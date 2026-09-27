import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _assignment_map,
    _get_constraints, _days, _make_tasks, _existing_occupied,
    _optional_validation, _selected_subjects, _start_periods
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
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
    
    for p in range(1, 8):
        matching = []
        for idx, t in enumerate(tasks):
            c_days = [t['fixed_day']] if t.get('fixed_day') else ([d for d in t['allowed_days'] if d in days] if t.get('allowed_days') else [d for d in days if d.lower() != 'saturday'])
            if 'Monday' not in c_days: continue
            starts = _start_periods(constraint, t['block_size'], after_lunch_only=t.get('after_lunch_only', False), is_lab=t.get('is_lab', False), task=t)
            for s in starts:
                cells = [('Monday', s + off) for off in range(t['block_size'])]
                if any((fid, cd, cp) in occupied for fid in t['faculty_ids'] for cd, cp in cells):
                    continue
                if s <= p < s + t['block_size']:
                    matching.append((t['subject']['subject_code'], t['component'], s))
        print(f"Monday P{p} can be occupied by {len(matching)} task options: {set(m[0] for m in matching)}")
