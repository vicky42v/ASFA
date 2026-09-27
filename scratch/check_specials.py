import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    r = rows("SELECT subject_id, department_id, semester_id, subject_code, subject_name, lecture_hours, practical_hours, tutorial_hours FROM subject WHERE subject_code IN ('PLACEMENT', 'LIBRARY', 'ACTIVITY', 'REMEDIAL')")
    for row in r:
        print(row)
