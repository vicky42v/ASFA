import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import row, rows, execute
import json

app = create_app()
with app.app_context():
    print("=== DEPARTMENTS IN DATABASE ===")
    depts = rows("SELECT department_id, department_name, department_code FROM department ORDER BY department_id")
    for d in depts:
        print(f"ID: {d['department_id']} | Code: {d['department_code']} | Name: {d['department_name']}")

    # Let's check subjects across different departments
    print("\n=== SUBJECTS SAMPLE BY DEPARTMENT ===")
    for d in depts:
        s_count = row("SELECT count(*) as cnt FROM subject WHERE department_id = %s", (d['department_id'],))
        f_count = row("SELECT count(*) as cnt FROM faculty WHERE department_id = %s", (d['department_id'],))
        print(f"Dept {d['department_code']} (ID {d['department_id']}): {s_count['cnt']} subjects, {f_count['cnt']} faculty")
