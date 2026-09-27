import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
from backend.services.timetable_service import generate

app = create_app()
with app.app_context():
    depts = rows("SELECT department_id, department_name, department_code FROM department")
    print(f"Active departments: {len(depts)}")
    for d in depts:
        d_id = d['department_id']
        d_code = d['department_code']
        print(f"\n--- Dept {d_id}: {d_code} ---")
        for sem_no in [7, 5, 3]:
            sem = rows("SELECT semester_id FROM semester WHERE semester_no=%s LIMIT 1", (sem_no,))
            if not sem:
                continue
            sem_id = sem[0]['semester_id']
            scheme_id = 1
            ctx = {
                'academic_year': '2026-27',
                'semester_type': 'Odd',
                'department_id': d_id,
                'scheme_id': scheme_id,
                'semester_id': sem_id,
                'semester': sem_no,
                'number_of_outputs': 1
            }
            try:
                res = generate(ctx)
                succ = res.get('success')
                err = res.get('error') or res.get('message') or (res.get('validation', {}).get('errors') if isinstance(res.get('validation'), dict) else None)
                alts = res.get('alternatives') or res.get('data', {}).get('alternatives', [])
                tt_len = len(res.get('timetable', [])) if res.get('timetable') else (len(alts[0].get('timetable', [])) if alts else 0)
                print(f"  Sem {sem_no}: success={succ}, sessions={tt_len}, err={err}")
            except Exception as e:
                print(f"  Sem {sem_no}: EXCEPTION {e}")
