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
    print("Seeding balanced faculty assignments for 2025 scheme...")
    
    # 1. Fetch all subjects for scheme_id = 2
    subs_2025 = rows("""
        SELECT subject_id, subject_code, subject_name, department_id, teaching_department_id,
               semester_id, lecture_hours, tutorial_hours, practical_hours, faculty_assignment_required
        FROM subject
        WHERE scheme_id = 2
        ORDER BY department_id, semester_id, subject_id
    """)
    
    # 2. Fetch active faculty per department
    all_faculty = rows("SELECT faculty_id, faculty_name, department_id, designation, role, max_workload FROM faculty WHERE status = 'Active'")
    fac_map = {f["faculty_id"]: f for f in all_faculty}
    dept_faculty = {}
    for f in all_faculty:
        did = f["department_id"]
        if did not in dept_faculty:
            dept_faculty[did] = []
        dept_faculty[did].append(f["faculty_id"])
        
    # 3. Clean existing assignments for 2025 subjects in 2026-27
    sids = [s["subject_id"] for s in subs_2025]
    placeholders = ",".join(["%s"] * len(sids))
    execute(f"DELETE FROM faculty_subject_assignment_detail WHERE academic_year = '2026-27' AND subject_id IN ({placeholders})", tuple(sids))
    
    # 4. Track workload per faculty per term: odd vs even
    # (fid, is_odd) -> current_hours
    workloads = { (f["faculty_id"], True): 0 for f in all_faculty }
    for f in all_faculty:
        workloads[(f["faculty_id"], False)] = 0
        
    ins_sql = """
        INSERT INTO faculty_subject_assignment_detail (
            subject_id, faculty_id, academic_year, component, assignment_role, status
        ) VALUES (%s, %s, '2026-27', %s, 'Main', 'Active')
    """
    
    assigned_count = 0
    
    def pick_faculty(dept_id, is_odd, hours_needed):
        # Try same department faculty first
        candidates = dept_faculty.get(dept_id, [])
        # Sort by current workload ascending
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
            
        # If all full in department, check cross-department faculty
        cross_valid = []
        for fid, f in fac_map.items():
            max_w = get_max_workload(f)
            curr = workloads.get((fid, is_odd), 0)
            if curr + hours_needed <= max_w:
                cross_valid.append((curr, fid))
        if cross_valid:
            cross_valid.sort()
            return cross_valid[0][1]
            
        # Absolute fallback: lowest loaded in dept
        all_d = [(workloads.get((fid, is_odd), 0), fid) for fid in candidates]
        all_d.sort()
        return all_d[0][1] if all_d else all_faculty[0]["faculty_id"]

    for s in subs_2025:
        if not s["faculty_assignment_required"]:
            continue
        is_odd = (s["semester_id"] % 2 == 1)
        dept_id = s["department_id"]
        
        # Theory component
        th_hours = (s["lecture_hours"] or 0) + (s["tutorial_hours"] or 0)
        if th_hours > 0:
            fid = pick_faculty(dept_id, is_odd, th_hours)
            workloads[(fid, is_odd)] = workloads.get((fid, is_odd), 0) + th_hours
            execute(ins_sql, (s["subject_id"], fid, "Theory"))
            assigned_count += 1
            
        # Lab component
        lab_hours = s["practical_hours"] or 0
        if lab_hours > 0:
            fid = pick_faculty(dept_id, is_odd, lab_hours)
            workloads[(fid, is_odd)] = workloads.get((fid, is_odd), 0) + lab_hours
            execute(ins_sql, (s["subject_id"], fid, "Lab"))
            assigned_count += 1
            
    print(f"Successfully seeded {assigned_count} balanced assignments for 2025 Scheme!")
