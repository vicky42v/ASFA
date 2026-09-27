import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.routes.timetable import context_from
from backend.services.timetable_service import generate_asfa_timetable
from backend.db import rows
from ortools.sat.python import cp_model

app = create_app()
with app.app_context():
    cse_faculty = rows("SELECT faculty_id FROM faculty WHERE department_id=7 AND status='Active'")
    raw_context = {
        'department_id': 7,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'Odd Semesters',
        'semester_id': 7,
        'semester': 7,
        'proctor_b1_faculty_id': cse_faculty[0]['faculty_id'],
        'proctor_b2_faculty_id': cse_faculty[1]['faculty_id'],
        'selected_subjects': [230, 231, 232, 233, 234, 238],
    }
    context, err = context_from(raw_context)
    res = generate_asfa_timetable(context, number_of_outputs=1)
    print("GEN RES SUCCESS:", res.get("success"))
    print("GEN RES ERRORS:", res.get("errors"))
    print("GEN RES TIMETABLE:", len(res.get("timetable", [])))
    print("GEN RES VALIDATION:", res.get("validation"))
