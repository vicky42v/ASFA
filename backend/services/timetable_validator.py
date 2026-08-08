from collections import Counter, defaultdict


def validate_entries(entries, constraints=None):
    """Validate a saved or proposed timetable without mutating it."""
    conflicts, warnings = [], []
    faculty_slots, class_slots, subject_slots = defaultdict(list), defaultdict(list), defaultdict(list)
    for item in entries:
        key = (item["day"], int(item["period"]))
        if item.get("faculty_id"):
            faculty_slots[(item["faculty_id"], key)].append(item)
        class_slots[key].append(item)
        if item.get("subject_id"):
            subject_slots[(item["subject_id"], key)].append(item)
    for (faculty_id, key), values in faculty_slots.items():
        if len(values) > 1:
            conflicts.append({"type": "faculty_conflict", "faculty_id": faculty_id, "slot": key,
                              "message": "A faculty member is assigned more than once in the same slot."})
    for key, values in class_slots.items():
        if len(values) > 1:
            conflicts.append({"type": "semester_conflict", "slot": key,
                              "message": "More than one subject is assigned to the same semester slot."})
    if constraints:
        allowed_days = {d.strip() for d in constraints["working_days"].split(",")}
        for entry in entries:
            if entry["day"] not in allowed_days or entry["period"] > constraints["periods_per_day"]:
                conflicts.append({"type": "constraint_violation", "entry": entry,
                                  "message": "Entry falls outside the configured working schedule."})
        by_faculty_day = Counter((e.get("faculty_id"), e["day"]) for e in entries if e.get("faculty_id"))
        by_faculty = Counter(e.get("faculty_id") for e in entries if e.get("faculty_id"))
        for key, count in by_faculty_day.items():
            if count > constraints["max_periods_per_day"]:
                conflicts.append({"type": "daily_workload", "faculty_id": key[0], "day": key[1],
                                  "message": "Faculty daily workload exceeds the configured maximum."})
        for faculty_id, count in by_faculty.items():
            if count > constraints["max_periods_per_week"]:
                conflicts.append({"type": "weekly_workload", "faculty_id": faculty_id,
                                  "message": "Faculty weekly workload exceeds the configured maximum."})
    return {"valid": not conflicts, "conflicts": conflicts, "warnings": warnings,
            "summary": {"scheduled_entries": len(entries), "conflict_count": len(conflicts)}}
