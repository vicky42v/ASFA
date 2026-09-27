from backend.app import create_app

app = create_app()

with app.app_context():
    from backend.db import rows, execute
    from backend.services.timetable_service import generate

    subjects = rows(
        "SELECT subject_id, subject_code, subject_name FROM subject WHERE department_id = 5 AND semester_id = 3 AND scheme_id = 1",
        ()
    )
    sids = [s['subject_id'] for s in subjects]
    if sids:
        placeholders = ",".join(["%s"] * len(sids))
        execute(
            f"DELETE FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND subject_id IN ({placeholders})",
            tuple(sids)
        )

    # Valid default assignments for AIML Semester 3
    # 65 (BCS301 Maths) -> 1 (Dr. Jayasudha K)
    # 66 (BCS302 DDCO IPCC) -> 2 (Mrs. Kolusu Lavanya) Theory & Lab
    # 67 (BCS303 OS IPCC) -> 3 (Mr. Sai Kiran T S) Theory & Lab
    # 68 (BCS304 DSA) -> 4 (Mr. Asghar Pasha) Theory
    # 69 (BCSL305 DSA Lab) -> 5 (Mrs. Nanda M B) Lab
    # 70 (BCSK307 SCR) -> 7 (Mr. Manzoor Ahmed) Lab
    # 76 (BCS306A Java PLC) -> 6 (Ms. Ramya H) Theory & Lab
    # 85 (BALI358D Python AEC) -> 8 (Dr. Maheswari L Patil) Lab
    # 71 (BNSK359 NSS MC) -> 98 (Mr. V. Srikaran) Lab

    valid_assignments = [
        (65, 1, 'Theory', 'Main'),
        (66, 2, 'Theory', 'Main'),
        (66, 2, 'Lab', 'Main'),
        (67, 3, 'Theory', 'Main'),
        (67, 3, 'Lab', 'Main'),
        (68, 4, 'Theory', 'Main'),
        (69, 5, 'Lab', 'Main'),
        (70, 7, 'Lab', 'Main'),
        (76, 100, 'Theory', 'Main'),
        (76, 100, 'Lab', 'Main'),
        (85, 8, 'Lab', 'Main'),
        (71, 98, 'Lab', 'Main'),
    ]

    for sid, fid, comp, role in valid_assignments:
        execute(
            """
            INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s, %s, '2026-27', %s, %s, 'Active')
            """,
            (sid, fid, comp, role)
        )

    print("Inserted valid clean assignments for Sem 3!")

    ctx = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 3,
        "number_of_outputs": 3,
    }

    res = generate(ctx)
    print("Sem 3 Generation Success:", res.get("success"))
    print("Total Alternatives:", len(res.get("alternatives", [])))
    if res.get("success"):
        print("Alt 1 sessions:", len(res["alternatives"][0]["timetable"]))
    else:
        print("Validation errors:", res.get("validation", {}).get("errors") or res.get("errors"))
