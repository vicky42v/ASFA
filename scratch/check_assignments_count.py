import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    asgs = rows("SELECT s.department_id, s.semester_id, COUNT(*) as cnt FROM faculty_subject_assignment_detail d JOIN subject s ON d.subject_id=s.subject_id WHERE d.status='Active' GROUP BY s.department_id, s.semester_id")
    print("Active assignments in faculty_subject_assignment_detail:")
    for r in asgs:
        print(f"  Dept {r['department_id']}, Sem {r['semester_id']}: {r['cnt']} assignments")
    facs = rows("SELECT department_id, COUNT(*) as cnt FROM faculty WHERE status='Active' GROUP BY department_id")
    print("Faculty counts per department:")
    for r in facs:
        print(f"  Dept {r['department_id']}: {r['cnt']} faculty")
