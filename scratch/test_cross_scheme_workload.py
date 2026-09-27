import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate

app = create_app()
with app.app_context():
    test_cases = [
        {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 5, 'scheme_id': 1, 'semester_id': 3},
        {'academic_year': '2026-27', 'semester_type': 'Odd', 'department_id': 5, 'scheme_id': 2, 'semester_id': 3},
    ]
    for tc in test_cases:
        print(f"\n--- Testing Scheme {tc['scheme_id']}, Dept {tc['department_id']}, Sem {tc['semester_id']} ---")
        res = generate(tc)
        print("Success:", res.get('success'))
        print("Conflicts:", len(res.get('conflicts', [])))
        if res.get('validation'):
            print("Hard satisfaction:", res['validation'].get('metrics', {}).get('hard_satisfaction_rate'))
            print("Workload compliance:", res['validation'].get('metrics', {}).get('faculty_workload_compliance_pct'))
