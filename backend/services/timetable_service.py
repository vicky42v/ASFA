from collections import Counter, defaultdict
import random

from ortools.sat.python import cp_model

from backend.db import rows, row
from backend.services.timetable_validator import validate_entries
from backend.services.asfa_rule_engine import AsfaRuleEngine


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
    """Return a randomized integer seed if none is explicitly specified, salted by section."""
    value = context.get("generation_seed")
    sec = str(context.get("section") or "A").strip().upper()
    sec_salt = 12791 if sec == "B" else (17291 if sec == "C" else 0)
    try:
        if value is not None and str(value).strip() != "":
            return int(value) + sec_salt
    except (TypeError, ValueError):
        pass
    return (random.randint(1, 1000000) + sec_salt) % 2147483647


def _is_major_project(subject):
    """Identify Major Project / Mini Project work only. Never match Project Management."""
    if not subject:
        return False
    name = str(subject.get("subject_name") or "").strip().lower()
    code = str(subject.get("subject_code") or "").strip().upper()

    if "management" in name:
        return False

    return (
        "major project" in name
        or "project phase" in name
        or "mini project" in name
        or code in (
            "BAI786", "BCS786", "BIS786", "BVL786", "BEC786", "BCV786",
            "BAI586", "BCS586", "BIS586", "BVL586", "BEC586", "BCV586",
            "BAI685", "BCS685", "BIS685", "BVL685", "BEC685", "BCV685",
        )
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
    """
    Check whether a department represents Science & Humanities /
    Basic Science.

    IMPORTANT:
    This function expects department NAME/CODE, not department_id.
    """

    text = f"{name or ''} {code or ''}".strip().lower()

    return (
        ("basic" in text and "science" in text)
        or "science and humanities" in text
        or text in {
            "bs",
            "bsc",
            "basic science",
            "basic sciences",
            "science and humanities",
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

def _resolve_effective_department(context):
    """
    FINAL ACADEMIC DEPARTMENT RESOLUTION.

    Semester 1:
        Science & Humanities / Basic Science
        Cycle = first_cycle

    Semester 2:
        Science & Humanities / Basic Science
        Cycle = opposite of first_cycle

    Semester 3-8:
        Selected student department
        No P/C cycle

    IMPORTANT:
    The user's selected engineering department is preserved as
    requested_department_id.

    For Semester 1/2, generation is performed using the actual
    Science & Humanities department stored in SQL.
    """

    semester = row(
        """
        SELECT
            semester_id,
            semester_no,
            semester_type
        FROM semester
        WHERE semester_id = %s
        LIMIT 1
        """,
        (
            context["semester_id"],
        ),
    )

    if not semester:
        return None, "Selected semester does not exist."

    semester_no = _safe_int(
        semester.get("semester_no")
    )

    # Preserve original selected/student department.
    context["requested_department_id"] = _safe_int(
        context.get("department_id")
    )

    # ========================================================
    # SEMESTER 1 / 2
    # ========================================================

    if semester_no in (1, 2):

        # ----------------------------------------------------
        # First preference:
        # The actual known SQL department ID for SH.
        #
        # Your database currently uses:
        # department_id = 9
        # department_code = SH
        # department_name = Science and Humanities
        # ----------------------------------------------------

        basic = row(
            """
            SELECT
                department_id,
                department_name,
                department_code
            FROM department
            WHERE department_id = 9
            LIMIT 1
            """
        )

        # ----------------------------------------------------
        # Fallback:
        # Dynamically locate SH/BSH if the ID changes.
        # ----------------------------------------------------

        if not basic:

            basic = row(
                """
                SELECT
                    department_id,
                    department_name,
                    department_code
                FROM department
                WHERE
                    UPPER(TRIM(department_code)) IN ('SH', 'BSH')
                    OR LOWER(TRIM(department_name)) IN (
                        'science and humanities',
                        'basic science',
                        'basic sciences'
                    )
                    OR LOWER(TRIM(department_name))
                       LIKE '%science and humanities%'
                    OR LOWER(TRIM(department_name))
                       LIKE '%basic science%'
                ORDER BY
                    CASE
                        WHEN UPPER(TRIM(department_code)) = 'SH'
                            THEN 0
                        WHEN UPPER(TRIM(department_code)) = 'BSH'
                            THEN 1
                        ELSE 2
                    END,
                    department_id
                LIMIT 1
                """
            )

        if not basic:
            return None, (
                "Science and Humanities / Basic Science department "
                "could not be resolved from the department table."
            )

        basic_department_id = _safe_int(
            basic.get("department_id")
        )

        if not basic_department_id:
            return None, (
                "Science and Humanities department was found "
                "but its department_id is invalid."
            )

        # ----------------------------------------------------
        # Store actual SH identity in context.
        # ----------------------------------------------------

        context["subject_department_id"] = (
            basic_department_id
        )

        context["effective_department_id"] = (
            basic_department_id
        )

        context["basic_science_department_id"] = (
            basic_department_id
        )

        context["subject_department_name"] = (
            basic.get("department_name")
        )

        context["subject_department_code"] = (
            basic.get("department_code")
        )

        context["effective_department_name"] = (
            basic.get("department_name")
        )

        context["effective_department_code"] = (
            basic.get("department_code")
        )

        # ----------------------------------------------------
        # IMPORTANT:
        # Generation department for Sem 1/2 is SH.
        # ----------------------------------------------------

        context["department_id"] = (
            basic_department_id
        )

        # ----------------------------------------------------
        # FIRST CYCLE
        # ----------------------------------------------------

        first_cycle = str(
            context.get("first_cycle")
            or context.get("cycle")
            or ""
        ).strip().upper()

        if first_cycle not in ("P", "C"):
            return None, (
                "Semester 1 and Semester 2 require "
                "first_cycle = P or C."
            )

        context["first_cycle"] = first_cycle

        # ----------------------------------------------------
        # SEMESTER 1
        # ----------------------------------------------------

        if semester_no == 1:

            context["cycle"] = first_cycle

        # ----------------------------------------------------
        # SEMESTER 2
        # ----------------------------------------------------

        else:

            context["cycle"] = (
                "C"
                if first_cycle == "P"
                else "P"
            )

    # ========================================================
    # SEMESTER 3-8
    # ========================================================

    else:

        selected_department_id = _safe_int(
            context.get(
                "requested_department_id"
            )
        )

        if not selected_department_id:
            return None, (
                "A valid department_id is required "
                "for Semester 3-8."
            )

        selected_department = row(
            """
            SELECT
                department_id,
                department_name,
                department_code
            FROM department
            WHERE department_id = %s
            LIMIT 1
            """,
            (
                selected_department_id,
            ),
        )

        if not selected_department:
            return None, (
                "Selected department does not exist."
            )

        context["department_id"] = (
            selected_department_id
        )

        context["subject_department_id"] = (
            selected_department_id
        )

        context["effective_department_id"] = (
            selected_department_id
        )

        context["basic_science_department_id"] = None

        context["subject_department_name"] = (
            selected_department.get(
                "department_name"
            )
        )

        context["subject_department_code"] = (
            selected_department.get(
                "department_code"
            )
        )

        context["effective_department_name"] = (
            selected_department.get(
                "department_name"
            )
        )

        context["effective_department_code"] = (
            selected_department.get(
                "department_code"
            )
        )

        # P/C cycles do not apply to Sem 3-8.
        context["first_cycle"] = None
        context["cycle"] = None

    context["semester_no"] = semester_no

    return semester, None


def _get_semester_info(context):
    """
    Get semester number and the effective department information.

    At this point _resolve_effective_department() has already run,
    so for Semester 1/2 this will use Science & Humanities.
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
# ACADEMIC YEAR
# ============================================================

def _resolve_academic_year(context):
    """
    Resolve the exact academic year from timetable_constraints.

    The current project configuration uses:

        2026-27

    We do NOT silently convert it to 2022 or any scheme year.
    """

    supplied = str(
        context.get("academic_year") or ""
    ).strip()

    if not supplied:
        return (
            "academic_year is required. "
            "Use the configured timetable academic year, "
            "currently 2026-27."
        )

    exact = row(
        """
        SELECT academic_year
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
            supplied,
            context["semester_type"],
            context["semester_id"],
        ),
    )

    if exact:
        context["academic_year"] = str(
            exact["academic_year"]
        )
        return None

    available = rows(
        """
        SELECT DISTINCT academic_year
        FROM timetable_constraints
        WHERE department_id = %s
          AND scheme_id = %s
          AND semester_type = %s
          AND semester_id = %s
        ORDER BY academic_year DESC
        """,
        (
            context["department_id"],
            context["scheme_id"],
            context["semester_type"],
            context["semester_id"],
        ),
    )

    if len(available) == 1:

        context["academic_year"] = str(
            available[0]["academic_year"]
        )

        return None

    if len(available) > 1:

        years = ", ".join(
            str(item["academic_year"])
            for item in available
        )

        return (
            f"Academic year '{supplied}' does not match "
            f"the selected timetable context. "
            f"Available academic years: {years}. "
            "Use 2026-27 for the current project configuration."
        )

    return (
        f"No timetable constraint exists for department "
        f"{context['department_id']}, "
        f"scheme {context['scheme_id']}, "
        f"semester {context['semester_id']}, "
        f"{context['semester_type']}, "
        f"academic year '{supplied}'."
    )


# ============================================================
# CONSTRAINTS
# ============================================================

def _get_constraints(context):
    """
    Dynamically resolve constraints for any department, scheme, academic year, and semester 1-8.
    Applies hierarchical fallback so that timetable generation never fails due to missing constraint records.
    """
    from datetime import timedelta

    dept_id = context.get("department_id")
    scheme_id = context.get("scheme_id")
    ay = context.get("academic_year")
    sem_type = context.get("semester_type")
    sem_id = context.get("semester_id")

    # 1. Exact match
    c = row(
        """
        SELECT * FROM timetable_constraints
        WHERE department_id = %s AND scheme_id = %s AND academic_year = %s
          AND semester_type = %s AND semester_id = %s
        ORDER BY constraint_id DESC LIMIT 1
        """,
        (dept_id, scheme_id, ay, sem_type, sem_id),
    )
    if c:
        return c

    # 2. Match department, scheme, semester
    c = row(
        """
        SELECT * FROM timetable_constraints
        WHERE department_id = %s AND scheme_id = %s AND semester_id = %s
        ORDER BY constraint_id DESC LIMIT 1
        """,
        (dept_id, scheme_id, sem_id),
    )
    if c:
        return c

    # 3. Match department, semester
    c = row(
        """
        SELECT * FROM timetable_constraints
        WHERE department_id = %s AND semester_id = %s
        ORDER BY constraint_id DESC LIMIT 1
        """,
        (dept_id, sem_id),
    )
    if c:
        return c

    # 4. Match semester_id anywhere
    c = row(
        """
        SELECT * FROM timetable_constraints
        WHERE semester_id = %s
        ORDER BY constraint_id DESC LIMIT 1
        """,
        (sem_id,),
    )
    if c:
        return c

    # 5. Sensible standard college default
    return {
        "constraint_id": 0,
        "department_id": dept_id,
        "scheme_id": scheme_id,
        "academic_year": ay or "2026-27",
        "semester_type": sem_type or "Odd",
        "semester_id": sem_id,
        "working_days": "Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
        "periods_per_day": 7,
        "college_start_time": timedelta(hours=9, minutes=0),
        "period_duration": 55,
        "lunch_after_period": 4,
        "short_break_after_period": 2,
        "short_break_duration": 15,
        "max_periods_per_day": 7,
        "max_periods_per_week": 35,
        "lab_duration": 2,
    }


# ============================================================
# SUBJECTS
# ============================================================

def _get_subjects(context):
    """
    Fetch subjects belonging to the exact timetable context.

    Semester 1/2:
        Science & Humanities subjects only.

    P/C:
        Select the requested cycle.
        Cycle-independent subjects are retained.
    """

    params = [
        context.get(
            "subject_department_id",
            context["department_id"],
        ),
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
    ) or _safe_int(context.get("semester_id"))

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

    selected_ids = [
        int(sid)
        for sid in (context.get("selected_subjects") or context.get("selected_subject_ids") or [])
        if str(sid).isdigit()
    ]
    if selected_ids:
        placeholders = ", ".join(["%s"] * len(selected_ids))
        sql += f" AND s.subject_id IN ({placeholders})"
        params.extend(selected_ids)

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
    Determine actual teaching components from L-T-P workload.
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
    Load ONLY real component-level faculty assignments.
    """

    db_assignments = rows(
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
            context.get(
                "subject_department_id",
                context["department_id"],
            ),
            context["scheme_id"],
            context["semester_id"],
        ),
    )

    if db_assignments:
        return db_assignments

    # Fallback to context["assignments"] if provided
    context_assignments = context.get("assignments") or []
    if context_assignments:
        enriched = []
        for ca in context_assignments:
            try:
                sid = int(ca.get("subject_id"))
                fid = int(ca.get("faculty_id"))
                comp = str(ca.get("component") or "Theory").title()
                role = str(ca.get("assignment_role") or "Main").title()
                fac_row = row("SELECT faculty_name, max_workload, designation, role, status FROM faculty WHERE faculty_id=%s", (fid,))
                sub_row = row("SELECT semester_id, department_id, scheme_id, subject_code, subject_name FROM subject WHERE subject_id=%s", (sid,))
                if fac_row and sub_row:
                    enriched.append({
                        "detail_id": 0,
                        "subject_id": sid,
                        "faculty_id": fid,
                        "component": comp,
                        "assignment_role": role,
                        "academic_year": context["academic_year"],
                        "faculty_name": fac_row.get("faculty_name"),
                        "max_workload": fac_row.get("max_workload"),
                        "designation": fac_row.get("designation"),
                        "role": fac_row.get("role"),
                        "faculty_status": fac_row.get("status"),
                        "semester_id": sub_row.get("semester_id"),
                        "department_id": sub_row.get("department_id"),
                        "scheme_id": sub_row.get("scheme_id"),
                        "subject_code": sub_row.get("subject_code"),
                        "subject_name": sub_row.get("subject_name"),
                    })
            except Exception:
                continue
        if enriched:
            return enriched

    return db_assignments


# ============================================================
# OPTIONAL SUBJECT VALIDATION
# ============================================================

def _optional_validation(subjects, assignments, context=None):
    groups = defaultdict(list)
    selected_subject_ids = set()

    for subject in subjects:

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
            "PLC",
            "AEC/SEC",
            "AEC",
            "SEC",
            "ESC",
            "ETC",
        ) or group_id not in (None, "") or is_optional

        code = str(subject.get("subject_code") or "").strip().upper()
        name = str(subject.get("subject_name") or "").strip().lower()

        if category in ("SDC", "ADC") or "DIP" in code or "MATDIP" in code or "lateral entry" in name:
            normalized_group = (
                str(group_id)
                if group_id not in (None, "")
                else f"ondemand_{subject['subject_id']}"
            )
            groups[
                (
                    category or "ONDEMAND",
                    normalized_group,
                )
            ].append(subject)
            continue

        if (is_elective or is_optional or group_id not in (None, "")) and (
            group_id not in (None, "")
            or is_optional
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

    if context:
        for sid in (context.get("selected_subjects") or context.get("selected_subject_ids") or []):
            try:
                selected_subject_ids.add(int(sid))
            except (TypeError, ValueError, KeyError):
                continue
        ca = context.get("component_assignments") or {}
        for sid in ca.keys():
            try:
                selected_subject_ids.add(int(sid))
            except (TypeError, ValueError, KeyError):
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

        # Check explicit user selections from context
        explicit_ids = set()
        if context:
            for sid in (context.get("selected_subjects") or context.get("selected_subject_ids") or []):
                try:
                    explicit_ids.add(int(sid))
                except (TypeError, ValueError, KeyError):
                    pass

        if category in ("SDC", "ADC") or "DIP" in group_id or "sdc_" in group_id or "ondemand_" in group_id:
            # SDC / ADC / Lateral entry is on-demand: included ONLY if user intended to add it (active assignment or explicit selection)
            if selected:
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
                            }
                            for subject in group_subjects
                        ],
                    }
                )
            continue

        explicit_in_group = [s for s in group_subjects if int(s["subject_id"]) in explicit_ids]
        if explicit_in_group:
            selected = [explicit_in_group[0]]
        elif len(selected) > 1:
            selected = [selected[0]]
        elif len(selected) == 0 and group_subjects:
            # Check if any subject has an active assignment
            assigned_s = next((s for s in group_subjects if int(s["subject_id"]) in selected_subject_ids), None)
            selected = [assigned_s] if assigned_s else [group_subjects[0]]

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
            "PLC",
            "AEC/SEC",
            "AEC",
            "SEC",
            "ESC",
            "ETC",
        ) or group_id not in (None, "") or is_optional

        is_choice_subject = (
            (is_elective or is_optional or group_id not in (None, ""))
            and (
                group_id not in (None, "")
                or is_optional
            )
        )

        # SDC / ADC / Lateral entry (DIP): on-demand.
        # Included ONLY if user intended to add it (in selected_ids).
        code = str(subject.get("subject_code") or "").strip().upper()
        name = str(subject.get("subject_name") or "").strip().lower()
        if category in ("SDC", "ADC") or "DIP" in code or "MATDIP" in code or "lateral entry" in name:
            if subject_id in selected_ids:
                result.append(subject)
            continue

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
            "Coordinator",
        ):
            continue

        sid = int(
            assignment["subject_id"]
        )

        batch = str(
            assignment.get("batch") or ""
        ).strip().upper()

        result[sid][component][role] = assignment
        if role == "Coordinator":
            result[sid][component]["Main"] = assignment
        if batch in ("B1", "B2"):
            result[sid][component][batch] = assignment

    return result


def _is_special_activity(subject):

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
            "music",
        )
    )


# ============================================================
# ASSIGNMENT VALIDATION
# ============================================================

def _assignment_validation(subjects, amap):

    errors = []

    for subject in subjects:

        sid = int(
            subject["subject_id"]
        )

        # Faculty-free subjects (Special activities, Library, Placement, Remedial, Activity, Projects)
        if (
            _safe_int(subject.get("faculty_assignment_required"), 1) == 0
            or str(subject.get("course_category") or "").upper() == "SPECIAL"
            or _is_major_project(subject)
            or _is_special_activity(subject)
            or str(subject.get("subject_code") or "").upper() in (
                "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROCTOR"
            )
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
                        "the same faculty member as Main "
                        "and Co-faculty."
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
    constraint=None,
    rule_engine=None,
    context=None,
    assignments=None,
):
    if rule_engine is None:
        rule_engine = AsfaRuleEngine(context or {})

    tasks = []
    lab_candidates = []
    days = list(days or [])
    saturday = next(
        (d for d in days if str(d).strip().lower() == "saturday"),
        None,
    )

    sem_no = int((context or {}).get("semester_no") or (context or {}).get("semester_id") or 0)
    sem7_cap = rule_engine.get_sem7_low_priority_cap() if sem_no == 7 else 999
    low_priority_allocated = 0

    for subject in subjects:
        # Check curriculum replacement (e.g. PE/NCC/Yoga replaced in Sem 7+)
        if rule_engine.is_activity_replaced_in_curriculum(subject):
            continue

        sid = int(subject["subject_id"])
        cfg = rule_engine.get_subject_config(subject)
        classification = cfg.get("classification", "CORE_THEORY")
        priority = cfg.get("scheduling_priority", "NORMAL")
        weight = cfg.get("scheduling_weight", 50)
        max_weekly = cfg.get("max_weekly_periods")

        lecture = _safe_int(subject.get("lecture_hours"))
        tutorial = _safe_int(subject.get("tutorial_hours"))
        practical = _safe_int(subject.get("practical_hours"))

        # MAJOR / MINI PROJECT
        if classification == "PROJECT" or _is_major_project(subject):
            fac_ids = []
            for comp_name in ("Theory", "Lab"):
                m_asg = amap.get(sid, {}).get(comp_name, {}).get("Main") or amap.get(sid, {}).get(comp_name, {}).get("Coordinator")
                if m_asg:
                    fac_ids.append(int(m_asg["faculty_id"]))
                    c_asg = amap.get(sid, {}).get(comp_name, {}).get("Co")
                    if c_asg and int(c_asg["faculty_id"]) != fac_ids[0]:
                        fac_ids.append(int(c_asg["faculty_id"]))
                    break

            weekday_days = [d for d in days if str(d).strip().lower() != "saturday"]
            if sem_no == 7:
                # 7th Sem Major Project Phase-II:
                # Weekday afternoon allocation (1 block)
                tasks.append({
                    "subject": subject,
                    "component": "Theory",
                    "ordinal": 0,
                    "block_size": 1,
                    "faculty_ids": fac_ids,
                    "is_lab": False,
                    "is_special": False,
                    "is_project": True,
                    "allowed_days": weekday_days,
                    "after_lunch_only": True,
                    "classification": "PROJECT",
                    "scheduling_priority": "LOW",
                    "scheduling_weight": 30,
                })
                if saturday:
                    # User requirement: "in 7th sem satuarday fill all the blocks with major project 2"
                    # Saturday Morning 1: Periods 1-2
                    tasks.append({
                        "subject": subject,
                        "component": "Theory",
                        "ordinal": 1,
                        "block_size": 2,
                        "faculty_ids": fac_ids,
                        "is_lab": False,
                        "is_special": False,
                        "is_project": True,
                        "fixed_day": "Saturday",
                        "fixed_start": 1,
                        "classification": "PROJECT",
                        "scheduling_priority": "HIGH",
                        "scheduling_weight": 95,
                    })
                    # Saturday Morning 2: Periods 3-4
                    tasks.append({
                        "subject": subject,
                        "component": "Theory",
                        "ordinal": 2,
                        "block_size": 2,
                        "faculty_ids": fac_ids,
                        "is_lab": False,
                        "is_special": False,
                        "is_project": True,
                        "fixed_day": "Saturday",
                        "fixed_start": 3,
                        "classification": "PROJECT",
                        "scheduling_priority": "HIGH",
                        "scheduling_weight": 95,
                    })
                    # Saturday Afternoon: Periods 5-7 (fill all remaining blocks)
                    tasks.append({
                        "subject": subject,
                        "component": "Theory",
                        "ordinal": 3,
                        "block_size": max(1, periods_per_day - 4),
                        "faculty_ids": fac_ids,
                        "is_lab": False,
                        "is_special": False,
                        "is_project": True,
                        "fixed_day": "Saturday",
                        "fixed_start": 5,
                        "classification": "PROJECT",
                        "scheduling_priority": "HIGH",
                        "scheduling_weight": 95,
                    })
            else:
                # Other semesters: Mini Project on weekday afternoon
                tasks.append({
                    "subject": subject,
                    "component": "Theory",
                    "ordinal": 0,
                    "block_size": 2,
                    "faculty_ids": fac_ids,
                    "is_lab": False,
                    "is_special": False,
                    "is_project": True,
                    "allowed_days": weekday_days,
                    "after_lunch_only": True,
                    "classification": "PROJECT",
                    "scheduling_priority": "LOW",
                    "scheduling_weight": 30,
                })
            continue

        code_u = str(subject.get("subject_code") or "").upper()
        name_u = str(subject.get("subject_name") or "").upper()

        # PLACEMENT (5 periods for Sem 7 across departments, max 3 in a day, after lunch)
        if "PLACEMENT" in code_u or "PLACEMENT" in name_u or classification == "PLACEMENT":
            target_periods = 5 if sem_no in (7, 8) else (2 if sem_no in (1, 2, 3, 4) else 3)
            fac_ids = []
            for comp_name in ("Theory", "Lab"):
                m_asg = amap.get(sid, {}).get(comp_name, {}).get("Main") or amap.get(sid, {}).get(comp_name, {}).get("Coordinator")
                if m_asg:
                    fac_ids.append(int(m_asg["faculty_id"]))
                    break

            pair_key = f"placement_{sid}"
            if target_periods >= 5:
                # Session 1: 3 periods block (P5-P7)
                tasks.append({
                    "subject": subject,
                    "component": "Theory",
                    "ordinal": 0,
                    "block_size": 3,
                    "faculty_ids": fac_ids,
                    "is_lab": False,
                    "is_special": False,
                    "is_project": False,
                    "is_placement": True,
                    "after_lunch_only": True,
                    "pair_key": pair_key,
                    "session_no": 1,
                    "classification": "PLACEMENT",
                    "scheduling_priority": "LOW",
                    "scheduling_weight": 15,
                })
                # Session 2: 2 periods block (P5-P6) on an alternate day
                tasks.append({
                    "subject": subject,
                    "component": "Theory",
                    "ordinal": 1,
                    "block_size": 2,
                    "faculty_ids": fac_ids,
                    "is_lab": False,
                    "is_special": False,
                    "is_project": False,
                    "is_placement": True,
                    "after_lunch_only": True,
                    "pair_key": pair_key,
                    "session_no": 2,
                    "classification": "PLACEMENT",
                    "scheduling_priority": "LOW",
                    "scheduling_weight": 15,
                })
            else:
                tasks.append({
                    "subject": subject,
                    "component": "Theory",
                    "ordinal": 0,
                    "block_size": min(3, target_periods),
                    "faculty_ids": fac_ids,
                    "is_lab": False,
                    "is_special": False,
                    "is_project": False,
                    "is_placement": True,
                    "after_lunch_only": True,
                    "classification": "PLACEMENT",
                    "scheduling_priority": "LOW",
                    "scheduling_weight": 15,
                })
            continue

        # LIBRARY (1 class in timetable, single section, no batches, after lunch)
        if "LIBRARY" in code_u or "LIBRARY" in name_u or classification == "LIBRARY":
            tasks.append({
                "subject": subject,
                "component": "Theory",
                "ordinal": 0,
                "block_size": 1,
                "faculty_ids": [],
                "is_lab": False,
                "is_special": False,
                "is_project": False,
                "is_library": True,
                "after_lunch_only": True,
                "classification": "LIBRARY",
                "scheduling_priority": "LOW",
                "scheduling_weight": 10,
            })
            continue

        # REMEDIAL (1 period for Sem 7, 2 for other sems, after lunch, priority least)
        if "REMEDIAL" in code_u or "REMEDIAL" in name_u or classification == "REMEDIAL":
            tasks.append({
                "subject": subject,
                "component": "Theory",
                "ordinal": 0,
                "block_size": 1 if sem_no == 7 else 2,
                "faculty_ids": [],
                "is_lab": False,
                "is_special": False,
                "is_project": False,
                "is_remedial": True,
                "after_lunch_only": True,
                "classification": "REMEDIAL",
                "scheduling_priority": "LOW",
                "scheduling_weight": 10,
            })
            continue

        # ACTIVITY (1 period for Sem 7, 2 for other sems, after lunch, priority least)
        if "ACTIVITY" in code_u or "ACTIVITY" in name_u or classification == "ACTIVITY":
            tasks.append({
                "subject": subject,
                "component": "Theory",
                "ordinal": 0,
                "block_size": 1 if sem_no == 7 else 2,
                "faculty_ids": [],
                "is_lab": False,
                "is_special": False,
                "is_project": False,
                "is_activity": True,
                "after_lunch_only": True,
                "classification": "ACTIVITY",
                "scheduling_priority": "LOW",
                "scheduling_weight": 10,
            })
            continue

        # SATURDAY CO-CURRICULAR (SPORTS / YOGA / NSS / NCC / PHYSICAL EDUCATION / MUSIC)
        if _is_special_activity(subject):
            if sem_no != 7 and saturday:
                cur_sat_periods = sum(
                    int(t.get("block_size", 1))
                    for t in tasks
                    if "Saturday" in (t.get("allowed_days") or [t.get("fixed_day")])
                )
                if cur_sat_periods + 2 <= periods_per_day:
                    tasks.append({
                        "subject": subject,
                        "component": "Special",
                        "ordinal": 0,
                        "block_size": 2,
                        "faculty_ids": [],
                        "is_lab": False,
                        "is_special": True,
                        "allowed_days": ["Saturday"],
                        "classification": "SPECIAL",
                        "scheduling_priority": "NORMAL",
                        "scheduling_weight": 50,
                    })
            continue

        components = _component_names(subject)

        # THEORY (Credit-based weekly classes matching syllabus)
        if "Theory" in components:
            credits = _safe_int(subject.get("credits"))
            if practical == 0:
                # Pure theory: classes assigned matching credits (or lecture hours if credits is 0)
                theory_hours = credits if credits > 0 else (lecture + tutorial if (lecture + tutorial) > 0 else 3)
            else:
                # Integrated / IPCC: theory lecture hours matching credits - 1 (plus practical lab block)
                theory_hours = max(1, credits - 1) if credits > 0 else max(1, lecture)

            theory_main = amap.get(sid, {}).get("Theory", {}).get("Main")
            if theory_hours > 0 and theory_main:
                for ordinal in range(theory_hours):
                    tasks.append({
                        "subject": subject,
                        "component": "Theory",
                        "ordinal": ordinal,
                        "block_size": 1,
                        "faculty_ids": [int(theory_main["faculty_id"])],
                        "is_lab": False,
                        "is_project": False,
                        "classification": classification,
                        "scheduling_priority": priority,
                        "scheduling_weight": weight,
                    })

        # LAB CANDIDATE
        # LAB CANDIDATE
        if "Lab" in components and practical > 0:
            lab_roles = amap.get(sid, {}).get("Lab", {})
            main_asg = lab_roles.get("Main") or lab_roles.get("B1")
            co_asg = lab_roles.get("Co") or lab_roles.get("B2")
            main_fac = [int(main_asg["faculty_id"])] if main_asg and main_asg.get("faculty_id") else []
            co_fac = [int(co_asg["faculty_id"])] if co_asg and co_asg.get("faculty_id") and (not main_fac or int(co_asg["faculty_id"]) != main_fac[0]) else []
            lab_faculty_ids = main_fac + co_fac

            if lab_faculty_ids:
                configured_lab_duration = _safe_int(
                    subject.get("lab_duration") or subject.get("practical_duration") or 0, 0
                )
                if isinstance(constraint, dict):
                    constraint_duration = _safe_int(constraint.get("lab_duration"), 0)
                    if constraint_duration > 0:
                        configured_lab_duration = constraint_duration
                if configured_lab_duration <= 0:
                    configured_lab_duration = 2
                configured_lab_duration = max(1, configured_lab_duration)

                lab_candidates.append({
                    "subject": subject,
                    "faculty_ids": lab_faculty_ids,
                    "lab_faculty_ids": lab_faculty_ids,
                    "main_faculty_ids": main_fac,
                    "co_faculty_ids": co_fac,
                    "duration": configured_lab_duration,
                    "practical_hours": practical,
                    "priority": priority,
                    "weight": weight,
                })

    # ------------------------------------------------------------
    # PAIR LAB CANDIDATES INTO CONCURRENT BATCHES B1 & B2
    # ------------------------------------------------------------
    # When 2 labs are available (e.g. ML Lab and DL Lab):
    # Session 1: Batch B1 takes Lab 1 and Batch B2 takes Lab 2 at the exact same time
    # Session 2: Batch B1 takes Lab 2 and Batch B2 takes Lab 1 at the exact same time
    # ------------------------------------------------------------
    pair_idx = 0
    lab_idx = 0
    while lab_idx < len(lab_candidates):
        if lab_idx + 1 < len(lab_candidates):
            lab1 = lab_candidates[lab_idx]
            lab2 = lab_candidates[lab_idx + 1]
            dur = max(lab1["duration"], lab2["duration"])
            pair_key = f"lab_pair_{pair_idx}"

            # Session 1: B1 takes Lab 1, B2 takes Lab 2 concurrently
            s1_b1_facs = list(lab1.get("lab_faculty_ids") or lab1["faculty_ids"])
            s1_b2_facs = list(lab2.get("lab_faculty_ids") or lab2["faculty_ids"])

            # Ensure zero faculty overlap between concurrently scheduled lab batches
            overlap = set(s1_b1_facs) & set(s1_b2_facs)
            if overlap:
                dept_id = (context or {}).get("department_id")
                available_facs = [
                    int(f["faculty_id"]) for f in (rows(
                        "SELECT faculty_id FROM faculty WHERE department_id = %s AND status = 'Active'",
                        (dept_id,)
                    ) or [])
                ] if dept_id else []
                new_b2 = []
                for fid in s1_b2_facs:
                    if fid in overlap:
                        replacement = next((f for f in available_facs if f not in s1_b1_facs and f not in new_b2), None)
                        new_b2.append(replacement if replacement else fid)
                    else:
                        new_b2.append(fid)
                s1_b2_facs = new_b2

            s1_facs = list(set(s1_b1_facs + s1_b2_facs))

            tasks.append({
                "subject": lab1["subject"],
                "component": "Lab",
                "ordinal": 0,
                "block_size": dur,
                "faculty_ids": s1_facs,
                "is_lab": True,
                "is_project": False,
                "classification": "LAB",
                "pair_key": pair_key,
                "session_no": 1,
                "sub_tasks": [
                    {"batch": "B1", "subject": lab1["subject"], "faculty_ids": s1_b1_facs},
                    {"batch": "B2", "subject": lab2["subject"], "faculty_ids": s1_b2_facs},
                ],
                "scheduling_priority": lab1["priority"],
                "scheduling_weight": max(lab1["weight"], lab2["weight"]),
            })

            # Session 2: B1 takes Lab 2, B2 takes Lab 1 concurrently on an alternate day
            s2_b1_facs = list(s1_b2_facs)
            s2_b2_facs = list(s1_b1_facs)
            s2_facs = list(set(s2_b1_facs + s2_b2_facs))

            tasks.append({
                "subject": lab2["subject"],
                "component": "Lab",
                "ordinal": 1,
                "block_size": dur,
                "faculty_ids": s2_facs,
                "is_lab": True,
                "is_project": False,
                "classification": "LAB",
                "pair_key": pair_key,
                "session_no": 2,
                "sub_tasks": [
                    {"batch": "B1", "subject": lab2["subject"], "faculty_ids": s2_b1_facs},
                    {"batch": "B2", "subject": lab1["subject"], "faculty_ids": s2_b2_facs},
                ],
                "scheduling_priority": lab2["priority"],
                "scheduling_weight": max(lab1["weight"], lab2["weight"]),
            })
            pair_idx += 1
            lab_idx += 2
        else:
            # Single lone lab: schedule Session 1 for B1 and Session 2 for B2 on alternate days
            lone = lab_candidates[lab_idx]
            dur = lone["duration"]
            lone_key = f"lab_lone_{pair_idx}"
            lone_facs = lone.get("lab_faculty_ids") or lone["faculty_ids"]

            tasks.append({
                "subject": lone["subject"],
                "component": "Lab",
                "ordinal": 0,
                "block_size": dur,
                "faculty_ids": lone_facs,
                "is_lab": True,
                "is_project": False,
                "classification": "LAB",
                "pair_key": lone_key,
                "session_no": 1,
                "sub_tasks": [
                    {"batch": "B1", "subject": lone["subject"], "faculty_ids": lone_facs},
                ],
                "scheduling_priority": lone["priority"],
                "scheduling_weight": lone["weight"],
            })
            tasks.append({
                "subject": lone["subject"],
                "component": "Lab",
                "ordinal": 1,
                "block_size": dur,
                "faculty_ids": lone_facs,
                "is_lab": True,
                "is_project": False,
                "classification": "LAB",
                "pair_key": lone_key,
                "session_no": 2,
                "sub_tasks": [
                    {"batch": "B2", "subject": lone["subject"], "faculty_ids": lone_facs},
                ],
                "scheduling_priority": lone["priority"],
                "scheduling_weight": lone["weight"],
            })
            pair_idx += 1
            lab_idx += 1

    # MANDATORY PROCTOR HOUR (B1 & B2 dual proctors)
    proctor_hours = rule_engine.get_proctor_rule_hours()
    if proctor_hours > 0 and not any(t.get("is_proctor") or t.get("classification") == "PROCTOR" for t in tasks):
        proctor_b1 = None
        proctor_b2 = None
        if context:
            if context.get("proctor_b1_faculty_id"):
                try:
                    proctor_b1 = int(context["proctor_b1_faculty_id"])
                except (ValueError, TypeError):
                    pass
            elif context.get("proctor_faculty_id"):
                try:
                    proctor_b1 = int(context["proctor_faculty_id"])
                except (ValueError, TypeError):
                    pass

            if context.get("proctor_b2_faculty_id"):
                try:
                    proctor_b2 = int(context["proctor_b2_faculty_id"])
                except (ValueError, TypeError):
                    pass

        if not proctor_b1:
            for s_id, comp_map in amap.items():
                for c_name, r_map in comp_map.items():
                    if r_map.get("Main"):
                        proctor_b1 = int(r_map["Main"]["faculty_id"])
                        break
                if proctor_b1:
                    break
        if not proctor_b1 and assignments:
            proctor_b1 = int(assignments[0]["faculty_id"])

        if not proctor_b2:
            for s_id, comp_map in amap.items():
                for c_name, r_map in comp_map.items():
                    if r_map.get("Main"):
                        cand = int(r_map["Main"]["faculty_id"])
                        if cand != proctor_b1:
                            proctor_b2 = cand
                            break
                if proctor_b2:
                    break
            if not proctor_b2 and assignments:
                for a in assignments:
                    cand = int(a["faculty_id"])
                    if cand != proctor_b1:
                        proctor_b2 = cand
                        break
            if not proctor_b2:
                proctor_b2 = proctor_b1

        proctor_subject = {
            "subject_id": 999900 + int((context or {}).get("semester_id") or 1),
            "subject_code": "PROCTOR",
            "subject_name": "Proctor / Mentoring Hour",
            "course_category": "MC",
            "lecture_hours": 1,
            "tutorial_hours": 0,
            "practical_hours": 0,
            "credits": 0,
        }

        proctor_sub_tasks = []
        if proctor_b1:
            proctor_sub_tasks.append({
                "batch": "B1",
                "subject": proctor_subject,
                "faculty_ids": [proctor_b1],
            })
        if proctor_b2:
            proctor_sub_tasks.append({
                "batch": "B2",
                "subject": proctor_subject,
                "faculty_ids": [proctor_b2],
            })

        proctor_all_facs = [f for f in [proctor_b1, proctor_b2] if f]
        is_sem7 = (sem_no == 7)
        tasks.append({
            "subject": proctor_subject,
            "component": "Theory",
            "ordinal": 0,
            "block_size": 1,
            "faculty_ids": list(set(proctor_all_facs)),
            "sub_tasks": proctor_sub_tasks,
            "is_lab": False,
            "is_special": False,
            "is_project": False,
            "is_proctor": True,
            "after_lunch_only": is_sem7,
            "classification": "PROCTOR",
            "scheduling_priority": "LOW" if is_sem7 else "NORMAL",
            "scheduling_weight": 50,
        })

    # For Semester 7: ensure PLACEMENT, LIBRARY, REMEDIAL, ACTIVITY are present from DB if not already added
    if sem_no == 7:
        has_placement = any(t.get("is_placement") or t.get("classification") == "PLACEMENT" for t in tasks)
        has_library = any(t.get("is_library") or t.get("classification") == "LIBRARY" for t in tasks)
        has_remedial = any(t.get("is_remedial") or t.get("classification") == "REMEDIAL" for t in tasks)
        has_activity = any(t.get("is_activity") or t.get("classification") == "ACTIVITY" for t in tasks)

        dept_id = (context or {}).get("department_id")
        sem_id = (context or {}).get("semester_id") or 7
        if not (has_placement and has_library and has_remedial and has_activity) and dept_id:
            try:
                db_specials = rows(
                    "SELECT * FROM subject WHERE department_id = %s AND semester_id = %s AND subject_code IN ('PLACEMENT', 'LIBRARY', 'REMEDIAL', 'ACTIVITY')",
                    (dept_id, sem_id)
                ) or []
                for sp in db_specials:
                    sp_code = str(sp.get("subject_code") or "").upper()
                    if sp_code == "PLACEMENT" and not has_placement:
                        pair_key = f"placement_{sp['subject_id']}"
                        pl_size = 5 if sem_no == 7 else 2
                        if pl_size >= 5:
                            tasks.append({
                                "subject": sp, "component": "Theory", "ordinal": 0, "block_size": 3,
                                "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                                "is_placement": True, "after_lunch_only": True, "pair_key": pair_key,
                                "session_no": 1, "classification": "PLACEMENT", "scheduling_priority": "LOW",
                                "scheduling_weight": 15,
                            })
                            tasks.append({
                                "subject": sp, "component": "Theory", "ordinal": 1, "block_size": 2,
                                "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                                "is_placement": True, "after_lunch_only": True, "pair_key": pair_key,
                                "session_no": 2, "classification": "PLACEMENT", "scheduling_priority": "LOW",
                                "scheduling_weight": 15,
                            })
                        else:
                            tasks.append({
                                "subject": sp, "component": "Theory", "ordinal": 0, "block_size": pl_size,
                                "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                                "is_placement": True, "after_lunch_only": True, "pair_key": pair_key,
                                "session_no": 1, "classification": "PLACEMENT", "scheduling_priority": "LOW",
                                "scheduling_weight": 15,
                            })
                        has_placement = True
                    elif sp_code == "LIBRARY" and not has_library:
                        tasks.append({
                            "subject": sp, "component": "Theory", "ordinal": 0, "block_size": 1,
                            "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                            "is_library": True, "after_lunch_only": True, "classification": "LIBRARY",
                            "scheduling_priority": "LOW", "scheduling_weight": 10,
                        })
                        has_library = True
                    elif sp_code == "REMEDIAL" and not has_remedial:
                        tasks.append({
                            "subject": sp, "component": "Theory", "ordinal": 0, "block_size": 2,
                            "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                            "is_remedial": True, "after_lunch_only": True, "classification": "REMEDIAL",
                            "scheduling_priority": "LOW", "scheduling_weight": 10,
                        })
                        has_remedial = True
                    elif sp_code == "ACTIVITY" and not has_activity:
                        tasks.append({
                            "subject": sp, "component": "Theory", "ordinal": 0, "block_size": 2,
                            "faculty_ids": [], "is_lab": False, "is_special": False, "is_project": False,
                            "is_activity": True, "after_lunch_only": True, "classification": "ACTIVITY",
                            "scheduling_priority": "LOW", "scheduling_weight": 10,
                        })
                        has_activity = True
            except Exception:
                pass

    # For non-Sem-7 semesters: ensure Yoga, NSS, and Sports are scheduled on Saturday
    if sem_no != 7 and saturday:
        existing_special_text = " ".join(
            str(t.get("subject", {}).get("subject_name") or "") + " " + str(t.get("subject", {}).get("subject_code") or "")
            for t in tasks if t.get("is_special")
        ).lower()

        missing_saturday = []
        if "yoga" not in existing_special_text:
            missing_saturday.append(("YOGA", "Yoga & Life Skills"))
        if "nss" not in existing_special_text:
            missing_saturday.append(("NSS", "National Service Scheme (NSS)"))
        if "sports" not in existing_special_text and "physical education" not in existing_special_text:
            missing_saturday.append(("SPORTS", "Physical Education & Sports"))

        for act_code, act_name in missing_saturday:
            cur_sat_periods = sum(int(t.get("block_size", 1)) for t in tasks if "Saturday" in (t.get("allowed_days") or [t.get("fixed_day")]))
            if cur_sat_periods + 2 <= periods_per_day:
                tasks.append({
                    "subject": {
                        "subject_id": 99000 + len(tasks),
                        "subject_code": act_code,
                        "subject_name": act_name,
                        "course_category": "MC",
                        "lecture_hours": 2,
                        "tutorial_hours": 0,
                        "practical_hours": 0,
                    },
                    "component": "Special",
                    "ordinal": 0,
                    "block_size": 2,
                    "faculty_ids": [],
                    "is_lab": False,
                    "is_special": True,
                    "allowed_days": ["Saturday"],
                    "classification": "SPECIAL",
                    "scheduling_priority": "NORMAL",
                    "scheduling_weight": 50,
                })

    # Priority order: Labs & High Priority -> Normal Core Theory -> Low Priority Fillers (Placement, Remedial, Activity, Library)
    tasks.sort(
        key=lambda task: (
            0 if task.get("is_lab") else (
                0 if task.get("scheduling_priority") == "HIGH" else (
                    1 if task.get("scheduling_priority") == "NORMAL" else 2
                )
            ),
            -int(task.get("block_size", 1)),
            str(task["subject"].get("subject_code") or ""),
            int(task.get("ordinal", 0)),
        )
    )

    # Cap low priority fillers (Placement, Activity, Remedial, Library) to available weekday slots
    weekday_days = [d for d in days if str(d).strip().lower() != "saturday"]
    max_weekday_slots = len(weekday_days) * periods_per_day
    weekday_needed = sum(
        int(t.get("block_size", 1)) for t in tasks
        if not ("Saturday" in (t.get("allowed_days") or []) or t.get("fixed_day") == "Saturday")
    )
    if weekday_needed > max_weekday_slots:
        excess = weekday_needed - max_weekday_slots
        # Step 1: Trim multi-period fillers (Placement, Activity, Remedial)
        for task in tasks:
            if excess <= 0:
                break
            if task.get("is_activity") or task.get("is_remedial") or task.get("is_placement"):
                cur_sz = int(task.get("block_size", 1))
                if cur_sz > 1:
                    reduce_by = min(excess, cur_sz - 1)
                    task["block_size"] = cur_sz - reduce_by
                    excess -= reduce_by
        # Step 2: If still excess, drop low priority filler tasks
        if excess > 0:
            trimmed_tasks = []
            for task in reversed(tasks):
                if excess > 0 and (task.get("is_library") or task.get("is_activity") or task.get("is_remedial") or task.get("is_placement")):
                    excess -= int(task.get("block_size", 1))
                    continue
                trimmed_tasks.append(task)
            tasks = list(reversed(trimmed_tasks))

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

        items = [
            str(item).strip()
            for item in raw
            if str(item).strip()
        ]
    else:
        items = [
            item.strip()
            for item in str(
                raw or ""
            ).split(",")
            if item.strip()
        ]

    standard_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    days_set = {d.title() for d in items}
    days_set.add("Saturday")
    return [d for d in standard_order if d in days_set]


# ============================================================
# POSSIBLE START PERIODS
# ============================================================

def _start_periods(
    constraint,
    block_size,
    after_lunch_only=False,
    is_lab=False,
    semester_no=None,
    task=None,
):

    periods = _safe_int(
        constraint.get(
            "periods_per_day"
        ),
        7,
    )

    lunch = _safe_int(
        constraint.get(
            "lunch_after_period"
        ),
        4,
    )

    short_break = _safe_int(
        constraint.get(
            "short_break_after_period"
        ),
        2,
    )

    # 1. HARD CONSTRAINT: LAB RULE
    # Labs must strictly be scheduled as 2-period blocks: [1,2], [3,4], or [5,6].
    # Option 1: P1-P2 (start 1)
    # Option 2: P3-P4 (start 3)
    # Option 3: P5-P6 (start 5)
    if is_lab:
        if block_size == 2:
            allowed = []
            for s in (1, 3, 5):
                if s + 1 <= periods:
                    crosses_break = (short_break > 0 and s <= short_break < s + 1)
                    crosses_lunch = (lunch > 0 and s <= lunch < s + 1)
                    if not crosses_break and not crosses_lunch:
                        allowed.append(s)
            return allowed
        elif block_size <= 1:
            return list(range(1, periods + 1))

    # 2. HARD CONSTRAINT: AFTER-LUNCH RULE
    # Placement, Remedial, Proctor, Library, and Activity MUST strictly be scheduled AFTER LUNCH (P5+)
    is_after_lunch_task = after_lunch_only
    if task:
        if task.get("after_lunch_only"):
            is_after_lunch_task = True
        classification = str(task.get("classification") or "").upper()
        code = str(task.get("subject", {}).get("subject_code") or "").upper()
        name = str(task.get("subject", {}).get("subject_name") or "").upper()
        if (
            task.get("is_proctor")
            or classification in ("PROCTOR", "PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY")
            or task.get("is_placement")
            or task.get("is_library")
            or task.get("is_remedial")
            or task.get("is_activity")
            or "PROCTOR" in code
            or "PLACEMENT" in code or "PLACEMENT" in name
            or "LIBRARY" in code or "LIBRARY" in name
            or "REMEDIAL" in code or "REMEDIAL" in name
            or "ACTIVITY" in code or "ACTIVITY" in name
        ):
            is_after_lunch_task = True

    if is_after_lunch_task:
        # If Proctor: strictly period 7 (or last period of the day)
        if task and (
            task.get("is_proctor")
            or str(task.get("classification") or "").upper() == "PROCTOR"
            or "PROCTOR" in str(task.get("subject", {}).get("subject_code") or "").upper()
        ):
            return [periods] if periods >= 7 else [max(1, periods - block_size + 1)]

        # For Major Project, Activity, Placement, Remedial, Library:
        # Prioritize late afternoon periods (6 & 7)
        late_starts = []
        if block_size == 1:
            late_starts = [p for p in (7, 6, 5) if p <= periods]
        elif block_size == 2:
            late_starts = [p for p in (6, 5) if p + 1 <= periods]
        elif block_size == 3:
            late_starts = [p for p in (5,) if p + 2 <= periods]

        # Non-break crossing fallbacks so solver never fails if late slots are occupied
        all_valid_starts = [
            s for s in range(1, periods - block_size + 2)
            if not (short_break > 0 and s <= short_break and s + block_size - 1 > short_break)
            and not (lunch > 0 and s <= lunch and s + block_size - 1 > lunch)
        ]
        # Put late afternoon starts first
        combined_starts = [s for s in late_starts if s in all_valid_starts]
        for s in all_valid_starts:
            if s not in combined_starts:
                combined_starts.append(s)
        return combined_starts if combined_starts else list(range(max(1, lunch + 1), periods - block_size + 2))

    if block_size <= 1:
        return list(range(1, periods + 1))

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
        if not crosses_short_break and not crosses_lunch:
            valid_starts.append(start)

    return valid_starts


# ============================================================
# EXISTING FACULTY OCCUPANCY
# ============================================================

def _existing_occupied(context):

    occupied = set()

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
                  AND COALESCE(section, 'A') = %s
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
                str(
                    context.get("section")
                    or "A"
                ).strip().upper(),
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
                            item["faculty_id"]
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
                            item["co_faculty_id"]
                        ),
                        day,
                        period,
                    )
                )

    except Exception:
        pass

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
                        item["faculty_id"]
                    ),
                    item["day"],
                    _safe_int(
                        item["period"]
                    ),
                )
            )

    except Exception:
        pass

    # Ingest in-memory or cascading extra_occupied
    extra_occupied = context.get("extra_occupied") or []
    for item in extra_occupied:
        try:
            if isinstance(item, (list, tuple)) and len(item) >= 3:
                occupied.add((int(item[0]), str(item[1]), _safe_int(item[2])))
            elif isinstance(item, dict):
                fid = item.get("faculty_id") or item.get("facultyId") or item.get("faculty")
                co_fid = item.get("co_faculty_id") or item.get("coFacultyId") or item.get("co_faculty")
                d = item.get("day")
                p = item.get("period") or item.get("period_no")
                if d and p is not None:
                    p_int = _safe_int(p)
                    if fid is not None and str(fid).isdigit():
                        occupied.add((int(fid), str(d), p_int))
                    if co_fid is not None and str(co_fid).isdigit():
                        occupied.add((int(co_fid), str(d), p_int))
        except Exception:
            pass

    # Ingest active_timetables from other semesters
    active_timetables = context.get("active_timetables") or {}
    if isinstance(active_timetables, dict):
        for sem_key, entries_list in active_timetables.items():
            if str(sem_key) != str(context.get("semester_id")) and str(sem_key) != str(context.get("semester_no")):
                for e in (entries_list or []):
                    try:
                        d = e.get("day")
                        p = _safe_int(e.get("period") or e.get("period_no"))
                        fid = e.get("faculty_id") or e.get("facultyId") or e.get("faculty")
                        co_fid = e.get("co_faculty_id") or e.get("coFacultyId") or e.get("co_faculty")
                        if d and p > 0:
                            if fid is not None and str(fid).isdigit():
                                occupied.add((int(fid), str(d), p))
                            if co_fid is not None and str(co_fid).isdigit():
                                occupied.add((int(co_fid), str(d), p))
                    except Exception:
                        pass
    elif isinstance(active_timetables, list):
        for e in active_timetables:
            try:
                d = e.get("day")
                p = _safe_int(e.get("period") or e.get("period_no"))
                fid = e.get("faculty_id") or e.get("facultyId") or e.get("faculty")
                co_fid = e.get("co_faculty_id") or e.get("coFacultyId") or e.get("co_faculty")
                if d and p > 0:
                    if fid is not None and str(fid).isdigit():
                        occupied.add((int(fid), str(d), p))
                    if co_fid is not None and str(co_fid).isdigit():
                        occupied.add((int(co_fid), str(d), p))
            except Exception:
                pass

    return occupied


def _existing_faculty_weekly_periods(context):
    """
    Count existing scheduled teaching periods per faculty across all other schemes
    and classes for the academic_year and semester_type to enforce global workload limits.
    """
    counts = defaultdict(int)
    try:
        existing = rows(
            """
            SELECT
                t.faculty_id,
                t.co_faculty_id
            FROM timetable t
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
        for item in existing:
            if item.get("faculty_id") is not None:
                counts[int(item["faculty_id"])] += 1
            if item.get("co_faculty_id") is not None:
                counts[int(item["co_faculty_id"])] += 1
    except Exception:
        pass
    return counts


# ============================================================
# FACULTY WORKLOAD LIMITS
# ============================================================

def _faculty_limits(
    assignments,
    global_weekly,
    rule_engine=None,
):
    limits = {}
    for assignment in assignments:
        faculty_id = int(assignment["faculty_id"])
        if faculty_id not in limits:
            if rule_engine:
                _min_w, max_workload = rule_engine.get_faculty_workload_bounds(assignment)
            else:
                max_workload = _safe_int(assignment.get("max_workload"), 0)
                if max_workload <= 0:
                    designation = str(assignment.get("designation") or "").lower()
                    role = str(assignment.get("role") or "").lower()
                    if role == "hod" or "hod" in designation or "head of department" in designation:
                        max_workload = 12
                    elif "assistant professor" in designation:
                        max_workload = 18
                    elif "associate professor" in designation or designation.startswith("professor"):
                        max_workload = 16
                    elif "principal" in designation or "principal" in role:
                        max_workload = 6
                    else:
                        max_workload = global_weekly
            limits[faculty_id] = min(max_workload, global_weekly)
    return limits


def _global_assignment_workload_errors(
    academic_year,
    scheme_id=None,
    semester_type=None,
):
    where_clauses = [
        "d.academic_year = %s",
        "d.status = 'Active'",
    ]
    params = [academic_year]

    # Faculty workload is global across all schemes (scheme_id is intentionally not filtered)

    if semester_type:
        sem_str = str(semester_type).strip().lower()
        if sem_str == "odd":
            where_clauses.append("s.semester_id % 2 = 1")
        elif sem_str == "even":
            where_clauses.append("s.semester_id % 2 = 0")

    where_sql = " AND ".join(where_clauses)

    totals = rows(
        f"""
        SELECT
            d.faculty_id,
            f.faculty_name,
            f.designation,
            f.role,
            f.max_workload,

            COALESCE(
                SUM(
                    CASE
                        WHEN s.course_category IN ('PROJ', 'MC', 'NCMC', 'SPECIAL')
                          OR d.assignment_role = 'Coordinator'
                          OR s.faculty_assignment_required = 0
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%PROJECT%'
                          OR UPPER(COALESCE(s.subject_code, '')) LIKE '%PROJ%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%PLACEMENT%'
                          OR UPPER(COALESCE(s.subject_code, '')) LIKE '%PLACEMENT%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%YOGA%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%SPORTS%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%PHYSICAL EDUCATION%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%NSS%'
                          OR UPPER(COALESCE(s.subject_name, '')) LIKE '%MUSIC%'
                        THEN 0
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

        WHERE {where_sql}

        GROUP BY
            d.faculty_id,
            f.faculty_name,
            f.designation,
            f.role,
            f.max_workload
        """,
        tuple(params),
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


def _repair_conflicts(output, constraint, context, rule_engine=None, max_iterations=30):
    """
    Backtracking conflict repair:
    Iteratively detects conflicts using validate_entries, identifies conflicting entries,
    searches for valid alternative (day, period) slots, moves the lowest-impact entry, and re-validates.
    Returns (repaired_output, repaired_count, iterations).
    """
    current_entries = [dict(e) for e in output]
    initial_validation = validate_entries(current_entries, constraint, context)
    if initial_validation.get("valid"):
        return current_entries, 0, 0

    repaired_count = 0
    days = _days(constraint)
    periods = _safe_int(constraint.get("periods_per_day"), 7)
    occupied = _existing_occupied(context)

    for iteration in range(1, max_iterations + 1):
        val = validate_entries(current_entries, constraint, context)
        if val.get("valid"):
            return current_entries, repaired_count, iteration

        conflicts = val.get("conflicts", [])
        problem_indices = []
        for c in conflicts:
            idx = c.get("entry_index")
            if idx is not None and 0 <= idx < len(current_entries):
                problem_indices.append(idx)
            fac_id = c.get("faculty_id")
            slot = c.get("slot")
            if fac_id and slot and isinstance(slot, (list, tuple)) and len(slot) == 2:
                c_day, c_period = slot
                for i, e in enumerate(current_entries):
                    if e.get("day") == c_day and e.get("period") == c_period and (
                        e.get("faculty_id") == fac_id or e.get("co_faculty_id") == fac_id
                    ):
                        problem_indices.append(i)

        if not problem_indices:
            break

        problem_indices = list(dict.fromkeys(problem_indices))
        moved = False

        for idx in problem_indices:
            entry = current_entries[idx]
            if entry.get("component") == "Lab" or entry.get("batch") in ("B1", "B2"):
                continue  # Never split atomic paired multi-batch lab blocks
            orig_day = entry.get("day")
            orig_period = entry.get("period")
            fid = entry.get("faculty_id")
            co_id = entry.get("co_faculty_id")

            for target_day in days:
                for target_period in range(1, periods + 1):
                    if target_day == orig_day and target_period == orig_period:
                        continue

                    # Cannot move into cross-class occupied slots
                    if fid and (int(fid), target_day, target_period) in occupied:
                        continue
                    if co_id and (int(co_id), target_day, target_period) in occupied:
                        continue

                    if any(
                        e.get("day") == target_day and e.get("period") == target_period
                        for i, e in enumerate(current_entries) if i != idx
                    ):
                        continue

                    if any(
                        e.get("day") == target_day and e.get("period") == target_period and
                        ((fid and (e.get("faculty_id") == fid or e.get("co_faculty_id") == fid)) or
                         (co_id and (e.get("faculty_id") == co_id or e.get("co_faculty_id") == co_id)))
                        for i, e in enumerate(current_entries) if i != idx
                    ):
                        continue

                    entry["day"] = target_day
                    entry["period"] = target_period
                    test_val = validate_entries(current_entries, constraint, context)
                    if len(test_val.get("conflicts", [])) < len(conflicts):
                        repaired_count += 1
                        moved = True
                        break
                    else:
                        entry["day"] = orig_day
                        entry["period"] = orig_period
                if moved:
                    break
        if not moved:
            break

    return current_entries, repaired_count, max_iterations


# ============================================================
# GENERATE TIMETABLE
# ============================================================

def generate(context):
    from backend.services.asfa_engine import AsfaEngine
    outputs = _safe_int(
        context.get("number_of_outputs")
        or context.get("number_of_alternatives")
        or context.get("alternatives")
        or 1,
        1,
    )
    engine = AsfaEngine(context)
    return engine.execute_pipeline(number_of_outputs=outputs)


def generate_asfa_timetable(context, rule_engine=None, number_of_outputs=None):
    context = dict(
        context or {}
    )

    # --------------------------------------------------------
    # FORCE CURRENT ACADEMIC YEAR
    # --------------------------------------------------------
    #
    # The project is currently using 2026-27.
    # n8n should already send this, but this prevents an old
    # client value such as 2022 from accidentally reaching
    # the SQL timetable generator.
    #
    # --------------------------------------------------------

    context["academic_year"] = "2026-27"

    # --------------------------------------------------------
    # NORMALIZE SEMESTER TYPE
    # --------------------------------------------------------

    semester_type = str(
        context.get("semester_type") or ""
    ).strip().upper()

    if "ODD" in semester_type:
        context["semester_type"] = "Odd"

    elif "EVEN" in semester_type:
        context["semester_type"] = "Even"

    else:
        return _failure(
            "semester_type must be Odd or Even."
        )

    # --------------------------------------------------------
    # RESOLVE EFFECTIVE DEPARTMENT
    # --------------------------------------------------------

    _semester, resolve_error = (
        _resolve_effective_department(
            context
        )
    )

    if resolve_error:
        return _failure(
            resolve_error
        )

    # --------------------------------------------------------
    # RESOLVE ACADEMIC YEAR
    # --------------------------------------------------------

    academic_year_error = (
        _resolve_academic_year(
            context
        )
    )

    if academic_year_error:
        return _failure(
            academic_year_error
        )

    # --------------------------------------------------------
    # SEMESTER INFORMATION
    # --------------------------------------------------------

    semester = _get_semester_info(
        context
    )

    if not semester:

        return _failure(
            "The selected semester or effective department "
            "could not be found."
        )

    context["semester_no"] = (
        semester.get(
            "semester_no"
        )
    )

    # --------------------------------------------------------
    # VERIFY SEMESTER TYPE
    # --------------------------------------------------------

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
    # SEMESTER 1 / 2 VALIDATION
    # --------------------------------------------------------

    if semester_no in (
        1,
        2,
    ):

        # IMPORTANT FIX:
        #
        # Do NOT call _basic_science("9", "SH").
        #
        # Check the actual resolved department information.

        resolved_name = str(
            context.get(
                "subject_department_name"
            )
            or semester.get(
                "department_name"
            )
            or ""
        )

        resolved_code = str(
            context.get(
                "subject_department_code"
            )
            or semester.get(
                "department_code"
            )
            or ""
        )

        resolved_department_id = _safe_int(
            context.get(
                "subject_department_id"
            )
        )

        is_basic_science = (
            resolved_department_id == 9
            or _basic_science(
                resolved_name,
                resolved_code,
            )
        )

        if not is_basic_science:

            return _failure(
                "Science and Humanities / Basic Science "
                "could not be resolved for Semester 1/2."
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
                "generating the Semester 1/2 timetable."
            )

        context["cycle"] = cycle

    # --------------------------------------------------------
    # SEMESTER 3-8
    # --------------------------------------------------------

    else:

        context["cycle"] = None

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
            f"Expected context: department={context['department_id']}, "
            f"scheme={context['scheme_id']}, "
            f"academic_year={context['academic_year']}, "
            f"semester_type={context['semester_type']}, "
            f"semester={context['semester_id']}."
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
                f"Science & Humanities Semester "
                f"{semester_no} "
                f"{context.get('cycle', '')} Cycle "
                f"for academic year "
                f"{context.get('academic_year')}."
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
        context=context,
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

    # Auto-fallback: ensure every subject has a Main faculty assigned if missing
    dept_id = context.get("department_id")
    dept_fac_list = rows("SELECT faculty_id FROM faculty WHERE department_id = %s AND status = 'Active'", (dept_id,))
    if not dept_fac_list:
        dept_fac_list = rows("SELECT faculty_id FROM faculty WHERE status = 'Active'")
    if dept_fac_list:
        fac_pool = [int(f["faculty_id"]) for f in dept_fac_list]
        f_idx = 0
        for s in subjects:
            sid = int(s["subject_id"])
            if _safe_int(s.get("faculty_assignment_required"), 1) == 0 or _is_major_project(s) or _is_special_activity(s):
                continue
            for comp in _component_names(s):
                if not amap.get(sid, {}).get(comp, {}).get("Main"):
                    auto_fid = fac_pool[f_idx % len(fac_pool)]
                    f_idx += 1
                    amap[sid][comp]["Main"] = {
                        "subject_id": sid,
                        "faculty_id": auto_fid,
                        "component": comp,
                        "assignment_role": "Main",
                    }

    # --------------------------------------------------------
    # ASSIGNMENT VALIDATION
    # --------------------------------------------------------

    assignment_check = (
        _assignment_validation(
            subjects,
            amap,
        )
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
            context["academic_year"],
            scheme_id=None,
            semester_type=context.get("semester_type"),
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
            "must be configured for the selected "
            "department and semester."
        )

    # --------------------------------------------------------
    # SATURDAY ACTIVITIES
    # --------------------------------------------------------

    special_subjects = [
        subject
        for subject in subjects
        if _is_special_activity(
            subject
        )
    ]

    has_saturday = any(
        str(day).strip().lower()
        == "saturday"
        for day in days
    )

    # Saturday has NO classes assigned per user requirement.
    if rule_engine is None:
        rule_engine = AsfaRuleEngine(context)

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

    seed = _generation_seed(context)
    task_rng = random.Random(seed)
    task_rng.shuffle(tasks)

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
        rule_engine=rule_engine,
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

    project_day_choices = defaultdict(
        lambda: defaultdict(list)
    )

    pair_day_choices = defaultdict(
        lambda: defaultdict(list)
    )

    task_by_var_index = {}

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

        if task.get("fixed_day"):
            candidate_days = [task.get("fixed_day")]
        elif task.get("allowed_days"):
            candidate_days = [d for d in task["allowed_days"] if d in days]
        else:
            # All regular subjects (theory, IPCC labs, electives, fillers) are strictly Monday-Friday
            candidate_days = [d for d in days if d.lower() != "saturday"]

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
                    after_lunch_only=task.get("after_lunch_only", False),
                    is_lab=task.get("is_lab", False),
                    semester_no=semester_no,
                    task=task,
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

                task_by_var_index[
                    var.Index()
                ] = task

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

                if task.get("pair_key"):
                    pair_day_choices[task["pair_key"]][day].append(var)

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

                if not task.get("is_lab") and not task.get("is_project") and not _is_major_project(subject):
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
    # LAB PAIR SESSIONS MUST BE ON DIFFERENT DAYS
    # ------------------------------------------------------------

    for pair_key, day_vars in pair_day_choices.items():
        for d, variables in day_vars.items():
            model.AddAtMostOne(variables)

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

    for variables in class_slot.values():

        model.AddAtMostOne(
            variables
        )

    # ------------------------------------------------------------
    # FREE BLOCKS AFTER LUNCH CONSTRAINT
    # Any free blocks must strictly be scheduled after lunch break.
    # If any period after lunch (p > lunch) is occupied on a day,
    # all morning periods (p <= lunch) must also be occupied.
    # Morning periods must be filled contiguously starting from P1.
    # ------------------------------------------------------------
    lunch_period = _safe_int(
        constraint.get("lunch_after_period"),
        4
    )

    has_morning_classes = any(
        t.get("is_lab") or (
            not (t.get("after_lunch_only") or t.get("is_placement") or t.get("is_library") or t.get("is_remedial") or t.get("is_activity") or t.get("is_proctor") or t.get("is_special"))
            and t.get("component") in ("Theory", "Core", "Integrated", "Elective")
        )
        for t in tasks
    )

    for day in days:
        if str(day).strip().lower() == "saturday":
            continue

        # 1. Any afternoon class requires morning periods (1..lunch) to be occupied
        if has_morning_classes:
            for p_morning in range(1, lunch_period + 1):
                morning_vars = class_slot.get((day, p_morning), [])
                if not morning_vars:
                    continue
                occ_morning = sum(morning_vars)
                for p_afternoon in range(lunch_period + 1, periods + 1):
                    afternoon_vars = class_slot.get((day, p_afternoon), [])
                    for v_aft in afternoon_vars:
                        model.Add(v_aft <= occ_morning)

        # 2. Morning periods must be filled contiguously (p+1 cannot be occupied if p is empty)
        for p in range(1, lunch_period):
            vars_curr = class_slot.get((day, p), [])
            vars_next = class_slot.get((day, p + 1), [])
            if vars_curr and vars_next:
                model.Add(sum(vars_next) <= sum(vars_curr))


    # ------------------------------------------------------------
    # NO ACADEMIC CLASSES AFTER MAJOR PROJECT, ACTIVITY, OR PROCTOR
    # Major Project, Activity, and Proctor belong at the end of the day
    # (majority in Periods 6 & 7). Regular classes must NEVER follow them.
    # ------------------------------------------------------------
    disallow_after_special = rule_engine.should_disallow_classes_after_specials() if rule_engine else True

    if disallow_after_special:
        day_special_period_vars = defaultdict(lambda: defaultdict(list))
        day_regular_period_vars = defaultdict(lambda: defaultdict(list))

        for choices_ in choices.values():
            for var, _task, day, start in choices_:
                if str(day).strip().lower() == "saturday":
                    continue
                blk = int(_task.get("block_size") or 1)
                is_special = (
                    _task.get("is_proctor")
                    or _task.get("is_placement")
                    or _task.get("is_library")
                    or _task.get("is_remedial")
                    or _task.get("is_activity")
                    or _task.get("is_project")
                    or _is_major_project(_task.get("subject", {}))
                    or str(_task.get("classification") or "").upper() in ("PROCTOR", "PLACEMENT", "REMEDIAL", "ACTIVITY", "LIBRARY", "PROJECT")
                    or any(k in str(_task.get("subject", {}).get("subject_code") or "").upper() for k in ("PROCTOR", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROJECT", "PROJ"))
                    or any(k in str(_task.get("subject", {}).get("subject_name") or "").upper() for k in ("PROCTOR", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "PROJECT"))
                )
                for p_offset in range(blk):
                    p = start + p_offset
                    if is_special:
                        day_special_period_vars[day][p].append(var)
                    else:
                        day_regular_period_vars[day][p].append(var)

        # For every day, if a special task occupies p_spec, no regular class can be at p_reg > p_spec
        for day in days:
            if str(day).strip().lower() == "saturday":
                continue
            for p_spec, spec_vars in day_special_period_vars[day].items():
                for p_reg, reg_vars in day_regular_period_vars[day].items():
                    if p_reg > p_spec:
                        for v_s in spec_vars:
                            for v_r in reg_vars:
                                model.Add(v_s + v_r <= 1)


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

        category = str(
            subject_row.get(
                "course_category"
            )
            or ""
        ).strip().upper()

        if category == "PROJ" or _is_major_project(subject_row) or "PROJECT" in str(subject_row.get("subject_name") or "").upper():
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

    prior_faculty_periods = _existing_faculty_weekly_periods(context)

    for faculty_id, variables in faculty_week.items():

        limit = faculty_limits.get(
            faculty_id,
            global_weekly,
        )

        prior = prior_faculty_periods.get(faculty_id, 0)
        remaining = max(0, limit - prior)

        model.Add(
            sum(
                var * weight
                for var, weight in variables
            )
            <= remaining
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

    seed = _generation_seed(
        context
    )

    rng = random.Random(
        seed
    )

    # 1. Randomized subject-day affinities so subjects vary across weekdays on each run
    subject_day_affinity = {}
    distinct_sids = {int(t["subject"]["subject_id"]) for t in tasks if t.get("subject")}
    weekdays_only = [d for d in days if d.lower() != "saturday"]
    sec_str = str(context.get("section") or "A").strip().upper()
    if sec_str == "B":
        # Rotate weekdays order so Section B has inverted / distinct day affinities from Section A
        weekdays_only = weekdays_only[2:] + weekdays_only[:2]
    for sid in distinct_sids:
        shuffled = list(weekdays_only)
        rng.shuffle(shuffled)
        for rank, d in enumerate(shuffled):
            subject_day_affinity[(sid, d)] = rank * rng.randint(-150, 150) + rng.randint(-250, 250)

    # 2. Randomized subject-period affinities so theory classes vary period positions
    subject_period_affinity = {}
    for sid in distinct_sids:
        for p in range(1, periods + 1):
            subject_period_affinity[(sid, p)] = rng.randint(-200, 200)

    # 3. Lab randomized affinities so labs vary their weekday assignments
    lab_day_affinity = {}
    for task_idx, t in enumerate(tasks):
        if t.get("is_lab"):
            shuffled_lab_days = list(weekdays_only)
            rng.shuffle(shuffled_lab_days)
            for rank, d in enumerate(shuffled_lab_days):
                lab_day_affinity[(task_idx, d)] = rank * rng.randint(-200, 200)

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

            pref_penalty = 0
            if _task.get("faculty_ids"):
                for fid in _task["faculty_ids"]:
                    penalty = rule_engine.evaluate_preference_score(fid, start, periods)
                    pref_penalty += int(penalty * 300)

            sched_prio = _task.get("scheduling_priority", "NORMAL")
            prio_cost = 0
            if sched_prio in ("LOW", "VERY_LOW"):
                if start <= 4:
                    prio_cost = (5 - start) * 60
            elif sched_prio == "HIGH":
                prio_cost = start * 40

            # Reference timetable preferences (SKIT format)
            ref_cost = 0
            if _task.get("is_lab"):
                # Labs strongly prefer Period 1-2 or Period 3-4 (before lunch)
                if start in (1, 3):
                    ref_cost -= 250
                elif start == 5:
                    ref_cost -= 80
            elif (
                _task.get("classification") in ("PLACEMENT", "REMEDIAL", "PROCTOR", "ACTIVITY", "LIBRARY", "PROJECT")
                or _task.get("is_placement")
                or _task.get("is_proctor")
                or _task.get("is_library")
                or _task.get("is_remedial")
                or _task.get("is_activity")
                or _task.get("is_project")
                or _is_major_project(_task.get("subject", {}))
            ):
                # Major Project, Activity, Proctor, Library & Placement prefer Period 6 & 7 (end of day)
                if _task.get("is_proctor"):
                    if start >= 7:
                        ref_cost -= 1200
                    elif start == 6:
                        ref_cost -= 700
                    elif start == 5:
                        ref_cost -= 200
                    else:
                        ref_cost += 1500
                elif _task.get("is_project") or _is_major_project(_task.get("subject", {})):
                    if str(day).strip().lower() != "saturday":
                        if start in (6, 7):
                            ref_cost -= 900
                        elif start == 5:
                            ref_cost -= 400
                        else:
                            ref_cost += 1500
                elif _task.get("is_placement"):
                    if start in (6, 7):
                        ref_cost -= 800
                    elif start == 5:
                        ref_cost -= 500
                    else:
                        ref_cost += 1200
                else:
                    # Remedial, Activity, Library
                    if start in (6, 7):
                        ref_cost -= 850
                    elif start == 5:
                        ref_cost -= 400
                    else:
                        ref_cost += 1200
            elif _task.get("is_special"):
                if start in (1, 3, 5):
                    ref_cost -= 150

            sid = int(_task.get("subject", {}).get("subject_id") or 0)
            sub_day_cost = subject_day_affinity.get((sid, day), 0)
            sub_period_cost = subject_period_affinity.get((sid, start), 0)
            lab_cost = lab_day_affinity.get((index, day), 0)
            rand_jitter = rng.randint(-150, 150)

            objective_terms.append(
                var
                * (
                    start * 40
                    + pref_penalty
                    + prio_cost
                    + ref_cost
                    + sub_day_cost
                    + sub_period_cost
                    + lab_cost
                    + rand_jitter
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
    try:
        all_fac_rows = rows("SELECT faculty_id, faculty_name FROM faculty") or []
        for f in all_fac_rows:
            if f.get("faculty_id"):
                faculty_names[int(f["faculty_id"])] = f.get("faculty_name")
    except Exception:
        pass

    for assignment in assignments:
        if assignment.get("faculty_id"):
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

        solver.parameters.max_time_in_seconds = 5
        solver.parameters.num_search_workers = 8

        solver.parameters.random_seed = (
            seed
            + alt_idx * 7919
            + rng.randint(1, 10000)
        ) % 2147483647
        solver.parameters.randomize_search = True
        solver.parameters.search_branching = cp_model.PORTFOLIO_SEARCH

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

                    sub_tasks = task.get("sub_tasks")

                    if sub_tasks:
                        for offset in range(block_size):
                            for sub in sub_tasks:
                                sub_facs = sub.get("faculty_ids", [])
                                sub_main = sub_facs[0] if sub_facs else None
                                sub_co = sub_facs[1] if len(sub_facs) > 1 else None
                                sub_sub = sub.get("subject", subject)
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

                                        "section":
                                            str(context.get("section") or "A").strip().upper(),

                                        "day":
                                            day,

                                        "period":
                                            start + offset,

                                        "period_no":
                                            start + offset,

                                        "subject_id":
                                            int(
                                                sub_sub[
                                                    "subject_id"
                                                ]
                                            ),

                                        "subject_code":
                                            sub_sub[
                                                "subject_code"
                                            ],

                                        "subject_name":
                                            sub_sub[
                                                "subject_name"
                                            ],

                                        "faculty_id":
                                            sub_main,

                                        "faculty_name":
                                            faculty_names.get(
                                                sub_main
                                            ),

                                        "co_faculty_id":
                                            sub_co,

                                        "co_faculty_name":
                                            (
                                                faculty_names.get(
                                                    sub_co
                                                )
                                                if sub_co is not None
                                                else None
                                            ),

                                        "component":
                                            sub.get("component") or component,

                                        "batch":
                                            sub.get("batch"),

                                        "cycle":
                                            context.get(
                                                "cycle"
                                            ),
                                    }
                                )
                    else:
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

                                    "section":
                                        str(context.get("section") or "A").strip().upper(),

                                    "day":
                                        day,

                                    "period":
                                        start + offset,

                                    "period_no":
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

                                    "batch":
                                        task.get("batch"),

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
                str(
                    item.get("batch") or ""
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

            "department_id":
                context.get(
                    "department_id"
                ),

            "department_name":
                context.get(
                    "effective_department_name"
                ),

            "academic_year":
                context.get(
                    "academic_year"
                ),

            "alternative_id":
                alt_idx + 1,
        }

        repaired_count = 0
        repair_iterations = 0
        if not validation.get("valid"):
            output, repaired_count, repair_iterations = _repair_conflicts(
                output, constraint, context, rule_engine
            )
            validation = validate_entries(
                output,
                constraint,
                context,
            )

        if validation.get("valid"):

            alternatives.append(
                {
                    "id":
                        len(
                            alternatives
                        ) + 1,

                    "name":
                        f"Option "
                        f"{len(alternatives) + 1}",

                    "timetable":
                        output,

                    "validation":
                        validation,

                    "metrics":
                        validation.get("metrics") or {},

                    "repaired_count":
                        repaired_count,

                    "repair_iterations":
                        repair_iterations,

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

            model.Add(
                sum(solution_vars)
                <= max(1, len(solution_vars) - 8)
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

        "metrics":
            first_alt.get("metrics") or first_alt["validation"].get("metrics") or {},

        "repaired_count":
            first_alt.get("repaired_count", 0),

        "repair_iterations":
            first_alt.get("repair_iterations", 0),

        "summary":
            first_alt[
                "summary"
            ],
    }