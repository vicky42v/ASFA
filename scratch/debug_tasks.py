import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
from backend.services.timetable_service import _get_subjects, _make_tasks, _get_assignments, _assignment_map, _start_periods, _days, generate
from backend.services.asfa_rule_engine import AsfaRuleEngine

app = create_app()
with app.app_context():
    context = {
        'department_id': 7,
        'scheme_id': 1,
        'semester_id': 7,
        'semester_no': 7,
        'academic_year': '2026-27',
        'semester_type': 'Odd Semesters',
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
    print(f"Total tasks: {len(tasks)}")
    total_slots = sum(t.get('block_size', 1) for t in tasks)
    print(f"Total slots required: {total_slots} out of {len(days) * periods}")
    for t in tasks:
        c_code = t['subject']['subject_code']
        comp = t.get('component')
        bsize = t.get('block_size')
        alo = t.get('after_lunch_only')
        pkey = t.get('pair_key')
        facs = t.get('faculty_ids')
        print(f"  {c_code:10} | {comp:6} | size: {bsize} | after_lunch: {alo} | pair: {pkey} | facs: {facs}")
