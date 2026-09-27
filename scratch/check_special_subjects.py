import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    print("Checking special subjects in Sem 5 and Sem 7 for department 5:")
    res = rows("""
        SELECT subject_id, subject_code, subject_name, course_category, semester_id, lecture_hours, practical_hours, credits 
        FROM subject 
        WHERE department_id = 5 AND semester_id IN (5, 7)
          AND (course_category IN ('MC', 'SPECIAL', 'PROJ') 
               OR UPPER(subject_name) LIKE '%YOGA%' 
               OR UPPER(subject_name) LIKE '%NSS%'
               OR UPPER(subject_name) LIKE '%SPORTS%'
               OR UPPER(subject_name) LIKE '%PROJECT%')
    """)
    for r in res:
        print(f"Sem {r['semester_id']} | {r['subject_code']} ({r['course_category']}): {r['subject_name']} | L={r['lecture_hours']}, P={r['practical_hours']}, C={r['credits']}")
