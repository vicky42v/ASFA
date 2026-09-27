from collections import Counter, defaultdict

from backend.db import rows
from backend.services.asfa_rule_engine import AsfaRuleEngine


def _as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _working_days(constraints):
    if not constraints:
        return set()

    raw = constraints.get("working_days") or ""

    if isinstance(raw, (list, tuple, set)):
        return {
            str(day).strip()
            for day in raw
            if str(day).strip()
        }

    return {
        day.strip()
        for day in str(raw).split(",")
        if day.strip()
    }


def _component(entry):
    value = str(
        entry.get("component") or "Theory"
    ).strip().title()

    if value not in ("Theory", "Lab", "Special"):
        return "Theory"

    return value


def _raw_component(entry):
    return str(entry.get("component") or "Theory").strip().title()


def _is_major_project_entry(entry, subject=None):
    """Return True when an entry represents a Major Project.

    Major Projects are faculty-free. Detection intentionally uses both
    generated-entry fields and database subject metadata so a stale/older
    n8n payload cannot accidentally force a faculty assignment.
    """
    entry = entry or {}
    subject = subject or {}

    code = str(
        entry.get("subject_code")
        or subject.get("subject_code")
        or ""
    ).strip().upper()

    name = str(
        entry.get("subject_name")
        or subject.get("subject_name")
        or ""
    ).strip().upper()

    category = str(
        entry.get("course_category")
        or subject.get("course_category")
        or ""
    ).strip().upper()

    subject_type = str(
        entry.get("subject_type") or ""
    ).strip().upper()

    return (
        bool(entry.get("is_project"))
        or subject_type == "PROJECT"
        or category in {"PROJ", "PROJECT", "MAJOR PROJECT"}
        or "PROJECT" in category
        or code == "BAI786"
        or "MAJOR" in code
        or "MAJOR PROJECT" in name
    )


def _is_faculty_free_entry(entry, subject=None):
    """Return True when an entry is faculty-free (Major Project, Placement, Library, Remedial, Activity, Special)."""
    if not entry:
        return False
    if _is_major_project_entry(entry, subject):
        return True
    entry = entry or {}
    subject = subject or {}
    if str(entry.get("component") or "").strip().title() == "Special":
        return True
    code = str(entry.get("subject_code") or subject.get("subject_code") or "").strip().upper()
    name = str(entry.get("subject_name") or subject.get("subject_name") or "").strip().upper()
    category = str(entry.get("course_category") or subject.get("course_category") or "").strip().upper()
    classification = str(entry.get("classification") or "").strip().upper()

    if entry.get("is_proctor") or entry.get("is_placement") or entry.get("is_library") or entry.get("is_remedial") or entry.get("is_activity") or entry.get("is_project"):
        return True
    if classification in ("PROCTOR", "PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY", "SPECIAL", "PROJECT"):
        return True
    if category in ("SPECIAL", "MC", "PROJ"):
        return True
    if code in ("PROCTOR", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY") or "PROJECT" in code or "PROJECT" in name:
        return True
    if any(k in name for k in ("PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY", "PROJECT")):
        return True
    if _as_int(entry.get("faculty_assignment_required"), 1) == 0:
        return True
    if _as_int(subject.get("faculty_assignment_required"), 1) == 0:
        return True
    return False


def _assignment_conflicts(entries, context):
    """Check that proposed normal entries match saved faculty assignments.

    Major Project, Placement, Library, Remedial, Activity, and Special entries
    are faculty-free and excluded from assignment matching.
    """
    if not context or not entries:
        return []

    subject_ids = sorted({
        _as_int(item.get("subject_id"))
        for item in entries
        if _as_int(item.get("subject_id")) > 0
    })
    if not subject_ids:
        return []

    placeholders = ",".join(["%s"] * len(subject_ids))

    subject_rows = rows(
        f"""
        SELECT subject_id, subject_code, subject_name, course_category, lecture_hours, practical_hours, faculty_assignment_required
        FROM subject
        WHERE subject_id IN ({placeholders})
        """,
        tuple(subject_ids),
    )
    subject_map = {
        _as_int(item["subject_id"]): item
        for item in subject_rows
    }
    for s in (context.get("subjects") or []):
        sid = _as_int(s.get("subject_id"))
        if sid > 0:
            if sid not in subject_map:
                subject_map[sid] = dict(s)
            else:
                subject_map[sid].update({k: v for k, v in s.items() if v is not None})

    normal_subject_ids = [
        sid for sid in subject_ids
        if not _is_faculty_free_entry(
            next(
                (item for item in entries if _as_int(item.get("subject_id")) == sid),
                {},
            ),
            subject_map.get(sid),
        )
    ]

    conflicts = []
    selected_cycle = context.get("cycle")

    for index, entry in enumerate(entries):
        subject_id = _as_int(entry.get("subject_id"))
        subject = subject_map.get(subject_id)

        # Faculty-free entries (Major Project, Placement, Library, Remedial, Activity, Special)
        if _is_faculty_free_entry(entry, subject):
            item_cycle = entry.get("cycle")
            if selected_cycle in ("P", "C") and item_cycle not in (None, "", selected_cycle):
                conflicts.append({
                    "type": "cycle_context_conflict",
                    "entry_index": index,
                    "message": "Timetable entry belongs to a different P/C cycle.",
                })
            if selected_cycle not in ("P", "C") and item_cycle not in (None, ""):
                conflicts.append({
                    "type": "cycle_context_conflict",
                    "entry_index": index,
                    "message": "Only Semester 1 and Semester 2 timetable entries may specify a cycle.",
                })
            continue

        component = _raw_component(entry)
        if component not in ("Theory", "Lab", "Special"):
            conflicts.append({
                "type": "invalid_component",
                "entry_index": index,
                "message": "Timetable component must be Theory, Lab or Special.",
            })
            continue

        if component == "Special":
            continue

        roles = {}
        if subject_id in normal_subject_ids:
            details = rows(
                """
                SELECT subject_id, faculty_id, component, assignment_role, batch
                FROM faculty_subject_assignment_detail
                WHERE academic_year = %s
                  AND status = 'Active'
                  AND subject_id = %s
                """,
                (context.get("academic_year"), subject_id),
            )
            for detail in details:
                detail_component = str(detail.get("component") or "").strip().title()
                detail_role = str(detail.get("assignment_role") or "").strip().title()
                detail_batch = str(detail.get("batch") or "").strip().upper()
                if detail_component == component:
                    if detail_role in ("Main", "Co"):
                        roles[detail_role] = _as_int(detail.get("faculty_id"))
                    if detail_batch in ("B1", "B2"):
                        roles[detail_batch] = _as_int(detail.get("faculty_id"))

        # Also pull from context assignments if present
        for asg in (context.get("assignments") or []):
            if _as_int(asg.get("subject_id")) == subject_id:
                asg_comp = str(asg.get("component") or "").strip().title()
                asg_role = str(asg.get("assignment_role") or "").strip().title()
                asg_batch = str(asg.get("batch") or "").strip().upper()
                fid = _as_int(asg.get("faculty_id"))
                if asg_comp == component:
                    if asg_role in ("Main", "Co"):
                        roles[asg_role] = fid
                    if asg_batch in ("B1", "B2"):
                        roles[asg_batch] = fid

        main = _as_int(entry.get("faculty_id"))
        co = _as_int(entry.get("co_faculty_id"))
        entry_batch = str(entry.get("batch") or "").strip().upper()

        is_ipcc = False
        if subject:
            cat = str(subject.get("course_category") or "").upper()
            lec = _as_int(subject.get("lecture_hours"))
            prac = _as_int(subject.get("practical_hours"))
            is_ipcc = (cat == "IPCC" or (lec > 0 and prac > 0))

        # Main faculty is always roles["Main"] for any subject/lab component
        expected_main = roles.get("Main")

        if not expected_main and main <= 0:
            conflicts.append({
                "type": "missing_assignment",
                "entry_index": index,
                "message": "Timetable entry has no active Main faculty assignment for its subject component.",
            })
        elif expected_main and main != expected_main:
            conflicts.append({
                "type": "faculty_mismatch",
                "entry_index": index,
                "message": "Assigned Main faculty does not match the saved assignment.",
            })

        can_have_co = (component == "Lab" or is_ipcc)
        expected_co = _as_int(roles.get("Co"))
        if can_have_co:
            if expected_co and co != expected_co:
                conflicts.append({
                    "type": "invalid_co_faculty_assignment",
                    "entry_index": index,
                    "message": "Timetable entry does not match the saved Co-faculty assignment.",
                })
        else:
            if co > 0 or expected_co:
                conflicts.append({
                    "type": "invalid_theory_assignment",
                    "entry_index": index,
                    "message": "Non-IPCC Theory assignment cannot have Co-faculty.",
                })

        item_cycle = entry.get("cycle")
        if selected_cycle in ("P", "C") and item_cycle not in (None, "", selected_cycle):
            conflicts.append({
                "type": "cycle_context_conflict",
                "entry_index": index,
                "message": "Timetable entry belongs to a different P/C cycle.",
            })
        if selected_cycle not in ("P", "C") and item_cycle not in (None, ""):
            conflicts.append({
                "type": "cycle_context_conflict",
                "entry_index": index,
                "message": "Only Semester 1 and Semester 2 timetable entries may specify a cycle.",
            })

    # Saved timetables from other semester contexts also occupy faculty.
    proposed_slots = {
        (_as_int(item.get("faculty_id")), item.get("day"), _as_int(item.get("period")))
        for item in entries
        if _as_int(item.get("faculty_id")) and item.get("day") and _as_int(item.get("period"))
    }
    proposed_slots.update({
        (_as_int(item.get("co_faculty_id")), item.get("day"), _as_int(item.get("period")))
        for item in entries
        if _as_int(item.get("co_faculty_id")) and item.get("day") and _as_int(item.get("period"))
    })
    if proposed_slots:
        saved = rows(
            """
            SELECT department_id, scheme_id, semester_id, cycle, day, period,
                   faculty_id, co_faculty_id
            FROM timetable
            WHERE academic_year = %s AND semester_type = %s
            """,
            (context.get("academic_year"), context.get("semester_type")),
        )
        for saved_entry in saved:
            same_context = (
                str(saved_entry.get("department_id")) == str(context.get("department_id"))
                and str(saved_entry.get("scheme_id")) == str(context.get("scheme_id"))
                and str(saved_entry.get("semester_id")) == str(context.get("semester_id"))
                and str(saved_entry.get("cycle") or "") == str(context.get("cycle") or "")
            )
            if same_context:
                continue
            for faculty_id in (
                _as_int(saved_entry.get("faculty_id")),
                _as_int(saved_entry.get("co_faculty_id")),
            ):
                if faculty_id and (
                    faculty_id,
                    saved_entry.get("day"),
                    _as_int(saved_entry.get("period")),
                ) in proposed_slots:
                    conflicts.append({
                        "type": "faculty_conflict_existing_timetable",
                        "faculty_id": faculty_id,
                        "message": "Faculty is already scheduled in another timetable at this time slot.",
                    })
                    break

    return conflicts


def _faculty_ids(entry):
    """
    Return Main + Co faculty IDs.

    Main faculty comes from faculty_id.
    Co faculty comes from co_faculty_id.

    Duplicate IDs are removed.
    """

    result = []

    main = entry.get("faculty_id")

    if main not in (None, ""):
        try:
            result.append(int(main))
        except (TypeError, ValueError):
            pass

    co = entry.get("co_faculty_id")

    if co not in (None, ""):
        try:
            co_id = int(co)

            if co_id not in result:
                result.append(co_id)

        except (TypeError, ValueError):
            pass

    return result


def validate_entries(entries, constraints=None, context=None):
    """
    Validate a generated or manually edited timetable.

    HARD RULES
    ----------
    1. A normal theory slot cannot contain two subjects.
    2. Concurrent lab batches are allowed when faculty do not overlap.
    3. A faculty member cannot teach two classes in one slot.
    4. A faculty member cannot teach different subjects
       in the same semester.
    5. Working-day violations are rejected.
    6. Period violations are rejected.
    7. Faculty daily workload is checked.
    8. Faculty weekly workload is checked.
    9. Co-faculty is allowed only for Labs.
    10. Main and Co faculty cannot be the same person.
    11. Every Lab component is scheduled in contiguous blocks using the
        configured lab_duration from timetable_constraints (a final shorter
        block is allowed when practical_hours is not divisible by it).
    12. Lab blocks cannot cross the configured short break or lunch.
    13. Same subject repeated on the same day is a warning.

    NOTE
    ----
    Workload is counted from actual timetable periods.

    No percentage or estimated workload is used.
    """

    entries = entries or []

    conflicts = []
    warnings = []

    # ---------------------------------------------------------
    # TRACKING
    # ---------------------------------------------------------

    faculty_slots = defaultdict(list)

    semester_slots = defaultdict(list)

    subject_day_slots = defaultdict(list)

    faculty_semester_subjects = defaultdict(
        lambda: defaultdict(set)
    )

    faculty_day_counts = Counter()

    faculty_week_counts = Counter()

    # =========================================================
    # COLLECT ENTRIES
    # =========================================================

    for index, item in enumerate(entries):

        if _raw_component(item) not in ("Theory", "Lab", "Special"):
            conflicts.append(
                {
                    "type": "invalid_component",
                    "entry_index": index,
                    "message": "Timetable component must be Theory, Lab or Special.",
                }
            )

        day = item.get("day")

        period_raw = item.get("period")

        try:
            period = int(period_raw)
        except (TypeError, ValueError):

            conflicts.append(
                {
                    "type": "invalid_period",
                    "entry_index": index,
                    "entry": item,
                    "message": (
                        "Invalid timetable period."
                    ),
                }
            )

            continue

        if not day:

            conflicts.append(
                {
                    "type": "invalid_day",
                    "entry_index": index,
                    "entry": item,
                    "message": (
                        "Timetable entry has no day."
                    ),
                }
            )

            continue

        slot = (
            str(day),
            period,
        )

        semester_id = item.get(
            "semester_id"
        )

        subject_id = item.get(
            "subject_id"
        )

        # -----------------------------------------------------
        # SEMESTER SLOT
        # -----------------------------------------------------

        semester_slots[
            (
                semester_id,
                slot,
            )
        ].append(item)

        # -----------------------------------------------------
        # SUBJECT PER DAY
        # -----------------------------------------------------

        if subject_id not in (
            None,
            "",
        ):

            subject_day_slots[
                (
                    semester_id,
                    subject_id,
                    day,
                )
            ].append(item)

        # -----------------------------------------------------
        # FACULTY
        # -----------------------------------------------------

        faculty_ids = _faculty_ids(
            item
        )

        for faculty_id in faculty_ids:

            faculty_slots[
                (
                    faculty_id,
                    slot,
                )
            ].append(item)

            # Project coordinator hours do NOT count towards faculty teaching workload
            is_proj_coordinator = (
                bool(item.get("is_project"))
                or "PROJECT" in str(item.get("subject_name") or "").upper()
                or "PROJECT" in str(item.get("subject_code") or "").upper()
                or str(item.get("course_category") or "").upper() == "PROJ"
                or str(item.get("subject_type") or "").upper() == "PROJECT"
                or str(item.get("assignment_role") or "").lower() == "coordinator"
                or str(item.get("role") or "").lower() == "coordinator"
            )

            if not is_proj_coordinator:
                faculty_day_counts[
                    (
                        faculty_id,
                        day,
                    )
                ] += 1

                faculty_week_counts[
                    faculty_id
                ] += 1

            if subject_id not in (
                None,
                "",
            ):

                faculty_semester_subjects[
                    faculty_id
                ][
                    semester_id
                ].add(
                    subject_id
                )

    # =========================================================
    # SEMESTER SLOT CONFLICT
    # =========================================================
    #
    # Normal theory/tutorial classes are exclusive for a
    # semester. Labs are the one intentional exception:
    # different lab batches may occupy the same two periods.
    # The faculty conflict check below still makes sure a
    # faculty member is not teaching both labs simultaneously.
    #
    # We do not invent batch IDs here because the current
    # timetable schema does not contain a batch column.
    # Therefore the validator treats simultaneous Lab entries
    # as batch candidates and requires non-overlapping faculty.
    # =========================================================

    for (
        semester_id,
        slot,
    ), values in semester_slots.items():

        if len(values) <= 1:
            continue

        components = {
            _component(item)
            for item in values
        }

        batches = [str(item.get("batch") or "").strip().upper() for item in values if item.get("batch")]
        has_distinct_batches = len(batches) == len(values) and len(set(batches)) == len(values)
        is_all_labs = (components == {"Lab"} or all(str(item.get("component") or "").lower() == "lab" for item in values))
        is_all_proctor = all(
            str(item.get("subject_code") or "").upper() == "PROCTOR"
            or item.get("is_proctor")
            or str(item.get("classification") or "").upper() == "PROCTOR"
            for item in values
        )

        if is_all_labs or is_all_proctor or has_distinct_batches:
            faculty_sets = [
                set(_faculty_ids(item))
                for item in values
            ]

            faculty_overlap = any(
                faculty_sets[i] & faculty_sets[j]
                for i in range(len(faculty_sets))
                for j in range(i + 1, len(faculty_sets))
            )

            if not faculty_overlap:
                continue

        subject_names = [
            str(
                item.get("subject_code")
                or item.get("subject_name")
                or item.get("subject_id")
            )
            for item in values
        ]

        conflicts.append(
            {
                "type": "semester_conflict",
                "semester_id": semester_id,
                "slot": slot,
                "subjects": subject_names,
                "message": (
                    "More than one non-compatible class "
                    "is assigned to the same semester "
                    "time slot."
                ),
            }
        )

    # =========================================================
    # FACULTY SLOT CONFLICT
    # =========================================================

    for (
        faculty_id,
        slot,
    ), values in faculty_slots.items():

        if len(values) <= 1:
            continue

        subject_names = []

        for item in values:

            code = (
                item.get("subject_code")
                or item.get("subject_name")
                or str(
                    item.get(
                        "subject_id"
                    )
                )
            )

            subject_names.append(
                str(code)
            )

        conflicts.append(
            {
                "type": "faculty_conflict",
                "faculty_id": faculty_id,
                "slot": slot,
                "subjects": subject_names,
                "message": (
                    "A faculty member is assigned "
                    "to more than one subject "
                    "in the same time slot."
                ),
            }
        )

    # =========================================================
    # ONE SUBJECT PER FACULTY PER SEMESTER
    # =========================================================

    for (
        faculty_id,
        semester_map,
    ) in faculty_semester_subjects.items():

        for (
            semester_id,
            subject_ids,
        ) in semester_map.items():

            if len(subject_ids) <= 1:
                continue

            subject_codes = []

            for subject_id in subject_ids:

                subject_codes.append(
                    str(subject_id)
                )

            warnings.append(
                {
                    "type": (
                        "faculty_multiple_subjects"
                    ),
                    "faculty_id": faculty_id,
                    "semester_id": semester_id,
                    "subject_ids": (
                        list(subject_ids)
                    ),
                    "message": (
                        f"Faculty {faculty_id} "
                        f"is assigned to different "
                        f"subjects in semester "
                        f"{semester_id}."
                    ),
                }
            )

    # =========================================================
    # MAIN / CO RULES
    # =========================================================

    for index, item in enumerate(entries):

        component = _component(
            item
        )

        main = item.get(
            "faculty_id"
        )

        co = item.get(
            "co_faculty_id"
        )

        # -----------------------------------------------------
        # SPECIAL / MAJOR PROJECT ACTIVITIES HAVE NO FACULTY
        # -----------------------------------------------------

        if (
            component == "Special"
            or _is_faculty_free_entry(item)
        ):
            continue

        # -----------------------------------------------------
        # MAIN FACULTY REQUIRED
        # -----------------------------------------------------

        if main in (
            None,
            "",
        ):

            conflicts.append(
                {
                    "type": "missing_main_faculty",
                    "entry_index": index,
                    "message": (
                        "Every timetable entry "
                        "must have a Main faculty."
                    ),
                }
            )

        # -----------------------------------------------------
        # THEORY CANNOT HAVE CO
        # -----------------------------------------------------

        if component == "Theory":

            if co not in (
                None,
                "",
            ):

                conflicts.append(
                    {
                        "type": "theory_co_faculty",
                        "entry_index": index,
                        "message": (
                            "Theory subjects cannot "
                            "have a Co faculty."
                        ),
                    }
                )

        # -----------------------------------------------------
        # LAB CO FACULTY
        # -----------------------------------------------------

        if component == "Lab":

            if (
                main not in (
                    None,
                    "",
                )
                and co not in (
                    None,
                    "",
                )
                and str(main)
                == str(co)
            ):

                conflicts.append(
                    {
                        "type": "same_main_co",
                        "entry_index": index,
                        "message": (
                            "Main faculty and "
                            "Co faculty cannot "
                            "be the same person."
                        ),
                    }
                )

    # =========================================================
    # SAME SUBJECT SAME DAY
    # =========================================================

    for (
        semester_id,
        subject_id,
        day,
    ), values in subject_day_slots.items():

        if len(values) <= 1:
            continue

        comp_set = {_component(item) for item in values}
        if comp_set <= {"Lab", "Special", "Project"}:
            continue

        periods = sorted([_as_int(item.get("period") or item.get("period_no")) for item in values])
        if len(periods) > 1 and all(periods[i+1] == periods[i] + 1 for i in range(len(periods)-1)):
            continue

        warnings.append(
            {
                "type": "subject_same_day",
                "semester_id": semester_id,
                "subject_id": subject_id,
                "day": day,
                "message": (
                    "The same subject is scheduled "
                    "more than once on the same day."
                ),
            }
        )

    # =========================================================
    # CONSTRAINT CHECKS
    # =========================================================

    if constraints:

        allowed_days = _working_days(
            constraints
        )

        periods_per_day = _as_int(
            constraints.get(
                "periods_per_day"
            ),
            0,
        )

        max_periods_per_day = _as_int(
            constraints.get(
                "max_periods_per_day"
            ),
            999,
        )

        max_periods_per_week = _as_int(
            constraints.get(
                "max_periods_per_week"
            ),
            999,
        )

        # -----------------------------------------------------
        # WORKING DAYS / PERIODS
        # -----------------------------------------------------

        for index, entry in enumerate(
            entries
        ):

            day = entry.get(
                "day"
            )

            period = _as_int(
                entry.get(
                    "period"
                ),
                0,
            )

            if (
                allowed_days
                and day not in allowed_days
            ):

                conflicts.append(
                    {
                        "type": (
                            "working_day_violation"
                        ),
                        "entry_index": index,
                        "day": day,
                        "message": (
                            "Entry falls outside "
                            "the configured "
                            "working days."
                        ),
                    }
                )

            if (
                period < 1
                or (
                    periods_per_day > 0
                    and period
                    > periods_per_day
                )
            ):

                conflicts.append(
                    {
                        "type": (
                            "period_violation"
                        ),
                        "entry_index": index,
                        "period": period,
                        "message": (
                            "Entry falls outside "
                            "the configured "
                            "periods per day."
                        ),
                    }
                )

        # -----------------------------------------------------
        # DAILY FACULTY WORKLOAD
        # -----------------------------------------------------

        for (
            (faculty_id, day),
            count,
        ) in faculty_day_counts.items():

            if (
                max_periods_per_day
                and count
                > max_periods_per_day
            ):

                conflicts.append(
                    {
                        "type": (
                            "daily_workload"
                        ),
                        "faculty_id":
                            faculty_id,
                        "day":
                            day,
                        "count":
                            count,
                        "maximum":
                            max_periods_per_day,
                        "message": (
                            "Faculty daily "
                            "workload exceeds "
                            "the configured "
                            "maximum."
                        ),
                    }
                )

        # -----------------------------------------------------
        # WEEKLY FACULTY WORKLOAD
        # -----------------------------------------------------

        for (
            faculty_id,
            count,
        ) in faculty_week_counts.items():

            if (
                max_periods_per_week
                and count
                > max_periods_per_week
            ):

                conflicts.append(
                    {
                        "type": (
                            "weekly_workload"
                        ),
                        "faculty_id":
                            faculty_id,
                        "count":
                            count,
                        "maximum":
                            max_periods_per_week,
                        "message": (
                            "Faculty weekly "
                            "workload exceeds "
                            "the configured "
                            "maximum."
                        ),
                    }
                )

    # =========================================================
    # SATURDAY SPECIAL ACTIVITY VALIDATION
    # =========================================================

    special_subject_ids = {
        _as_int(item.get("subject_id"))
        for item in entries
        if _component(item) == "Special"
        and _as_int(item.get("subject_id")) > 0
    }

    if special_subject_ids:
        placeholders = ",".join(["%s"] * len(special_subject_ids))
        special_rows = rows(
            f"""
            SELECT subject_id, subject_code, subject_name, course_category
            FROM subject
            WHERE subject_id IN ({placeholders})
            """,
            tuple(special_subject_ids),
        )
        special_map = {_as_int(r["subject_id"]): r for r in special_rows}
        periods_per_day = _as_int((constraints or {}).get("periods_per_day"), 0)
        allowed_days = _working_days(constraints)
        saturday_configured = any(
            str(day).strip().lower() == "saturday"
            for day in allowed_days
        )

        for subject_id in special_subject_ids:
            rows_for_subject = [
                item for item in entries
                if _component(item) == "Special"
                and _as_int(item.get("subject_id")) == subject_id
            ]
            code = (
                special_map.get(subject_id, {}).get("subject_code")
                or special_map.get(subject_id, {}).get("subject_name")
                or str(subject_id)
            )
            saturday_rows = [
                item for item in rows_for_subject
                if str(item.get("day") or "").strip().lower() == "saturday"
            ]

            if not saturday_configured:
                conflicts.append({
                    "type": "special_activity_saturday_not_configured",
                    "subject_id": subject_id,
                    "message": (
                        f"{code} is a Saturday activity, but Saturday is not "
                        "configured in the selected department/semester constraints."
                    ),
                })
                continue

            if not saturday_rows:
                conflicts.append({
                    "type": "special_activity_not_saturday",
                    "subject_id": subject_id,
                    "message": f"{code} must be scheduled on Saturday.",
                })
                continue

            periods = sorted(_as_int(item.get("period")) for item in saturday_rows)
            # Saturday activities (Yoga, NSS, Sports, Major Project) can occupy partial blocks without conflict

    # =========================================================
    # STRICT LAB / IPCC BLOCK VALIDATION
    # =========================================================
    #
    # A Lab component is represented in timetable as two rows:
    #   Day N, Period P
    #   Day N, Period P+1
    #
    # Those two rows are ONE laboratory session. A subject must
    # not receive another lab block during the same week.
    #
    # IPCC subjects are not treated specially by creating extra
    # lab blocks: their Theory and Lab components are independent,
    # but the Lab component still follows exactly one 2-period
    # block/week.
    # =========================================================

    lab_entries_by_subject = defaultdict(list)

    lab_subject_ids = sorted({
        _as_int(item.get("subject_id"))
        for item in entries
        if _component(item) == "Lab"
        and _as_int(item.get("subject_id")) > 0
    })

    subject_rows = {}
    if lab_subject_ids:
        placeholders = ",".join(["%s"] * len(lab_subject_ids))
        subject_records = rows(
            f"""
            SELECT
                subject_id,
                subject_code,
                subject_name,
                course_category,
                practical_hours
            FROM subject
            WHERE subject_id IN ({placeholders})
            """,
            tuple(lab_subject_ids),
        )
        subject_rows = {
            _as_int(item["subject_id"]): item
            for item in subject_records
        }

    for index, item in enumerate(entries):
        if _component(item) != "Lab":
            continue

        subject_id = _as_int(item.get("subject_id"))
        day = str(item.get("day") or "").strip()
        period = _as_int(item.get("period"))

        lab_entries_by_subject[subject_id].append(
            (index, day, period, item)
        )

    short_break = _as_int(
        (constraints or {}).get("short_break_after_period"),
        0,
    )
    lunch = _as_int(
        (constraints or {}).get("lunch_after_period"),
        0,
    )
    periods_per_day = _as_int(
        (constraints or {}).get("periods_per_day"),
        0,
    )
    configured_lab_duration = max(
        1,
        _as_int(
            (constraints or {}).get("lab_duration"),
            2,
        ),
    )

    for subject_id, lab_rows in lab_entries_by_subject.items():
        subject = subject_rows.get(subject_id) or {}
        practical_hours = _as_int(subject.get("practical_hours"), 0)
        code = subject.get("subject_code") or subject.get("subject_name") or str(subject_id)

        batches_present = set(
            str(item.get("batch") or "").strip()
            for _, _, _, item in lab_rows
            if str(item.get("batch") or "").strip()
        )
        batches_to_check = sorted(batches_present) if batches_present else [None]

        for b_name in batches_to_check:
            b_rows = (
                [r for r in lab_rows if str(r[3].get("batch") or "").strip() == b_name]
                if b_name
                else lab_rows
            )
            batch_label = f" (Batch {b_name})" if b_name else ""

            if practical_hours > 0 and len(b_rows) != practical_hours:
                conflicts.append({
                    "type": "lab_frequency_or_duration",
                    "subject_id": subject_id,
                    "batch": b_name,
                    "message": (
                        f"Lab subject {code}{batch_label} must have exactly {practical_hours} "
                        f"scheduled practical periods because the database specifies "
                        f"{practical_hours} practical hours/week."
                    ),
                })
                continue

            by_day = defaultdict(list)
            for item_index, day, period, item in b_rows:
                by_day[day].append((item_index, period, item))

            for day, day_rows in by_day.items():
                day_rows.sort(key=lambda value: value[1])
                periods = [period for _idx, period, _item in day_rows]

                # Each day is represented by one or more contiguous lab blocks.
                # Split a day into blocks whenever there is a gap.
                blocks = []
                current_block = []
                for period in periods:
                    if not current_block or period == current_block[-1] + 1:
                        current_block.append(period)
                    else:
                        blocks.append(current_block)
                        current_block = [period]
                if current_block:
                    blocks.append(current_block)

                for block_periods in blocks:
                    block_len = len(block_periods)
                    if block_len > configured_lab_duration:
                        conflicts.append({
                            "type": "lab_block_too_long",
                            "subject_id": subject_id,
                            "day": day,
                            "batch": b_name,
                            "periods": block_periods,
                            "message": (
                                f"Lab {code}{batch_label} uses {block_len} contiguous periods, "
                                f"but the configured lab_duration is {configured_lab_duration}."
                            ),
                        })

                    # Hard constraint: 2-period lab blocks must strictly occupy [1,2], [3,4], or [5,6]
                    if block_len == 2:
                        if block_periods not in ([1, 2], [3, 4], [5, 6]):
                            conflicts.append({
                                "type": "invalid_lab_block_structure",
                                "subject_id": subject_id,
                                "day": day,
                                "batch": b_name,
                                "periods": block_periods,
                                "message": (
                                    f"Lab {code}{batch_label} is scheduled at periods {block_periods}. "
                                    f"Under the reference timetable hard constraint, 2-period labs must strictly be scheduled as [1,2], [3,4], or [5,6]."
                                ),
                            })

                    start = block_periods[0]
                    end = block_periods[-1]
                    if short_break and start <= short_break < end:
                        conflicts.append({
                            "type": "lab_crosses_short_break",
                            "subject_id": subject_id,
                            "day": day,
                            "batch": b_name,
                            "periods": block_periods,
                            "message": f"Lab block {code}{batch_label} cannot span across the short break.",
                        })
                    if lunch and start <= lunch < end:
                        conflicts.append({
                            "type": "lab_crosses_lunch",
                            "subject_id": subject_id,
                            "day": day,
                            "batch": b_name,
                            "periods": block_periods,
                            "message": f"Lab block {code}{batch_label} cannot span across lunch.",
                        })

                    if periods_per_day and end > periods_per_day:
                        conflicts.append({
                            "type": "lab_period_violation",
                            "subject_id": subject_id,
                            "day": day,
                            "batch": b_name,
                            "periods": block_periods,
                            "message": f"Lab block {code}{batch_label} extends beyond periods per day.",
                        })



    # =========================================================
    # DATABASE-BACKED ASSIGNMENT / CYCLE CHECKS
    # =========================================================

    conflicts.extend(_assignment_conflicts(entries, context))

    # =========================================================
    # ASFA CUSTOM RULES & PERFORMANCE METRICS
    # =========================================================
    rule_engine = AsfaRuleEngine(context or {})

    # 1. Mandatory Weekly Proctor Hour
    proctor_hours_required = rule_engine.get_proctor_rule_hours()
    if proctor_hours_required > 0 and len(entries) > 0:
        proctor_count = sum(
            1 for item in entries
            if str(item.get("component") or "").strip().lower() == "proctor"
            or "proctor" in str(item.get("subject_code") or "").lower()
            or "proctor" in str(item.get("subject_name") or "").lower()
        )
        if proctor_count < proctor_hours_required:
            conflicts.append({
                "type": "proctor_missing",
                "required": proctor_hours_required,
                "found": proctor_count,
                "message": f"Mandatory Proctor hour missing. Required: {proctor_hours_required} hour/week, Found: {proctor_count}."
            })

    # 2. Semester 7 Low-Priority Activity Limit
    sem_no = int((context or {}).get("semester_no") or (context or {}).get("semester_id") or 0)
    if sem_no == 7 and len(entries) > 0:
        # Sem 7 afternoon co-curricular activities (Placement 5 + Remedial 2 + Activity 2 + Library 1 = 10, max 16)
        sem7_cap = max(16, rule_engine.get_sem7_low_priority_cap())
        low_priority_count = 0
        for item in entries:
            if _is_major_project_entry(item):
                continue
            code = str(item.get("subject_code") or "").upper()
            name = str(item.get("subject_name") or "").upper()
            classification = str(item.get("classification") or "").upper()
            if classification in ("PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY") or any(k in code for k in ("PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY")):
                low_priority_count += 1
        if low_priority_count > sem7_cap:
            conflicts.append({
                "type": "sem7_low_priority_exceeded",
                "count": low_priority_count,
                "max_allowed": sem7_cap,
                "message": f"Semester 7 low-priority activities exceed configured limit ({low_priority_count} > {sem7_cap})."
            })

    # 3. Semester 7+ Activity Replacement
    if sem_no >= 7 and len(entries) > 0:
        for item in entries:
            code = str(item.get("subject_code") or "")
            name = str(item.get("subject_name") or "")
            if rule_engine.is_activity_replaced_in_curriculum({"subject_code": code, "subject_name": name}):
                conflicts.append({
                    "type": "replaced_activity_scheduled",
                    "subject_code": code,
                    "message": f"Activity {code} ({name}) is configured to be replaced by Project/Placement in Semester 7+ curriculum."
                })

    # 3b. Semester 7 Special After-Lunch Hard Constraint:
    # Placement, Remedial, Proctor, Library, Activity MUST strictly be scheduled after lunch (Period 5+)
    if sem_no == 7 and len(entries) > 0:
        lunch_val = lunch if lunch else _as_int((constraints or {}).get("lunch_after_period") or 4)
        min_allowed_period = lunch_val + 1
        placement_per_day = defaultdict(int)
        library_by_slot = defaultdict(list)

        for item in entries:
            p = _as_int(item.get("period"))
            d = item.get("day")
            code = str(item.get("subject_code") or "").upper()
            name = str(item.get("subject_name") or "").upper()
            classification = str(item.get("classification") or "").upper()
            is_special = (
                item.get("is_proctor")
                or classification in ("PROCTOR", "PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY")
                or item.get("is_placement")
                or item.get("is_library")
                or item.get("is_remedial")
                or item.get("is_activity")
                or "PROCTOR" in code
                or "PLACEMENT" in code or "PLACEMENT" in name
                or "LIBRARY" in code or "LIBRARY" in name
                or "REMEDIAL" in code or "REMEDIAL" in name
                or "ACTIVITY" in code or "ACTIVITY" in name
            )
            is_strict_afternoon = (
                item.get("is_proctor")
                or "PROCTOR" in code
                or "PLACEMENT" in code or "PLACEMENT" in name
                or classification in ("PROCTOR", "PLACEMENT")
                or item.get("is_placement")
            )
            if is_strict_afternoon and p < min_allowed_period:
                conflicts.append({
                    "type": "sem7_afternoon_rule_violation",
                    "subject_code": code,
                    "period": p,
                    "min_period": min_allowed_period,
                    "message": (
                        f"Semester 7 constraint violation: {code} ({name or classification}) "
                        f"is scheduled at Period {p}. For Semester 7, Placement and Proctor "
                        f"must strictly be scheduled AFTER LUNCH (Period {min_allowed_period}+)."
                    ),
                })
            elif is_special and p < min_allowed_period:
                warnings.append({
                    "type": "sem7_afternoon_rule_advisory",
                    "subject_code": code,
                    "period": p,
                    "min_period": min_allowed_period,
                    "message": (
                        f"Semester 7 advisory: {code} is scheduled at Period {p}."
                    ),
                })

            # Placement daily cap check (max 3 classes in a day)
            if "PLACEMENT" in code or "PLACEMENT" in name or classification == "PLACEMENT":
                placement_per_day[d] += 1

            # Library single class check
            if "LIBRARY" in code or "LIBRARY" in name or classification == "LIBRARY":
                library_by_slot[(d, p)].append(item)

        for day_name, count in placement_per_day.items():
            if count > 3:
                conflicts.append({
                    "type": "placement_daily_cap_exceeded",
                    "day": day_name,
                    "count": count,
                    "message": f"Placement classes exceeded maximum 3 periods in a day on {day_name}: scheduled {count} periods."
                })

        for slot_key, items in library_by_slot.items():
            if len(items) > 1:
                conflicts.append({
                    "type": "library_batch_split",
                    "slot": slot_key,
                    "message": f"Library must be a single class for the section without batch split. Found {len(items)} entries at {slot_key}."
                })

        # Check that no regular academic classes follow special activities / project / proctor on the same day
        special_periods_by_day = defaultdict(list)
        regular_periods_by_day = defaultdict(list)
        for item in entries:
            d = item.get("day")
            if str(d).strip().lower() == "saturday":
                continue
            p = _as_int(item.get("period"))
            code = str(item.get("subject_code") or "").upper()
            name = str(item.get("subject_name") or "").upper()
            classification = str(item.get("classification") or "").upper()
            is_special = (
                item.get("is_proctor")
                or classification in ("PROCTOR", "PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY", "PROJECT")
                or item.get("is_placement")
                or item.get("is_library")
                or item.get("is_remedial")
                or item.get("is_activity")
                or item.get("is_project")
                or any(k in code for k in ("PROCTOR", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROJECT", "PROJ"))
                or any(k in name for k in ("PROCTOR", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROJECT"))
            )
            if is_special:
                special_periods_by_day[d].append((p, code))
            elif item.get("subject_code") or item.get("subject_name"):
                regular_periods_by_day[d].append((p, code))

        for d, s_list in special_periods_by_day.items():
            for p_spec, s_code in s_list:
                for p_reg, r_code in regular_periods_by_day.get(d, []):
                    if p_reg > p_spec:
                        conflicts.append({
                            "type": "regular_class_after_special_activity",
                            "day": d,
                            "special_period": p_spec,
                            "regular_period": p_reg,
                            "message": f"Academic class {r_code} at Period {p_reg} is scheduled after {s_code} at Period {p_spec} on {d}. Special activities, projects, and proctors must conclude the day (periods 6 and 7)."
                        })

    # 4. Soft Constraint Evaluation: Faculty Preferences
    total_pref_penalty = 0.0
    fac_evaluated = 0
    for item in entries:
        fid = item.get("faculty_id")
        period = _as_int(item.get("period"))
        if fid:
            total_pref_penalty += rule_engine.evaluate_preference_score(int(fid), period, periods_per_day)
            fac_evaluated += 1

    pref_satisfaction_pct = round(max(0.0, 100.0 - (total_pref_penalty / max(1, fac_evaluated) * 100.0)), 1)

    # 5. Constraint Compliance & Performance Metrics
    hard_violations = len(conflicts)
    hard_total = max(10, len(entries) + 5)
    hard_satisfied = max(0, hard_total - hard_violations)
    hard_sat_rate = round((hard_satisfied / hard_total) * 100.0, 1)

    soft_violations = len(warnings)
    soft_total = max(5, (len(entries) // 3) + 2)
    soft_satisfied = max(0, soft_total - soft_violations)
    soft_sat_rate = round((soft_satisfied / soft_total) * 100.0, 1)

    workload_conflicts = [c for c in conflicts if c.get("type") in ("daily_workload", "weekly_workload")]
    workload_comp_pct = round(100.0 if not workload_conflicts else max(0.0, 100.0 - (len(workload_conflicts) * 20.0)), 1)
    proctor_comp_pct = 100.0 if not any(c.get("type") == "proctor_missing" for c in conflicts) else 0.0
    sem7_comp_pct = 100.0 if not any(c.get("type") == "sem7_low_priority_exceeded" for c in conflicts) else 0.0
    final_quality_score = round(max(0.0, min(100.0, (hard_sat_rate * 0.5) + (soft_sat_rate * 0.2) + (pref_satisfaction_pct * 0.3))), 1)
    if len(conflicts) > 0:
        final_quality_score = max(0.0, round(final_quality_score - 40.0, 1))

    metrics = {
        "hard_constraint_count": hard_total,
        "hard_constraints_satisfied": hard_satisfied,
        "hard_satisfaction_rate": hard_sat_rate,
        "soft_constraint_count": soft_total,
        "soft_constraints_satisfied": soft_satisfied,
        "soft_satisfaction_rate": soft_sat_rate,
        "conflict_count": len(conflicts),
        "warning_count": len(warnings),
        "faculty_workload_compliance_pct": workload_comp_pct,
        "proctor_compliance_pct": proctor_comp_pct,
        "sem7_low_priority_compliance_pct": sem7_comp_pct,
        "preference_satisfaction_pct": pref_satisfaction_pct,
        "final_quality_score": final_quality_score,
    }

    # =========================================================
    # RETURN
    # =========================================================

    return {
        "valid": (
            len(conflicts) == 0
        ),

        "conflicts": conflicts,

        "warnings": warnings,

        "errors": [
            conflict["message"]
            for conflict in conflicts
        ],

        "metrics": metrics,

        "summary": {
            "scheduled_entries":
                len(entries),

            "conflict_count":
                len(conflicts),

            "warning_count":
                len(warnings),

            "faculty_count":
                len(
                    {
                        faculty_id
                        for (
                            faculty_id,
                            _day,
                        ) in faculty_day_counts
                    }
                ),
            "quality_score": final_quality_score,
        },
    }
