import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute, row
import json

app = create_app()
with app.app_context():
    client = app.test_client()

    # Assign faculty to CSE Sem 7 core subjects if not yet assigned
    cse_faculty = rows("SELECT faculty_id, faculty_name FROM faculty WHERE department_id=7 AND status='Active'")
    print(f"CSE Faculty available: {len(cse_faculty)}")
    
    execute("DELETE FROM faculty_subject_assignment_detail WHERE subject_id IN (SELECT subject_id FROM subject WHERE department_id=7)")
    print("Cleaned prior CSE assignments.")

    # Core + 1 from group 35 + 1 from group 36:
    target_codes = ['BCS701', 'BCS702', 'BCS703', 'BCS786', 'BCS714A', 'BCS755A']
    subs = rows(f"SELECT subject_id, subject_code, subject_name, lecture_hours, tutorial_hours, practical_hours FROM subject WHERE department_id=7 AND subject_code IN ({','.join(['%s']*len(target_codes))})", tuple(target_codes))
    
    # Ensure each subject uses a distinct faculty member so no one exceeds 18h
    # (CSE has 17 faculty members available)
    for i, s in enumerate(subs):
        fac = cse_faculty[i]
        execute("""
            INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s, %s, '2026-27', 'Theory', 'Main', 'Active')
            ON DUPLICATE KEY UPDATE faculty_id=VALUES(faculty_id), status='Active'
        """, (s['subject_id'], fac['faculty_id']))
        if (s.get('practical_hours') or 0) > 0:
            fac_lab = cse_faculty[i + len(subs)]
            execute("""
                INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
                VALUES (%s, %s, '2026-27', 'Lab', 'Main', 'Active')
                ON DUPLICATE KEY UPDATE faculty_id=VALUES(faculty_id), status='Active'
            """, (s['subject_id'], fac_lab['faculty_id']))

    payload = {
        "department_id": 7, # CSE-A
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd Semesters",
        "semester_id": 7,
        "semester": 7,
        "cycle": None,
        "number_of_outputs": 3,
        "proctor_b1_faculty_id": cse_faculty[0]['faculty_id'],
        "proctor_b2_faculty_id": cse_faculty[1]['faculty_id'],
        "selected_subjects": [s['subject_id'] for s in subs],
    }

    with client.session_transaction() as sess:
        sess['user'] = {'role': 'Admin', 'user_id': 1, 'name': 'Admin'}

    resp = client.post('/api/timetable/generate', json=payload)
    print("STATUS CODE:", resp.status_code)
    data = resp.get_json()
    print("SUCCESS:", data.get("success"))
    print("MESSAGE:", data.get("message"))
    
    if data.get("success"):
        res_data = data.get("data", {})
        print("Alternatives generated:", len(res_data.get("alternatives", [])))
        timetable = res_data.get("timetable", [])
        print("Sessions scheduled:", len(timetable))
        
        # Check proctor period
        proctors = [t for t in timetable if t.get('is_proctor')]
        for p in proctors:
            print(f"CSE Sem 7 Proctor scheduled at: Day {p.get('day_name')} Period {p.get('period_number')} (Should be >= 7: {p.get('period_number') >= 7})")
            assert p.get('period_number') >= 7, "Proctor MUST be in afternoon (>=7) for Sem 7!"
            
        print("ALL CSE GENERATION CHECKS PASSED!")
    else:
        print("ERRORS:", data.get("errors"))
