import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import generate
from backend.db import rows

app = create_app()
with app.app_context():
    print("DEPARTMENTS:")
    for d in rows("SELECT department_id, department_name, department_code FROM department"):
        print(d)
        
    print("\nCONSTRAINTS FOR OTHER DEPTS:")
    for c in rows("SELECT * FROM timetable_constraints WHERE department_id != 5 LIMIT 5"):
        print(c)
