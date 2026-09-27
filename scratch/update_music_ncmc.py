import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows, execute

app = create_app()
with app.app_context():
    print("=== UPDATING MUSIC, YOGA, SPORTS, NSS IN DB ===")
    
    # Update Music in Sem 3 and Sem 4
    execute("""
        UPDATE subject
        SET course_category = 'NCMC',
            faculty_assignment_required = 0,
            lecture_hours = 0,
            tutorial_hours = 0,
            practical_hours = 2,
            credits = 0
        WHERE subject_code IN ('1BMUK309', '1BMUS409')
    """)
    print("Updated Music subjects in Sem 3 and Sem 4")

    # Update Sem 4 counterparts (1BYOK409, 1BPEK409, 1BNSK409)
    execute("""
        UPDATE subject
        SET course_category = 'NCMC',
            faculty_assignment_required = 0,
            lecture_hours = 0,
            tutorial_hours = 0,
            practical_hours = 2,
            credits = 0
        WHERE subject_code IN ('1BYOK409', '1BPEK409', '1BNSK409')
    """)
    print("Updated Yoga, PE, NSS in Sem 4")

    # Clean any assignments for Music, Yoga, Sports, NSS (NCMC co-curriculars have no faculty requirement)
    execute("""
        DELETE FROM faculty_subject_assignment_detail
        WHERE subject_id IN (
            SELECT subject_id FROM subject WHERE subject_code IN ('1BMUK309', '1BMUS409', '1BNSS309', '1BPE309', '1BYOG309', '1BNSK409', '1BPEK409', '1BYOK409')
        )
    """)
    print("Cleaned any faculty assignment details for NCMC Saturday co-curriculars")

    # Update RULE_SEM7_ACTIVITY_REPLACEMENT in asfa_rule
    execute("""
        UPDATE asfa_rule
        SET rule_value = '{"with": ["PROJECT", "PLACEMENT"], "replace": ["PE", "PHYSICAL EDUCATION", "NCC", "YOGA", "NSS", "MUSIC"]}',
            description = 'Physical Education, NCC, Yoga, NSS, and Music are replaced by Project and Placement activities in Semester 7 curriculum.'
        WHERE rule_code = 'RULE_SEM7_ACTIVITY_REPLACEMENT'
    """)
    print("Updated RULE_SEM7_ACTIVITY_REPLACEMENT rule in asfa_rule table")

    print("=== FINISHED DB UPDATES ===")
