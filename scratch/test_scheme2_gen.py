import os
import sys
sys.path.insert(0, os.path.abspath("."))

from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows

app = create_app()
with app.app_context():
    print("Testing Generation for Scheme 2025 (scheme_id=2)...")
    
    # Test CSE Sem 3 Scheme 2025
    ctx_2025 = {
        "department_id": 5,
        "scheme_id": 2,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 3,
        "number_of_outputs": 2,
    }
    
    print("\n1. Generating CSE Sem 3 under 2025 Scheme...")
    res_2025 = generate(ctx_2025)
    print("Result 2025 success:", res_2025.get("success"))
    if not res_2025.get("success"):
        print("Errors:", res_2025.get("validation", {}).get("errors") or res_2025.get("error"))
    else:
        alts = res_2025.get("alternatives", [])
        print(f"Alternatives generated: {len(alts)}")
        if alts:
            print(f"Sample sessions from Alt 1: {len(alts[0]['timetable'])}")
            for s in alts[0]['timetable'][:5]:
                print(f"  Day: {s['day']} | Period: {s['period']} | Code: {s.get('subject_code')} | Subject: {s.get('subject_name')} | Faculty: {s.get('faculty_name')}")

    # Test CSE Sem 3 Scheme 2022 for comparison
    ctx_2022 = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 3,
        "number_of_outputs": 2,
    }
    print("\n2. Generating CSE Sem 3 under 2022 Scheme...")
    res_2022 = generate(ctx_2022)
    print("Result 2022 success:", res_2022.get("success"))
    if not res_2022.get("success"):
        print("Errors:", res_2022.get("validation", {}).get("errors") or res_2022.get("error"))
    else:
        alts = res_2022.get("alternatives", [])
        print(f"Alternatives generated: {len(alts)}")
        if alts:
            print(f"Sample sessions from Alt 1: {len(alts[0]['timetable'])}")
            for s in alts[0]['timetable'][:5]:
                print(f"  Day: {s['day']} | Period: {s['period']} | Code: {s.get('subject_code')} | Subject: {s.get('subject_name')} | Faculty: {s.get('faculty_name')}")
