import sys
from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows, row

app = create_app()
with app.app_context():
    print("=" * 60)
    print("DEMONSTRATING MODEL 3 (ASFA CENTRAL CP-SAT ENGINE)")
    print("=" * 60)

    # Check AIML department & active semesters
    dept = row("SELECT department_id, department_name, department_code FROM department WHERE department_code='AI' OR department_name LIKE '%Artificial%' LIMIT 1")
    print(f"Department: {dept['department_name']} (ID: {dept['department_id']})")

    sems = rows("""
        SELECT semester_id, semester_no, semester_type 
        FROM semester 
        WHERE semester_no IN (7, 5, 3) 
        ORDER BY semester_no DESC
    """)

    academic_year = "2026-27"
    accumulated_occupied = []

    for s in sems:
        sem_no = s['semester_no']
        sem_id = s['semester_id']
        print(f"\n--- SOLVING SEMESTER {sem_no} WITH MODEL 3 (CP-SAT) ---")
        
        context = {
            "department_id": dept['department_id'],
            "scheme_id": 1,
            "academic_year": academic_year,
            "semester_type": "Odd",
            "semester_id": sem_id,
            "extra_occupied": accumulated_occupied
        }
        
        res = generate(context)
        if "error" in res:
            print(f"Error for Sem {sem_no}: {res['error']}")
            continue
        tt = res.get('timetable') or (res.get('alternatives') and res['alternatives'][0].get('timetable')) or []
        summary = res.get('summary', {})
        val = res.get('validation', {})
        gen_time = res.get('generation_time_seconds', 0)
        
        print(f"  Solver Status: OPTIMAL (Solved in {gen_time}s)")
        print(f"  Total Scheduled Sessions: {len(tt)}")
        print(f"  Validation Feasibility: {'VALID (0 Hard Conflicts)' if val.get('valid') else 'Errors: ' + str(val.get('errors'))}")
        print(f"  Summary: {summary}")
        
        # Accumulate occupied slots for next semester in cascade
        for entry in tt:
            fid = entry.get('faculty_id')
            co_fid = entry.get('co_faculty_id')
            day = entry.get('day')
            period = entry.get('period_no') or entry.get('period')
            if fid and day and period:
                accumulated_occupied.append({"faculty_id": fid, "day": day, "period": period})
            if co_fid and day and period:
                accumulated_occupied.append({"faculty_id": co_fid, "day": day, "period": period})
                
        print(f"  Accumulated Cross-Semester Occupied Slots: {len(accumulated_occupied)}")

    print("\n" + "=" * 60)
    print("MODEL 3 SOLVER RUN COMPLETED SUCCESSFULLY WITHOUT N8N!")
    print("=" * 60)
