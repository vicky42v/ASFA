import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows
from backend.services.timetable_service import generate
import traceback

app = create_app()
with app.app_context():
    context = {
        'department_id': 7,
        'scheme_id': 1,
        'semester_id': 7,
        'semester_no': 7,
        'academic_year': '2026-27',
        'semester_type': 'Odd',
    }
    # Let's see what subjects are available
    subs = rows("SELECT subject_id, subject_code, course_category, is_optional FROM subject WHERE department_id = 7 AND semester_id = 7")
    print("Available subs:", [(s['subject_id'], s['subject_code']) for s in subs])
    
    # Target 1 from each elective group
    target_codes = ['BCS701', 'BCS702', 'BCS703', 'BCS786', 'BCS714A', 'BCS755A']
    sel_ids = [s['subject_id'] for s in subs if s['subject_code'] in target_codes]
    context['selected_subjects'] = sel_ids
    
    res = generate(context)
    print("Success:", res.get("success"))
    if not res.get("success"):
        print("Validation errors:", res.get("validation", {}).get("errors"))
        print("Message:", res.get("message"))
    else:
        print("Timetable generated with entries:", len(res.get("timetable", [])))
        for entry in res.get("timetable", []):
            if entry.get("subject_code") in ("PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROCTOR"):
                print(f"  {entry['day']} Period {entry['period']}: {entry['subject_code']} ({entry.get('subject_name')})")
