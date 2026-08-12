from collections import Counter, defaultdict


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

    if value not in ("Theory", "Lab"):
        return "Theory"

    return value


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


def validate_entries(entries, constraints=None):
    """
    Validate a generated or manually edited timetable.

    HARD RULES
    ----------
    1. A semester cannot have two subjects in one slot.
    2. A faculty member cannot teach two classes in one slot.
    3. A faculty member cannot teach different subjects
       in the same semester.
    4. Working-day violations are rejected.
    5. Period violations are rejected.
    6. Faculty daily workload is checked.
    7. Faculty weekly workload is checked.
    8. Co-faculty is allowed only for Labs.
    9. Main and Co faculty cannot be the same person.
    10. A Theory entry must not have a Co faculty.
    11. Lab blocks must not overlap.
    12. Same subject repeated on the same day is a warning.

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

    for (
        semester_id,
        slot,
    ), values in semester_slots.items():

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
                "type": "semester_conflict",
                "semester_id": semester_id,
                "slot": slot,
                "subjects": subject_names,
                "message": (
                    "More than one subject is "
                    "assigned to the same "
                    "semester time slot."
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

            conflicts.append(
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
                        f"{semester_id}. "
                        "A faculty member can "
                        "handle only one subject "
                        "in the same semester."
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