import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _assignment_map, _resolve_effective_department,
    _get_constraints, _days, _make_tasks, _existing_occupied, _faculty_limits,
    _start_periods, _safe_int, _is_major_project
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    context = {
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'department_id': 5,
        'scheme_id': 1,
        'semester_id': 5,
    }
    sem, err = _resolve_effective_department(context)
    subs = _get_subjects(context)
    subs = [s for s in subs if s['subject_code'] not in ('BAI515A', 'BAI515B', 'BCS515C')]
    asgs = _get_assignments(context)
    amap = _assignment_map(asgs)
    constraint = _get_constraints(context)
    days = _days(constraint)
    periods = 7
    rule_engine = AsfaRuleEngine(context)
    tasks = _make_tasks(subs, amap, days=days, periods_per_day=7, context=context, rule_engine=rule_engine, constraint=constraint, assignments=asgs)
    occupied = _existing_occupied(context)
    faculty_limits = _faculty_limits(asgs, 18, rule_engine)

    model = cp_model.CpModel()
    choices = {}
    subject_day = defaultdict(list)
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)
    project_day_choices = defaultdict(lambda: defaultdict(list))
    period_tasks = defaultdict(list)
    fac_period = defaultdict(list)

    for task_idx, task in enumerate(tasks):
        choices[task_idx] = []
        is_lab = task.get("is_lab", False)
        starts = _start_periods(constraint, int(task["block_size"]), after_lunch_only=task.get("after_lunch_only", False), is_lab=is_lab, semester_no=5, task=task)
        sid = int(task["subject"]["subject_id"])

        for day in days:
            for start in starts:
                clash = False
                for fid in task.get("faculty_ids", []):
                    for off in range(int(task["block_size"])):
                        if (fid, day, start + off) in occupied:
                            clash = True
                            break
                    if clash: break
                if clash: continue
                var = model.NewBoolVar(f"t_{task_idx}_{day}_{start}")
                choices[task_idx].append((var, task, day, start))
                
                subject_day[(sid, day)].append(var)
                for fid in task.get("faculty_ids", []):
                    faculty_day[(fid, day)].append((var, task["block_size"]))
                    faculty_week[fid].append((var, task["block_size"]))
                if task.get("is_project"):
                    project_day_choices[sid][day].append(var)
                for off in range(int(task["block_size"])):
                    period_tasks[(day, start + off)].append(var)
                    for fid in task.get("faculty_ids", []):
                        fac_period[(fid, day, start + off)].append(var)
        
        model.AddExactlyOne([v for v, _, _, _ in choices[task_idx]])

    for (day, p), vlist in period_tasks.items():
        model.Add(sum(vlist) <= 1)
    for (fid, day, p), vlist in fac_period.items():
        model.Add(sum(vlist) <= 1)

    solver = cp_model.CpSolver()
    print("Baseline (slot + faculty + occupancy):", solver.StatusName(solver.Solve(model)))

    # Test Subject Day (max 1 per day)
    for (subject_id, day), variables in subject_day.items():
        subject_row = next((s for s in subs if int(s.get("subject_id")) == int(subject_id)), {})
        category = str(subject_row.get("course_category") or "").strip().upper()
        if category == "PROJ" or _is_major_project(subject_row) or "PROJECT" in str(subject_row.get("subject_name") or "").upper():
            continue
        model.AddAtMostOne(variables)
    print("+ Subject Day (at most 1/day):", solver.StatusName(solver.Solve(model)))

    # Test Faculty Daily Workload (max 4 periods/day)
    for (fid, day), variables in faculty_day.items():
        model.Add(sum(var * w for var, w in variables) <= 4)
    print("+ Faculty Daily Workload (<=4/day):", solver.StatusName(solver.Solve(model)))

    # Test Faculty Weekly Workload
    for fid, variables in faculty_week.items():
        lim = faculty_limits.get(fid, 18)
        model.Add(sum(var * w for var, w in variables) <= lim)
    print("+ Faculty Weekly Workload:", solver.StatusName(solver.Solve(model)))

    # Test Project max 2 days
    for sid, day_map in project_day_choices.items():
        day_used = []
        for day, variables in day_map.items():
            used = model.NewBoolVar(f"proj_{sid}_{day}_used")
            for v in variables:
                model.Add(v <= used)
            day_used.append(used)
        if day_used:
            model.Add(sum(day_used) <= 2)
    print("+ Project max 2 days:", solver.StatusName(solver.Solve(model)))
