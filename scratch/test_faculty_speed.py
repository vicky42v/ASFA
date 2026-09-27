import sys, os, time
sys.path.insert(0, os.path.abspath('.'))
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    res = rows('SELECT * FROM faculty_subject_assignment_detail WHERE status = "Active"')
    print(f"Active assignment detail count: {len(res)}")
    for r in res[:10]:
        print(r)
