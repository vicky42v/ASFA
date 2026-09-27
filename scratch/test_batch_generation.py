import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import row, execute, rows
from backend.services.timetable_service import generate_asfa_timetable

app = create_app()
with app.app_context():
    execute("DELETE FROM faculty_subject_assignment_detail WHERE academic_year='2026-27'")
    all_facs = rows("SELECT faculty_id, faculty_name, department_id, max_workload FROM faculty WHERE status='Active' LIMIT 15")
    print("Available faculties:")
    for f in all_facs:
        print(f"  {f['faculty_id']}: {f['faculty_name']} (Dept {f['department_id']}, max {f['max_workload']}h)")

    sem7_assignments = [
        (144, 1, 'Theory', 'Main'),
        (144, 3, 'Lab', 'Main'),
        (144, 11, 'Lab', 'Co'),
        (145, 2, 'Theory', 'Main'),
        (145, 4, 'Lab', 'Main'),
        (145, 12, 'Lab', 'Co'),
        (146, 5, 'Theory', 'Main'),
        (147, 8, 'Lab', 'Main'),
        (151, 7, 'Theory', 'Main'),
        (152, 99, 'Theory', 'Main'),
    ]
    for sid, fid, comp, role in sem7_assignments:
        execute(
            "INSERT INTO faculty_subject_assignment_detail (subject_id, faculty_id, academic_year, component, assignment_role, status) VALUES (%s, %s, '2026-27', %s, %s, 'Active')",
            (sid, fid, comp, role)
        )
    print("Clean assignments set up for Sem 7!")

    context = {
        'department_id': 5,
        'scheme_id': 1,
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'semester_id': 7,
        'proctor_b1_faculty_id': 1,
        'proctor_b2_faculty_id': 2,
    }
    from backend.services.timetable_service import _make_tasks, _get_constraints, _get_subjects, _get_assignments, _assignment_map
    constr = _get_constraints(context)
    subs = _get_subjects(context)
    asgs = _get_assignments(context)
    am = _assignment_map(asgs)
    print("Constraints working days:", constr.get("working_days"), "periods:", constr.get("periods_per_day"))
    tsks = _make_tasks(subs, am, days=constr.get("working_days").split(","), periods_per_day=constr.get("periods_per_day"), constraint=constr, context=context, assignments=asgs)
    print(f"Total tasks generated: {len(tsks)}")
    from backend.services.timetable_service import _existing_occupied, _days, _start_periods
    occ = _existing_occupied(context)
    print(f"Total occupied faculty slots in DB: {len(occ)}")
    for i, t in enumerate(tsks):
        valid_cnt = 0
        for d in _days(constr):
            for s in _start_periods(constr, t['block_size']):
                cells = [(d, s + o) for o in range(t['block_size'])]
                if not any((f, cd, cp) in occ for f in t['faculty_ids'] for (cd, cp) in cells):
                    valid_cnt += 1
        if valid_cnt == 0:
            print(f"WARNING: 0 valid slots for task {i}: {t['subject']['subject_code']} ({t['component']}) facs: {t['faculty_ids']}")
    
    import backend.services.timetable_service as ts
    # Inspect CP-SAT
    print("Testing generate_asfa_timetable...")
    res = generate_asfa_timetable(context)
    print('Success:', res.get('success'))
    if res.get('success'):
        tt = res['timetable']
        print(f"Total entries: {len(tt)}")
        labs = [e for e in tt if e.get('component') == 'Lab' or e.get('batch') in ('B1', 'B2')]
        print(f"Lab/Batch entries count: {len(labs)}")
        for l in labs:
            print(f"  Day: {l['day']}, Period: {l['period']}, Batch: {l.get('batch')}, Sub: {l['subject_code']}, Fac: {l['faculty_name']}, CoFac: {l.get('co_faculty_name')}")
        proctors = [e for e in tt if e.get('subject_code') == 'PROCTOR']
        print(f"Proctor entries count: {len(proctors)}")
        for p in proctors:
            print(f"  Day: {p['day']}, Period: {p['period']}, Batch: {p.get('batch')}, Fac: {p['faculty_name']}")
        placements = [e for e in tt if 'PLACEMENT' in str(e.get('subject_name') or '').upper() or 'PLACEMENT' in str(e.get('subject_code') or '').upper()]
        print(f"Placement entries count: {len(placements)}")
        for pl in placements:
            print(f"  Day: {pl['day']}, Period: {pl['period']}, Sub: {pl['subject_code']}")
    else:
        print('Failure:', res)
