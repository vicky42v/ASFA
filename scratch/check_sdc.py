import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    r = rows("SELECT subject_id, department_id, semester_id, scheme_id, subject_code, subject_name, course_category, is_optional, faculty_assignment_required FROM subject WHERE course_category = 'SDC' OR subject_code LIKE '%SDC%'")
    print(f"Total SDC subjects: {len(r)}")
    for x in r[:20]:
        print(x)
