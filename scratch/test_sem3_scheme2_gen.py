import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate

app = create_app()
with app.app_context():
    context = {
        'academic_year': '2026-27',
        'semester_type': 'Odd',
        'department_id': 5,
        'scheme_id': 2,
        'semester_id': 3
    }
    print("Testing generate for Scheme 2, Sem 3, Dept 5...")
    try:
        res = generate(context)
        print("Full res:", res)
    except Exception as e:
        print("Error during generate:", e)
        import traceback
        traceback.print_exc()
