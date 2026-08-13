from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.db import rows, execute
    from backend.services.timetable_service import generate
    
    subjects = rows("SELECT subject_id, subject_code, subject_name FROM subject WHERE department_id = 5 AND semester_id = 5 AND scheme_id = 1", ())
    sids = [s['subject_id'] for s in subjects]
    placeholders = ",".join(["%s"] * len(sids))
    execute(f"DELETE FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND subject_id IN ({placeholders})", tuple(sids))
    
    # Selected subjects in sem 5:
    # 103 (BCS501) -> faculty 1 (Dr. Jayasudha K)
    # 104 (BCS502 IPCC) -> faculty 2 (Mrs. Kolusu Lavanya)
    # 105 (BCS503) -> faculty 3 (Mr. Sai Kiran T S)
    # 106 (BAIL504) -> faculty 4 (Mr. Asghar Pasha)
    # 107 (BAI586) -> faculty 5 (Mrs. Nanda M B)
    # 108 (BRMK557) -> faculty 7 (Mr. Manzoor Ahmed)
    # 109 (BCS508) -> faculty 8 (Dr. Maheswari L Patil)
    # 110 (BAI515A PEC) -> faculty 99 (Mr. V. Srikaran)
    # 117 (BNSK559 MC) -> faculty 100 (Ms. Keerthi M S)
    
    valid_assignments = [
        (103, 1, 'Theory', 'Main'),
        (104, 2, 'Theory', 'Main'),
        (105, 3, 'Theory', 'Main'),
        (106, 4, 'Lab', 'Main'),
        (107, 5, 'Lab', 'Main'),
        (108, 7, 'Theory', 'Main'),
        (109, 8, 'Theory', 'Main'),
        (110, 99, 'Theory', 'Main'),
        (117, 100, 'Lab', 'Main'),
    ]
    
    for sid, fid, comp, role in valid_assignments:
        execute(
            """
            INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s, %s, '2026-27', %s, %s, 'Active')
            """,
            (sid, fid, comp, role)
        )
        
    print("Inserted valid clean assignments for Sem 5!")
    
    ctx = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 5,
        "number_of_outputs": 3,
    }
    
    res = generate(ctx)
    print("Sem 5 Generation Success:", res.get("success"))
    print("Total Alternatives:", len(res.get("alternatives", [])))
    for alt in res.get("alternatives", []):
        print(f"\n--- Alternative {alt['id']} ---")
        print(f"Scheduled sessions: {len(alt['timetable'])}")
        print("Sample entries:")
        for entry in alt['timetable'][:5]:
            print(f"  Day: {entry['day']}, Period: {entry['period']}, Subject: {entry['subject_code']} ({entry['component']}), Faculty: {entry['faculty_name']}")
