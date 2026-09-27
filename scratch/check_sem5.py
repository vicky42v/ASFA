import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import _make_tasks, _get_subjects, _get_assignments, _assignment_map, _resolve_effective_department, _get_constraints, _optional_validation
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
    print('Active subjects count for Sem 5:', len(subs))
    for s in subs:
        print(f"  {s['subject_code']} ({s.get('course_category')}): {s.get('subject_name')}, opt_grp={s.get('group_id')}")
    asgs = _get_assignments(context)
    opt_val = _optional_validation(subs, asgs, context)
    print('Optional validation:', opt_val)
