import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate_asfa_timetable

app = create_app()
with app.app_context():
    print("Generating Sem 7...")
    res7 = generate_asfa_timetable({
        'academic_year': '2026-27',
        'department_id': 5,
        'semester_id': 7,
        'scheme_id': 1,
        'semester_type': 'Odd',
    })
    tt7 = res7.get('timetable') or []
    v7 = res7.get('validation', {}).get('valid')
    print(f"Sem 7 entries: {len(tt7)}, valid: {v7}")

    # Extract occupied slots from Sem 7
    extra_occ = []
    for e in tt7:
        if e.get('faculty_id'):
            extra_occ.append({'faculty_id': e['faculty_id'], 'day': e['day'], 'period': e['period']})
        if e.get('co_faculty_id'):
            extra_occ.append({'faculty_id': e['co_faculty_id'], 'day': e['day'], 'period': e['period']})

    print(f"Total occupied slots passed: {len(extra_occ)}")

    print("Generating Sem 5 with Sem 7 occupied blocked...")
    res5 = generate_asfa_timetable({
        'academic_year': '2026-27',
        'department_id': 5,
        'semester_id': 5,
        'scheme_id': 1,
        'semester_type': 'Odd',
        'extra_occupied': extra_occ,
        'active_timetables': {'7': tt7}
    })
    tt5 = res5.get('timetable') or []
    v5 = res5.get('validation', {}).get('valid')
    print(f"Sem 5 entries: {len(tt5)}, valid: {v5}")

    # Check for any clashes between tt7 and tt5!
    clashes = []
    for e5 in tt5:
        f5 = e5.get('faculty_id')
        co5 = e5.get('co_faculty_id')
        d5 = e5.get('day')
        p5 = e5.get('period')
        for e7 in tt7:
            if e7.get('day') == d5 and e7.get('period') == p5:
                f7 = e7.get('faculty_id')
                co7 = e7.get('co_faculty_id')
                facs5 = {f for f in (f5, co5) if f}
                facs7 = {f for f in (f7, co7) if f}
                common = facs5 & facs7
                if common:
                    clashes.append({'day': d5, 'period': p5, 'faculty': list(common), 'e7': e7['subject_code'], 'e5': e5['subject_code']})

    print(f"Total clashes between Sem 7 and Sem 5: {len(clashes)}")
    for c in clashes:
        print("CLASH:", c)

    # Now also generate Sem 3 with Sem 7 & Sem 5 blocked!
    extra_occ_all = list(extra_occ)
    for e in tt5:
        if e.get('faculty_id'):
            extra_occ_all.append({'faculty_id': e['faculty_id'], 'day': e['day'], 'period': e['period']})
        if e.get('co_faculty_id'):
            extra_occ_all.append({'faculty_id': e['co_faculty_id'], 'day': e['day'], 'period': e['period']})

    print("Generating Sem 3 with Sem 7 & Sem 5 occupied blocked...")
    res3 = generate_asfa_timetable({
        'academic_year': '2026-27',
        'department_id': 5,
        'semester_id': 3,
        'scheme_id': 1,
        'semester_type': 'Odd',
        'extra_occupied': extra_occ_all,
        'active_timetables': {'7': tt7, '5': tt5}
    })
    tt3 = res3.get('timetable') or []
    v3 = res3.get('validation', {}).get('valid')
    print(f"Sem 3 entries: {len(tt3)}, valid: {v3}")

    clashes3 = []
    for e3 in tt3:
        f3 = e3.get('faculty_id')
        co3 = e3.get('co_faculty_id')
        d3 = e3.get('day')
        p3 = e3.get('period')
        for e_prev in (tt7 + tt5):
            if e_prev.get('day') == d3 and e_prev.get('period') == p3:
                f_prev = e_prev.get('faculty_id')
                co_prev = e_prev.get('co_faculty_id')
                facs3 = {f for f in (f3, co3) if f}
                facs_prev = {f for f in (f_prev, co_prev) if f}
                common = facs3 & facs_prev
                if common:
                    clashes3.append({'day': d3, 'period': p3, 'faculty': list(common), 'sem3_sub': e3['subject_code'], 'prev_sub': e_prev['subject_code']})

    print(f"Total clashes with Sem 3: {len(clashes3)}")
    for c in clashes3:
        print("CLASH with Sem 3:", c)
