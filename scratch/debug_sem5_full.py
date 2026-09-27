import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _resolve_effective_department, _resolve_academic_year, _get_constraints,
    _get_subjects, _get_assignments, _optional_validation, _selected_subjects,
    _assignment_map, _is_special_activity, _assignment_validation, _days,
    _make_tasks, _existing_occupied, _faculty_limits, _start_periods, _safe_int,
    _generation_seed, _is_major_project
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model
from collections import defaultdict
import random

app = create_app()
with app.app_context():
    context = {
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'department_id': 5,
        'scheme_id': 1,
        'semester_id': 5,
    }
    _semester, resolve_error = _resolve_effective_department(context)
    academic_year_error = _resolve_academic_year(context)
    constraint = _get_constraints(context)
    days = _days(constraint)
    periods = _safe_int(constraint.get("periods_per_day"), 7)
    subjects = _get_subjects(context)
    assignments = _get_assignments(context)
    optional_result = _optional_validation(subjects, assignments, context)
    print("Optional result valid:", optional_result["valid"])
    if not optional_result["valid"]:
        print("Optional errors:", optional_result["errors"])
    
    subjects = _selected_subjects(subjects, optional_result)
    amap = _assignment_map(assignments)
    assignment_result = _assignment_validation(subjects, amap)
    print("Assignment result valid:", assignment_result["valid"])
    if not assignment_result["valid"]:
        print("Assignment errors:", assignment_result["errors"])
    
    rule_engine = AsfaRuleEngine(context)
    tasks = _make_tasks(
        subjects, amap, days=days, periods_per_day=periods,
        constraint=constraint, rule_engine=rule_engine, context=context,
        assignments=assignments
    )
    seed = _generation_seed(context)
    task_rng = random.Random(seed)
    task_rng.shuffle(tasks)
    print("Tasks count:", len(tasks), "Total periods:", sum(t["block_size"] for t in tasks))
    
    occupied = _existing_occupied(context)
    global_daily = _safe_int(constraint.get("max_periods_per_day"), 7)
    global_weekly = _safe_int(constraint.get("max_periods_per_week"), len(days) * periods)
    faculty_limits = _faculty_limits(assignments, global_weekly, rule_engine=rule_engine)
    
    # Model build
    model = cp_model.CpModel()
    choices = defaultdict(list)
    pair_day_choices = defaultdict(lambda: defaultdict(list))
    faculty_slot = defaultdict(list)
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)
    class_slot = defaultdict(list)
    project_day_choices = defaultdict(lambda: defaultdict(list))
    subject_day = defaultdict(list)
    semester_no = 5

    for index, task in enumerate(tasks):
        subject = task["subject"]
        block = int(task["block_size"])
        candidate_days = list(days)
        for day in candidate_days:
            candidate_starts = _start_periods(
                constraint, block, after_lunch_only=task.get("after_lunch_only", False),
                is_lab=task.get("is_lab", False), semester_no=semester_no, task=task
            )
            cells = [(day, start + offset) for start in candidate_starts for offset in range(block)]
            for start in candidate_starts:
                task_cells = [(day, start + offset) for offset in range(block)]
                already_occupied = any(
                    (fid, cd, cp) in occupied
                    for fid in task["faculty_ids"]
                    for (cd, cp) in task_cells
                )
                if already_occupied:
                    continue
                var = model.NewBoolVar(f"task_{index}_{day}_{start}")
                choices[index].append((var, task, day, start))
                if task.get("pair_key"):
                    pair_day_choices[task["pair_key"]][day].append(var)
                for fid in task["faculty_ids"]:
                    for (cd, cp) in task_cells:
                        faculty_slot[(fid, cd, cp)].append(var)
                    faculty_day[(fid, day)].append((var, block))
                    faculty_week[fid].append((var, block))
                for (cd, cp) in task_cells:
                    class_slot[(cd, cp)].append(var)
                if task.get("is_project"):
                    project_day_choices[int(subject["subject_id"])][day].append(var)
                if not task.get("is_lab") and not task.get("is_project") and not _is_major_project(subject):
                    subject_day[(int(subject["subject_id"]), day)].append(var)
        if not choices[index]:
            print(f"FAILED on task {index}: {task['subject']['subject_code']} - {task.get('classification')}")
        else:
            model.AddExactlyOne([v for v, _, _, _ in choices[index]])

    print("Step 1 (all choices exist): check pass")
    for pair_key, day_vars in pair_day_choices.items():
        for d, variables in day_vars.items():
            model.AddAtMostOne(variables)
    for variables in faculty_slot.values():
        model.AddAtMostOne(variables)
    for variables in class_slot.values():
        model.AddAtMostOne(variables)
    
    for (subject_id, day), variables in subject_day.items():
        subject_row = next((s for s in subjects if int(s.get("subject_id")) == int(subject_id)), {})
        category = str(subject_row.get("course_category") or "").strip().upper()
        if category == "PROJ" or _is_major_project(subject_row) or "PROJECT" in str(subject_row.get("subject_name") or "").upper():
            continue
        model.AddAtMostOne(variables)

    for (fid, _day), variables in faculty_day.items():
        model.Add(sum(v * w for v, w in variables) <= global_daily)
    for fid, variables in faculty_week.items():
        lim = faculty_limits.get(fid, global_weekly)
        model.Add(sum(v * w for v, w in variables) <= lim)

    for (subject_id, day_map) in project_day_choices.items():
        day_used = []
        for day, variables in day_map.items():
            used = model.NewBoolVar(f"project_{subject_id}_{day}_used")
            for variable in variables:
                model.Add(variable <= used)
            day_used.append(used)
        if day_used:
            model.Add(sum(day_used) <= 2)

    solver = cp_model.CpSolver()
    st = solver.Solve(model)
    print("Exact model status:", solver.StatusName(st))
