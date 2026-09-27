import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
from backend.services.timetable_service import _get_subjects, _make_tasks, _get_assignments, _assignment_map, _start_periods, _days
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model
from collections import defaultdict
import random

app = create_app()
with app.app_context():
    context = {
        'department_id': 7,
        'scheme_id': 1,
        'semester_id': 7,
        'semester_no': 7,
        'academic_year': '2026-27',
        'semester_type': 'Odd',
    }
    constraint = rows('SELECT * FROM timetable_constraints WHERE department_id = 7 AND semester_id = 7')[0]
    asgs = _get_assignments(context)
    amap = _assignment_map(asgs)
    subs = _get_subjects(context)
    target_codes = ['BCS701', 'BCS702', 'BCS703', 'BCS786', 'BCS714A', 'BCS755A']
    sel_subs = [s for s in subs if s['subject_code'] in target_codes]
    context['selected_subjects'] = [s['subject_id'] for s in sel_subs]
    
    rule_engine = AsfaRuleEngine(context)
    days = _days(constraint)
    periods = constraint['periods_per_day']
    tasks = _make_tasks(sel_subs, amap, days=days, periods_per_day=periods, constraint=constraint, rule_engine=rule_engine, context=context, assignments=asgs)

    model = cp_model.CpModel()
    task_choices = defaultdict(list)
    class_slot = defaultdict(list)
    faculty_slot = defaultdict(list)
    subject_day = defaultdict(list)
    pair_day_choices = defaultdict(lambda: defaultdict(list))
    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)

    for i, task in enumerate(tasks):
        block = int(task.get("block_size", 1))
        candidate_starts = _start_periods(
            constraint, block, after_lunch_only=task.get("after_lunch_only", False),
            is_lab=task.get("is_lab", False), semester_no=7, task=task
        )
        for day in days:
            for start in candidate_starts:
                var = model.NewBoolVar(f"t_{i}_{day}_{start}")
                task_choices[i].append(var)
                for offset in range(block):
                    class_slot[(day, start + offset)].append(var)
                    for fid in task.get("faculty_ids", []):
                        faculty_slot[(fid, day, start + offset)].append(var)
                if not task.get("is_lab") and not task.get("is_project"):
                    subject_day[(task["subject"]["subject_id"], day)].append(var)
                if task.get("pair_key"):
                    pair_day_choices[task["pair_key"]][day].append(var)
                for fid in task.get("faculty_ids", []):
                    faculty_day[(fid, day)].append((var, block))
                    faculty_week[fid].append((var, block))

    print("Checking Base: exactly one slot per task...")
    for i in range(len(tasks)):
        model.AddExactlyOne(task_choices[i])
    
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    print("Base status:", solver.StatusName(status))

    print("Adding class_slot constraint (at most one per slot)...")
    for variables in class_slot.values():
        model.AddAtMostOne(variables)
    status = solver.Solve(model)
    print("Class slot status:", solver.StatusName(status))

    print("Adding faculty_slot constraint (no concurrent faculty)...")
    for variables in faculty_slot.values():
        model.AddAtMostOne(variables)
    status = solver.Solve(model)
    print("Faculty slot status:", solver.StatusName(status))

    print("Adding pair_day_choices constraint (diff days for pair)...")
    for pair_key, day_vars in pair_day_choices.items():
        for d, variables in day_vars.items():
            model.AddAtMostOne(variables)
    status = solver.Solve(model)
    print("Pair day status:", solver.StatusName(status))

    print("Adding subject_day constraint (theory max per day)...")
    for (sid, d), variables in subject_day.items():
        # Check what limit is applied in timetable_service.py
        # In timetable_service: model.Add(sum(variables) <= max_daily)
        model.Add(sum(variables) <= 1)
    status = solver.Solve(model)
    print("Subject day status:", solver.StatusName(status))

    print("Adding faculty daily/weekly workload...")
    for (fid, d), variables in faculty_day.items():
        model.Add(sum(var * w for var, w in variables) <= 6)
    for fid, variables in faculty_week.items():
        model.Add(sum(var * w for var, w in variables) <= 18)
    status = solver.Solve(model)
    print("Faculty workload status:", solver.StatusName(status))
