import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _assignment_map,
    _get_constraints, _days, _make_tasks, _existing_occupied,
    _optional_validation, _selected_subjects, _start_periods, _is_major_project
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    context = {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 5, 'scheme_id': 1, 'semester_id': 3}
    subs = _get_subjects(context)
    asgs = _get_assignments(context)
    opt = _optional_validation(subs, asgs, context)
    sel = _selected_subjects(subs, opt)
    amap = _assignment_map(asgs)
    constraint = _get_constraints(context)
    days = _days(constraint)
    periods = 7
    lunch = 4
    rule_engine = AsfaRuleEngine(context)
    tasks = _make_tasks(sel, amap, days=days, periods_per_day=periods, constraint=constraint, rule_engine=rule_engine, assignments=asgs, context=context)
    occupied = _existing_occupied(context)
    
    model = cp_model.CpModel()
    choices = defaultdict(list)
    faculty_slot = defaultdict(list)
    class_slot = defaultdict(list)
    subject_day = defaultdict(list)
    
    for idx, task in enumerate(tasks):
        c_days = [task['fixed_day']] if task.get('fixed_day') else ([d for d in task['allowed_days'] if d in days] if task.get('allowed_days') else [d for d in days if d.lower() != 'saturday'])
        for d in c_days:
            starts = _start_periods(constraint, task['block_size'], after_lunch_only=task.get('after_lunch_only', False), is_lab=task.get('is_lab', False), task=task)
            for s in starts:
                cells = [(d, s + off) for off in range(task['block_size'])]
                if any((fid, cd, cp) in occupied for fid in task['faculty_ids'] for cd, cp in cells):
                    continue
                var = model.NewBoolVar(f't_{idx}_{d}_{s}')
                choices[idx].append((var, task, d, s))
                for fid in task['faculty_ids']:
                    for cd, cp in cells:
                        faculty_slot[(fid, cd, cp)].append(var)
                for cd, cp in cells:
                    class_slot[(cd, cp)].append(var)
                if not task.get('is_lab') and not task.get('is_project') and not _is_major_project(task['subject']):
                    subject_day[(int(task['subject']['subject_id']), d)].append(var)

    for idx in range(len(tasks)):
        model.AddExactlyOne([v[0] for v in choices[idx]])
    for v in class_slot.values(): model.AddAtMostOne(v)
    for v in faculty_slot.values(): model.AddAtMostOne(v)
    for v in subject_day.values(): model.AddAtMostOne(v)
    
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    print("Base status:", solver.StatusName(status))
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        grid = {d: {p: '---' for p in range(1, 8)} for d in days}
        for idx in range(len(tasks)):
            for var, t, d, s in choices[idx]:
                if solver.Value(var) == 1:
                    for off in range(t['block_size']):
                        grid[d][s + off] = t['subject']['subject_code']
        for d in days:
            print(f"{d:9}: " + " | ".join(f"P{p}: {grid[d][p]}" for p in range(1, 8)))
