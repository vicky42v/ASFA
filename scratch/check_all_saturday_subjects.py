import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    print("Checking institutional / activity / project subjects across all semesters:")
    res = rows("""
        SELECT DISTINCT s.semester_id, s.subject_code, s.subject_name, s.course_category
        FROM subject s
        WHERE course_category IN ('MC', 'SPECIAL', 'PROJ')
           OR UPPER(subject_name) LIKE '%YOGA%'
           OR UPPER(subject_name) LIKE '%NSS%'
           OR UPPER(subject_name) LIKE '%SPORTS%'
           OR UPPER(subject_name) LIKE '%PHYSICAL EDUCATION%'
           OR UPPER(subject_name) LIKE '%PROJECT%'
        ORDER BY s.semester_id, s.course_category, s.subject_code
    """)
    for r in res:
        print(f"Sem {r['semester_id']} | {r['subject_code']} ({r['course_category']}): {r['subject_name']}")
