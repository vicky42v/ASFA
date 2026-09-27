import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
import backend.services.timetable_service as ts

app = create_app()
with app.app_context():
    # Monkey-patch _optional_validation to auto-pick
    orig_opt = ts._optional_validation
    def auto_optional_validation(subjects, assignments, context=None):
        res = orig_opt(subjects, assignments, context=context)
        # Auto resolve any groups with 0 or >1 selected
        for grp in res.get("groups", []):
            sel = grp.get("selected_subjects", [])
            avail = grp.get("available_subjects", [])
            if len(sel) == 0 and avail:
                grp["selected_subjects"] = [avail[0]]
                grp["errors"] = []
            elif len(sel) > 1:
                grp["selected_subjects"] = [sel[0]]
                grp["errors"] = []
        res["valid"] = True
        res["errors"] = []
        return res

    ts._optional_validation = auto_optional_validation

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
