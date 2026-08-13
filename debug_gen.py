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
    }
    res = generate(context)
    print("Validation:", res.get("validation"))
