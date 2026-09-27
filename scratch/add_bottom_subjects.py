import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute

app = create_app()
with app.app_context():
    print("=== APPLYING SUBJECT UPDATES ===")
    
    # 1. Fix 1BCP308 title
    cnt = execute("""
        UPDATE subject 
        SET subject_name = 'Community Project (Project-Based Learning) / Societal Project',
            course_category = 'SDC'
        WHERE scheme_id = 2 AND subject_code = '1BCP308'
    """)
    print(f"Updated 1BCP308 titles: {cnt}")
    
    # 2. Fix 1BEP408 title in Sem 4
    cnt = execute("""
        UPDATE subject 
        SET subject_name = 'Environmental Science Project',
            course_category = 'SDC'
        WHERE scheme_id = 2 AND subject_code = '1BEP408'
    """)
    print(f"Updated 1BEP408 titles: {cnt}")

    # 3. Delete placeholder 1BXXL307
    cnt = execute("DELETE FROM subject WHERE scheme_id = 2 AND subject_code = '1BXXL307'")
    print(f"Deleted placeholder 1BXXL307: {cnt}")

    # 4. Ensure 1BAIL307A in Dept 5, 6, 7, 8
    cs_allied_depts = [5, 6, 7, 8] # AIML, ISE, CSE-A, CSE-B
    for d_id in cs_allied_depts:
        existing = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 3 AND department_id = %s AND subject_code = '1BAIL307A'", (d_id,))
        if not existing:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (
                    '1BAIL307A', 'Exploratory Data Analysis', %s, %s,
                    3, 2, 1, 'AEC', NULL,
                    1, NULL, 1, NULL,
                    0, 0, 2, 1
                )
            """, (d_id, d_id))
            print(f"Inserted 1BAIL307A for Dept {d_id}")
        else:
            execute("""
                UPDATE subject
                SET subject_name = 'Exploratory Data Analysis',
                    course_category = 'AEC',
                    is_optional = 1,
                    practical_hours = 2,
                    credits = 1
                WHERE subject_id = %s
            """, (existing[0]["subject_id"],))
            print(f"Updated 1BAIL307A for Dept {d_id}")

    # 5. Ensure 1BCSL307A has correct AEC attributes and is_optional=1 in Dept 5, 6, 7, 8
    for d_id in cs_allied_depts:
        execute("""
            UPDATE subject 
            SET subject_name = 'Project Management (with Git)',
                course_category = 'AEC',
                is_optional = 1,
                lecture_hours = 0,
                tutorial_hours = 0,
                practical_hours = 2,
                credits = 1,
                faculty_assignment_required = 1
            WHERE scheme_id = 2 AND semester_id = 3 AND department_id = %s AND subject_code = '1BCSL307A'
        """, (d_id,))
        print(f"Updated 1BCSL307A for Dept {d_id}")

    # 6. Add 1BMATDIP310 (Lateral Entry Mathematics) for all engineering depts 1..8
    all_eng_depts = [1, 2, 3, 4, 5, 6, 7, 8]
    for d_id in all_eng_depts:
        existing = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 3 AND department_id = %s AND subject_code = '1BMATDIP310'", (d_id,))
        if not existing:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (
                    '1BMATDIP310', 'Mathematics course for Lateral Entry Students', %s, 9,
                    3, 2, 1, 'NCMC', NULL,
                    0, NULL, 0, NULL,
                    1, 0, 0, 0
                )
            """, (d_id,))
            print(f"Inserted 1BMATDIP310 for Dept {d_id}")
        else:
            print(f"1BMATDIP310 already exists for Dept {d_id}")

    # 7. Add 1BMATDIP410 (Lateral Entry Mathematics) for all engineering depts 1..8 in Sem 4
    for d_id in all_eng_depts:
        existing = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 4 AND department_id = %s AND subject_code = '1BMATDIP410'", (d_id,))
        if not existing:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (
                    '1BMATDIP410', 'Mathematics course for Lateral Entry Students', %s, 9,
                    4, 2, 1, 'NCMC', NULL,
                    0, NULL, 0, NULL,
                    1, 0, 0, 0
                )
            """, (d_id,))
            print(f"Inserted 1BMATDIP410 for Dept {d_id}")
        else:
            print(f"1BMATDIP410 already exists for Dept {d_id}")

    # 8. Add other AEC electives in other branches for completeness
    # ME (Dept 1):
    me_aec = [
        ('1BMEL307A', 'MATLAB for Engineering Computation'),
        ('1BMEL307B', 'Virtual Reality'),
        ('1BMEL307C', 'Spread Sheet for Engineers'),
        ('1BMEL307D', 'Prompt Engineering')
    ]
    for code, title in me_aec:
        ex = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 3 AND department_id = 1 AND subject_code = %s", (code,))
        if not ex:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (%s, %s, 1, 1, 3, 2, 1, 'AEC', NULL, 1, NULL, 1, NULL, 0, 0, 2, 1)
            """, (code, title))
        else:
            execute("UPDATE subject SET subject_name = %s, course_category = 'AEC', is_optional = 1 WHERE subject_id = %s", (title, ex[0]["subject_id"]))

    # VLSI (Dept 3):
    vlsi_aec = [
        ('1BVLL307A', 'Introduction to Data structures'),
        ('1BVLL307B', 'Simulation of Circuits and Devices'),
        ('1BVLL307C', 'Linux Fundamentals and Introduction to Python Programming'),
        ('1BVLL307D', 'MATLAB')
    ]
    for code, title in vlsi_aec:
        ex = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 3 AND department_id = 3 AND subject_code = %s", (code,))
        if not ex:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (%s, %s, 3, 3, 3, 2, 1, 'AEC', NULL, 1, NULL, 1, NULL, 0, 0, 2, 1)
            """, (code, title))
        else:
            execute("UPDATE subject SET subject_name = %s, course_category = 'AEC', is_optional = 1 WHERE subject_id = %s", (title, ex[0]["subject_id"]))

    # EC (Dept 4):
    ec_aec = [
        ('1BECL307A', 'Analog Electronic Circuit Simulations Lab'),
        ('1BECL307B', 'Microcontroller Lab'),
        ('1BECL307C', 'Introduction to Data Structures using Python Lab'),
        ('1BECL307D', 'Programming Using JAVA')
    ]
    for code, title in ec_aec:
        ex = rows("SELECT subject_id FROM subject WHERE scheme_id = 2 AND semester_id = 3 AND department_id = 4 AND subject_code = %s", (code,))
        if not ex:
            execute("""
                INSERT INTO subject (
                    subject_code, subject_name, department_id, teaching_department_id,
                    semester_id, scheme_id, group_id, course_category, course_structure,
                    faculty_assignment_required, cycle, is_optional, option_group_id,
                    lecture_hours, tutorial_hours, practical_hours, credits
                ) VALUES (%s, %s, 4, 4, 3, 2, 1, 'AEC', NULL, 1, NULL, 1, NULL, 0, 0, 2, 1)
            """, (code, title))
        else:
            execute("UPDATE subject SET subject_name = %s, course_category = 'AEC', is_optional = 1 WHERE subject_id = %s", (title, ex[0]["subject_id"]))

    print("=== UPDATE COMPLETE ===")
