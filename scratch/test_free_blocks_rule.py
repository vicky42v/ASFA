import sys
from backend.app import create_app

app = create_app()
with app.app_context():
    from backend.services.timetable_service import generate
    # Generate Sem 7
    ctx = {
        'department_id': 5,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'semester_id': 7,
        'number_of_outputs': 1,
    }
    res = generate(ctx)
    print("Success:", res.get("success"))
    if not res.get("success"):
        print("Errors:", res.get("errors") or res.get("validation"))
    else:
        alt = res['alternatives'][0]['timetable']
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        grid = {d: {p: '---' for p in range(1, 8)} for d in days}
        for item in alt:
            grid[item['day']][item['period']] = item.get('subject_code') or item.get('subject_name')[:8]
        for d in days:
            print(f"{d:9}: " + " | ".join(f"P{p}: {grid[d][p]}" for p in range(1, 8)))
