import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute
from backend.services.timetable_service import generate_asfa_timetable

app = create_app()
with app.app_context():
    execute("DELETE FROM subject_scheduling_config WHERE subject_id=103")
    execute("UPDATE timetable_constraints SET working_days='Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', max_periods_per_day=7, max_periods_per_week=42 WHERE constraint_id=6")
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    sem5_assignments = [
        (103, 1, 'Theory', 'Main'),
        (104, 2, 'Theory', 'Main'),
        (104, 3, 'Lab', 'Main'),
        (105, 4, 'Theory', 'Main'),
        (106, 5, 'Lab', 'Main'),
        (107, 99, 'Lab', 'Main'),
        (108, 7, 'Theory', 'Main'),
        (109, 8, 'Theory', 'Main'),
        (110, 99, 'Theory', 'Main'),
        (117, 9, 'Lab', 'Main'),
    ]
    for sid, fid, comp, role in sem5_assignments:
        execute(
            "INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status) VALUES (%s, %s, '2026-27', %s, %s, 'Active')",
            (sid, fid, comp, role)
        )
    
    context = {
        'department_id': 5,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'ODD',
        'semester_id': 5,
        'section_id': 1,
        'proctor_faculty_id': 1,
        'proctor_b1_faculty_id': 1,
        'proctor_b2_faculty_id': 2,
    }
    res = generate_asfa_timetable(context)
    print("Sem 5 Success:", res.get("success"), "Entries:", len(res.get("timetable") or []))
    if not res.get("success"):
        print("Validation errors:", res.get("validation_errors"))
    for e in res.get("timetable", []):
        if e.get("component") == "Lab" or e.get("batch"):
            print(" ", e.get("day"), "P" + str(e.get("period")), "Batch:", e.get("batch"), "Sub:", e.get("subject_code"), "Fac:", e.get("faculty_name"))
