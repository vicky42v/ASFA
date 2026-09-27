import sys
sys.path.insert(0, '.')
from backend.app import create_app
import json

app = create_app()
with app.app_context():
    client = app.test_client()
    
    payload = {
        "department_id": 5,
        "scheme_id": 1,
        "academic_year": "2026-27",
        "semester_type": "Odd Semesters",
        "semester_id": 7,
        "semester": 7,
        "cycle": None,
        "number_of_outputs": 3,
        "proctor_b1_faculty_id": 3,
        "proctor_b2_faculty_id": 5,
        "selected_subjects": [146, 144, 145, 147, 151, 567],
    }
    
    with client.session_transaction() as sess:
        sess['user'] = {'role': 'Admin', 'user_id': 1, 'name': 'Admin'}

    resp = client.post('/api/timetable/generate', json=payload)
    print("STATUS CODE:", resp.status_code)
    data = resp.get_json()
    print("SUCCESS:", data.get("success"))
    print("MESSAGE:", data.get("message"))
    if not data.get("success"):
        print("ERRORS:", data.get("errors"))
        print("DATA:", json.dumps(data, indent=2))
    else:
        res_data = data.get("data", {})
        print("Data success:", res_data.get("success"))
        print("Timetable entries:", len(res_data.get("timetable", [])))
        print("Alternatives:", len(res_data.get("alternatives", [])))
        for entry in res_data.get("timetable", []):
            if entry.get("batch") or entry.get("component") == "Lab":
                print(f"  {entry.get('day')} P{entry.get('period')} | Batch: {entry.get('batch')} | Sub: {entry.get('subject_code')} | Fac: {entry.get('faculty_name')} | CoFac: {entry.get('co_faculty_name')}")
