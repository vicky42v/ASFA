import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    r = rows("SELECT subject_code, subject_name, course_category, department_id, lecture_hours, practical_hours, credits FROM subject WHERE scheme_id = 2 AND semester_id = 3 ORDER BY department_id, subject_code")
    for s in r:
        print(f"Dept {s['department_id']}: {s['subject_code']} - {s['subject_name']} ({s['course_category']})")
