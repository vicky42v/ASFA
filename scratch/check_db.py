import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    print('--- FACULTY SUBJECT ASSIGNMENTS (2026-27) ---')
    asgs = rows("SELECT * FROM faculty_subject_assignment WHERE academic_year = '2026-27'")
    for a in asgs:
        print(a)
    print('--- DETAILS ---')
    details = rows("SELECT * FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND status = 'Active'")
    for d in details:
        print(d)
