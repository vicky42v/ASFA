import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute, rows

app = create_app()
with app.app_context():
    execute("UPDATE timetable_constraints SET working_days = REPLACE(REPLACE(working_days, ',Saturday', ''), 'Saturday', '') WHERE working_days LIKE '%Saturday%'")
    execute("UPDATE timetable_constraints SET working_days = TRIM(BOTH ',' FROM working_days)")
    res = rows("SELECT constraint_id, department_id, semester_id, working_days FROM timetable_constraints WHERE working_days LIKE '%Saturday%'")
    print("Remaining Saturday constraints:", len(res))
