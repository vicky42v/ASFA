import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    generate_asfa_timetable, _get_subjects, _get_assignments, _optional_validation, _selected_subjects
)
from backend.routes.faculty_assignment_rules import list_details, reset_all_assignments
from flask import session

app = create_app()
with app.app_context():
    context = {
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'department_id': 5,
        'scheme_id': 2,
        'semester_id': 3,
        'section': 'A',
        'number_of_outputs': 1,
    }
    
    print("=================================================================")
    print("TEST 1: On-demand check for SDC, ADC, and Lateral Entry (MATDIP)")
    print("=================================================================")
    subs = _get_subjects(context)
    asgs = _get_assignments(context)
    opt1 = _optional_validation(subs, asgs, context)
    sel1 = _selected_subjects(subs, opt1)
    
    sdc_in_sel1 = [s for s in sel1 if s['course_category'] in ('SDC', 'ADC') or 'DIP' in s['subject_code']]
    print(f"When unassigned: on-demand subjects in selected_subjects = {len(sdc_in_sel1)} (Expected 0)")
    assert len(sdc_in_sel1) == 0, "Unassigned on-demand subjects should not be in selected_subjects"
    
    res1 = generate_asfa_timetable(context)
    assert res1.get('alternatives'), "Generation failed without on-demand subjects"
    tt1 = res1['alternatives'][0].get('timetable', [])
    print(f"Generation successful: {len(tt1)} periods generated with 0 on-demand subjects.")

    print("\n=================================================================")
    print("TEST 2: User assigns faculty to 1BMATDIP310 (Lateral Entry Maths)")
    print("=================================================================")
    matdip = next((s for s in subs if 'DIP' in s['subject_code']), None)
    assert matdip is not None, "1BMATDIP310 should exist in Sem 3"
    print(f"Found {matdip['subject_code']} (id {matdip['subject_id']}, L={matdip['lecture_hours']}, credits={matdip['credits']})")
    
    context_with_dip = dict(context)
    context_with_dip['selected_subjects'] = [s['subject_id'] for s in subs]
    asgs2 = _get_assignments(context)
    asgs2.append({
        'subject_id': matdip['subject_id'],
        'faculty_id': 101,
        'component': 'Theory',
        'assignment_role': 'Main',
        'department_id': 5,
        'academic_year': '2026-27',
        'scheme_id': 2,
        'semester_id': 3,
        'batch': None,
    })
    context_with_dip['assignments'] = asgs2
    
    opt2 = _optional_validation(subs, asgs2, context_with_dip)
    sel2 = _selected_subjects(subs, opt2)
    dip_in_sel2 = [s for s in sel2 if s['subject_id'] == matdip['subject_id']]
    print(f"When assigned: {matdip['subject_code']} in selected_subjects = {len(dip_in_sel2)} (Expected 1)")
    assert len(dip_in_sel2) == 1, "Assigned on-demand subject should be in selected_subjects"

    res2 = generate_asfa_timetable(context_with_dip)
    assert res2.get('alternatives'), "Generation failed with assigned 1BMATDIP310"
    tt2 = res2['alternatives'][0].get('timetable', [])
    dip_entries = [e for e in tt2 if str(e.get('subject_id')) == str(matdip['subject_id'])]
    print(f"Generation successful! {matdip['subject_code']} scheduled in timetable: {len(dip_entries)} periods:")
    for e in dip_entries:
        print(f"  {e.get('day')} Period {e.get('period')} - {e.get('subject_code')} ({e.get('faculty_name')})")
    assert len(dip_entries) == 1, "Expected exactly 1 period scheduled for 1BMATDIP310"

    print("\nALL BACKEND TESTS PASSED CLEANLY!")
