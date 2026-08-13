"""Database inspection script"""
from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.db import rows, row
    
    print('=== IPCC SUBJECTS ===')
    r = rows(
        "SELECT subject_id, subject_code, subject_name, department_id, semester_id, lecture_hours, tutorial_hours, practical_hours, course_category FROM subject WHERE course_category = 'IPCC' LIMIT 10",
        ()
    )
    for x in r:
        print(x)
    
    print('\n=== FSAD DATA ===')
    r2 = rows(
        "SELECT * FROM faculty_subject_assignment_detail WHERE status = 'Active' LIMIT 20",
        ()
    )
    for x in r2:
        print(x)
    
    print('\n=== COURSE CATEGORY DISTINCT ===')
    r3 = rows(
        "SELECT DISTINCT course_category FROM subject",
        ()
    )
    print([x['course_category'] for x in r3])
    
    print('\n=== SUBJECT TABLE COLUMNS ===')
    r4 = rows(
        "SHOW COLUMNS FROM subject",
        ()
    )
    for x in r4:
        print(x)
    
    print('\n=== EXISTING TIMETABLE CONTEXT (most recent) ===')
    r5 = rows(
        "SELECT DISTINCT department_id, scheme_id, academic_year, semester_type, semester_id, cycle FROM timetable LIMIT 10",
        ()
    )
    for x in r5:
        print(x)
