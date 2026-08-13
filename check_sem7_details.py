from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.db import rows
    subs = rows("SELECT subject_id, subject_code, subject_name, course_category, lecture_hours, tutorial_hours, practical_hours FROM subject WHERE subject_id IN (144, 145, 567, 568)", ())
    for s in subs:
        print(s)
        fsad = rows("SELECT * FROM faculty_subject_assignment_detail WHERE subject_id = %s AND academic_year = '2026-27' AND status = 'Active'", (s['subject_id'],))
        print("  FSAD:", fsad)
