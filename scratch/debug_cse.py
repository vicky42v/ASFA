import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.routes.timetable import context_from
from backend.services.timetable_service import _collect_generation_inputs, _solve_cp_sat_candidates
from backend.db import rows

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
    inputs, err2 = _collect_generation_inputs(context)
    print("Inputs err:", err2)
    if inputs:
        print("Constraint:", inputs.get("constraint"))
        print("Tasks count:", len(inputs.get("tasks", [])))
        for t in inputs.get("tasks", []):
            print(t.get("subject_code"), t.get("component"), "sessions:", t.get("weekly_hours"), "faculty:", t.get("faculty_id"), "is_lab:", t.get("is_lab"))
        
        # Test candidate solve
        candidates, solve_err = _solve_cp_sat_candidates(inputs, number_of_outputs=1, timeout_seconds=5)
        print("Solve err:", solve_err)
        print("Candidates count:", len(candidates))
