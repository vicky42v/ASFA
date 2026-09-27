import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.routes.timetable import context_from
from backend.services.timetable_service import (
    _get_constraints, _get_subjects, _get_assignments, _optional_validation,
    _selected_subjects, _assignment_map, _days, _make_tasks,
    _faculty_limits, _existing_occupied, _start_periods
)
from backend.db import rows
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    cse_faculty = rows("SELECT faculty_id FROM faculty WHERE department_id=7 AND status='Active'")
    raw_context = {
        'department_id': 7,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'Odd Semesters',
        'semester_id': 7,
        'semester': 7,
        'proctor_b1_faculty_id': cse_faculty[0]['faculty_id'],
        'proctor_b2_faculty_id': cse_faculty[1]['faculty_id'],
        'selected_subjects': [230, 231, 232, 233, 234, 238],
    }
    context, err = context_from(raw_context)
    constraint = _get_constraints(context)
    subjects = _get_subjects(context)
    assignments = _get_assignments(context)
    optional = _optional_validation(subjects, assignments, context=context)
    subjects = _selected_subjects(subjects, optional)
    amap = _assignment_map(assignments)
    days = _days(constraint)
    periods = int(constraint.get("periods_per_day") or 7)
    tasks = _make_tasks(subjects, amap, days=days, periods_per_day=periods, constraint=constraint, context=context, assignments=assignments)
    print(f"Total tasks: {len(tasks)}")
    
    occupied = _existing_occupied(context)
    global_daily = int(constraint.get("max_periods_per_day") or 7)
    global_weekly = int(constraint.get("max_periods_per_week") or 42)
    faculty_limits = _faculty_limits(assignments, global_weekly)
    
    # We will build CP model step-by-step
    model = cp_model.CpModel()
    choices = defaultdict(list)
    faculty_slot = defaultdict(list)
    class_slot = defaultdict(list)
    subject_day = defaultdict(list)
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)
    project_day_choices = defaultdict(lambda: defaultdict(list))
    pair_day_choices = defaultdict(lambda: defaultdict(list))
    
    for index, task in enumerate(tasks):
        subject = task["subject"]
        block = int(task["block_size"])
        starts = _start_periods(constraint, block, is_lab=task.get("is_lab", False), semester_no=7, task=task)
        for day in days:
            for start in starts:
                cells = [(day, start + off) for off in range(block)]
                # Check occupied
                if any((fid, c_d, c_p) in occupied for fid in task["faculty_ids"] for (c_d, c_p) in cells):
                    continue
                var = model.NewBoolVar(f"t_{index}_{day}_{start}")
                choices[index].append((var, task, day, start))
                if task.get("pair_key"):
                    pair_day_choices[task["pair_key"]][day].append(var)
                for fid in task["faculty_ids"]:
                    for (c_d, c_p) in cells:
                        faculty_slot[(fid, c_d, c_p)].append(var)
                    faculty_day[(fid, day)].append((var, block))
                    faculty_week[fid].append((var, block))
                for (c_d, c_p) in cells:
                    class_slot[(c_d, c_p)].append(var)
                if task.get("is_project"):
                    project_day_choices[int(subject["subject_id"])][day].append(var)
                if not task.get("is_lab"):
                    subject_day[(int(subject["subject_id"]), day)].append(var)
        
        if not choices[index]:
            print(f"Task {index} ({subject['subject_code']} {task['component']}) HAS NO VALID CHOICES!")
        else:
            model.AddExactlyOne([item[0] for item in choices[index]])

    # Base solve test (just ExactlyOne on tasks)
    solver = cp_model.CpSolver()
    st = solver.Solve(model)
    print("Step 1 (Task ExactlyOne):", solver.StatusName(st))
    
    # Add class slot conflicts
    for variables in class_slot.values():
        model.AddAtMostOne(variables)
    st = solver.Solve(model)
    print("Step 2 (+ Class Slot AtMostOne):", solver.StatusName(st))

    # Add faculty slot conflicts
    for variables in faculty_slot.values():
        model.AddAtMostOne(variables)
    st = solver.Solve(model)
    print("Step 3 (+ Faculty Slot AtMostOne):", solver.StatusName(st))

    # Add same subject once per day
    for (s_id, d), vars_ in subject_day.items():
        s_row = next((s for s in subjects if int(s.get("subject_id")) == s_id), {})
        cat = str(s_row.get("course_category") or "").upper()
        if cat == "PROJ": continue
        model.AddAtMostOne(vars_)
    st = solver.Solve(model)
    print("Step 4 (+ Subject Day AtMostOne):", solver.StatusName(st))

    # Add project max two days
    for s_id, day_map in project_day_choices.items():
        day_used = []
        for day, variables in day_map.items():
            used = model.NewBoolVar(f"p_{s_id}_{day}_used")
            for v in variables:
                model.Add(v <= used)
            day_used.append(used)
        model.Add(sum(day_used) <= 2)
    st = solver.Solve(model)
    print("Step 5 (+ Project max two days):", solver.StatusName(st))

    # Add faculty daily workload
    for (fid, day), vars_ in faculty_day.items():
        model.Add(sum(v * w for v, w in vars_) <= global_daily)
    st = solver.Solve(model)
    print("Step 6 (+ Faculty daily limit):", solver.StatusName(st))

    # Add faculty weekly workload
    for fid, vars_ in faculty_week.items():
        lim = faculty_limits.get(fid, global_weekly)
        model.Add(sum(v * w for v, w in vars_) <= lim)
    st = solver.Solve(model)
    print("Step 7 (+ Faculty weekly limit):", solver.StatusName(st))
