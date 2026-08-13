from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import _get_subjects, _get_assignments
    from collections import defaultdict
    
    context = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 5,
    }
    
    subjects = _get_subjects(context)
    assignments = _get_assignments(context)
    
    print("FSAD Assignments count:", len(assignments))
    for a in assignments:
        print(a['subject_id'], a['subject_code'], a['component'], a['assignment_role'], a['faculty_id'], a['faculty_name'])
