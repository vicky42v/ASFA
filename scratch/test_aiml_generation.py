import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute
from backend.services.timetable_service import generate

app = create_app()
with app.app_context():
    context = {
        'department_id': 5, # AIML
        'scheme_id': 1,
        'semester_id': 7,
        'semester_no': 7,
        'academic_year': '2026-27',
        'semester_type': 'Odd',
    }
    
    # Assign faculty to AIML Sem 7 core subjects
    aiml_fac = rows("SELECT faculty_id, faculty_name FROM faculty WHERE department_id=5 AND status='Active'")
    print(f"AIML Faculty available: {len(aiml_fac)}")
    
    execute("DELETE FROM faculty_subject_assignment_detail WHERE subject_id IN (SELECT subject_id FROM subject WHERE department_id=5)")
    
    target_codes = ['BAI701', 'BAI702', 'BAD703', 'BAI786', 'BCS714D', 'BEC755A']
    subs = rows(f"SELECT subject_id, subject_code, subject_name, credits, lecture_hours, tutorial_hours, practical_hours FROM subject WHERE department_id=5 AND subject_code IN ({','.join(['%s']*len(target_codes))})", tuple(target_codes))
    
    for i, s in enumerate(subs):
        fac = aiml_fac[i % len(aiml_fac)]
        execute("""
            INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s, %s, '2026-27', 'Theory', 'Main', 'Active')
            ON DUPLICATE KEY UPDATE faculty_id=VALUES(faculty_id), status='Active'
        """, (s['subject_id'], fac['faculty_id']))
        if (s.get('practical_hours') or 0) > 0:
            fac_lab = aiml_fac[(i + 4) % len(aiml_fac)]
            execute("""
                INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
                VALUES (%s, %s, '2026-27', 'Lab', 'Main', 'Active')
                ON DUPLICATE KEY UPDATE faculty_id=VALUES(faculty_id), status='Active'
            """, (s['subject_id'], fac_lab['faculty_id']))

    context['selected_subjects'] = [s['subject_id'] for s in subs]
    
    res = generate(context)
    print("AIML GENERATE SUCCESS:", res.get("success"))
    if not res.get("success"):
        print("Validation errors:", res.get("validation", {}).get("errors"))
    else:
        tt = res.get("timetable", [])
        print(f"AIML generated {len(tt)} total slots.")
        
        # Check weekly count of each subject
        from collections import Counter
        counts = Counter()
        placement_days = Counter()
        for e in tt:
            code = e['subject_code']
            # Only count once per (day, period) for multi-batch
            counts[code] += 1
            if code == 'PLACEMENT':
                placement_days[e['day']] += 1
            if code in ('PLACEMENT', 'LIBRARY', 'REMEDIAL', 'ACTIVITY', 'PROCTOR'):
                print(f"  {e['day']} Period {e['period']}: {code} ({e.get('subject_name')})")

        print("\nSubject Counts:")
        for c, n in sorted(counts.items()):
            print(f"  {c}: {n}")
            
        print("\nPlacement per day:")
        for d, n in placement_days.items():
            print(f"  {d}: {n} periods (max: 3)")
            assert n <= 3, f"Placement exceeded 3 periods on {d}"
            
        assert placement_days.total() == 5, f"Expected 5 Placement periods, got {placement_days.total()}"
        print("\nAll assertions passed for AIML Sem 7!")
