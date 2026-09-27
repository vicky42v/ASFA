import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute, row, rows
from backend.services.timetable_service import _days, _make_tasks, _safe_int, AsfaRuleEngine, _assignment_map, _selected_subjects, _optional_validation, _faculty_limits, _start_periods
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    execute("UPDATE timetable_constraints SET working_days='Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', max_periods_per_day=7, max_periods_per_week=42 WHERE constraint_id=6")
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    sem5_assignments = [
        (103, 1, 'Theory', 'Main'),
        (104, 2, 'Theory', 'Main'),
        (104, 3, 'Lab', 'Main'),
        (105, 4, 'Theory', 'Main'),
        (106, 5, 'Lab', 'Main'),
        (107, 6, 'Lab', 'Main'),
        (108, 7, 'Theory', 'Main'),
        (109, 8, 'Theory', 'Main'),
        (110, 99, 'Theory', 'Main'),
        (117, 9, 'Lab', 'Main'),
    ]
    for sid, fid, comp, role in sem5_assignments:
        execute(
            "INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status) VALUES (%s, %s, '2026-27', %s, %s, 'Active')",
            (sid, fid, comp, role)
        )
    
    context = {
        'department_id': 5,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'ODD',
        'semester_id': 5,
        'section_id': 1,
        'proctor_faculty_id': 1,
        'proctor_b1_faculty_id': 1,
        'proctor_b2_faculty_id': 2,
    }
    
    subjects = rows("SELECT * FROM subject WHERE department_id=5 AND semester_id=5")
    assignments = rows("SELECT * FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    constraint = row("SELECT * FROM timetable_constraints WHERE constraint_id=6")
    days = _days(constraint)
    periods = _safe_int(constraint.get("periods_per_day"), 7)
    rule_engine = AsfaRuleEngine(context)
    optional = _optional_validation(subjects, assignments)
    subjects = _selected_subjects(subjects, optional)
    amap = _assignment_map(assignments)
    tasks = _make_tasks(subjects, amap, days, periods, constraint, rule_engine, context, assignments)
    
    # Let's see how many tasks we have and build model step-by-step
    print("Tasks count:", len(tasks))
    model = cp_model.CpModel()
    choices = defaultdict(list)
    class_slot = defaultdict(list)
    faculty_slot = defaultdict(list)
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)
    subject_day = defaultdict(list)
    project_day_choices = defaultdict(lambda: defaultdict(list))
    pair_day_choices = defaultdict(lambda: defaultdict(list))
    
    for index, task in enumerate(tasks):
        subject = task["subject"]
        block = int(task.get("block_size", 1))
        fac_ids = task.get("faculty_ids", [])
        pair_key = task.get("pair_key")
        
        starts = _start_periods(constraint, block, after_lunch_only=task.get("after_lunch_only", False))
        for day in days:
            if task.get("fixed_day") and str(task["fixed_day"]).strip().lower() != str(day).strip().lower():
                continue
            if task.get("is_special") and not (task.get("fixed_day") and str(task["fixed_day"]).strip().lower() == str(day).strip().lower()):
                continue
            # When Saturday is entirely occupied by special activities, disallow normal classes
            # Wait! Is this the line?!
            if str(day).strip().lower() == "saturday" and not task.get("is_special"):
                continue
                
            for start in starts:
                if task.get("fixed_start") is not None and int(task["fixed_start"]) != start:
                    continue
                cells = [(day, start + offset) for offset in range(block)]
                var = model.NewBoolVar(f"task_{index}_{day}_{start}")
                choices[index].append((var, day, start, cells))
                if pair_key:
                    pair_day_choices[pair_key][day].append(var)
                for faculty_id in fac_ids:
                    for c_day, c_period in cells:
                        faculty_slot[(faculty_id, c_day, c_period)].append(var)
                    faculty_day[(faculty_id, day)].append((var, block))
                    faculty_week[faculty_id].append((var, block))
                for c_day, c_period in cells:
                    class_slot[(c_day, c_period)].append(var)
                if task.get("is_project"):
                    project_day_choices[int(subject["subject_id"])][day].append(var)
                if not task.get("is_lab"):
                    subject_day[(int(subject["subject_id"]), day)].append(var)
        
        if not choices[index]:
            print(f"ERROR: Task {index} {subject['subject_code']} has NO choices!")
        else:
            model.AddExactlyOne([item[0] for item in choices[index]])

    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    print("Step 1 (AddExactlyOne each task):", solver.StatusName(status))
    
    # Add class slot conflict
    for slot, vars_ in class_slot.items():
        model.AddAtMostOne(vars_)
    status = solver.Solve(model)
    print("Step 2 (AddAtMostOne class_slot):", solver.StatusName(status))
    
    # Add faculty slot conflict
    for (f_id, slot_day, slot_period), vars_ in faculty_slot.items():
        model.AddAtMostOne(vars_)
    status = solver.Solve(model)
    print("Step 3 (AddAtMostOne faculty_slot):", solver.StatusName(status))
    
    # Add pair day choices
    for pair_key, day_map in pair_day_choices.items():
        for p_day, p_vars in day_map.items():
            model.AddAtMostOne(p_vars)
    status = solver.Solve(model)
    print("Step 4 (AddAtMostOne pair_day_choices):", solver.StatusName(status))
    
    # Add subject_day
    for (sid, sday), vars_ in subject_day.items():
        srow = next((s for s in subjects if int(s["subject_id"]) == sid), {})
        if str(srow.get("course_category") or "").strip().upper() == "PROJ":
            continue
        model.AddAtMostOne(vars_)
    status = solver.Solve(model)
    print("Step 5 (AddAtMostOne subject_day):", solver.StatusName(status))
    
    # Add project max two days
    for sid, day_map in project_day_choices.items():
        print("Project sid:", sid, "days in day_map:", list(day_map.keys()))
        for d, vars_ in day_map.items():
            print(f"  Day {d}: {len(vars_)} variables")
        day_used = []
        for d, vars_ in day_map.items():
            used = model.NewBoolVar(f"proj_{sid}_{d}")
            for v in vars_:
                model.Add(v <= used)
            day_used.append(used)
        if day_used:
            model.Add(sum(day_used) <= 2)
    status = solver.Solve(model)
    print("Step 6 (Project max two days):", solver.StatusName(status))
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Test with <= 3 or <= 4
        m2 = cp_model.CpModel()
        # let's see if <= 3 or <= 4 works

