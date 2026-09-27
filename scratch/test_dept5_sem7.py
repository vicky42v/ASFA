import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.services.timetable_service import (
    _get_subjects, _get_constraints, _get_assignments, _assignment_map,
    _optional_validation, _selected_subjects, _make_tasks, _resolve_effective_department,
    generate_asfa_timetable
)
from backend.services.asfa_rule_engine import AsfaRuleEngine
from backend.services.timetable_validator import validate_entries
import json

app = create_app()
with app.app_context():
    context = {
        "department_id": 5,
        "scheme_id": 1,
        "semester_id": 7,
        "semester": 7,
        "academic_year": "2026-27",
        "semester_type": "Odd",
        "cycle": None,
        "number_of_outputs": 3,
        "proctor_b1_faculty_id": 3,
        "proctor_b2_faculty_id": 5,
    }
    
    _resolve_effective_department(context)
    constraint = _get_constraints(context)
    assignments = _get_assignments(context)
    amap = _assignment_map(assignments)
    subjects = _get_subjects(context)
    opt = _optional_validation(subjects, assignments, context=context)
    subjects = _selected_subjects(subjects, opt)
    rule_engine = AsfaRuleEngine(context)
    
    days = [d.strip() for d in constraint["working_days"].split(",") if d.strip()]
    periods = int(constraint["periods_per_day"])
    
    tasks = _make_tasks(
        subjects,
        amap,
        days=days,
        periods_per_day=periods,
        constraint=constraint,
        rule_engine=rule_engine,
        context=context,
        assignments=assignments,
    )
    print(f"Tasks count: {len(tasks)}")
    for t in tasks:
        sub_code = t.get('subject', {}).get('subject_code') if t.get('subject') else t.get('name')
        print(f"  {sub_code} | comp={t.get('component')} | ord={t.get('ordinal')} | dur={t.get('block_size')} | facs={t.get('faculty_ids')}")

    # Now let's call generate_asfa_timetable directly and inspect internal failure
    res = generate_asfa_timetable(context, rule_engine=rule_engine, number_of_outputs=1)
    print("\n--- GENERATE RESULT ---")
    print("Success:", res.get("success"))
    print("Validation:", json.dumps(res.get("validation"), indent=2))
    print("Errors:", res.get("errors"))
    print("Conflicts:", res.get("conflicts"))
