import sys
sys.path.insert(0, '.')
from backend.app import create_app
import backend.services.timetable_service as ts
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    context = {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 4, 'scheme_id': 1, 'semester_id': 7}
    subs = ts._get_subjects(context)
    asgs = ts._get_assignments(context)
    opt = ts._optional_validation(subs, asgs, context=context)
    for grp in opt.get('groups', []):
        avail = grp.get('available_subjects', [])
        sel = grp.get('selected_subjects', [])
        if len(sel) == 0 and avail: grp['selected_subjects'] = [avail[0]]
        elif len(sel) > 1: grp['selected_subjects'] = [sel[0]]
    subs = ts._selected_subjects(subs, opt)
    amap = ts._assignment_map(asgs)
    c = ts._get_constraints(context)
    tasks = ts._make_tasks(subs, amap, days=ts._days(c), periods_per_day=7, constraint=c, context=context, assignments=asgs)
    days = ts._days(c)
    occupied = ts._existing_occupied(context)
    
    for remove_idx in range(len(tasks)):
        test_tasks = [t for i, t in enumerate(tasks) if i != remove_idx]
        model = cp_model.CpModel()
        choices = defaultdict(list)
        faculty_slot = defaultdict(list)
        class_slot = defaultdict(list)
        subject_day = defaultdict(list)
        for idx, task in enumerate(test_tasks):
            c_days = [task['fixed_day']] if task.get('fixed_day') else ([d for d in task['allowed_days'] if d in days] if task.get('allowed_days') else [d for d in days if d.lower() != 'saturday'])
            for d in c_days:
                starts = [int(task.get("fixed_start"))] if task.get("fixed_start") is not None else ts._start_periods(c, task['block_size'], after_lunch_only=task.get('after_lunch_only', False), is_lab=task.get('is_lab', False), task=task)
                for s in starts:
                    cells = [(d, s + off) for off in range(task['block_size'])]
                    if any((fid, cd, cp) in occupied for fid in task['faculty_ids'] for cd, cp in cells):
                        continue
                    var = model.NewBoolVar(f't_{idx}_{d}_{s}')
                    choices[idx].append((var, task, d, s))
                    for fid in task['faculty_ids']:
                        for cd, cp in cells: faculty_slot[(fid, cd, cp)].append(var)
                    for cd, cp in cells: class_slot[(cd, cp)].append(var)
                    if not task.get('is_lab') and not task.get('is_project') and not ts._is_major_project(task['subject']):
                        subject_day[(int(task['subject']['subject_id']), d)].append(var)

        for idx in range(len(test_tasks)):
            model.AddExactlyOne([v[0] for v in choices[idx]])
        for v in class_slot.values(): model.AddAtMostOne(v)
        for v in faculty_slot.values(): model.AddAtMostOne(v)
        for v in subject_day.values(): model.AddAtMostOne(v)

        solver = cp_model.CpSolver()
        st = solver.Solve(model)
        if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            t_rem = tasks[remove_idx]
            print(f"FEASIBLE when removing Task {remove_idx}: {t_rem['subject']['subject_code']} {t_rem['component']}")
            break
