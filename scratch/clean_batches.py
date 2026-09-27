import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute, rows

app = create_app()
with app.app_context():
    execute("UPDATE faculty_subject_assignment_detail SET batch = NULL WHERE assignment_role IN ('Main', 'Co')")
    print("Cleaned batch column for Main and Co roles:")
    for d in rows("SELECT detail_id, subject_id, faculty_id, component, assignment_role, batch FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND status = 'Active'"):
        print(d)
