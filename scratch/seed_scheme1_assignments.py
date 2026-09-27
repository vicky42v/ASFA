import os
import sys
sys.path.insert(0, os.path.abspath("."))

from backend.app import create_app
from backend.db import execute, rows

def get_max_workload(f):
    mw = int(f.get("max_workload") or 0)
    if mw > 0: return mw
    desig = str(f.get("designation") or "").lower()
    role = str(f.get("role") or "").lower()
    if role == "hod" or "hod" in desig or "head" in desig:
        return 12
    if "associate" in desig or desig.startswith("professor"):
        return 16
    return 18

app = create_app()
with app.app_context():
    print("Seeding balanced faculty assignments for Scheme 1 (2022) for all departments...")
    
    subs = rows("""
        SELECT subject_id, subject_code, subject_name, department_id, teaching_department_id,
               semester_id, lecture_hours, tutorial_hours, practical_hours, faculty_assignment_required
        FROM subject
        WHERE scheme_id = 1
        ORDER BY department_id, semester_id, subject_id
    """)
    
    all_faculty = rows("SELECT faculty_id, faculty_name, department_id, designation, role, max_workload FROM faculty WHERE status = 'Active'")
    fac_map = {f["faculty_id"]: f for f in all_faculty}
    dept_faculty = {}
    for f in all_faculty:
        did = f["department_id"]
        if did not in dept_faculty:
            dept_faculty[did] = []
        dept_faculty[did].append(f["faculty_id"])
        
    # Check existing assignments for Scheme 1 subjects
    sids = [s["subject_id"] for s in subs]
    existing = rows(f"SELECT subject_id, component, assignment_role FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND status='Active'")
    existing_set = {(r["subject_id"], r["component"]) for r in existing}
    
    workloads = {}
    # compute current workloads
    cur_workload_rows = rows("""
        SELECT d.faculty_id, (s.semester_id % 2 = 1) as is_odd,
               SUM(CASE WHEN d.component='Lab' THEN COALESCE(s.practical_hours,0) ELSE COALESCE(s.lecture_hours,0)+COALESCE(s.tutorial_hours,0) END) as wl
        FROM faculty_subject_assignment_detail d
        JOIN subject s ON d.subject_id = s.subject_id
        WHERE d.academic_year = '2026-27' AND d.status='Active'
        GROUP BY d.faculty_id, is_odd
    """)
    for r in cur_workload_rows:
        workloads[(r["faculty_id"], bool(r["is_odd"]))] = int(r["wl"] or 0)
        
    ins_sql = """
        INSERT INTO faculty_subject_assignment_detail (
            subject_id, faculty_id, academic_year, component, assignment_role, status
        ) VALUES (%s, %s, '2026-27', %s, 'Main', 'Active')
    """
    
    def pick_faculty(dept_id, is_odd, hours_needed):
        candidates = dept_faculty.get(dept_id, [])
        valid = []
        for fid in candidates:
            f = fac_map[fid]
            max_w = get_max_workload(f)
            curr = workloads.get((fid, is_odd), 0)
            if curr + hours_needed <= max_w:
                valid.append((curr, fid))
        if valid:
            valid.sort()
            return valid[0][1]
            
        cross_valid = []
        for fid, f in fac_map.items():
            max_w = get_max_workload(f)
            curr = workloads.get((fid, is_odd), 0)
            if curr + hours_needed <= max_w:
                cross_valid.append((curr, fid))
        if cross_valid:
            cross_valid.sort()
            return cross_valid[0][1]
            
        all_d = [(workloads.get((fid, is_odd), 0), fid) for fid in candidates]
        all_d.sort()
        return all_d[0][1] if all_d else all_faculty[0]["faculty_id"]

    assigned_count = 0
    for s in subs:
        if not s.get("faculty_assignment_required", 1):
            continue
        is_odd = (s["semester_id"] % 2 == 1)
        dept_id = s["department_id"]
        sid = s["subject_id"]
        
        # Don't overwrite if already assigned
        th_hours = (s["lecture_hours"] or 0) + (s["tutorial_hours"] or 0)
        if th_hours > 0 and (sid, "Theory") not in existing_set:
            fid = pick_faculty(dept_id, is_odd, th_hours)
            workloads[(fid, is_odd)] = workloads.get((fid, is_odd), 0) + th_hours
            execute(ins_sql, (sid, fid, "Theory"))
            assigned_count += 1
            
        lab_hours = s["practical_hours"] or 0
        if lab_hours > 0 and (sid, "Lab") not in existing_set:
            fid = pick_faculty(dept_id, is_odd, lab_hours)
            workloads[(fid, is_odd)] = workloads.get((fid, is_odd), 0) + lab_hours
            execute(ins_sql, (sid, fid, "Lab"))
            assigned_count += 1
            
    print(f"Successfully seeded {assigned_count} balanced assignments for Scheme 1 (2022)!")
