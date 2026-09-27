import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.routes.timetable import context_from
from backend.services.timetable_service import (
    _get_constraints, _get_subjects, _get_assignments, _optional_validation,
    _selected_subjects, _assignment_map, _days, _make_tasks,
    _faculty_limits, _existing_occupied
)
from backend.db import rows

app = create_app()
with app.app_context():
    cse_faculty = rows("SELECT faculty_id, faculty_name, designation, role, max_workload FROM faculty WHERE department_id=7 AND status='Active'")
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
    constraint = _get_constraints(context)
    assignments = _get_assignments(context)
    limits = _faculty_limits(assignments, 42)
    print("Faculty limits:", limits)
    occupied = _existing_occupied(context)
    print("Occupied slots count:", len(occupied))
    for f in cse_faculty:
        assigned_tasks = [a for a in assignments if a.get('faculty_id') == f['faculty_id']]
        if assigned_tasks:
            print(f"Faculty {f['faculty_name']} (ID {f['faculty_id']}): {len(assigned_tasks)} assignments, limit={limits.get(f['faculty_id'])}")
