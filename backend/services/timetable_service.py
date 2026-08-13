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
    Get the most specific timetable constraint.

    First:
        department + scheme + academic year + semester type + semester

    Fallback:
        department + academic year + semester type + semester

    Final fallback:
        safe defaults.
    """

    exact = row(
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
        _context_params(context),
    )

    if exact:
        return exact

    fallback = row(
        """
        SELECT *
        FROM timetable_constraints
        WHERE department_id = %s
          AND academic_year = %s
          AND semester_type = %s
          AND semester_id = %s
        ORDER BY constraint_id DESC
        LIMIT 1
        """,
        (
            context["department_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ),
    )

    if fallback:
        return fallback

    return {
        "working_days": (
            "Monday,Tuesday,Wednesday,"
            "Thursday,Friday,Saturday"
        ),
        "periods_per_day": 7,
        "max_periods_per_day": 4,
        "max_periods_per_week": 20,
    }


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
    Determine which teaching components a subject contains.

    IPCC subjects:
        Only subjects with course_category == 'IPCC' receive the special Theory + Lab split.

    Non-IPCC subjects:
        Standard theory courses or lab courses (if lecture_hours == 0 and practical_hours > 0).
    """
    category = str(subject.get("course_category") or "").strip().upper()
    theory = (
        _safe_int(subject.get("lecture_hours"))
        + _safe_int(subject.get("tutorial_hours"))
    )
    practical = _safe_int(subject.get("practical_hours"))

    if category == "IPCC":
        components = []
        if theory > 0:
            components.append("Theory")
        if practical > 0:
            components.append("Lab")
        return components if components else ["Theory"]

    if theory == 0 and practical > 0:
        return ["Lab"]

    return ["Theory"]


# ============================================================
# FACULTY ASSIGNMENTS
# ============================================================

def _get_assignments(context):
    """
    Get Main / Co faculty assignments.

    The newer detailed assignment table is the source of truth.
    """

    return rows(
        """
        SELECT
            a.detail_id,
            a.subject_id,
            a.faculty_id,
            a.component,
            a.assignment_role,
            a.academic_year,

            f.faculty_name,
            f.max_workload,
            f.status AS faculty_status,

            s.semester_id,
            s.department_id,
            s.scheme_id,
            s.subject_code,
            s.subject_name

        FROM faculty_subject_assignment_detail a

        JOIN faculty f
            ON f.faculty_id = a.faculty_id

        JOIN subject s
            ON s.subject_id = a.subject_id

        WHERE a.academic_year = %s
          AND a.status = 'Active'
          AND f.status = 'Active'

          AND s.department_id = %s
          AND s.scheme_id = %s
          AND s.semester_id = %s

        ORDER BY
            a.subject_id,
            a.component,
            a.assignment_role,
            a.detail_id
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
    Elective / Option groups:
        Subjects sharing an option_group_id are alternatives.
        Assignment existence is used to determine which subject is selected.
    """
    groups = defaultdict(list)
    selected = defaultdict(set)

    for subject in subjects:
        category = str(subject.get("course_category") or "").strip().upper()
        group_id = subject.get("option_group_id")

        if group_id not in (None, "") or (_truthy(subject.get("is_optional")) and category in ("PEC", "OEC")):
            key_id = str(group_id) if group_id not in (None, "") else f"opt_{subject['subject_id']}"
            groups[(category or "ELECTIVE", key_id)].append(subject)

    for assignment in assignments:
        selected[int(assignment["subject_id"])].add(assignment["component"])

    errors = []
    info = []

    for key, group_subjects in groups.items():
        chosen = [
            subject
            for subject in group_subjects
            if int(subject["subject_id"]) in selected
        ]

        if not chosen:
            errors.append(
                f"Option group {key[1]} ({key[0]}) "
                "has no selected subject. "
                "Select one subject before generation."
            )

        info.append({
            "category": key[0],
            "option_group_id": key[1],
            "selected_subjects": [
                {
                    "subject_id": subject["subject_id"],
                    "subject_code": subject["subject_code"],
                }
                for subject in chosen
            ],
        })

    return {
        "valid": not errors,
        "errors": errors,
        "groups": info,
    }


# ============================================================
# SELECT OPTIONAL SUBJECTS
# ============================================================

def _selected_subjects(subjects, optional_result):
    selected_by_group = {}

    for group in optional_result.get("groups", []):
        gid = group["option_group_id"]
        if group["selected_subjects"]:
            # Pick the first chosen subject for this option group
            selected_by_group[gid] = int(group["selected_subjects"][0]["subject_id"])

    result = []
    for subject in subjects:
        group_id = str(subject.get("option_group_id") or "")
        category = str(subject.get("course_category") or "").strip().upper()
        is_choice = bool(group_id) or (_truthy(subject.get("is_optional")) and category in ("PEC", "OEC"))

        if not is_choice:
            result.append(subject)
        else:
            chosen_id = selected_by_group.get(group_id)
            if chosen_id is not None:
                if int(subject["subject_id"]) == chosen_id:
                    result.append(subject)
            else:
                # If no choice made yet, keep subject so validation catches missing assignment
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

        if component not in ("Theory", "Lab"):
            continue

        if role not in ("Main", "Co"):
            continue

        result[
            int(assignment["subject_id"])
        ][component][role] = assignment

    return result


# ============================================================
# ASSIGNMENT VALIDATION
# ============================================================

def _assignment_validation(subjects, amap):
    """
    Rules:

    1. Every component requires Main faculty.
    2. Theory cannot have Co faculty.
    3. Lab may have Main + optional Co.
    4. Main and Co cannot be the same person.
    5. A faculty member can handle only ONE SUBJECT
       within the selected semester.
    """

    errors = []

    faculty_subjects = defaultdict(set)

    for subject in subjects:
        sid = int(subject["subject_id"])
        components = _component_names(subject)

        for component in components:
            roles = amap.get(sid, {}).get(component, {})
            main = roles.get("Main")
            co = roles.get("Co")

            # Fallback for Lab component if not explicitly created in FSAD
            if not main and component == "Lab":
                main = amap.get(sid, {}).get("Theory", {}).get("Main")

            if not main:
                errors.append(
                    f"{subject['subject_code']} - "
                    f"{subject['subject_name']} "
                    f"is missing a Main faculty "
                    f"for {component}."
                )
                continue

            main_id = int(main["faculty_id"])
            faculty_subjects[main_id].add(sid)

            if co:
                if component != "Lab":
                    errors.append(
                        f"Co-faculty is not allowed "
                        f"for Theory: "
                        f"{subject['subject_code']}."
                    )
                else:
                    co_id = int(co["faculty_id"])
                    if co_id == main_id:
                        errors.append(
                            f"{subject['subject_code']} "
                            "cannot use the same person "
                            "as Main and Co-faculty."
                        )
                    else:
                        faculty_subjects[co_id].add(sid)

    # --------------------------------------------------------
    # ONE SUBJECT PER FACULTY IN SELECTED SEMESTER
    # --------------------------------------------------------

    for faculty_id, subject_ids in faculty_subjects.items():
        if len(subject_ids) <= 1:
            continue

        placeholders = ",".join(["%s"] * len(subject_ids))
        codes = rows(
            f"""
            SELECT subject_code
            FROM subject
            WHERE subject_id IN ({placeholders})
            ORDER BY subject_code
            """,
            tuple(subject_ids),
        )

        names = ", ".join(item["subject_code"] for item in codes)
        faculty = row(
            """
            SELECT faculty_name
            FROM faculty
            WHERE faculty_id = %s
            """,
            (faculty_id,),
        )

        faculty_name = (
            faculty["faculty_name"]
            if faculty
            else f"Faculty ID {faculty_id}"
        )

        errors.append(
            f"{faculty_name} is assigned to different "
            f"subjects in the same semester ({names}). "
            "One faculty member can handle only one "
            "subject in a semester."
        )

    return {
        "valid": not errors,
        "errors": errors,
    }


# ============================================================
# CREATE TIMETABLE TASKS
# ============================================================

def _make_tasks(subjects, amap):
    """
    Convert subject workload into scheduling tasks.

    Theory:
        Every lecture/tutorial hour becomes one slot.

    Lab:
        Practical hours become ONE consecutive block.
    """

    tasks = []

    for subject in subjects:
        sid = int(subject["subject_id"])
        lecture = _safe_int(subject.get("lecture_hours"))
        tutorial = _safe_int(subject.get("tutorial_hours"))
        practical = _safe_int(subject.get("practical_hours"))

        components = _component_names(subject)

        # ----------------------------------------------------
        # THEORY
        # ----------------------------------------------------
        if "Theory" in components:
            theory_hours = lecture + tutorial
            if theory_hours == 0:
                theory_hours = 3  # safe default

            theory_main = amap.get(sid, {}).get("Theory", {}).get("Main")
            if theory_main:
                for ordinal in range(theory_hours):
                    tasks.append({
                        "subject": subject,
                        "component": "Theory",
                        "ordinal": ordinal,
                        "block_size": 1,
                        "faculty_ids": [int(theory_main["faculty_id"])],
                    })

        # ----------------------------------------------------
        # LAB
        # ----------------------------------------------------
        if "Lab" in components:
            lab_hours = practical if practical > 0 else 2
            lab_roles = amap.get(sid, {}).get("Lab", {})
            lab_main = lab_roles.get("Main") or amap.get(sid, {}).get("Theory", {}).get("Main")

            if lab_main:
                faculty_ids = [int(lab_main["faculty_id"])]
                lab_co = lab_roles.get("Co")
                if lab_co and int(lab_co["faculty_id"]) != int(lab_main["faculty_id"]):
                    faculty_ids.append(int(lab_co["faculty_id"]))

                tasks.append({
                    "subject": subject,
                    "component": "Lab",
                    "ordinal": 0,
                    "block_size": lab_hours,
                    "faculty_ids": faculty_ids,
                })

    return tasks


# ============================================================
# WORKING DAYS
# ============================================================

def _days(constraint):
    raw = constraint.get(
        "working_days"
    )

    if isinstance(raw, (list, tuple, set)):
        return [
            str(item).strip()
            for item in raw
            if str(item).strip()
        ]

    return [
        item.strip()
        for item in str(raw or "").split(",")
        if item.strip()
    ]


# ============================================================
# POSSIBLE START PERIODS
# ============================================================

def _start_periods(constraint, block_size):
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

    last_start = (
        periods - block_size + 1
    )

    if last_start < 1:
        return range(0)

    return range(
        1,
        last_start + 1,
    )


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
              )
            """,
            (
                context["academic_year"],
                context["semester_type"],
                context["department_id"],
                context["scheme_id"],
                context["semester_id"],
            ),
        )

        for item in existing:

            day = item["day"]
            period = _safe_int(
                item["period"]
            )

            if item.get("faculty_id") is not None:

                occupied.add(
                    (
                        int(item["faculty_id"]),
                        day,
                        period,
                    )
                )

            if item.get("co_faculty_id") is not None:

                occupied.add(
                    (
                        int(item["co_faculty_id"]),
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
              )
            """,
            (
                context["academic_year"],
                context["semester_type"],
                context["department_id"],
                context["scheme_id"],
                context["semester_id"],
            ),
        )

        for item in co_rows:

            occupied.add(
                (
                    int(item["faculty_id"]),
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

def _faculty_limits(assignments, global_weekly):
    """
    Faculty-specific max_workload takes priority.

    If max_workload <= 0:
        treat it as not configured and use the global limit.

    Otherwise:
        effective limit = MIN(
            faculty.max_workload,
            global timetable weekly limit
        )
    """

    limits = {}

    for assignment in assignments:

        faculty_id = int(
            assignment["faculty_id"]
        )

        max_workload = _safe_int(
            assignment.get("max_workload"),
            0,
        )

        if faculty_id not in limits:

            if max_workload > 0:

                limits[faculty_id] = min(
                    max_workload,
                    global_weekly,
                )

            else:

                limits[faculty_id] = global_weekly

    return limits


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
        semester.get("semester_no")
    )

    semester_no = _safe_int(
        context.get("semester_no")
    )

    # --------------------------------------------------------
    # FIRST / SECOND SEMESTER RULES
    # --------------------------------------------------------

    if semester_no in (1, 2):

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
            context.get("cycle") or ""
        ).strip().upper()

        if cycle not in ("P", "C"):

            return _failure(
                "Select P Cycle or C Cycle before "
                "generating the 1st/2nd semester timetable."
            )

        context["cycle"] = cycle

    # --------------------------------------------------------
    # CONSTRAINTS
    # --------------------------------------------------------

    constraint = _get_constraints(
        context
    )

    # --------------------------------------------------------
    # SUBJECTS
    # --------------------------------------------------------

    subjects = _get_subjects(
        context
    )

    if not subjects:

        if semester_no in (1, 2):

            return _failure(
                f"No subjects are available for "
                f"Semester {semester_no} "
                f"{context.get('cycle', '')} Cycle "
                f"under the selected Basic Science "
                f"department."
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
                "errors": optional["errors"],
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
    # ASSIGNMENT RULE VALIDATION
    # --------------------------------------------------------

    assignment_check = _assignment_validation(
        subjects,
        amap,
    )

    if not assignment_check["valid"]:

        return _failure_list(
            assignment_check["errors"]
        )

    # --------------------------------------------------------
    # CREATE TASKS
    # --------------------------------------------------------

    tasks = _make_tasks(
        subjects,
        amap,
    )

    if not tasks:

        return _failure(
            "No timetable tasks could be created "
            "from the selected subject assignments."
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

    if not days or periods <= 0:

        return _failure(
            "Working days and periods per day "
            "must be configured."
        )

    available = (
        len(days) * periods
    )

    required = sum(
        int(task["block_size"])
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
    subject_day = defaultdict(list)

    faculty_day = defaultdict(list)
    faculty_week = defaultdict(list)

    # --------------------------------------------------------
    # CREATE CHOICES
    # --------------------------------------------------------

    for index, task in enumerate(tasks):

        subject = task["subject"]
        block = int(
            task["block_size"]
        )

        for day in days:

            for start in _start_periods(
                constraint,
                block,
            ):

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

                choices[index].append(
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
                # CLASS SLOT
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

        if not choices[index]:

            return _failure(
                f"No free timetable block is available "
                f"for {subject['subject_code']} - "
                f"{subject['subject_name']} "
                f"({task['component']})."
            )

        model.AddExactlyOne(
            [
                item[0]
                for item in choices[index]
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
    # SAME SEMESTER CANNOT HAVE TWO SUBJECTS SAME SLOT
    # ------------------------------------------------------------

    for variables in class_slot.values():

        model.AddAtMostOne(
            variables
        )

    # ------------------------------------------------------------
    # SAME SUBJECT ONLY ONCE PER DAY
    # ------------------------------------------------------------

    for variables in subject_day.values():

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
    # OBJECTIVE
    # ============================================================

    # Prefer earlier periods while still allowing CP-SAT
    # to find a valid timetable.

    model.Minimize(
        sum(
            var * start
            for choices_ in choices.values()
            for var, _task, _day, start
            in choices_
        )
    )

    # ============================================================
    # SOLVER & ALTERNATIVE GENERATION
    # ============================================================

    number_of_outputs = _safe_int(
        context.get("number_of_outputs")
        or context.get("number_of_alternatives")
        or context.get("alternatives"),
        1,
    )
    number_of_outputs = max(1, min(5, number_of_outputs))

    faculty_names = {}
    for assignment in assignments:
        faculty_names[int(assignment["faculty_id"])] = assignment.get("faculty_name")

    alternatives = []
    day_order = {day: index for index, day in enumerate(days)}

    for alt_idx in range(number_of_outputs):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 20
        solver.parameters.num_search_workers = 4
        solver.parameters.random_seed = alt_idx * 100 + 42

        status = solver.Solve(model)

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break

        output = []
        solution_vars = []

        for choices_ in choices.values():
            for (var, task, day, start) in choices_:
                if solver.BooleanValue(var):
                    solution_vars.append(var)
                    subject = task["subject"]
                    faculty_ids = task["faculty_ids"]
                    main = faculty_ids[0]
                    co = faculty_ids[1] if len(faculty_ids) > 1 else None
                    component = task["component"]
                    block_size = int(task["block_size"])

                    for offset in range(block_size):
                        output.append({
                            "department_id": context["department_id"],
                            "scheme_id": context["scheme_id"],
                            "academic_year": context["academic_year"],
                            "semester_type": context["semester_type"],
                            "semester_id": context["semester_id"],
                            "day": day,
                            "period": start + offset,
                            "subject_id": int(subject["subject_id"]),
                            "subject_code": subject["subject_code"],
                            "subject_name": subject["subject_name"],
                            "faculty_id": main,
                            "faculty_name": faculty_names.get(main),
                            "co_faculty_id": co,
                            "co_faculty_name": (
                                faculty_names.get(co) if co is not None else None
                            ),
                            "component": component,
                            "cycle": context.get("cycle"),
                        })

        output.sort(
            key=lambda item: (
                day_order.get(item["day"], 999),
                int(item["period"]),
                item.get("subject_code", ""),
                item.get("component", ""),
            )
        )

        validation = validate_entries(
            output,
            constraint,
            context,
        )

        alt_summary = {
            "scheduled_sessions": len(output),
            "subjects": len(subjects),
            "required_periods": required,
            "working_days": len(days),
            "available_slots": available,
            "faculty_count": len(faculty_limits),
            "cycle": context.get("cycle"),
            "alternative_id": alt_idx + 1,
        }

        alternatives.append({
            "id": alt_idx + 1,
            "timetable": output,
            "validation": validation,
            "summary": alt_summary,
        })

        if solution_vars:
            model.AddBoolOr([v.Not() for v in solution_vars])

    if not alternatives:
        return _failure(
            "No feasible timetable could be generated "
            "with the current faculty assignments, "
            "workload limits and timetable constraints."
        )

    first_alt = alternatives[0]

    return {
        "success": first_alt["validation"]["valid"],
        "validation": first_alt["validation"],
        "timetable": first_alt["timetable"],
        "alternatives": alternatives,
        "conflicts": first_alt["validation"].get("conflicts", []),
        "warnings": first_alt["validation"].get("warnings", []),
        "summary": first_alt["summary"],
    }
