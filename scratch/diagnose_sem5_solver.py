import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _assignment_map, _resolve_effective_department,
    _get_constraints, _days, _make_tasks, _existing_occupied, _faculty_limits,
    _start_periods, _safe_int
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from ortools.sat.python import cp_model

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
    rule_engine = AsfaRuleEngine(context)
    tasks = _make_tasks(subs, amap, days=days, periods_per_day=7, context=context, rule_engine=rule_engine, constraint=constraint, assignments=asgs)
    print("Tasks count:", len(tasks), "Total periods:", sum(t['block_size'] for t in tasks))
    
    occupied = _existing_occupied(context)
    print("Existing occupied slots count:", len(occupied))
    
    # Check faculty limits
    fac_limits = _faculty_limits(asgs, 18, rule_engine)
    print("Faculty limits:", fac_limits)
    
    # Check which faculty might be oversubscribed
    from collections import defaultdict
    task_fac_hours = defaultdict(int)
    for t in tasks:
        for fid in t.get('faculty_ids', []):
            task_fac_hours[fid] += t['block_size']
    print("Task faculty hours needed:")
    for fid, hrs in task_fac_hours.items():
        print(f"  Faculty {fid}: needed {hrs}h vs limit {fac_limits.get(fid)}")
