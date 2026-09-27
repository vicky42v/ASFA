import sys
sys.path.insert(0, '.')
from backend.app import create_app
import backend.services.timetable_service as ts
from ortools.sat.python import cp_model

app = create_app()
with app.app_context():
    context = {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 4, 'scheme_id': 1, 'semester_id': 7}
    constraint = ts._get_constraints(context)
    subjects = ts._get_subjects(context)
    assignments = ts._get_assignments(context)
    optional = ts._optional_validation(subjects, assignments, context=context)
    subjects = ts._selected_subjects(subjects, optional)
    amap = ts._assignment_map(assignments)
    days = ts._days(constraint)
    rule_engine = ts.AsfaRuleEngine(context)
    tasks = ts._make_tasks(subjects, amap, days=days, periods_per_day=7, constraint=constraint, rule_engine=rule_engine, assignments=assignments, context=context)
    occupied = ts._existing_occupied(context)
    faculty_limits = ts._faculty_limits(assignments, 42, rule_engine)
    global_daily = int(constraint.get("max_periods_per_day") or 7)
    global_weekly = int(constraint.get("max_periods_per_week") or 42)
    periods = 7
    semester_no = 7

    # Build model exactly like generate()
    model = cp_model.CpModel()
    from collections import defaultdict
    choices = defaultdict(list)
    faculty_slot = defaultdict(list)
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)
    class_slot = defaultdict(list)
    subject_day = defaultdict(list)
    project_day_choices = defaultdict(lambda: defaultdict(list))
    pair_day_choices = defaultdict(lambda: defaultdict(list))

    for index, task in enumerate(tasks):
        subject = task["subject"]
        block = int(task["block_size"])
        if task.get("fixed_day"):
            candidate_days = [task.get("fixed_day")]
        elif task.get("allowed_days"):
            candidate_days = [d for d in task["allowed_days"] if d in days]
        else:
            candidate_days = [d for d in days if d.lower() != "saturday"]

        for day in candidate_days:
            candidate_starts = (
                [int(task.get("fixed_start", 1))]
                if task.get("fixed_start") is not None
                else ts._start_periods(constraint, block, after_lunch_only=task.get("after_lunch_only", False), is_lab=task.get("is_lab", False), semester_no=semester_no, task=task)
            )
            for start in candidate_starts:
                cells = [(day, start + offset) for offset in range(block)]
                if any((int(faculty_id), cell_day, cell_period) in occupied for faculty_id in task.get("faculty_ids", []) for cell_day, cell_period in cells):
                    continue
                var = model.NewBoolVar(f"t_{index}_{day}_{start}")
                choices[index].append((var, task, day, start))
                if task.get("pair_key"):
                    pair_day_choices[task["pair_key"]][day].append(var)
                for faculty_id in task.get("faculty_ids", []):
                    fid = int(faculty_id)
                    for cell_day, cell_period in cells:
                        faculty_slot[(fid, cell_day, cell_period)].append(var)
                    faculty_day[(fid, day)].append((var, block))
                    faculty_week[fid].append((var, block))
                for cell_day, cell_period in cells:
                    class_slot[(cell_day, cell_period)].append(var)
                if task.get("is_project"):
                    project_day_choices[int(subject["subject_id"])][day].append(var)
                if not task.get("is_lab") and not task.get("is_project") and not ts._is_major_project(subject):
                    subject_day[(int(subject["subject_id"]), day)].append(var)

    for index in range(len(tasks)):
        if not choices[index]:
            print(f"Task {index} ({tasks[index]['subject']['subject_code']} {tasks[index]['component']}) HAS 0 CHOICES!")
        model.AddExactlyOne([item[0] for item in choices[index]])

    solver = cp_model.CpSolver()
    print("Stage 1 (ExactlyOne on choices):", solver.StatusName(solver.Solve(model)))

    for key, variables in class_slot.items():
        model.AddAtMostOne(variables)
    print("Stage 2 (+ Class slot):", solver.StatusName(solver.Solve(model)))

    for key, variables in faculty_slot.items():
        model.AddAtMostOne(variables)
    print("Stage 3 (+ Faculty slot):", solver.StatusName(solver.Solve(model)))

    for pair_key, day_map in pair_day_choices.items():
        for day, variables in day_map.items():
            model.Add(sum(variables) <= 1)
    print("Stage 4 (+ Pair day choices):", solver.StatusName(solver.Solve(model)))

    # Contiguity & afternoon contiguity (lines 3380-3416)
    lunch_period = int(constraint.get("lunch_after_period") or 4)
    for day in days:
        for p_morning in range(1, lunch_period + 1):
            morning_vars = class_slot.get((day, p_morning), [])
            if not morning_vars: continue
            occ_morning = sum(morning_vars)
            for p_afternoon in range(lunch_period + 1, periods + 1):
                afternoon_vars = class_slot.get((day, p_afternoon), [])
                for v_aft in afternoon_vars:
                    model.Add(v_aft <= occ_morning)

        for p in range(1, lunch_period):
            vars_curr = class_slot.get((day, p), [])
            vars_next = class_slot.get((day, p + 1), [])
            if vars_curr and vars_next:
                model.Add(sum(vars_next) <= sum(vars_curr))
    print("Stage 5 (+ Morning contiguity):", solver.StatusName(solver.Solve(model)))

    for (subject_id, day), variables in subject_day.items():
        model.AddAtMostOne(variables)
    print("Stage 6 (+ Subject once per day):", solver.StatusName(solver.Solve(model)))

    for (faculty_id, _day), variables in faculty_day.items():
        model.Add(sum(var * weight for var, weight in variables) <= global_daily)
    print("Stage 7 (+ Faculty daily limit):", solver.StatusName(solver.Solve(model)))

    for faculty_id, variables in faculty_week.items():
        limit = faculty_limits.get(faculty_id, global_weekly)
        model.Add(sum(var * weight for var, weight in variables) <= limit)
    print("Stage 8 (+ Faculty weekly limit):", solver.StatusName(solver.Solve(model)))

    for subject_id, day_map in project_day_choices.items():
        day_used = []
        for day, variables in day_map.items():
            used = model.NewBoolVar(f"project_{subject_id}_{day}_used")
            for variable in variables: model.Add(variable <= used)
            day_used.append(used)
        if day_used:
            model.Add(sum(day_used) <= 2)
    print("Stage 9 (+ Project max 2 days):", solver.StatusName(solver.Solve(model)))
