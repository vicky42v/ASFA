from collections import Counter, defaultdict

from backend.db import rows


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


def _assignment_conflicts(entries, context):
    """Check that each proposed entry exactly matches the saved assignment."""
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
    details = rows(
        f"""
        SELECT subject_id, faculty_id, component, assignment_role
        FROM faculty_subject_assignment_detail
        WHERE academic_year = %s
          AND status = 'Active'
          AND subject_id IN ({placeholders})
        """,
        tuple([context.get("academic_year")] + subject_ids),
    )
    expected = defaultdict(dict)
    for detail in details:
        expected[(int(detail["subject_id"]), detail["component"])][
            detail["assignment_role"]
        ] = _as_int(detail["faculty_id"])

    conflicts = []
    selected_cycle = context.get("cycle")
    for index, entry in enumerate(entries):
        subject_id = _as_int(entry.get("subject_id"))
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

        roles = expected.get((subject_id, component), {})
        main = _as_int(entry.get("faculty_id"))
        co = _as_int(entry.get("co_faculty_id"))
        if not roles.get("Main") and main <= 0:
            conflicts.append({
                "type": "missing_assignment",
                "entry_index": index,
                "message": "Timetable entry has no active Main faculty assignment for its subject component.",
            })
        elif roles.get("Main") and main != roles["Main"]:
            conflicts.append({
                "type": "faculty_mismatch",
                "entry_index": index,
                "message": "Assigned Main faculty does not match the saved subject component assignment.",
            })
        elif component == "Lab":
            expected_co = _as_int(roles.get("Co"))
            if co != expected_co:
                conflicts.append({
                    "type": "invalid_co_faculty_assignment",
                    "entry_index": index,
                    "message": (
                        "Timetable entry does not match the saved "
                        "Lab Co-faculty assignment."
                    ),
                })
        elif component == "Theory" and roles.get("Co"):
            conflicts.append({
                "type": "invalid_theory_assignment",
                "entry_index": index,
                "message": "Theory assignment cannot have Co-faculty.",
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
    # This protects manual save requests, while the generator uses the same
    # persisted occupancy when building its proposal.
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
    11. Every Lab component is exactly one 2-period contiguous block/week.
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

        if components == {"Lab"}:
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
        # SPECIAL SATURDAY ACTIVITIES HAVE NO FACULTY
        # -----------------------------------------------------

        if component == "Special":
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

            if not saturday_rows:
                conflicts.append({
                    "type": "special_activity_not_saturday",
                    "subject_id": subject_id,
                    "message": f"{code} must be scheduled on Saturday.",
                })
                continue

            periods = sorted(_as_int(item.get("period")) for item in saturday_rows)
            expected = list(range(1, periods_per_day + 1)) if periods_per_day > 0 else []
            if expected and periods != expected:
                conflicts.append({
                    "type": "special_activity_not_full_day",
                    "subject_id": subject_id,
                    "message": f"{code} must occupy the full Saturday timetable day.",
                })

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

    for subject_id, lab_rows in lab_entries_by_subject.items():
        subject = subject_rows.get(subject_id) or {}
        practical_hours = _as_int(subject.get("practical_hours"), 0)
        code = subject.get("subject_code") or subject.get("subject_name") or str(subject_id)

        if practical_hours > 0 and len(lab_rows) != practical_hours:
            conflicts.append({
                "type": "lab_frequency_or_duration",
                "subject_id": subject_id,
                "message": (
                    f"Lab subject {code} must have exactly {practical_hours} "
                    f"scheduled practical periods because the database specifies "
                    f"{practical_hours} practical hours/week."
                ),
            })
            continue

        by_day = defaultdict(list)
        for item_index, day, period, item in lab_rows:
            by_day[day].append((item_index, period, item))

        for day, day_rows in by_day.items():
            day_rows.sort(key=lambda value: value[1])
            periods = [period for _idx, period, _item in day_rows]
            # Every lab day must consist of contiguous periods. This permits
            # multiple two-period blocks for subjects such as a 12-period project.
            for previous, current in zip(periods, periods[1:]):
                if current != previous + 1:
                    conflicts.append({
                        "type": "lab_not_contiguous",
                        "subject_id": subject_id,
                        "day": day,
                        "message": f"Lab {code} must use contiguous periods on each lab day.",
                    })
                    break

        for _idx, day, period, _item in lab_rows:
            if periods_per_day and period > periods_per_day:
                conflicts.append({
                    "type": "lab_period_violation",
                    "subject_id": subject_id,
                    "message": "Lab block extends beyond the configured periods per day.",
                })
            if short_break and period == short_break:
                conflicts.append({
                    "type": "lab_crosses_short_break",
                    "subject_id": subject_id,
                    "day": day,
                    "periods": [period, period + 1],
                    "message": "Lab block cannot start at the configured short-break boundary.",
                })
            if lunch and period == lunch:
                conflicts.append({
                    "type": "lab_crosses_lunch",
                    "subject_id": subject_id,
                    "day": day,
                    "periods": [period, period + 1],
                    "message": "Lab block cannot start at the configured lunch boundary.",
                })

    # =========================================================
    # DATABASE-BACKED ASSIGNMENT / CYCLE CHECKS
    # =========================================================

    conflicts.extend(_assignment_conflicts(entries, context))

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
        },
    }
