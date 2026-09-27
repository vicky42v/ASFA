import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute
from backend.services.timetable_service import generate_asfa_timetable, _days, _make_tasks, _safe_int, AsfaRuleEngine, _assignment_map, _selected_subjects, _optional_validation, _faculty_limits, rows, row
from ortools.sat.python import cp_model

app = create_app()
with app.app_context():
    execute("UPDATE timetable_constraints SET working_days='Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', max_periods_per_day=7, max_periods_per_week=42 WHERE constraint_id=6")
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    sem5_assignments = [
        (103, 1, 'Theory', 'Main'),
        (104, 2, 'Theory', 'Main'),
        (104, 3, 'Lab', 'Main'),
        (105, 4, 'Theory', 'Main'),
        (106, 5, 'Lab', 'Main'),
        (107, 6, 'Lab', 'Main'),
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
    
    # Let's inspect tasks
    subjects = rows("SELECT * FROM subject WHERE department_id=5 AND semester_id=5")
    assignments = rows("SELECT * FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    constraint = row("SELECT * FROM timetable_constraints WHERE constraint_id=6")
    days = _days(constraint)
    periods = _safe_int(constraint.get("periods_per_day"), 7)
    rule_engine = AsfaRuleEngine(context)
    optional = _optional_validation(subjects, assignments)
    subjects = _selected_subjects(subjects, optional)
    amap = _assignment_map(assignments)
    tasks = _make_tasks(subjects, amap, days, periods, constraint, rule_engine, context, assignments)
    print("Num tasks:", len(tasks))
    print("Faculty limits:", _faculty_limits(assignments, 42, rule_engine))
    for i, t in enumerate(tasks):
        print(f"Task {i}: {t['subject']['subject_code']} ({t['component']}) block={t.get('block_size')} facs={t.get('faculty_ids')} special={t.get('is_special')} pair={t.get('pair_key')}")
