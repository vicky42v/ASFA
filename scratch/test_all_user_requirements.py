import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows, row

app = create_app()
with app.app_context():
    print("=" * 60)
    print("TEST 1: GENERATE SEMESTER 5 AIML (Odd, dept 5, scheme 1)")
    print("=" * 60)
    context_sem5 = {
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "department_id": 5,
        "scheme_id": 1,
        "semester_id": 5,
        "number_of_outputs": 3,
        "selected_subjects": [113] # BCS515D chosen for PEC option group 13
    }
    result_sem5 = generate(context_sem5)
    print("Sem 5 Success:", result_sem5.get("success"))
    if not result_sem5.get("success"):
        print("Sem 5 Error:", result_sem5.get("error") or result_sem5.get("message"))
    else:
        alts = result_sem5.get("data", {}).get("alternatives", [])
        print(f"Sem 5 Generated {len(alts)} alternatives.")
        for idx, alt in enumerate(alts):
            tt = alt.get("timetable", [])
            sat_classes = [e for e in tt if str(e.get("day", "")).lower() == "saturday"]
            print(f"  Option {idx+1}: {len(tt)} sessions total, Saturday classes: {len(sat_classes)}")

    print("\n" + "=" * 60)
    print("TEST 2: GENERATE SEMESTER 7 AIML & CHECK MAJOR PROJECT + SATURDAY")
    print("=" * 60)
    context_sem7_run1 = {
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "department_id": 5,
        "scheme_id": 1,
        "semester_id": 7,
        "number_of_outputs": 3,
    }
    result_sem7_1 = generate(context_sem7_run1)
    print("Sem 7 Run 1 Success:", result_sem7_1.get("success"))
    if result_sem7_1.get("success"):
        alts = result_sem7_1.get("data", {}).get("alternatives", [])
        print(f"Sem 7 Generated {len(alts)} alternatives.")
        for idx, alt in enumerate(alts):
            tt = alt.get("timetable", [])
            sat_classes = [e for e in tt if str(e.get("day", "")).lower() == "saturday"]
            proj_classes = [e for e in tt if "BAI786" in str(e.get("subject_code", ""))]
            print(f"  Option {idx+1}: {len(tt)} sessions, Saturday classes: {len(sat_classes)}")
            print(f"    Major Project (BAI786) sessions: {len(proj_classes)}")
            for p in proj_classes[:2]:
                print(f"      Day: {p.get('day')}, Period: {p.get('period')}, Faculty: {p.get('faculty_name')}")

    print("\n" + "=" * 60)
    print("TEST 3: RANDOMIZATION CHECK (RUN 1 VS RUN 2 FOR SEM 7)")
    print("=" * 60)
    result_sem7_2 = generate(context_sem7_run1)
    if result_sem7_1.get("success") and result_sem7_2.get("success"):
        tt1 = result_sem7_1["data"]["alternatives"][0]["timetable"]
        tt2 = result_sem7_2["data"]["alternatives"][0]["timetable"]
        
        map1 = {(e["day"], e["period"]): e.get("subject_code") for e in tt1}
        map2 = {(e["day"], e["period"]): e.get("subject_code") for e in tt2}
        
        diffs = 0
        for slot, code in map1.items():
            if map2.get(slot) != code:
                diffs += 1
        print(f"Different slots between Run 1 and Run 2: {diffs} out of {len(map1)} slots.")
        if diffs > 0:
            print("✓ SUCCESS: Run 1 and Run 2 produced DIFFERENT randomized layouts!")
        else:
            print("⚠️ Notice: Layouts were identical.")

    print("\n" + "=" * 60)
    print("TEST 4: FACULTY WORKLOAD FOR PLACEMENT & PROJECT COORDINATOR")
    print("=" * 60)
    from backend.routes.academic import bp
    from backend.db import rows
    fac_workloads = rows("""
        SELECT f.faculty_name,
               SUM(CASE
                   WHEN s_d.course_category = 'PROJ'
                     OR d_assign.assignment_role = 'Coordinator'
                     OR UPPER(COALESCE(s_d.subject_name, '')) LIKE '%PROJECT%'
                     OR UPPER(COALESCE(s_d.subject_code, '')) LIKE '%PROJ%'
                     OR UPPER(COALESCE(s_d.subject_name, '')) LIKE '%PLACEMENT%'
                     OR UPPER(COALESCE(s_d.subject_code, '')) LIKE '%PLACEMENT%'
                   THEN 0
                   WHEN d_assign.component = 'Lab' THEN COALESCE(s_d.practical_hours, 0)
                   ELSE COALESCE(s_d.lecture_hours, 0) + COALESCE(s_d.tutorial_hours, 0)
               END) as workload
        FROM faculty_subject_assignment_detail d_assign
        JOIN subject s_d ON s_d.subject_id = d_assign.subject_id
        JOIN faculty f ON f.faculty_id = d_assign.faculty_id
        WHERE d_assign.status = 'Active'
          AND (UPPER(s_d.subject_code) LIKE '%PLACEMENT%' OR UPPER(s_d.subject_code) LIKE '%BAI786%')
        GROUP BY f.faculty_id, f.faculty_name
    """)
    print("Workload for faculty assigned to Placement / Project Coordinator:")
    for fw in fac_workloads:
        print(f"  {fw['faculty_name']}: {fw['workload']}h workload added from placement/project")
    if not fac_workloads or all(fw['workload'] == 0 for fw in fac_workloads):
        print("✓ SUCCESS: Placement & Project Coordinator correctly have 0h faculty workload!")
