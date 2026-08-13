from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import generate
    for sem_id in [1, 3, 5, 7]:
        ctx = {
            "department_id": 5 if sem_id != 1 else 9,
            "scheme_id": 1,
            "academic_year": "2026-27",
            "semester_type": "Odd",
            "semester_id": sem_id,
            "number_of_outputs": 3,
        }
        if sem_id == 1:
            ctx["cycle"] = "P"
            
        res = generate(ctx)
        print(f"Sem {sem_id} Result:", res.get("success"), "Alts count:", len(res.get("alternatives", [])))
        if not res.get("success"):
            print("   Errors:", res.get("validation", {}).get("errors"))
        else:
            print("   Alt 1 sessions:", len(res["alternatives"][0]["timetable"]))
            if len(res["alternatives"]) > 1:
                print("   Alt 2 sessions:", len(res["alternatives"][1]["timetable"]))
