import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute, row

app = create_app()
with app.app_context():
    departments = rows("SELECT department_id, department_code FROM department")
    semesters = rows("SELECT semester_id, semester_no FROM semester")
    
    special_subjects = [
        {
            "code": "PLACEMENT",
            "name": "Placement & Training",
            "lecture_hours": 5,
            "practical_hours": 0,
            "category": "SPECIAL",
            "structure": "THEORY",
        },
        {
            "code": "LIBRARY",
            "name": "Library & Information Center",
            "lecture_hours": 1,
            "practical_hours": 0,
            "category": "SPECIAL",
            "structure": "THEORY",
        },
        {
            "code": "REMEDIAL",
            "name": "Remedial Classes",
            "lecture_hours": 2,
            "practical_hours": 0,
            "category": "SPECIAL",
            "structure": "THEORY",
        },
        {
            "code": "ACTIVITY",
            "name": "Student Activity / Forum",
            "lecture_hours": 2,
            "practical_hours": 0,
            "category": "SPECIAL",
            "structure": "THEORY",
        },
    ]

    added_count = 0
    # Add across departments for Semester 7 (and other semesters 3-8)
    for dept in departments:
        d_id = dept["department_id"]
        for sem in semesters:
            s_id = sem["semester_id"]
            s_no = int(sem.get("semester_no") or s_id)
            # Focus on Sem 3-8 (upper semesters)
            if s_no < 3:
                continue
                
            for spec in special_subjects:
                # Check if already exists
                existing = row("""
                    SELECT subject_id FROM subject 
                    WHERE department_id = %s AND semester_id = %s AND subject_code = %s
                """, (d_id, s_id, spec["code"]))
                
                if not existing:
                    execute("""
                        INSERT INTO subject (
                            subject_code, subject_name, department_id, teaching_department_id,
                            semester_id, scheme_id, group_id, course_category, course_structure,
                            faculty_assignment_required, cycle, is_optional, lecture_hours,
                            tutorial_hours, practical_hours, credits
                        ) VALUES (
                            %s, %s, %s, %s,
                            %s, 1, 1, %s, %s,
                            0, NULL, 0, %s,
                            0, %s, 0
                        )
                    """, (
                        spec["code"], spec["name"], d_id, d_id,
                        s_id, spec["category"], spec["structure"],
                        spec["lecture_hours"], spec["practical_hours"]
                    ))
                    added_count += 1

    print(f"Successfully seeded {added_count} special subject records into SQL across departments and semesters.")
