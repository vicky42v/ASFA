import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _assignment_map,
    _get_constraints, _days, _make_tasks, _existing_occupied,
    _optional_validation, _selected_subjects, _start_periods, _faculty_limits,
    _existing_faculty_weekly_periods
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model
from collections import defaultdict

app = create_app()
with app.app_context():
    context = {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 5, 'scheme_id': 2, 'semester_id': 3}
    subs = _get_subjects(context)
    asgs = _get_assignments(context)
    opt = _optional_validation(subs, asgs, context)
    sel = _selected_subjects(subs, opt)
    amap = _assignment_map(asgs)
    constraint = _get_constraints(context)
    days = _days(constraint)
    periods = 7
    rule_engine = AsfaRuleEngine(context)
    tasks = _make_tasks(sel, amap, days=days, periods_per_day=periods, constraint=constraint, rule_engine=rule_engine, assignments=asgs, context=context)
    occupied = _existing_occupied(context)
    prior_faculty_periods = _existing_faculty_weekly_periods(context)
    faculty_limits = _faculty_limits(asgs, 42, rule_engine=rule_engine)
    
    print(f"Total tasks: {len(tasks)}")
    for t in tasks:
        print(f"  {t['subject']['subject_code']} ({t['component']}) block={t['block_size']} fac={t['faculty_ids']} allowed_days={t.get('allowed_days')} fixed_day={t.get('fixed_day')}")
        
    print(f"\nPrior faculty periods in other timetables:")
    for fid, cnt in prior_faculty_periods.items():
        if fid in faculty_limits:
            print(f"  Faculty {fid}: prior={cnt}, limit={faculty_limits[fid]}, remaining={faculty_limits[fid]-cnt}")

    # Check each task has valid slots
    for idx, t in enumerate(tasks):
        c_days = [t['fixed_day']] if t.get('fixed_day') else ([d for d in t['allowed_days'] if d in days] if t.get('allowed_days') else [d for d in days if d.lower() != 'saturday'])
        valid_slots = []
        for d in c_days:
            starts = _start_periods(constraint, t['block_size'], after_lunch_only=t.get('after_lunch_only', False), is_lab=t.get('is_lab', False), task=t)
            for s in starts:
                cells = [(d, s + off) for off in range(t['block_size'])]
                if any((fid, cd, cp) in occupied for fid in t['faculty_ids'] for cd, cp in cells):
                    continue
                valid_slots.append((d, s))
        if not valid_slots:
            print(f"TASK {idx} HAS NO VALID SLOTS: {t['subject']['subject_code']} ({t['component']})")
        else:
            print(f"Task {idx} ({t['subject']['subject_code']} {t['component']}): {len(valid_slots)} valid slots")
