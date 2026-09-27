import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute

app = create_app()
with app.app_context():
    execute("ALTER TABLE faculty_subject_assignment_detail MODIFY COLUMN assignment_role enum('Main','Co','Coordinator') NOT NULL DEFAULT 'Main'")
    print("Altered faculty_subject_assignment_detail.assignment_role to include Coordinator!")
    execute("""
        INSERT INTO faculty_subject_assignment_detail 
        (faculty_id, subject_id, academic_year, component, assignment_role, status)
        VALUES (5, 147, '2026-27', 'Theory', 'Coordinator', 'Active')
    """)
    print("Successfully inserted Major Project Coordinator row for BAI786 -> Mrs. Nanda M B!")
