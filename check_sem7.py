from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import generate
    context = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 7,
    }
    res = generate(context)
    print("Sem 7 Success:", res.get("success"))
    print("Validation:", res.get("validation"))
    print("Entries count:", len(res.get("timetable", [])))
