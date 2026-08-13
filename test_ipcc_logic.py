from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import _component_names, _assignment_map, _assignment_validation, _get_subjects, _get_assignments
    
    context = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 5,
    }
    
    subjects = _get_subjects(context)
    print("Subjects count:", len(subjects))
    for s in subjects:
        print(s['subject_code'], "Category:", s.get('course_category'), "L-T-P:", s.get('lecture_hours'), s.get('tutorial_hours'), s.get('practical_hours'))
