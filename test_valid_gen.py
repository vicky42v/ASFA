from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.db import execute
    from backend.services.timetable_service import generate
    
    # Reassign BRMK557 (subject 108) from faculty 2 to faculty 6 for testing
    execute("UPDATE faculty_subject_assignment_detail SET faculty_id = 6 WHERE subject_id = 108 AND academic_year = '2026-27'", ())
    
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
