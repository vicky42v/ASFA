import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    print("--- NCMC Co-curriculars in subject table ---")
    r = rows("SELECT subject_id, department_id, semester_id, scheme_id, subject_code, subject_name, course_category, faculty_assignment_required, lecture_hours, practical_hours, credits FROM subject WHERE subject_code IN ('1BNSS309', '1BPE309', '1BYOG309', '1BMUK309', '1BNSK409', '1BPEK409', '1BYOK409', '1BMUS409') ORDER BY subject_code, department_id")
    for x in r:
        print(x)
