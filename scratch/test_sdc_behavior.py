import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_assignments, _optional_validation, _selected_subjects
)

app = create_app()
with app.app_context():
    context = {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 5, 'scheme_id': 2, 'semester_id': 3}
    subs = _get_subjects(context)
    asgs = _get_assignments(context)
    
    # 1. Without SDC assignment and without SDC in selected_subjects
    opt1 = _optional_validation(subs, asgs, context)
    sel1 = _selected_subjects(subs, opt1)
    sdc_in_sel1 = [s for s in sel1 if s['course_category'] == 'SDC']
    print(f"Test 1 (No SDC assignment/selection): SDC in selected_subjects = {len(sdc_in_sel1)}")
    
    # 2. With SDC (1BCP308) in context['selected_subjects']
    context2 = dict(context)
    context2['selected_subjects'] = [10651]
    opt2 = _optional_validation(subs, asgs, context2)
    sel2 = _selected_subjects(subs, opt2)
    sdc_in_sel2 = [s for s in sel2 if s['course_category'] == 'SDC']
    print(f"Test 2 (User intends to add SDC 10651): SDC in selected_subjects = {len(sdc_in_sel2)} ({[s['subject_code'] for s in sdc_in_sel2]})")
