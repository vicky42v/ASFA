"""Test script for timetable generation with alternatives"""
from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import generate
    
    context = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 5,
        "number_of_outputs": 3,
    }
    
    print("Generating for context:", context)
    res = generate(context)
    print("Success:", res.get("success"))
    print("Total alternatives generated:", len(res.get("alternatives", [])))
    for alt in res.get("alternatives", []):
        print(f"Alternative {alt['id']}: {len(alt['timetable'])} entries")
