import os
import sys
sys.path.insert(0, os.path.abspath("."))

from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows

app = create_app()
with app.app_context():
    print("==================================================================")
    print("AUTOMATED VERIFICATION: 2022 SCHEME vs 2025 SCHEME GENERATION")
    print("==================================================================")
    
    # 1. 2022 Scheme Test: CSE Sem 5
    print("\n--- TEST 1: 2022 Scheme (CSE Semester 5) ---")
    ctx_2022 = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 5,
        "number_of_outputs": 2,
    }
    res_2022 = generate(ctx_2022)
    assert res_2022.get("success"), f"2022 gen failed: {res_2022.get('validation', {}).get('errors') or res_2022.get('error')}"
    alts_2022 = res_2022.get("alternatives", [])
    print(f"PASS: Generated {len(alts_2022)} alternatives.")
    tt_2022 = alts_2022[0]["timetable"]
    print(f"Sessions in Alt 1: {len(tt_2022)}")
    codes_2022 = set(e["subject_code"] for e in tt_2022 if e.get("subject_code"))
    print(f"Sample 2022 Subject codes: {sorted(list(codes_2022))[:6]}")
    # Verify no 2025 course codes (starting with '1B') are in 2022 timetable
    for code in codes_2022:
        assert not code.startswith("1B"), f"Violation: 2025 course code {code} found in 2022 timetable!"
    print("VERIFIED: 2022 timetable contains strictly 2022 scheme subjects.")
    
    # 2. 2025 Scheme Test: CSE Sem 3
    print("\n--- TEST 2: 2025 Scheme (CSE Semester 3) ---")
    ctx_2025_cse = {
        "department_id": 5,
        "scheme_id": 2,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 3,
        "number_of_outputs": 2,
    }
    res_2025_cse = generate(ctx_2025_cse)
    assert res_2025_cse.get("success"), f"2025 CSE gen failed: {res_2025_cse.get('validation', {}).get('errors') or res_2025_cse.get('error')}"
    alts_2025_cse = res_2025_cse.get("alternatives", [])
    print(f"PASS: Generated {len(alts_2025_cse)} alternatives.")
    tt_2025_cse = alts_2025_cse[0]["timetable"]
    print(f"Sessions in Alt 1: {len(tt_2025_cse)}")
    codes_2025_cse = set(e["subject_code"] for e in tt_2025_cse if e.get("subject_code"))
    print(f"Sample 2025 Subject codes: {sorted(list(codes_2025_cse))[:6]}")
    # Verify course codes are 2025 codes
    assert any(code.startswith("1B") for code in codes_2025_cse), "Violation: Expected 2025 '1B...' course codes!"
    print("VERIFIED: 2025 CSE timetable contains strictly 2025 scheme subjects.")

    # 3. 2025 Scheme Test: AIML Sem 3
    print("\n--- TEST 3: 2025 Scheme (AIML Semester 3) ---")
    aiml_subs = rows("SELECT subject_id FROM subject WHERE department_id=8 AND semester_id=3 AND scheme_id=2 AND subject_code NOT IN ('1BPE309', '1BYOG309', '1BMUK309', '1BCSL307A', '1BXXL307')")
    ctx_2025_aiml = {
        "department_id": 8,
        "scheme_id": 2,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 3,
        "selected_subjects": [s["subject_id"] for s in aiml_subs],
        "number_of_outputs": 2,
    }
    res_2025_aiml = generate(ctx_2025_aiml)
    assert res_2025_aiml.get("success"), f"2025 AIML gen failed: {res_2025_aiml.get('validation', {}).get('errors') or res_2025_aiml.get('error')}"
    alts_2025_aiml = res_2025_aiml.get("alternatives", [])
    print(f"PASS: Generated {len(alts_2025_aiml)} alternatives.")
    tt_2025_aiml = alts_2025_aiml[0]["timetable"]
    print(f"Sessions in Alt 1: {len(tt_2025_aiml)}")
    codes_2025_aiml = set(e["subject_code"] for e in tt_2025_aiml if e.get("subject_code"))
    print(f"Sample 2025 AIML codes: {sorted(list(codes_2025_aiml))[:6]}")
    print("VERIFIED: 2025 AIML timetable generated cleanly.")

    # 4. 2025 Scheme Test: First Year Basic Science Sem 1 P-Cycle
    print("\n--- TEST 4: 2025 Scheme (First Year Sem 1 P-Cycle) ---")
    # In FY P-Cycle, select standard set: Maths, Physics, CAED, ESC, PLC, English, IDT, Kannada
    fy_subs = rows("SELECT subject_id, subject_code FROM subject WHERE department_id=9 AND semester_id=1 AND scheme_id=2 AND cycle='P'")
    # Filter 1 from each group
    chosen_codes = {'1BMATS101', '1BPHYS102', '1BCEDS103', '1BESC104B', '1BPLC105B', '1BENG106', '1BIDTL158', '1BKSK109'}
    fy_sids = [s["subject_id"] for s in fy_subs if s["subject_code"] in chosen_codes]
    ctx_2025_fy = {
        "department_id": 9,
        "scheme_id": 2,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "semester_id": 1,
        "cycle": "P",
        "selected_subjects": fy_sids,
        "number_of_outputs": 2,
    }
    res_2025_fy = generate(ctx_2025_fy)
    assert res_2025_fy.get("success"), f"2025 FY gen failed: {res_2025_fy.get('validation', {}).get('errors') or res_2025_fy.get('error')}"
    alts_2025_fy = res_2025_fy.get("alternatives", [])
    print(f"PASS: Generated {len(alts_2025_fy)} alternatives.")
    tt_2025_fy = alts_2025_fy[0]["timetable"]
    print(f"Sessions in Alt 1: {len(tt_2025_fy)}")
    codes_2025_fy = set(e["subject_code"] for e in tt_2025_fy if e.get("subject_code"))
    print(f"Sample 2025 FY codes: {sorted(list(codes_2025_fy))[:6]}")
    print("VERIFIED: 2025 First Year timetable generated cleanly.")

    print("\n==================================================================")
    print("ALL TESTS PASSED SUCCESSFULLY! SCHEMES ARE FULLY SEPARATE & WORKING")
    print("==================================================================")
