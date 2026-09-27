import sys, os
sys.path.insert(0, os.path.abspath('.'))
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    sub = rows("SELECT subject_id, department_id, scheme_id, semester_id FROM subject WHERE subject_code = 'BMATS101' LIMIT 1")
    fac = rows("SELECT faculty_id FROM faculty WHERE status = 'Active' LIMIT 1")

if sub and fac:
    payload = {
        "assignments": [
            {
                "subject_id": sub[0]["subject_id"],
                "faculty_id": fac[0]["faculty_id"],
                "academic_year": "2026-27",
                "component": "Theory",
                "assignment_role": "Main",
            }
        ]
    }
    with app.test_request_context():
        from backend.routes.faculty_assignment_rules import _save_bulk_assignments
        res = _save_bulk_assignments(payload)
        data = res[0].get_json() if isinstance(res, tuple) else res.get_json()
        print(f"Direct _save_bulk_assignments result: data={data}")
        
        saved = rows("SELECT * FROM faculty_subject_assignment_detail WHERE subject_id=%s AND status='Active'", (sub[0]["subject_id"],))
        print(f"Verified saved rows: {len(saved)}")
        for r in saved:
            print("Row:", r)
