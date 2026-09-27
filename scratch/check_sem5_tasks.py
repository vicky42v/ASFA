import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import _make_tasks, _get_subjects, _get_assignments, _assignment_map, _resolve_effective_department, _get_constraints
from backend.services.asfa_rule_engine import AsfaRuleEngine

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
    # Filter out MC electives if not selected, keep 1 PEC (BCS515D)
    subs = [s for s in subs if s['subject_code'] not in ('BAI515A', 'BAI515B', 'BCS515C')]
    asgs = _get_assignments(context)
    amap = _assignment_map(asgs)
    rule_engine = AsfaRuleEngine(context)
    constraint = _get_constraints(context)
    tasks = _make_tasks(subs, amap, days=['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], periods_per_day=7, context=context, rule_engine=rule_engine, constraint=constraint)
    total_periods = sum(t['block_size'] for t in tasks)
    print('Total required periods for Sem 5:', total_periods)
    for t in tasks:
        code = t['subject'].get('subject_code')
        cls = t.get('classification')
        sz = t['block_size']
        print(f"  {code}: block={sz}, cls={cls}")
