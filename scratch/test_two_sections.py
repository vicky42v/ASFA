import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate_asfa_timetable

app = create_app()
with app.app_context():
    print("Generating Sem 5 Section A...")
    resA = generate_asfa_timetable({
        'academic_year': '2026-27',
        'department_id': 5,
        'semester_id': 5,
        'scheme_id': 1,
        'semester_type': 'Odd',
        'section': 'A',
    })
    ttA = resA.get('timetable') or []
    vA = resA.get('validation', {}).get('valid')
    print(f"Sec A entries: {len(ttA)}, valid: {vA}")

    # Pass Sec A as occupied slots into Sec B
    occ_A = []
    for e in ttA:
        if e.get('faculty_id'):
            occ_A.append({'faculty_id': e['faculty_id'], 'day': e['day'], 'period': e['period']})
        if e.get('co_faculty_id'):
            occ_A.append({'faculty_id': e['co_faculty_id'], 'day': e['day'], 'period': e['period']})

    print(f"Sec A occupied slots: {len(occ_A)}")
    print("Generating Sem 5 Section B with Section A occupied blocked...")
    resB = generate_asfa_timetable({
        'academic_year': '2026-27',
        'department_id': 5,
        'semester_id': 5,
        'scheme_id': 1,
        'semester_type': 'Odd',
        'section': 'B',
        'extra_occupied': occ_A,
        'active_timetables': {'5_A': ttA}
    })
    ttB = resB.get('timetable') or []
    vB = resB.get('validation', {}).get('valid')
    print(f"Sec B entries: {len(ttB)}, valid: {vB}")

    # Check for clashes between Sec A and Sec B
    clashes = []
    for eB in ttB:
        fB = eB.get('faculty_id')
        coB = eB.get('co_faculty_id')
        dB = eB.get('day')
        pB = eB.get('period')
        for eA in ttA:
            if eA.get('day') == dB and eA.get('period') == pB:
                fA = eA.get('faculty_id')
                coA = eA.get('co_faculty_id')
                facsB = {f for f in (fB, coB) if f}
                facsA = {f for f in (fA, coA) if f}
                common = facsB & facsA
                if common:
                    clashes.append({'day': dB, 'period': pB, 'faculty': list(common), 'subA': eA['subject_code'], 'subB': eB['subject_code']})

    print(f"Total clashes between Sec A and Sec B: {len(clashes)}")
    for c in clashes:
        print("CLASH:", c)
