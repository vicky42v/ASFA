from collections import Counter, defaultdict

from ortools.sat.python import cp_model

from backend.db import rows, row
from backend.services.timetable_validator import validate_entries


ODD_ORDER = [7, 5, 3, 1]
EVEN_ORDER = [8, 6, 4, 2]


# ============================================================
# BASIC HELPERS
# ============================================================

def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _truthy(value):
    return value in (
        True,
        1,
        "1",
        "true",
        "True",
        "yes",
        "Yes",
        "Y",
    )


def _generation_seed(context):
    """Return a stable integer seed for regeneration rounds."""
    value = context.get("generation_seed")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 42


def _is_major_project(subject):
    """Identify Major Project / project work without changing DB data."""
    category = str(
        subject.get("course_category") or ""
    ).strip().upper()

    text = " ".join(
        str(subject.get(key) or "")
        for key in (
            "subject_code",
            "subject_name",
            "group_name",
        )
    ).strip().lower()

    return (
        category in {"PROJ", "PROJECT"}
        or "major project" in text
        or text.startswith("project ")
        or "project" in text
    )


def _context_params(context):
    return (
        context["department_id"],
        context["scheme_id"],
        context["academic_year"],
        context["semester_type"],
        context["semester_id"],
    )


def _basic_science(name, code):
    text = f"{name or ''} {code or ''}".strip().lower()

    return (
        ("basic" in text and "science" in text)
        or "science and humanities" in text
        or text in {
            "bs",
            "bsc",
            "basic science",
            "basic sciences",
            "sh",
        }
    )


# ============================================================
# FAILURE HELPERS
# ============================================================

def _failure(message):
    return {
        "success": False,
        "validation": {
            "valid": False,
            "errors": [message],
            "conflicts": [],
        },
        "timetable": [],
        "conflicts": [],
        "warnings": [],
        "summary": {
            "scheduled_sessions": 0,
            "subjects": 0,
            "required_periods": 0,
        },
    }


def _failure_list(messages):
    messages = list(messages or [])

    return {
        "success": False,
        "validation": {
            "valid": False,
            "errors": messages,
            "conflicts": [],
        },
        "timetable": [],
        "conflicts": [],
        "warnings": [],
        "summary": {
            "scheduled_sessions": 0,
            "subjects": 0,
            "required_periods": 0,
        },
    }


# ============================================================
# SEMESTER INFORMATION
# ============================================================

def _get_semester_info(context):
    """
    Get semester number and selected department information.

    This deliberately checks the selected department instead of
    depending on a subject existing first.
    """

    return row(
        """
        SELECT
            sem.semester_id,
            sem.semester_no,
            sem.semester_type,
            d.department_id,
            d.department_name,
            d.department_code
        FROM semester sem
        JOIN department d
            ON d.department_id = %s
        WHERE sem.semester_id = %s
        LIMIT 1
        """,
        (
            context["department_id"],
            context["semester_id"],
        ),
    )


# ============================================================
# CONSTRAINTS
# ============================================================

def _get_constraints(context):
    """
    Get ONLY the constraint belonging to the exact timetable context.

    IMPORTANT:
    There is intentionally NO fallback to another semester,
    department, scheme, or academic year.

    This prevents the generator from accidentally using an old
    or unrelated timetable constraint.
    """

    return row(
        """
        SELECT *
        FROM timetable_constraints
        WHERE department_id = %s
          AND scheme_id = %s
          AND academic_year = %s
          AND semester_type = %s
          AND semester_id = %s
        ORDER BY constraint_id DESC
        LIMIT 1
        """,
        (
            context["department_id"],
            context["scheme_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ),
    )


# ============================================================
# SUBJECTS
# ============================================================

def _get_subjects(context):
    """
    Fetch subjects belonging to the exact timetable context.

    For Semester 1 / 2:
        Only subjects belonging to the selected Basic Science
        department are considered.

    P/C cycle:
        If cycle is supplied, subjects with that cycle are selected.
        Subjects without a cycle are retained because some common
        subjects may be cycle-independent.
    """

    params = [
        context["department_id"],
        context["scheme_id"],
        context["semester_id"],
    ]

    sql = """
        SELECT
            s.*,
            sem.semester_no,
            sem.semester_type,
            d.department_name,
            d.department_code,
            sg.group_name
        FROM subject s

        JOIN semester sem
            ON sem.semester_id = s.semester_id

        JOIN department d
            ON d.department_id = s.department_id

        LEFT JOIN subject_group sg
            ON sg.group_id = s.group_id

        LEFT JOIN entity_status es
            ON es.entity_type = 'subject'
            AND es.entity_id = s.subject_id

        WHERE s.department_id = %s
          AND s.scheme_id = %s
          AND s.semester_id = %s
          AND COALESCE(es.is_active, 1) = 1
    """

    semester_no = _safe_int(
        context.get("semester_no")
    )

    cycle = str(
        context.get("cycle") or ""
    ).strip().upper()

    if semester_no in (1, 2):

        if cycle not in ("P", "C"):
            return []

        sql += """
            AND (
                UPPER(COALESCE(s.cycle, '')) = %s
                OR COALESCE(s.cycle, '') = ''
            )
        """

        params.append(cycle)

    sql += """
        ORDER BY s.subject_code
    """

    return rows(
        sql,
        tuple(params),
    )


# ============================================================
# SUBJECT COMPONENTS
# ============================================================

def _component_names(subject):
    """
    Determine the actual teaching components from the subject record.

    Rules:
      - Theory/tutorial hours create Theory component(s).
      - Any practical_hours > 0 creates a Lab component.
      - IPCC naturally becomes Theory + Lab.
      - A practical component is never converted into theory.
    """

    theory = (
        _safe_int(subject.get("lecture_hours"))
        + _safe_int(subject.get("tutorial_hours"))
    )

    practical = _safe_int(
        subject.get("practical_hours")
    )

    components = []

    if theory > 0:
        components.append("Theory")

    if practical > 0:
        components.append("Lab")

    if not components:
        components.append("Theory")

    return components


# ============================================================
# FACULTY ASSIGNMENTS
# ============================================================

def _get_assignments(context):
    """
    Load ONLY real component-level assignments from MySQL.

    faculty_subject_assignment_detail is the source of truth for
    Theory/Lab + Main/Co.

    No faculty is invented or automatically assigned by the
    generator.
    """

    return rows(
        """
        SELECT
            d.detail_id,
            d.subject_id,
            d.faculty_id,
            d.component,
            d.assignment_role,
            d.academic_year,

            f.faculty_name,
            f.max_workload,
            f.designation,
            f.role,
            f.status AS faculty_status,

            s.semester_id,
            s.department_id,
            s.scheme_id,
            s.subject_code,
            s.subject_name

        FROM faculty_subject_assignment_detail d

        JOIN faculty f
          ON f.faculty_id = d.faculty_id

        JOIN subject s
          ON s.subject_id = d.subject_id

        WHERE d.academic_year = %s
          AND d.status = 'Active'
          AND LOWER(COALESCE(f.status, 'Active')) = 'active'
          AND s.department_id = %s
          AND s.scheme_id = %s
          AND s.semester_id = %s

        ORDER BY
            d.subject_id,
            d.component,
            d.assignment_role,
            d.detail_id
        """,
        (
            context["academic_year"],
            context["department_id"],
            context["scheme_id"],
            context["semester_id"],
        ),
    )


# ============================================================
# OPTIONAL SUBJECT VALIDATION
# ============================================================

def _optional_validation(subjects, assignments):
    """
    Validate PEC/OEC selection using the saved manual faculty assignment.

    An elective is considered selected only when it has an active
    component-level faculty assignment.

    Rules:
      - exactly one elective per PEC/OEC option group
      - zero selected -> generation is rejected
      - more than one selected -> generation is rejected
      - unselected elective subjects do NOT require faculty assignment
    """

    groups = defaultdict(list)
    selected_subject_ids = set()

    for subject in subjects:

        category = str(
            subject.get("course_category") or ""
        ).strip().upper()

        group_id = subject.get("option_group_id")

        is_optional = _truthy(
            subject.get("is_optional")
        )

        is_elective = category in (
            "PEC",
            "OEC",
        )

        if (
            group_id not in (None, "")
            or (
                is_optional
                and is_elective
            )
        ):

            normalized_group = (
                str(group_id)
                if group_id not in (None, "")
                else f"opt_{subject['subject_id']}"
            )

            groups[
                (
                    category or "ELECTIVE",
                    normalized_group,
                )
            ].append(subject)

    # Any active assignment means that subject was selected manually.
    for assignment in assignments:

        try:
            selected_subject_ids.add(
                int(
                    assignment["subject_id"]
                )
            )
        except (
            TypeError,
            ValueError,
            KeyError,
        ):
            continue

    errors = []
    info = []

    for (
        category,
        group_id,
    ), group_subjects in groups.items():

        selected = [
            subject
            for subject in group_subjects
            if int(
                subject["subject_id"]
            ) in selected_subject_ids
        ]

        if len(selected) == 0:

            codes = ", ".join(
                str(
                    subject.get(
                        "subject_code"
                    )
                    or subject["subject_id"]
                )
                for subject in group_subjects
            )

            errors.append(
                f"{category} option group {group_id} "
                f"requires exactly one selected elective. "
                f"Available subjects: {codes}."
            )

        elif len(selected) > 1:

            codes = ", ".join(
                str(
                    subject.get(
                        "subject_code"
                    )
                    or subject["subject_id"]
                )
                for subject in selected
            )

            errors.append(
                f"{category} option group {group_id} "
                f"has multiple selected electives: {codes}. "
                f"Only one elective can be selected."
            )

        info.append(
            {
                "category": category,
                "option_group_id": group_id,
                "selected_subjects": [
                    {
                        "subject_id": int(
                            subject["subject_id"]
                        ),
                        "subject_code": subject.get(
                            "subject_code"
                        ),
                    }
                    for subject in selected
                ],
                "available_subjects": [
                    {
                        "subject_id": int(
                            subject["subject_id"]
                        ),
                        "subject_code": subject.get(
                            "subject_code"
                        ),
                        "subject_name": subject.get(
                            "subject_name"
                        ),
                        "selected": (
                            int(
                                subject["subject_id"]
                            )
                            in selected_subject_ids
                        ),
                    }
                    for subject in group_subjects
                ],
                "required_selection_count": 1,
            }
        )

    return {
        "valid": not errors,
        "errors": errors,
        "groups": info,
    }


# ============================================================
# SELECT OPTIONAL SUBJECTS
# ============================================================

def _selected_subjects(subjects, optional_result):
    """
    Keep all normal subjects and only the manually selected subject
    from each PEC/OEC option group.
    """

    selected_ids = set()

    for group in optional_result.get(
        "groups",
        [],
    ):

        for selected in group.get(
            "selected_subjects",
            [],
        ):

            try:
                selected_ids.add(
                    int(
                        selected["subject_id"]
                    )
                )
            except (
                TypeError,
                ValueError,
                KeyError,
            ):
                continue

    result = []

    for subject in subjects:

        subject_id = int(
            subject["subject_id"]
        )

        category = str(
            subject.get("course_category") or ""
        ).strip().upper()

        group_id = subject.get(
            "option_group_id"
        )

        is_optional = _truthy(
            subject.get("is_optional")
        )

        is_elective = category in (
            "PEC",
            "OEC",
        )

        is_choice_subject = (
            group_id not in (None, "")
            or (
                is_optional
                and is_elective
            )
        )

        if not is_choice_subject:

            result.append(subject)

            continue

        if subject_id in selected_ids:

            result.append(subject)

    return result


# ============================================================
# ASSIGNMENT MAP
# ============================================================

def _assignment_map(assignments):
    """
    Structure:

    {
        subject_id: {
            "Theory": {
                "Main": assignment
            },
            "Lab": {
                "Main": assignment,
                "Co": assignment
            }
        }
    }
    """

    result = defaultdict(
        lambda: defaultdict(dict)
    )

    for assignment in assignments:

        component = str(
            assignment.get("component") or ""
        ).strip()

        role = str(
            assignment.get("assignment_role") or ""
        ).strip()

        if component not in (
            "Theory",
            "Lab",
        ):
            continue

        if role not in (
            "Main",
            "Co",
        ):
            continue

        result[
            int(
                assignment["subject_id"]
            )
        ][component][role] = assignment

    return result


def _is_special_activity(subject):
    """
    Identify curriculum activities that must occupy Saturday.
    """

    text = " ".join(
        str(
            subject.get(key) or ""
        )
        for key in (
            "subject_code",
            "subject_name",
            "course_category",
            "group_name",
        )
    ).strip().lower()

    return any(
        token in text
        for token in (
            "sports",
            "yoga",
            "nss",
            "ncc",
        )
    )


# ============================================================
# ASSIGNMENT VALIDATION
# ============================================================

def _assignment_validation(subjects, amap):
    """
    Every required component must have a real Main faculty assignment.

    Lab Co-faculty is optional.

    Theory Co-faculty is invalid.
    """

    errors = []

    for subject in subjects:

        sid = int(
            subject["subject_id"]
        )

        if _is_special_activity(
            subject
        ):
            continue

        for component in _component_names(
            subject
        ):

            roles = (
                amap
                .get(sid, {})
                .get(component, {})
            )

            main = roles.get("Main")
            co = roles.get("Co")

            if not main:

                errors.append(
                    f"{subject['subject_code']} - "
                    f"{subject['subject_name']} is missing "
                    f"a Main faculty assignment for "
                    f"{component}."
                )

                continue

            main_id = int(
                main["faculty_id"]
            )

            if co:

                if component != "Lab":

                    errors.append(
                        f"Co-faculty is not allowed for Theory: "
                        f"{subject['subject_code']}."
                    )

                elif int(
                    co["faculty_id"]
                ) == main_id:

                    errors.append(
                        f"{subject['subject_code']} cannot use "
                        f"the same faculty member as Main "
                        f"and Co-faculty."
                    )

    return {
        "valid": not errors,
        "errors": errors,
    }


# ============================================================
# CREATE TIMETABLE TASKS
# ============================================================

def _make_tasks(
    subjects,
    amap,
    days=None,
    periods_per_day=7,
):
    """
    Create solver tasks from the actual database L-T-P workload.
    """

    tasks = []

    days = list(
        days or []
    )

    saturday = next(
        (
            d
            for d in days
            if str(d).strip().lower()
            == "saturday"
        ),
        None,
    )

    for subject in subjects:

        sid = int(
            subject["subject_id"]
        )

        lecture = _safe_int(
            subject.get(
                "lecture_hours"
            )
        )

        tutorial = _safe_int(
            subject.get(
                "tutorial_hours"
            )
        )

        practical = _safe_int(
            subject.get(
                "practical_hours"
            )
        )

        if _is_special_activity(
            subject
        ):

            if (
                saturday
                and periods_per_day > 0
            ):

                tasks.append(
                    {
                        "subject": subject,
                        "component": "Special",
                        "ordinal": 0,
                        "block_size": periods_per_day,
                        "faculty_ids": [],
                        "is_lab": False,
                        "is_special": True,
                        "is_project": False,
                        "fixed_day": saturday,
                        "fixed_start": 1,
                    }
                )

            continue

        components = _component_names(
            subject
        )

        # ----------------------------------------------------
        # THEORY
        # ----------------------------------------------------

        if "Theory" in components:

            theory_hours = (
                lecture + tutorial
            )

            theory_main = (
                amap
                .get(sid, {})
                .get("Theory", {})
                .get("Main")
            )

            if (
                theory_hours > 0
                and theory_main
            ):

                for ordinal in range(
                    theory_hours
                ):

                    tasks.append(
                        {
                            "subject": subject,
                            "component": "Theory",
                            "ordinal": ordinal,
                            "block_size": 1,
                            "faculty_ids": [
                                int(
                                    theory_main[
                                        "faculty_id"
                                    ]
                                )
                            ],
                            "is_lab": False,
                            "is_project": _is_major_project(
                                subject
                            ),
                        }
                    )

        # ----------------------------------------------------
        # LAB
        # ----------------------------------------------------

        if (
            "Lab" in components
            and practical > 0
        ):

            lab_roles = (
                amap
                .get(sid, {})
                .get("Lab", {})
            )

            lab_main = lab_roles.get(
                "Main"
            )

            if lab_main:

                faculty_ids = [
                    int(
                        lab_main[
                            "faculty_id"
                        ]
                    )
                ]

                lab_co = lab_roles.get(
                    "Co"
                )

                if (
                    lab_co
                    and int(
                        lab_co[
                            "faculty_id"
                        ]
                    )
                    != faculty_ids[0]
                ):

                    faculty_ids.append(
                        int(
                            lab_co[
                                "faculty_id"
                            ]
                        )
                    )

                remaining = practical
                ordinal = 0

                while remaining > 0:

                    block_size = (
                        2
                        if remaining >= 2
                        else 1
                    )

                    tasks.append(
                        {
                            "subject": subject,
                            "component": "Lab",
                            "ordinal": ordinal,
                            "block_size": block_size,
                            "faculty_ids": faculty_ids,
                            "is_lab": True,
                            "is_project": _is_major_project(
                                subject
                            ),
                        }
                    )

                    remaining -= block_size
                    ordinal += 1

    # --------------------------------------------------------
    # HARDER TASKS FIRST
    # --------------------------------------------------------

    tasks.sort(
        key=lambda task: (
            0
            if task.get("is_special")
            else (
                1
                if task.get("is_lab")
                else 2
            ),
            -int(
                task.get(
                    "block_size",
                    1,
                )
            ),
            str(
                task["subject"].get(
                    "subject_code"
                )
                or ""
            ),
            int(
                task.get(
                    "ordinal",
                    0,
                )
            ),
        )
    )

    return tasks


# ============================================================
# WORKING DAYS
# ============================================================

def _days(constraint):
    raw = constraint.get(
        "working_days"
    )

    if isinstance(
        raw,
        (
            list,
            tuple,
            set,
        ),
    ):

        return [
            str(item).strip()
            for item in raw
            if str(item).strip()
        ]

    return [
        item.strip()
        for item in str(
            raw or ""
        ).split(",")
        if item.strip()
    ]


# ============================================================
# POSSIBLE START PERIODS
# ============================================================

def _start_periods(
    constraint,
    block_size,
):
    periods = _safe_int(
        constraint.get(
            "periods_per_day"
        ),
        7,
    )

    if block_size <= 1:

        return range(
            1,
            periods + 1,
        )

    short_break = _safe_int(
        constraint.get(
            "short_break_after_period"
        ),
        0,
    )

    lunch = _safe_int(
        constraint.get(
            "lunch_after_period"
        ),
        0,
    )

    valid_starts = []

    for start in range(
        1,
        periods - block_size + 2,
    ):

        end = (
            start
            + block_size
            - 1
        )

        crosses_short_break = (
            short_break > 0
            and start <= short_break
            and end > short_break
        )

        crosses_lunch = (
            lunch > 0
            and start <= lunch
            and end > lunch
        )

        if (
            not crosses_short_break
            and not crosses_lunch
        ):

            valid_starts.append(
                start
            )

    return valid_starts


# ============================================================
# EXISTING FACULTY OCCUPANCY
# ============================================================

def _existing_occupied(context):
    """
    Prevent faculty from being scheduled at the same time
    in another timetable belonging to the same academic year.

    Includes:
        - timetable.faculty_id
        - timetable.co_faculty_id
        - legacy timetable_faculty rows if that table exists
    """

    occupied = set()

    # --------------------------------------------------------
    # MAIN + CO FROM timetable
    # --------------------------------------------------------

    try:

        existing = rows(
            """
            SELECT
                day,
                period,
                faculty_id,
                co_faculty_id
            FROM timetable
            WHERE academic_year = %s
              AND semester_type = %s
              AND NOT (
                  department_id = %s
                  AND scheme_id = %s
                  AND semester_id = %s
                  AND COALESCE(cycle, '') = %s
              )
            """,
            (
                context["academic_year"],
                context["semester_type"],
                context["department_id"],
                context["scheme_id"],
                context["semester_id"],
                str(
                    context.get("cycle")
                    or ""
                ),
            ),
        )

        for item in existing:

            day = item["day"]

            period = _safe_int(
                item["period"]
            )

            if item.get(
                "faculty_id"
            ) is not None:

                occupied.add(
                    (
                        int(
                            item[
                                "faculty_id"
                            ]
                        ),
                        day,
                        period,
                    )
                )

            if item.get(
                "co_faculty_id"
            ) is not None:

                occupied.add(
                    (
                        int(
                            item[
                                "co_faculty_id"
                            ]
                        ),
                        day,
                        period,
                    )
                )

    except Exception:
        pass

    # --------------------------------------------------------
    # LEGACY timetable_faculty TABLE
    # --------------------------------------------------------

    try:

        co_rows = rows(
            """
            SELECT
                tf.faculty_id,
                t.day,
                t.period
            FROM timetable_faculty tf
            JOIN timetable t
                ON t.timetable_id =
                   tf.timetable_id
            WHERE t.academic_year = %s
              AND t.semester_type = %s
              AND NOT (
                  t.department_id = %s
                  AND t.scheme_id = %s
                  AND t.semester_id = %s
                  AND COALESCE(t.cycle, '') = %s
              )
            """,
            (
                context["academic_year"],
                context["semester_type"],
                context["department_id"],
                context["scheme_id"],
                context["semester_id"],
                str(
                    context.get("cycle")
                    or ""
                ),
            ),
        )

        for item in co_rows:

            occupied.add(
                (
                    int(
                        item[
                            "faculty_id"
                        ]
                    ),
                    item["day"],
                    _safe_int(
                        item["period"]
                    ),
                )
            )

    except Exception:
        pass

    return occupied


# ============================================================
# FACULTY WORKLOAD LIMITS
# ============================================================

def _faculty_limits(
    assignments,
    global_weekly,
):
    """
    Faculty-specific max_workload takes priority.
    """

    limits = {}

    for assignment in assignments:

        faculty_id = int(
            assignment["faculty_id"]
        )

        max_workload = _safe_int(
            assignment.get(
                "max_workload"
            ),
            0,
        )

        if faculty_id not in limits:

            designation = str(
                assignment.get(
                    "designation"
                )
                or ""
            ).lower()

            role = str(
                assignment.get(
                    "role"
                )
                or ""
            ).lower()

            if max_workload <= 0:

                if (
                    role == "hod"
                    or "hod" in designation
                    or "head of department"
                    in designation
                ):

                    max_workload = 12

                elif (
                    "assistant professor"
                    in designation
                ):

                    max_workload = 18

                elif (
                    "associate professor"
                    in designation
                    or designation.startswith(
                        "professor"
                    )
                ):

                    max_workload = 16

                else:

                    max_workload = global_weekly

            limits[faculty_id] = min(
                max_workload,
                global_weekly,
            )

    return limits


def _global_assignment_workload_errors(
    academic_year,
):
    """
    Validate actual global assignment workload before CP-SAT.
    """

    totals = rows(
        """
        SELECT
            d.faculty_id,
            f.faculty_name,
            f.designation,
            f.role,
            f.max_workload,

            COALESCE(
                SUM(
                    CASE
                        WHEN d.component = 'Lab'
                        THEN COALESCE(
                            s.practical_hours,
                            0
                        )
                        ELSE COALESCE(
                            s.lecture_hours,
                            0
                        )
                        +
                        COALESCE(
                            s.tutorial_hours,
                            0
                        )
                    END
                ),
                0
            ) AS workload

        FROM faculty_subject_assignment_detail d

        JOIN faculty f
          ON f.faculty_id = d.faculty_id

        JOIN subject s
          ON s.subject_id = d.subject_id

        WHERE d.academic_year = %s
          AND d.status = 'Active'

        GROUP BY
            d.faculty_id,
            f.faculty_name,
            f.designation,
            f.role,
            f.max_workload
        """,
        (
            academic_year,
        ),
    )

    errors = []

    for faculty in totals:

        maximum = _safe_int(
            faculty.get(
                "max_workload"
            ),
            0,
        )

        designation = str(
            faculty.get(
                "designation"
            )
            or ""
        ).lower()

        role = str(
            faculty.get(
                "role"
            )
            or ""
        ).lower()

        if maximum <= 0:

            if (
                role == "hod"
                or "hod" in designation
                or "head of department"
                in designation
            ):

                maximum = 12

            elif (
                "assistant professor"
                in designation
            ):

                maximum = 18

            elif (
                "associate professor"
                in designation
                or designation.startswith(
                    "professor"
                )
            ):

                maximum = 16

            else:

                maximum = 18

        workload = float(
            faculty.get(
                "workload"
            )
            or 0
        )

        if workload > maximum:

            errors.append(
                f"{faculty.get('faculty_name') or 'Faculty'} "
                f"has {workload:g}h global workload, "
                f"exceeding the maximum {maximum:g}h."
            )

    return errors


# ============================================================
# GENERATE TIMETABLE
# ============================================================

def generate(context):

    context = dict(
        context or {}
    )

    # --------------------------------------------------------
    # SEMESTER INFORMATION
    # --------------------------------------------------------

    semester = _get_semester_info(
        context
    )

    if not semester:

        return _failure(
            "The selected semester or department "
            "could not be found."
        )

    context["semester_no"] = (
        semester.get(
            "semester_no"
        )
    )

    db_semester_type = str(
        semester.get(
            "semester_type"
        )
        or ""
    ).strip().lower()

    requested_semester_type = str(
        context.get(
            "semester_type"
        )
        or ""
    ).strip().lower()

    if (
        requested_semester_type
        and db_semester_type
        and requested_semester_type
        != db_semester_type
    ):

        return _failure(
            "The selected semester type does not "
            "match the semester stored in the database."
        )

    semester_no = _safe_int(
        context.get(
            "semester_no"
        )
    )

    # --------------------------------------------------------
    # FIRST / SECOND SEMESTER RULES
    # --------------------------------------------------------

    if semester_no in (
        1,
        2,
    ):

        if not _basic_science(
            semester.get(
                "department_name"
            ),
            semester.get(
                "department_code"
            ),
        ):

            return _failure(
                "1st and 2nd semester subjects "
                "can only be assigned and generated "
                "under the Basic Science department."
            )

        cycle = str(
            context.get(
                "cycle"
            )
            or ""
        ).strip().upper()

        if cycle not in (
            "P",
            "C",
        ):

            return _failure(
                "Select P Cycle or C Cycle before "
                "generating the 1st/2nd semester timetable."
            )

        context["cycle"] = cycle

    # --------------------------------------------------------
    # EXACT CONSTRAINT
    # --------------------------------------------------------

    constraint = _get_constraints(
        context
    )

    if not constraint:

        return _failure(
            "No timetable constraints are configured "
            "for the EXACT selected department, scheme, "
            "academic year, semester type and semester. "
            "Configure timetable_constraints before generating."
        )

    # --------------------------------------------------------
    # SUBJECTS
    # --------------------------------------------------------

    subjects = _get_subjects(
        context
    )

    if not subjects:

        if semester_no in (
            1,
            2,
        ):

            return _failure(
                f"No subjects are available for "
                f"Semester {semester_no} "
                f"{context.get('cycle', '')} Cycle "
                f"under the selected Basic Science department."
            )

        return _failure(
            "No subjects are available for the "
            "selected department, scheme and semester."
        )

    # --------------------------------------------------------
    # FACULTY ASSIGNMENTS
    # --------------------------------------------------------

    assignments = _get_assignments(
        context
    )

    # --------------------------------------------------------
    # OPTIONAL SUBJECTS
    # --------------------------------------------------------

    optional = _optional_validation(
        subjects,
        assignments,
    )

    if not optional["valid"]:

        return {
            "success": False,
            "validation": {
                "valid": False,
                "errors": optional[
                    "errors"
                ],
                "optional_groups": optional[
                    "groups"
                ],
            },
            "timetable": [],
            "conflicts": [],
            "warnings": [],
            "summary": {
                "scheduled_sessions": 0,
                "subjects": 0,
                "required_periods": 0,
            },
        }

    subjects = _selected_subjects(
        subjects,
        optional,
    )

    # --------------------------------------------------------
    # ASSIGNMENT MAP
    # --------------------------------------------------------

    amap = _assignment_map(
        assignments
    )

    # --------------------------------------------------------
    # ASSIGNMENT VALIDATION
    # --------------------------------------------------------

    assignment_check = _assignment_validation(
        subjects,
        amap,
    )

    if not assignment_check[
        "valid"
    ]:

        return _failure_list(
            assignment_check[
                "errors"
            ]
        )

    # --------------------------------------------------------
    # GLOBAL FACULTY WORKLOAD
    # --------------------------------------------------------

    global_workload_errors = (
        _global_assignment_workload_errors(
            context[
                "academic_year"
            ]
        )
    )

    if global_workload_errors:

        return _failure_list(
            global_workload_errors
        )

    # --------------------------------------------------------
    # WORKING DAYS / PERIODS
    # --------------------------------------------------------

    days = _days(
        constraint
    )

    periods = _safe_int(
        constraint.get(
            "periods_per_day"
        ),
        7,
    )

    if (
        not days
        or periods <= 0
    ):

        return _failure(
            "Working days and periods per day "
            "must be configured."
        )

    # --------------------------------------------------------
    # CREATE TASKS
    # --------------------------------------------------------

    tasks = _make_tasks(
        subjects,
        amap,
        days=days,
        periods_per_day=periods,
    )

    if not tasks:

        return _failure(
            "No timetable tasks could be created from "
            "the selected subject assignments."
        )

    available = (
        len(days)
        * periods
    )

    required = sum(
        int(
            task[
                "block_size"
            ]
        )
        for task in tasks
    )

    if required > available:

        return _failure(
            f"Timetable requires {required} "
            f"teaching periods but only "
            f"{available} timetable slots are available."
        )

    # --------------------------------------------------------
    # EXISTING FACULTY OCCUPANCY
    # --------------------------------------------------------

    occupied = _existing_occupied(
        context
    )

    # --------------------------------------------------------
    # WORKLOAD LIMITS
    # --------------------------------------------------------

    global_daily = _safe_int(
        constraint.get(
            "max_periods_per_day"
        ),
        999,
    )

    global_weekly = _safe_int(
        constraint.get(
            "max_periods_per_week"
        ),
        999,
    )

    faculty_limits = _faculty_limits(
        assignments,
        global_weekly,
    )

    # --------------------------------------------------------
    # CP-SAT MODEL
    # --------------------------------------------------------

    model = cp_model.CpModel()

    choices = defaultdict(list)

    faculty_slot = defaultdict(list)
    class_slot = defaultdict(list)
    lab_slot = defaultdict(list)
    subject_day = defaultdict(list)

    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)

    project_day_choices = defaultdict(
        lambda: defaultdict(list)
    )

    # --------------------------------------------------------
    # CREATE CHOICES
    # --------------------------------------------------------

    for index, task in enumerate(
        tasks
    ):

        subject = task[
            "subject"
        ]

        block = int(
            task[
                "block_size"
            ]
        )

        candidate_days = (
            [
                task.get(
                    "fixed_day"
                )
            ]
            if task.get(
                "fixed_day"
            )
            else days
        )

        for day in candidate_days:

            candidate_starts = (
                [
                    int(
                        task.get(
                            "fixed_start",
                            1,
                        )
                    )
                ]
                if task.get(
                    "fixed_start"
                ) is not None
                else _start_periods(
                    constraint,
                    block,
                )
            )

            for start in candidate_starts:

                cells = [
                    (
                        day,
                        start + offset,
                    )
                    for offset in range(
                        block
                    )
                ]

                # ------------------------------------------------
                # EXISTING FACULTY OCCUPANCY
                # ------------------------------------------------

                already_occupied = any(
                    (
                        faculty_id,
                        cell_day,
                        cell_period,
                    )
                    in occupied

                    for faculty_id in task[
                        "faculty_ids"
                    ]

                    for (
                        cell_day,
                        cell_period,
                    ) in cells
                )

                if already_occupied:
                    continue

                var = model.NewBoolVar(
                    f"task_{index}_{day}_{start}"
                )

                choices[
                    index
                ].append(
                    (
                        var,
                        task,
                        day,
                        start,
                    )
                )

                # ------------------------------------------------
                # FACULTY SLOT
                # ------------------------------------------------

                for faculty_id in task[
                    "faculty_ids"
                ]:

                    for (
                        cell_day,
                        cell_period,
                    ) in cells:

                        faculty_slot[
                            (
                                faculty_id,
                                cell_day,
                                cell_period,
                            )
                        ].append(var)

                    faculty_day[
                        (
                            faculty_id,
                            day,
                        )
                    ].append(
                        (
                            var,
                            block,
                        )
                    )

                    faculty_week[
                        faculty_id
                    ].append(
                        (
                            var,
                            block,
                        )
                    )

                # ------------------------------------------------
                # CLASS / STUDENT SLOT
                # ------------------------------------------------

                for (
                    cell_day,
                    cell_period,
                ) in cells:

                    class_slot[
                        (
                            cell_day,
                            cell_period,
                        )
                    ].append(var)

                    if task.get(
                        "is_lab"
                    ):

                        lab_slot[
                            (
                                cell_day,
                                cell_period,
                            )
                        ].append(var)

                # ------------------------------------------------
                # MAJOR PROJECT
                # ------------------------------------------------

                if task.get(
                    "is_project"
                ):

                    project_day_choices[
                        int(
                            subject[
                                "subject_id"
                            ]
                        )
                    ][
                        day
                    ].append(var)

                # ------------------------------------------------
                # SAME SUBJECT SAME DAY
                # ------------------------------------------------

                subject_day[
                    (
                        int(
                            subject[
                                "subject_id"
                            ]
                        ),
                        day,
                    )
                ].append(var)

        # --------------------------------------------------------
        # EVERY TASK MUST BE SCHEDULED
        # --------------------------------------------------------

        if not choices[
            index
        ]:

            return _failure(
                f"No free timetable block is available "
                f"for {subject['subject_code']} - "
                f"{subject['subject_name']} "
                f"({task['component']})."
            )

        model.AddExactlyOne(
            [
                item[0]
                for item in choices[
                    index
                ]
            ]
        )

    # ============================================================
    # HARD CONSTRAINTS
    # ============================================================

    # ------------------------------------------------------------
    # FACULTY CANNOT TEACH TWO THINGS IN SAME SLOT
    # ------------------------------------------------------------

    for variables in faculty_slot.values():

        model.AddAtMostOne(
            variables
        )

    # ------------------------------------------------------------
    # STUDENT CLASS CONFLICT
    # ------------------------------------------------------------

    for slot, variables in class_slot.items():

        theory_vars = []
        lab_vars = []

        for var in variables:

            for choices_ in choices.values():

                found = False

                for (
                    candidate_var,
                    candidate_task,
                    _d,
                    _s,
                ) in choices_:

                    if (
                        candidate_var.Index()
                        == var.Index()
                    ):

                        if candidate_task.get(
                            "is_lab"
                        ):

                            lab_vars.append(
                                var
                            )

                        else:

                            theory_vars.append(
                                var
                            )

                        found = True
                        break

                if found:
                    break

        # Any theory class blocks every other class in the slot.
        if theory_vars:

            model.AddAtMostOne(
                variables
            )

    # ------------------------------------------------------------
    # SAME SUBJECT ONLY ONCE PER DAY
    # ------------------------------------------------------------

    for (
        subject_id,
        day,
    ), variables in subject_day.items():

        subject_row = next(
            (
                s
                for s in subjects
                if int(
                    s.get(
                        "subject_id"
                    )
                )
                == int(
                    subject_id
                )
            ),
            {},
        )

        if (
            str(
                subject_row.get(
                    "course_category"
                )
                or ""
            ).strip().upper()
            == "PROJ"
        ):

            continue

        model.AddAtMostOne(
            variables
        )

    # ============================================================
    # FACULTY DAILY WORKLOAD
    # ============================================================

    for (
        faculty_id,
        _day,
    ), variables in faculty_day.items():

        model.Add(
            sum(
                var * weight
                for var, weight in variables
            )
            <= global_daily
        )

    # ============================================================
    # FACULTY WEEKLY WORKLOAD
    # ============================================================

    for faculty_id, variables in faculty_week.items():

        limit = faculty_limits.get(
            faculty_id,
            global_weekly,
        )

        model.Add(
            sum(
                var * weight
                for var, weight in variables
            )
            <= limit
        )

    # ============================================================
    # MAJOR PROJECT: MAX TWO DAYS / WEEK
    # ============================================================

    for (
        subject_id,
        day_map,
    ) in project_day_choices.items():

        day_used = []

        for day, variables in day_map.items():

            used = model.NewBoolVar(
                f"project_{subject_id}_{day}_used"
            )

            for variable in variables:

                model.Add(
                    variable <= used
                )

            day_used.append(
                used
            )

        if day_used:

            model.Add(
                sum(day_used)
                <= 2
            )

    # ============================================================
    # OBJECTIVE
    # ============================================================

    import random

    seed = _generation_seed(
        context
    )

    rng = random.Random(
        seed
    )

    objective_terms = []

    for choices_ in choices.values():

        for (
            var,
            _task,
            day,
            start,
        ) in choices_:

            day_weight = (
                days.index(day)
                if day in days
                else 0
            )

            objective_terms.append(
                var
                * (
                    start * 100
                    + day_weight * 7
                    + rng.randint(
                        0,
                        31,
                    )
                )
            )

    model.Minimize(
        sum(
            objective_terms
        )
    )

    # ============================================================
    # SOLVER / ALTERNATIVES
    # ============================================================

    number_of_outputs = _safe_int(
        context.get(
            "number_of_outputs"
        )
        or context.get(
            "number_of_alternatives"
        )
        or context.get(
            "alternatives"
        ),
        1,
    )

    number_of_outputs = max(
        1,
        min(
            5,
            number_of_outputs,
        ),
    )

    faculty_names = {}

    for assignment in assignments:

        faculty_names[
            int(
                assignment[
                    "faculty_id"
                ]
            )
        ] = assignment.get(
            "faculty_name"
        )

    alternatives = []

    day_order = {
        day: index
        for index, day
        in enumerate(days)
    }

    for alt_idx in range(
        number_of_outputs
    ):

        solver = cp_model.CpSolver()

        solver.parameters.max_time_in_seconds = 3
        solver.parameters.num_search_workers = 8
        solver.parameters.random_seed = (
            seed
            + alt_idx * 1009
        ) % 2147483647

        status = solver.Solve(
            model
        )

        if status not in (
            cp_model.OPTIMAL,
            cp_model.FEASIBLE,
        ):

            break

        output = []
        solution_vars = []

        for choices_ in choices.values():

            for (
                var,
                task,
                day,
                start,
            ) in choices_:

                if solver.BooleanValue(
                    var
                ):

                    solution_vars.append(
                        var
                    )

                    subject = task[
                        "subject"
                    ]

                    faculty_ids = task[
                        "faculty_ids"
                    ]

                    main = (
                        faculty_ids[0]
                        if faculty_ids
                        else None
                    )

                    co = (
                        faculty_ids[1]
                        if len(
                            faculty_ids
                        ) > 1
                        else None
                    )

                    component = task[
                        "component"
                    ]

                    block_size = int(
                        task[
                            "block_size"
                        ]
                    )

                    for offset in range(
                        block_size
                    ):

                        output.append(
                            {
                                "department_id":
                                    context[
                                        "department_id"
                                    ],

                                "scheme_id":
                                    context[
                                        "scheme_id"
                                    ],

                                "academic_year":
                                    context[
                                        "academic_year"
                                    ],

                                "semester_type":
                                    context[
                                        "semester_type"
                                    ],

                                "semester_id":
                                    context[
                                        "semester_id"
                                    ],

                                "day":
                                    day,

                                "period":
                                    start + offset,

                                "subject_id":
                                    int(
                                        subject[
                                            "subject_id"
                                        ]
                                    ),

                                "subject_code":
                                    subject[
                                        "subject_code"
                                    ],

                                "subject_name":
                                    subject[
                                        "subject_name"
                                    ],

                                "faculty_id":
                                    main,

                                "faculty_name":
                                    faculty_names.get(
                                        main
                                    ),

                                "co_faculty_id":
                                    co,

                                "co_faculty_name":
                                    (
                                        faculty_names.get(
                                            co
                                        )
                                        if co is not None
                                        else None
                                    ),

                                "component":
                                    component,

                                "cycle":
                                    context.get(
                                        "cycle"
                                    ),
                            }
                        )

        output.sort(
            key=lambda item: (
                day_order.get(
                    item["day"],
                    999,
                ),
                int(
                    item["period"]
                ),
                item.get(
                    "subject_code",
                    "",
                ),
                item.get(
                    "component",
                    "",
                ),
            )
        )

        validation = validate_entries(
            output,
            constraint,
            context,
        )

        alt_summary = {
            "scheduled_sessions":
                len(output),

            "subjects":
                len(subjects),

            "required_periods":
                required,

            "working_days":
                len(days),

            "available_slots":
                available,

            "faculty_count":
                len(faculty_limits),

            "cycle":
                context.get(
                    "cycle"
                ),

            "alternative_id":
                alt_idx + 1,
        }

        if validation.get(
            "valid"
        ):

            alternatives.append(
                {
                    "id":
                        len(
                            alternatives
                        ) + 1,

                    "name":
                        f"Option {len(alternatives) + 1}",

                    "timetable":
                        output,

                    "validation":
                        validation,

                    "summary":
                        {
                            **alt_summary,
                            "alternative_id":
                                len(
                                    alternatives
                                ) + 1,
                        },
                }
            )

        # --------------------------------------------------------
        # NO-GOOD CUT
        # --------------------------------------------------------

        if solution_vars:

            model.AddBoolOr(
                [
                    v.Not()
                    for v in solution_vars
                ]
            )

    # ============================================================
    # NO ALTERNATIVES
    # ============================================================

    if not alternatives:

        return _failure(
            "No feasible timetable could be generated "
            "with the current faculty assignments, "
            "workload limits and timetable constraints."
        )

    # ============================================================
    # FIRST ALTERNATIVE
    # ============================================================

    first_alt = alternatives[0]

    return {
        "success":
            first_alt[
                "validation"
            ][
                "valid"
            ],

        "validation":
            first_alt[
                "validation"
            ],

        "timetable":
            first_alt[
                "timetable"
            ],

        "alternatives":
            alternatives,

        "conflicts":
            first_alt[
                "validation"
            ].get(
                "conflicts",
                [],
            ),

        "warnings":
            first_alt[
                "validation"
            ].get(
                "warnings",
                [],
            ),

        "summary":
            first_alt[
                "summary"
            ],
    }