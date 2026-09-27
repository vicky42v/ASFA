import sys, os
sys.path.insert(0, os.path.abspath('.'))
from backend.app import create_app
from backend.db import execute

app = create_app()
with app.app_context():
    execute('DELETE FROM faculty_subject_assignment_detail WHERE detail_id = 2167')
    print("Cleaned up detail_id 2167")
