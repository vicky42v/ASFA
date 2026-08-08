from collections import defaultdict
from ortools.sat.python import cp_model
from backend.db import rows, row
from backend.services.timetable_validator import validate_entries


def configuration(context):
    params = (context["department_id"], context["scheme_id"], context["academic_year"],
              context["semester_type"], context["semester_id"])
    constraint = row("""SELECT * FROM timetable_constraints WHERE department_id=%s AND scheme_id=%s
                     AND academic_year=%s AND semester_type=%s AND semester_id=%s ORDER BY constraint_id DESC LIMIT 1""", params)
    subjects = rows("""SELECT s.*, sg.group_name FROM subject s JOIN subject_group sg ON sg.group_id=s.group_id
                    LEFT JOIN entity_status es ON es.entity_type='subject' AND es.entity_id=s.subject_id
                    WHERE s.department_id=%s AND s.scheme_id=%s AND s.semester_id=%s
                      AND COALESCE(es.is_active, 1)=1 ORDER BY s.subject_code""",
                    (context["department_id"], context["scheme_id"], context["semester_id"]))
    assignments = rows("""SELECT a.assignment_id, a.subject_id, a.faculty_id, f.faculty_name, f.max_workload
                         FROM faculty_subject_assignment a JOIN faculty f ON f.faculty_id=a.faculty_id
                         WHERE a.academic_year=%s AND a.status='Active' AND f.status='Active'""", (context["academic_year"],))
    eligible = defaultdict(list)
    for assignment in assignments:
        eligible[assignment["subject_id"]].append(assignment)
    missing = [s for s in subjects if not eligible[s["subject_id"]]]
    return constraint, subjects, eligible, missing


def generate(context):
    constraint, subjects, eligible, missing = configuration(context)
    errors = []
    if not constraint:
        errors.append("No timetable constraints have been configured for the selected department, scheme, academic year, and semester.")
    if not subjects:
        errors.append("No subjects exist for the selected department, scheme, and semester.")
    if missing:
        errors.append(f"Timetable cannot be generated because {len(missing)} subject(s) do not have active faculty assignments.")
    if errors:
        return {"success": False, "validation": {"valid": False, "errors": errors,
                "missing_assignments": [{"subject_id": s["subject_id"], "subject_code": s["subject_code"], "subject_name": s["subject_name"]} for s in missing]},
                "timetable": [], "conflicts": [], "warnings": []}

    days = [day.strip() for day in constraint["working_days"].split(",") if day.strip()]
    slots = [(day, period) for day in days for period in range(1, constraint["periods_per_day"] + 1)]
    existing = rows("""SELECT day, period, faculty_id FROM timetable
                       WHERE academic_year=%s AND semester_type=%s AND NOT (department_id=%s AND scheme_id=%s AND semester_id=%s)
                         AND faculty_id IS NOT NULL""",
                    (context["academic_year"], context["semester_type"], context["department_id"], context["scheme_id"], context["semester_id"]))
    occupied = {(e["faculty_id"], e["day"], e["period"]) for e in existing}
    tasks = []
    for subject in subjects:
        # The dump exposes weekly lecture/tutorial/practical hours; each requires one timetable period.
        weekly_sessions = int(subject["lecture_hours"] or 0) + int(subject["tutorial_hours"] or 0) + int(subject["practical_hours"] or 0)
        for ordinal in range(weekly_sessions):
            tasks.append((subject, ordinal))
    if len(tasks) > len(slots):
        return {"success": False, "validation": {"valid": False, "errors": [f"{len(tasks)} required sessions exceed {len(slots)} available weekly slots."]}, "timetable": [], "conflicts": [], "warnings": []}

    model = cp_model.CpModel()
    choices, faculty_slot, faculty_day, faculty_week, task_slot = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for index, (subject, ordinal) in enumerate(tasks):
        for candidate in eligible[subject["subject_id"]]:
            faculty_id = candidate["faculty_id"]
            for day, period in slots:
                if (faculty_id, day, period) in occupied:
                    continue
                var = model.NewBoolVar(f"t_{index}_f_{faculty_id}_{day}_{period}")
                choice = (var, subject, faculty_id, day, period)
                choices[index].append(choice)
                faculty_slot[(faculty_id, day, period)].append(var)
                faculty_day[(faculty_id, day)].append(var)
                faculty_week[faculty_id].append(var)
                task_slot[(day, period)].append(var)
        if not choices[index]:
            return {"success": False, "validation": {"valid": False, "errors": [f"No eligible free slots are available for {subject['subject_code']}." ]}, "timetable": [], "conflicts": [], "warnings": []}
        model.AddExactlyOne([choice[0] for choice in choices[index]])
    for variables in faculty_slot.values(): model.AddAtMostOne(variables)
    for variables in task_slot.values(): model.AddAtMostOne(variables)
    for variables in faculty_day.values(): model.Add(sum(variables) <= constraint["max_periods_per_day"])
    for variables in faculty_week.values(): model.Add(sum(variables) <= constraint["max_periods_per_week"])
    # Prefer spreading a subject across days and earlier slots while keeping all hard constraints strict.
    model.Minimize(sum(var * period for index in choices for var, _, _, _, period in choices[index]))
    solver = cp_model.CpSolver(); solver.parameters.max_time_in_seconds = 20; solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"success": False, "validation": {"valid": False, "errors": ["No feasible timetable satisfies the configured constraints and faculty availability."]}, "timetable": [], "conflicts": [], "warnings": []}
    output = []
    for index in choices:
        for var, subject, faculty_id, day, period in choices[index]:
            if solver.BooleanValue(var):
                candidate = next(c for c in eligible[subject["subject_id"]] if c["faculty_id"] == faculty_id)
                output.append({"department_id": context["department_id"], "scheme_id": context["scheme_id"], "academic_year": context["academic_year"], "semester_type": context["semester_type"], "semester_id": context["semester_id"], "day": day, "period": period, "subject_id": subject["subject_id"], "subject_code": subject["subject_code"], "subject_name": subject["subject_name"], "faculty_id": faculty_id, "faculty_name": candidate["faculty_name"]})
    validation = validate_entries(output, constraint)
    return {"success": validation["valid"], "timetable": sorted(output, key=lambda e: (days.index(e["day"]), e["period"])), "conflicts": validation["conflicts"], "warnings": validation["warnings"], "validation": validation, "summary": {"scheduled_sessions": len(output), "subjects": len(subjects), "working_days": len(days)}}
