import os
import sys

# Add project root to sys.path
sys.path.insert(0, r"c:\AI-ASFA")

from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows, row

app = create_app()
with app.app_context():
    dept_id = 5
    scheme_id = 1
    academic_year = "2026-27"
    semester_type = "Odd"

    from backend.db import execute
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    active_facs = [f['faculty_id'] for f in rows("SELECT faculty_id FROM faculty WHERE status='Active' AND department_id=5")]
    print(f"Found {len(active_facs)} active faculties in department 5: {active_facs}")
    # Insert assignments for Sem 7
    sem7_assignments = [
        (146, active_facs[0], 'Theory', 'Main'), # BAD703
        (148, active_facs[1], 'Theory', 'Main'), # BAD714B
        (144, active_facs[2], 'Theory', 'Main'), # BAI701
        (144, active_facs[3], 'Lab', 'Main'),    # BAI701
        (145, active_facs[4], 'Theory', 'Main'), # BAI702
        (145, active_facs[5], 'Lab', 'Main'),    # BAI702
        (152, active_facs[6], 'Theory', 'Main'), # BCS755A
        (147, active_facs[7], 'Theory', 'Main'), # BAI786
    ]
    for sid, fid, comp, role in sem7_assignments:
        execute(
            "DELETE FROM faculty_subject_assignment_detail WHERE subject_id=%s AND component=%s AND assignment_role=%s AND academic_year='2026-27'",
            (sid, comp, role)
        )
        execute(
            "INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status) VALUES (%s, %s, '2026-27', %s, %s, 'Active')",
            (sid, fid, comp, role)
        )

    sem7_ctx = {
        "department_id": dept_id,
        "scheme_id": scheme_id,
        "academic_year": academic_year,
        "semester_type": semester_type,
        "semester_id": 7, # Sem 7
        "number_of_outputs": 1,
        "selected_subjects": [148, 152], # Group 19 & Group 20 choices
    }
    res7 = generate(sem7_ctx)
    print(f"Sem 7 success: {res7.get('success')}, valid: {res7.get('validation', {}).get('valid')}, entries: {len(res7.get('timetable', []))}")
    print("Sem 7 error:", res7.get("error"))
    print("Sem 7 validation:", res7.get("validation"))
    sem7_tt = res7.get("timetable", [])
    assert len(sem7_tt) > 0, "Sem 7 should produce entries"

    # Collect Sem 7 faculty slots
    sem7_fac_slots = []
    for e in sem7_tt:
        fid = e.get("faculty_id")
        d = e.get("day")
        p = e.get("period")
        if fid and d and p:
            sem7_fac_slots.append({"faculty_id": fid, "day": d, "period": p})

    print(f"Collected {len(sem7_fac_slots)} faculty slots from Sem 7.")

    # 2. Sem 5 with Sem 7 extra_occupied
    print("\n=== GENERATING SEMESTER 5 (with Sem 7 occupied) ===")
    sem5_ctx = {
        "department_id": dept_id,
        "scheme_id": scheme_id,
        "academic_year": academic_year,
        "semester_type": semester_type,
        "semester_id": 5, # Sem 5
        "number_of_outputs": 1,
        "extra_occupied": sem7_fac_slots,
        "active_timetables": {"7": sem7_tt},
    }
    res5 = generate(sem5_ctx)
    print(f"Sem 5 success: {res5.get('success')}, valid: {res5.get('validation', {}).get('valid')}, entries: {len(res5.get('timetable', []))}")
    sem5_tt = res5.get("timetable", [])

    # Collect Sem 5 faculty slots
    sem5_fac_slots = []
    for e in sem5_tt:
        fid = e.get("faculty_id")
        d = e.get("day")
        p = e.get("period")
        if fid and d and p:
            sem5_fac_slots.append({"faculty_id": fid, "day": d, "period": p})

    # Verify NO overlap between Sem 7 and Sem 5 for any faculty!
    sem7_set = {(item["faculty_id"], item["day"], item["period"]) for item in sem7_fac_slots}
    sem5_set = {(item["faculty_id"], item["day"], item["period"]) for item in sem5_fac_slots}
    overlap_7_5 = sem7_set.intersection(sem5_set)
    print(f"Overlap between Sem 7 and Sem 5 faculty slots: {len(overlap_7_5)} (Must be 0!)")
    assert len(overlap_7_5) == 0, f"Found faculty overlap between Sem 7 and 5: {overlap_7_5}"

    # 3. Sem 3 with Sem 7 + Sem 5 extra_occupied
    print("\n=== GENERATING SEMESTER 3 (with Sem 7 & Sem 5 occupied) ===")
    sem3_ctx = {
        "department_id": dept_id,
        "scheme_id": scheme_id,
        "academic_year": academic_year,
        "semester_type": semester_type,
        "semester_id": 3, # Sem 3
        "number_of_outputs": 1,
        "extra_occupied": sem7_fac_slots + sem5_fac_slots,
        "active_timetables": {"7": sem7_tt, "5": sem5_tt},
    }
    res3 = generate(sem3_ctx)
    print(f"Sem 3 success: {res3.get('success')}, valid: {res3.get('validation', {}).get('valid')}, entries: {len(res3.get('timetable', []))}")
    sem3_tt = res3.get("timetable", [])

    sem3_fac_slots = []
    for e in sem3_tt:
        fid = e.get("faculty_id")
        d = e.get("day")
        p = e.get("period")
        if fid and d and p:
            sem3_fac_slots.append({"faculty_id": fid, "day": d, "period": p})

    sem3_set = {(item["faculty_id"], item["day"], item["period"]) for item in sem3_fac_slots}
    overlap_3_7 = sem3_set.intersection(sem7_set)
    overlap_3_5 = sem3_set.intersection(sem5_set)
    print(f"Overlap between Sem 3 and Sem 7: {len(overlap_3_7)} (Must be 0!)")
    print(f"Overlap between Sem 3 and Sem 5: {len(overlap_3_5)} (Must be 0!)")
    assert len(overlap_3_7) == 0, f"Found faculty overlap between Sem 3 and 7: {overlap_3_7}"
    assert len(overlap_3_5) == 0, f"Found faculty overlap between Sem 3 and 5: {overlap_3_5}"

    print("\n>>> ALL 3 SEMESTERS GENERATED WITH ZERO CROSS-SEMESTER FACULTY CONFLICTS! <<<")
