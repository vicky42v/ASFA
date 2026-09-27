import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate_asfa_timetable, _get_subjects, _get_assignments

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
    print("TEST 1: Generate timetable without SDC assigned (User omits SDC)")
    print("=================================================================")
    res1 = generate_asfa_timetable(context)
    assert res1.get('alternatives'), "Test 1 failed: No alternatives generated"
    alt1 = res1['alternatives'][0]
    tt1 = alt1.get('timetable', [])
    sdc_in_tt1 = [e for e in tt1 if 'BCP308' in str(e.get('subject_code')) or 'SDC' in str(e.get('course_category'))]
    print(f"Test 1 Success! Total periods: {len(tt1)}, SDC periods: {len(sdc_in_tt1)} (Expected: 0)")
    assert len(sdc_in_tt1) == 0, "Expected 0 SDC periods when unassigned"

    print("\n=================================================================")
    print("TEST 2: Generate timetable with SDC assigned (User intends to add SDC)")
    print("=================================================================")
    context_with_sdc = dict(context)
    subs = _get_subjects(context)
    context_with_sdc['selected_subjects'] = [s['subject_id'] for s in subs]
    asgs = _get_assignments(context)
    asgs.append({
        'subject_id': 10651,
        'faculty_id': 101,
        'component': 'Theory',
        'assignment_role': 'Main',
        'department_id': 5,
        'academic_year': '2026-27',
        'scheme_id': 2,
        'semester_id': 3,
        'batch': None,
    })
    context_with_sdc['assignments'] = asgs

    res2 = generate_asfa_timetable(context_with_sdc)
    assert res2.get('alternatives'), "Test 2 failed: No alternatives generated"
    alt2 = res2['alternatives'][0]
    tt2 = alt2.get('timetable', [])
    sdc_in_tt2 = [e for e in tt2 if '10651' == str(e.get('subject_id')) or '1BCP308' == str(e.get('subject_code'))]
    print(f"Test 2 Success! Total periods: {len(tt2)}, SDC periods: {len(sdc_in_tt2)} (Expected: > 0)")
    for e in sdc_in_tt2:
        print(f"  SDC entry: {e.get('day')} Period {e.get('period')} - {e.get('subject_code')} ({e.get('faculty_name')})")
    assert len(sdc_in_tt2) > 0, "Expected SDC periods when assigned"

    print("\nALL SDC ON-DEMAND TESTS PASSED SUCCESSFULLY!")
