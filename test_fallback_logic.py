from backend.app import create_app
app = create_app()

with app.app_context():
    from backend.services.timetable_service import _get_subjects, _get_assignments, _assignment_map, _make_tasks
    from collections import defaultdict
    
    def test_solve(semester_id):
        context = {
            "department_id": 5,
            "scheme_id": 1,
            "academic_year": "2026-27",
            "semester_type": "Odd",
            "semester_id": semester_id,
        }
        
        subjects = _get_subjects(context)
        assignments = _get_assignments(context)
        
        # Option group filtering for ALL option_group_id
        groups = defaultdict(list)
        selected_subjects = set()
        for s in subjects:
            if s.get("option_group_id"):
                groups[s["option_group_id"]].append(s)
                
        for a in assignments:
            selected_subjects.add(a["subject_id"])
            
        final_subjects = []
        for s in subjects:
            gid = s.get("option_group_id")
            if gid:
                # check if any in this group is selected
                chosen_in_group = [item for item in groups[gid] if item["subject_id"] in selected_subjects]
                if chosen_in_group:
                    if s["subject_id"] in selected_subjects:
                        final_subjects.append(s)
                else:
                    final_subjects.append(s) # keep if none chosen
            else:
                final_subjects.append(s)
                
        print(f"Sem {semester_id} Final subjects count:", len(final_subjects))
        for s in final_subjects:
            print("  ", s['subject_code'], s['subject_name'])

    print("--- SEM 5 ---")
    test_solve(5)
    print("\n--- SEM 7 ---")
    test_solve(7)
