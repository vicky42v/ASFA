import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_validator import validate_entries

app = create_app()
with app.app_context():
    constraint = {
        "periods_per_day": 7,
        "lunch_after_period": 4,
        "short_break_after_period": 2,
        "lab_duration": 2,
    }
    context = {
        "department_id": 5,
        "semester_id": 7,
        "semester_no": 7,
        "academic_year": "2026-27",
    }
    
    # Test 1: Lab placed at [2, 3] (illegal start)
    bad_lab_entries = [
        {"subject_id": 144, "subject_code": "BAI701", "component": "Lab", "day": "Monday", "period": 2, "batch": "B1", "faculty_id": 98},
        {"subject_id": 144, "subject_code": "BAI701", "component": "Lab", "day": "Monday", "period": 3, "batch": "B1", "faculty_id": 98},
    ]
    val1 = validate_entries(bad_lab_entries, constraints=constraint, context=context)
    print("Test 1 - Illegal lab at [2,3] caught?", any(c.get("type") == "invalid_lab_block_structure" for c in val1.get("conflicts", [])))
    
    # Test 2: Proctor placed at Period 3 (morning) for Semester 7
    bad_proctor_entries = [
        {"subject_id": 999907, "subject_code": "PROCTOR", "component": "Theory", "day": "Monday", "period": 3, "batch": "B1", "faculty_id": 3},
    ]
    val2 = validate_entries(bad_proctor_entries, constraints=constraint, context=context)
    print("Test 2 - Sem 7 Proctor at morning period 3 caught?", any(c.get("type") == "sem7_afternoon_rule_violation" for c in val2.get("conflicts", [])))
