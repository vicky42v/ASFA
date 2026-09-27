import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute, rows

app = create_app()
with app.app_context():
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    assignments = [
        {'subject_id': 144, 'faculty_id': 98, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'},
        {'subject_id': 144, 'faculty_id': 98, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Lab', 'assignment_role': 'Main'},
        {'subject_id': 144, 'faculty_id': 8, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Lab', 'assignment_role': 'Co'},
        {'subject_id': 145, 'faculty_id': 5, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'},
        {'subject_id': 145, 'faculty_id': 5, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Lab', 'assignment_role': 'Main'},
        {'subject_id': 145, 'faculty_id': 4, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Lab', 'assignment_role': 'Co'},
        {'subject_id': 146, 'faculty_id': 4, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'},
        {'subject_id': 147, 'faculty_id': 5, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'},
        {'subject_id': 151, 'faculty_id': 8, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'},
        {'subject_id': 567, 'faculty_id': 57, 'academic_year': '2026-27', 'department_id': 5, 'scheme_id': 1, 'semester_id': 7, 'component': 'Theory', 'assignment_role': 'Main'}
    ]
    for a in assignments:
        execute("""
            INSERT INTO faculty_subject_assignment_detail
                (subject_id, faculty_id, component, assignment_role, academic_year, batch, status)
            VALUES (%s, %s, %s, %s, %s, NULL, 'Active')
        """, (a['subject_id'], a['faculty_id'], a['component'], a['assignment_role'], a['academic_year']))
        if a['assignment_role'] == 'Main':
            execute("""
                INSERT INTO faculty_subject_assignment
                    (subject_id, faculty_id, academic_year, status)
                VALUES (%s, %s, %s, 'Active')
                ON DUPLICATE KEY UPDATE status='Active', faculty_id=VALUES(faculty_id)
            """, (a['subject_id'], a['faculty_id'], a['academic_year']))
    print("Restored active assignments. Total active details:")
    for r in rows("SELECT detail_id, subject_id, faculty_id, component, assignment_role FROM faculty_subject_assignment_detail WHERE academic_year='2026-27' AND status='Active'"):
        print(r)
