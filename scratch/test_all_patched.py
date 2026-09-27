import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
import backend.services.timetable_service as ts

app = create_app()
with app.app_context():
    # Test patched _optional_validation
    orig_opt = ts._optional_validation
    def auto_optional_validation(subjects, assignments, context=None):
        res = orig_opt(subjects, assignments, context=context)
        # Auto resolve
        for grp in res.get("groups", []):
            avail = grp.get("available_subjects", [])
            sel = grp.get("selected_subjects", [])
            if len(sel) == 0 and avail:
                grp["selected_subjects"] = [avail[0]]
            elif len(sel) > 1:
                grp["selected_subjects"] = [sel[0]]
        res["valid"] = True
        res["errors"] = []
        return res

    ts._optional_validation = auto_optional_validation

    # Test patched _make_tasks to cap weekday periods
    orig_make_tasks = ts._make_tasks
    def safe_make_tasks(subjects, amap, days=None, periods_per_day=7, constraint=None, rule_engine=None, context=None, assignments=None):
        sem_no = int((context or {}).get("semester_no") or (context or {}).get("semester_id") or 0)
        # Cap placement for lower sems
        for s in subjects:
            code_u = str(s.get("subject_code") or "").upper()
            if "PLACEMENT" in code_u:
                if sem_no in (1, 2, 3, 4):
                    s["lecture_hours"] = 2
                elif sem_no in (5, 6):
                    s["lecture_hours"] = 3
        tasks = orig_make_tasks(subjects, amap, days=days, periods_per_day=periods_per_day, constraint=constraint, rule_engine=rule_engine, context=context, assignments=assignments)
        
        # Check weekday capacity
        weekday_days = [d for d in (days or []) if str(d).strip().lower() != "saturday"]
        max_weekday_periods = len(weekday_days) * periods_per_day
        weekday_periods = sum(
            t["block_size"] for t in tasks 
            if not ("Saturday" in (t.get("allowed_days") or []) or t.get("fixed_day") == "Saturday")
        )
        if weekday_periods > max_weekday_periods:
            excess = weekday_periods - max_weekday_periods
            removable_tasks = [t for t in tasks if t.get("scheduling_priority") == "LOW" or t.get("is_library") or t.get("is_activity") or t.get("is_remedial") or t.get("is_placement")]
            for t in reversed(removable_tasks):
                if excess <= 0:
                    break
                if t["block_size"] <= excess:
                    excess -= t["block_size"]
                    tasks.remove(t)
                elif t["block_size"] > 1:
                    reduce_by = min(t["block_size"] - 1, excess)
                    t["block_size"] -= reduce_by
                    excess -= reduce_by
        return tasks

    ts._make_tasks = safe_make_tasks

    depts = rows("SELECT department_id, department_name, department_code FROM department")
    for d in depts:
        d_id = d['department_id']
        d_code = d['department_code']
        print(f"\n--- Dept {d_id}: {d_code} ---")
        for sem_no in [7, 5, 3]:
            sem = rows("SELECT semester_id FROM semester WHERE semester_no=%s LIMIT 1", (sem_no,))
            if not sem:
                continue
            sem_id = sem[0]['semester_id']
            ctx = {
                'academic_year': '2026-27',
                'semester_type': 'Odd',
                'department_id': d_id,
                'scheme_id': 1,
                'semester_id': sem_id,
                'semester': sem_no,
                'number_of_outputs': 1
            }
            try:
                res = ts.generate(ctx)
                succ = res.get('success')
                err = res.get('error') or res.get('message') or (res.get('validation', {}).get('errors') if isinstance(res.get('validation'), dict) else None)
                alts = res.get('alternatives') or res.get('data', {}).get('alternatives', [])
                tt_len = len(res.get('timetable', [])) if res.get('timetable') else (len(alts[0].get('timetable', [])) if alts else 0)
                print(f"  Sem {sem_no}: success={succ}, sessions={tt_len}, err={err}")
            except Exception as e:
                print(f"  Sem {sem_no}: EXCEPTION {e}")
