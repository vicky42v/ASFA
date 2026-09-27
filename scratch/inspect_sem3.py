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
    for grp in opt.get('groups', []):
        avail = grp.get('available_subjects', [])
        sel = grp.get('selected_subjects', [])
        if len(sel) != 1 and avail:
            grp['selected_subjects'] = [avail[0]]
    sel = _selected_subjects(subs, opt)
    amap = _assignment_map(asgs)
    constraint = _get_constraints(context)
    days = _days(constraint)
    rule_engine = AsfaRuleEngine(context)

    tasks = _make_tasks(sel, amap, days=days, periods_per_day=7, constraint=constraint, rule_engine=rule_engine, assignments=asgs, context=context)
    occupied = _existing_occupied(context)
    print("Tasks count:", len(tasks), "Total periods:", sum(t['block_size'] for t in tasks))
    print("Occupied slots count:", len(occupied))

    # Let's test step by step
    for remove_count in range(len(tasks)):
        test_tasks = tasks[:len(tasks)-remove_count] if remove_count > 0 else tasks
        model = cp_model.CpModel()
        choices = defaultdict(list)
        faculty_slot = defaultdict(list)
        class_slot = defaultdict(list)
        subject_day = defaultdict(list)

        for idx, task in enumerate(test_tasks):
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

        no_choice = [idx for idx in range(len(test_tasks)) if not choices[idx]]
        if no_choice:
            print(f"Tasks with 0 valid choices: {[test_tasks[i]['subject']['subject_code'] + ' ' + test_tasks[i]['component'] for i in no_choice]}")
            continue

        for idx in range(len(test_tasks)):
            model.AddExactlyOne([v[0] for v in choices[idx]])
        for v in class_slot.values(): model.AddAtMostOne(v)
        for v in faculty_slot.values(): model.AddAtMostOne(v)
        for v in subject_day.values(): model.AddAtMostOne(v)

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 2.0
        status = solver.Solve(model)
        print(f"With {len(test_tasks)} tasks (sum periods={sum(t['block_size'] for t in test_tasks)}): {solver.StatusName(status)}")
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            print(f"FEASIBLE WHEN {remove_count} tasks removed! Removed: {[tasks[len(tasks)-1-k]['subject']['subject_code'] for k in range(remove_count)]}")
            break
