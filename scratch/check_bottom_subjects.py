import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute

app = create_app()
with app.app_context():
    print("Checking current status...")
    asgs = rows('''
        SELECT s.subject_code, s.subject_name, d.component, d.assignment_role, f.faculty_name, d.status
        FROM faculty_subject_assignment_detail d
        JOIN subject s ON d.subject_id = s.subject_id
        JOIN faculty f ON d.faculty_id = f.faculty_id
        WHERE s.scheme_id = 2 AND s.semester_id = 3 AND s.department_id = 5 AND d.status = 'Active'
        ORDER BY s.subject_code, d.component, d.assignment_role
    ''')
    for a in asgs:
        print(f"{a['subject_code']} ({a['component']} - {a['assignment_role']}): {a['faculty_name']}")
