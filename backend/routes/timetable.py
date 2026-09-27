from flask import Blueprint, request

from backend.db import row, rows, connection, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.timetable_service import generate
from backend.services.timetable_validator import validate_entries
from backend.services.audit_service import audit, notify


def _safe_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


bp = Blueprint(
    "timetable",
    __name__,
    url_prefix="/api/timetable",
)


EDITORS = ["Admin", "Coordinator", "HOD"]


# ============================================================
# TIMETABLE CONTEXT
# ============================================================

CONTEXT = (
    "department_id",
    "scheme_id",
    "academic_year",
    "semester_type",
    "semester_id",
)


# ============================================================
# CONTEXT HELPER
# ============================================================

def context_from(data):
    data = data or {}

    context = {
        field: data.get(field)
        for field in CONTEXT
    }

    missing = [
        field
        for field in CONTEXT
        if context[field] in (None, "")
    ]

    if missing:
        return None, missing

    sem_type = str(context.get("semester_type") or "").strip().upper()
    if "ODD" in sem_type:
        context["semester_type"] = "Odd"
    elif "EVEN" in sem_type:
        context["semester_type"] = "Even"

    cycle = data.get("cycle")

    if cycle not in (None, ""):
        cycle = str(cycle).strip().upper()

        if cycle in ("P CYCLE", "P"):
            cycle = "P"
        elif cycle in ("C CYCLE", "C"):
            cycle = "C"
        else:
            return None, [
                "cycle must be P or C"
            ]

        context["cycle"] = cycle
    else:
        context["cycle"] = None

    first_cycle = data.get("first_cycle")

    if first_cycle not in (None, ""):
        first_cycle = str(first_cycle).strip().upper()

        if first_cycle in ("P CYCLE", "P"):
            first_cycle = "P"
        elif first_cycle in ("C CYCLE", "C"):
            first_cycle = "C"
        else:
            return None, [
                "first_cycle must be P or C"
            ]

        context["first_cycle"] = first_cycle
    else:
        context["first_cycle"] = None

    section = data.get("section")
    if section not in (None, ""):
        context["section"] = str(section).strip().upper()
    else:
        context["section"] = "A"

    return context, []


# ============================================================
# SEMESTER INFORMATION
# ============================================================

def _get_semester(context):
    """
    Return the selected semester joined to the selected timetable
    department. For Semester 1/2 the subject curriculum department is
    resolved separately as Science & Humanities.
    """
    return row(
        """
        SELECT
            sem.*,
            d.department_name,
            d.department_code,
            d.department_id
        FROM semester sem
        JOIN department d
            ON d.department_id = %s
        WHERE sem.semester_id = %s
        LIMIT 1
        """,
        (
            context.get(
                "subject_department_id",
                context["department_id"],
            ),
            context["semester_id"],
        ),
    )


def _resolve_effective_department(context):
    """
    Sem 1/2 -> dynamically resolve Science and Humanities / Basic Science.
    Sem 3-8 -> keep the selected department.
    """
    semester = row(
        """
        SELECT semester_id, semester_no, semester_type
        FROM semester
        WHERE semester_id = %s
        LIMIT 1
        """,
        (context["semester_id"],),
    )

    if not semester:
        return None, "Selected semester does not exist."

    semester_no = _safe_int(
        semester.get("semester_no")
    )

    context["requested_department_id"] = (
        context["department_id"]
    )

    if semester_no in (1, 2):

        basic = row(
            """
            SELECT
                department_id,
                department_name,
                department_code
            FROM department
            WHERE
                UPPER(TRIM(department_code))
                    IN ('SH', 'BSH')
                OR
                LOWER(TRIM(department_name))
                    IN (
                        'science and humanities',
                        'basic science',
                        'basic sciences'
                    )
            ORDER BY
                CASE
                    WHEN
                        UPPER(TRIM(department_code))
                        = 'SH'
                    THEN 0

                    WHEN
                        UPPER(TRIM(department_code))
                        = 'BSH'
                    THEN 1

                    ELSE 2
                END,
                department_id
            LIMIT 1
            """
        )

        if not basic:
            return None, (
                "Science and Humanities / Basic Science "
                "department could not be resolved from the "
                "department table."
            )

        # IMPORTANT:
        # department_id remains the selected/student department.
        #
        # Semester 1/2 use Science & Humanities only for
        # curriculum subjects and faculty assignments.
        #
        # Timetable constraints and saved timetable rows remain
        # department-specific.

        context["subject_department_id"] = int(
            basic["department_id"]
        )

        context["effective_department_id"] = int(
            basic["department_id"]
        )

        context["basic_science_department_id"] = int(
            basic["department_id"]
        )

        first_cycle = context.get("first_cycle")

        if first_cycle in ("P", "C"):

            context["cycle"] = (
                first_cycle
                if semester_no == 1
                else (
                    "C"
                    if first_cycle == "P"
                    else "P"
                )
            )

    else:

        context["subject_department_id"] = int(
            context["department_id"]
        )

        context["effective_department_id"] = int(
            context["department_id"]
        )

        context["basic_science_department_id"] = None

        # P/C cycles are only meaningful for Semester 1/2.
        context["cycle"] = None

    context["semester_no"] = semester_no

    return semester, None


# ============================================================
# ACADEMIC YEAR NORMALIZATION
# ============================================================

def _resolve_academic_year(context):
    """
    Keep the database as the source of truth.

    The UI historically sent the scheme year, for example 2022,
    while timetable_constraints stores the actual academic year,
    for example 2026-27.

    If the supplied value has no matching constraint but there is
    exactly one available academic year for the exact department /
    scheme / semester / semester-type context, use that DB value.

    If multiple years exist, fail instead of guessing.
    """

    supplied = str(
        context.get("academic_year") or ""
    ).strip()

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

        context["academic_year"] = (
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

        context["academic_year"] = (
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
            "Send the actual timetable academic year, "
            "e.g. 2026-27."
        )

    return (
        f"No timetable constraint exists for department "
        f"{context['department_id']}, scheme "
        f"{context['scheme_id']}, semester "
        f"{context['semester_id']}, "
        f"{context['semester_type']}, academic year "
        f"'{supplied}'."
    )


# ============================================================
# BASIC SCIENCE CHECK
# ============================================================

def _is_basic_science(department):

    if not department:
        return False

    text = (
        f"{department.get('department_name') or ''} "
        f"{department.get('department_code') or ''}"
    ).strip().lower()

    return (
        (
            "basic" in text
            and
            "science" in text
        )
        or
        "science and humanities" in text
        or
        text in {
            "bs",
            "bsc",
            "basic science",
            "basic sciences",
            "sh",
        }
    )


# ============================================================
# SEMESTER / CYCLE VALIDATION
# ============================================================

def _validate_semester_context(context):

    semester, resolve_error = (
        _resolve_effective_department(
            context
        )
    )

    if resolve_error:

        return (
            False,
            resolve_error,
            None,
        )

    semester = _get_semester(
        context
    )

    if not semester:

        return (
            False,
            "Selected semester does not exist.",
            None,
        )

    academic_year_error = (
        _resolve_academic_year(
            context
        )
    )

    if academic_year_error:

        return (
            False,
            academic_year_error,
            semester,
        )

    try:

        semester_no = int(
            semester.get(
                "semester_no"
            )
        )

    except (
        TypeError,
        ValueError,
    ):

        semester_no = 0

    context["semester_no"] = semester_no

    stored_type = str(
        semester.get(
            "semester_type"
        ) or ""
    ).strip()

    if (
        stored_type
        and
        stored_type
        != str(
            context.get(
                "semester_type"
            ) or ""
        ).strip()
    ):

        return (
            False,
            (
                f"Semester {semester_no} belongs "
                f"to {stored_type} semester type, "
                f"not "
                f"{context.get('semester_type')}."
            ),
            semester,
        )

    if semester_no in (1, 2):

        if not _is_basic_science(
            semester
        ):

            return (
                False,
                (
                    "Semester 1 and Semester 2 "
                    "can only be handled under "
                    "the Basic Science department."
                ),
                semester,
            )

        cycle = context.get(
            "cycle"
        )

        if cycle not in ("P", "C"):

            return (
                False,
                (
                    "Select P Cycle or C Cycle "
                    "for Semester 1 or Semester 2."
                ),
                semester,
            )

    else:

        context["cycle"] = None

    return (
        True,
        None,
        semester,
    )


# ============================================================
# MAJOR PROJECT DETECTION
# ============================================================

def _is_major_project_subject(subject):
    """
    Detect Major Project / Mini Project from authoritative subject data.

    Project subjects are faculty-free. Detection intentionally uses
    database metadata as well as the subject code/name so an older n8n
    payload cannot accidentally force a faculty assignment.
    """

    if not subject:
        return False

    code = str(
        subject.get(
            "subject_code"
        ) or ""
    ).strip().upper()

    name = str(
        subject.get(
            "subject_name"
        ) or ""
    ).strip().upper()

    code = str(
        subject.get(
            "subject_code"
        ) or ""
    ).strip().upper()

    # Exclude non-project courses that happen to have 'project' in the title (like Project Management)
    if "PROJECT MANAGEMENT" in name or "MANAGEMENT" in name:
        return False

    return (
        "MAJOR PROJECT" in name
        or "PROJECT PHASE" in name
        or "MINI PROJECT" in name
        or code in (
            "BAI786", "BCS786", "BIS786", "BVL786", "BEC786", "BCV786",
            "BAI586", "BCS586", "BIS586", "BVL586", "BEC586", "BCV586",
            "BAI685", "BCS685", "BIS685", "BVL685", "BEC685", "BCV685",
        )
    )


# ============================================================
# PROJECT ENTRY NORMALIZATION
# ============================================================

def _project_subject_map(entries):
    """Load subject metadata needed to identify project entries."""
    subject_ids = sorted({
        _safe_int(item.get("subject_id"))
        for item in (entries or [])
        if _safe_int(item.get("subject_id")) > 0
    })

    if not subject_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(subject_ids))
    records = rows(
        f"""
        SELECT
            subject_id,
            subject_code,
            subject_name,
            course_category
        FROM subject
        WHERE subject_id IN ({placeholders})
        """,
        tuple(subject_ids),
    )

    return {
        _safe_int(item.get("subject_id")): item
        for item in records
    }


def _is_project_entry(item, subject=None):
    """Return True only for Major Project or Mini Project entries."""
    item = item or {}
    subject = subject or {}

    return _is_major_project_subject(subject or item)


def _normalize_project_entries(entries):
    """
    Return a copy of entries where project rows have single coordinator preserved.
    Normal subjects are left untouched.
    """
    subject_map = _project_subject_map(entries)
    normalized = []

    for item in (entries or []):
        copy_item = dict(item)
        sid = _safe_int(copy_item.get("subject_id"))
        subject = subject_map.get(sid)

        if _is_project_entry(copy_item, subject):
            copy_item["is_project"] = True
            copy_item["subject_type"] = "PROJECT"
            # Keep assigned Project Coordinator faculty_id if present
            copy_item["co_faculty_id"] = None
            copy_item["component"] = "Theory"

        normalized.append(copy_item)

    return normalized


def _validate_timetable_entries(entries, constraint, context):
    """
    Validate entries while treating Major/Mini Projects as faculty-free.

    Project rows are normalized to is_project=True and Theory for the
    generic validator. This bypasses only project faculty/special-activity
    validation; normal timetable conflict checks remain active.
    """
    validation_entries = _normalize_project_entries(entries)
    return validate_entries(
        validation_entries,
        constraint,
        context,
    )


# ============================================================
# FACULTY ASSIGNMENT VALIDATION
# ============================================================

def _verify_generated_faculty_assignments(
    entries,
    context,
):
    """
    Verify generated faculty assignments against the current DB.

    NORMAL SUBJECTS
    ---------------

    Theory:
        Requires active Theory/Main faculty.

    Lab:
        Requires active Lab/Main faculty.
        Optional Co faculty must match active Lab/Co.

    MAJOR PROJECT
    -------------

    Major Project does NOT require:

        - Main faculty
        - Co faculty
        - faculty_id
        - active faculty assignment
        - faculty_subject_assignment_detail row

    Major Project is skipped from faculty validation
    completely.

    This means BAI786 can be saved even if there is no
    active Main faculty assignment.
    """

    if not entries:

        return {
            "valid": True,
            "errors": [],
        }

    # --------------------------------------------------------
    # GET SUBJECT IDS
    # --------------------------------------------------------

    subject_ids = sorted({
        _safe_int(
            item.get(
                "subject_id"
            )
        )
        for item in entries
        if _safe_int(
            item.get(
                "subject_id"
            )
        ) > 0
    })

    if not subject_ids:

        return {
            "valid": True,
            "errors": [],
        }

    placeholders = ", ".join(
        ["%s"] * len(subject_ids)
    )

    # --------------------------------------------------------
    # LOAD SUBJECT MASTER DATA
    # --------------------------------------------------------

    subjects = rows(
        f"""
        SELECT
            subject_id,
            subject_code,
            subject_name,
            course_category,
            faculty_assignment_required
        FROM subject
        WHERE subject_id IN ({placeholders})
        """,
        tuple(subject_ids),
    )

    subject_map = {
        _safe_int(
            item.get(
                "subject_id"
            )
        ): item
        for item in subjects
    }

    # --------------------------------------------------------
    # REMOVE MAJOR PROJECTS & CO-CURRICULAR FROM FACULTY VALIDATION
    # --------------------------------------------------------

    faculty_entries = []

    for item in entries:

        subject_id = _safe_int(
            item.get(
                "subject_id"
            )
        )

        subject = subject_map.get(
            subject_id
        )

        component = str(
            item.get(
                "component"
            )
            or "Theory"
        ).strip().title()

        subject_type = str(
            item.get(
                "subject_type"
            )
            or ""
        ).strip().upper()

        is_project_flag = bool(
            item.get(
                "is_project"
            )
        )

        # ====================================================
        # FACULTY-FREE & SPECIAL ACTIVITY BYPASS
        # ====================================================
        #
        # Major Project, Proctor, Library, Remedial, Activity,
        # Placement, Sports, Yoga, NSS, and subjects with
        # faculty_assignment_required = 0 are faculty-free.
        # ====================================================

        subject_code_val = str(item.get("subject_code") or (subject.get("subject_code") if subject else "") or "").strip().upper()
        subject_name_val = str(item.get("subject_name") or (subject.get("subject_name") if subject else "") or "").strip().upper()
        is_fac_req = _safe_int((subject or {}).get("faculty_assignment_required"), 1)
        cat_val = str((subject or {}).get("course_category") or "").upper()

        if (
            _is_major_project_subject(
                subject
            )
            or
            component == "Special"
            or
            subject_type in ("PROJECT", "MINI_PROJECT", "MAJOR_PROJECT", "PROCTOR", "SPECIAL")
            or
            is_project_flag
            or
            is_fac_req == 0
            or
            cat_val == "SPECIAL"
            or
            any(k in subject_code_val for k in ("PROCTOR", "PROJECT", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "NSS", "SPORTS", "YOGA", "PE", "MUSIC", "BMUK", "BMUS"))
            or
            any(k in subject_name_val for k in ("PROCTOR", "PROJECT", "MINI PROJECT", "PLACEMENT", "LIBRARY", "REMEDIAL", "ACTIVITY", "NSS", "SPORTS", "YOGA", "PHYSICAL EDUCATION", "MUSIC"))
        ):
            continue

        # ----------------------------------------------------
        # NORMAL SUBJECT
        # ----------------------------------------------------

        faculty_entries.append(
            item
        )

    # If everything is a Major Project,
    # there is nothing to validate against faculty.
    if not faculty_entries:

        return {
            "valid": True,
            "errors": [],
        }

    normal_subject_ids = sorted({
        _safe_int(
            item.get(
                "subject_id"
            )
        )
        for item in faculty_entries
        if _safe_int(
            item.get(
                "subject_id"
            )
        ) > 0
    })

    if not normal_subject_ids:

        return {
            "valid": True,
            "errors": [],
        }

    normal_placeholders = ", ".join(
        ["%s"] * len(
            normal_subject_ids
        )
    )

    # --------------------------------------------------------
    # LOAD CURRENT ACTIVE FACULTY ASSIGNMENTS
    # --------------------------------------------------------

    assignments = rows(
        f"""
        SELECT
            d.detail_id,
            d.subject_id,
            d.faculty_id,
            d.component,
            d.assignment_role,
            d.batch,
            f.faculty_name

        FROM faculty_subject_assignment_detail d

        JOIN faculty f
            ON f.faculty_id =
               d.faculty_id

        JOIN subject s
            ON s.subject_id =
               d.subject_id

        WHERE d.academic_year = %s

          AND d.status = 'Active'

          AND LOWER(
              COALESCE(
                  f.status,
                  'Active'
              )
          ) = 'active'

          AND s.department_id = %s

          AND s.scheme_id = %s

          AND s.semester_id = %s

          AND d.subject_id IN (
              {normal_placeholders}
          )

        ORDER BY
            d.detail_id DESC
        """,
        (
            context["academic_year"],

            context.get(
                "subject_department_id",
                context["department_id"],
            ),

            context["scheme_id"],

            context["semester_id"],

            *normal_subject_ids,
        ),
    )

    expected = {}

    for item in assignments:

        subject_id = _safe_int(
            item.get(
                "subject_id"
            )
        )

        component = str(
            item.get(
                "component"
            )
            or ""
        ).strip().title()

        role = str(
            item.get(
                "assignment_role"
            )
            or ""
        ).strip().title()

        batch = str(
            item.get(
                "batch"
            )
            or ""
        ).strip().upper()

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

        key = (
            subject_id,
            component,
            role,
        )

        # Latest active assignment wins.
        if key not in expected:

            expected[key] = {
                "faculty_id":
                    _safe_int(
                        item.get(
                            "faculty_id"
                        )
                    ),

                "faculty_name":
                    item.get(
                        "faculty_name"
                    ),
            }

        if batch in ("B1", "B2") and role != "Co":
            batch_key = (subject_id, component, batch)
            if batch_key not in expected:
                expected[batch_key] = {
                    "faculty_id": _safe_int(item.get("faculty_id")),
                    "faculty_name": item.get("faculty_name"),
                }

    for item in (context.get("assignments") or []):
        s_id = _safe_int(item.get("subject_id"))
        comp = str(item.get("component") or "").strip().title()
        r = str(item.get("assignment_role") or "").strip().title()
        b = str(item.get("batch") or "").strip().upper()
        f_id = _safe_int(item.get("faculty_id"))
        f_name = item.get("faculty_name") or str(f_id)
        if comp in ("Theory", "Lab"):
            if r in ("Main", "Co"):
                expected.setdefault((s_id, comp, r), {"faculty_id": f_id, "faculty_name": f_name})
            if b in ("B1", "B2") and r != "Co":
                expected.setdefault((s_id, comp, b), {"faculty_id": f_id, "faculty_name": f_name})

    errors = []

    # --------------------------------------------------------
    # VERIFY NORMAL SUBJECTS
    # --------------------------------------------------------

    for item in faculty_entries:

        subject_id = _safe_int(
            item.get(
                "subject_id"
            )
        )

        component = str(
            item.get(
                "component"
            )
            or "Theory"
        ).strip().title()

        generated_main = item.get(
            "faculty_id"
        )

        generated_co = item.get(
            "co_faculty_id"
        )

        subject_code = item.get(
            "subject_code",
            subject_id,
        )

        entry_batch = str(item.get("batch") or "").strip().upper()

        # ----------------------------------------------------
        # MAIN FACULTY
        # ----------------------------------------------------

        main_key = (
            subject_id,
            component,
            "Main",
        )

        expected_main = expected.get(main_key)
        if not expected_main and entry_batch in ("B1", "B2"):
            expected_main = expected.get((subject_id, component, entry_batch))

        if not expected_main:

            errors.append(
                f"{subject_code} ({component}) "
                f"has no active Main faculty assignment."
            )

            continue

        if generated_main in (
            None,
            "",
        ):

            errors.append(
                f"{subject_code} ({component}) "
                f"has no faculty in the generated timetable."
            )

        elif _safe_int(
            generated_main
        ) != _safe_int(
            expected_main[
                "faculty_id"
            ]
        ):

            errors.append(
                f"{subject_code} ({component}) "
                f"was generated with "
                f"{item.get('faculty_name') or generated_main}, "
                f"but the current Main assignment is "
                f"{expected_main['faculty_name']}."
            )

        # ----------------------------------------------------
        # CO FACULTY
        # ----------------------------------------------------

        if generated_co not in (
            None,
            "",
        ):

            is_ipcc = (
                str(item.get("course_category") or "").upper() == "IPCC"
                or (_safe_int(item.get("lecture_hours")) > 0 and _safe_int(item.get("practical_hours")) > 0)
            )

            if component != "Lab" and not is_ipcc:

                errors.append(
                    f"{subject_code} ({component}) "
                    f"contains a Co faculty, "
                    f"but Co faculty is only valid for Lab or IPCC."
                )

                continue

            co_key = (
                subject_id,
                component if is_ipcc else "Lab",
                "Co",
            )

            expected_co = expected.get(co_key) or expected.get((subject_id, "Lab", "Co"))

            if not expected_co:

                errors.append(
                    f"{subject_code} ({component}) "
                    f"was generated with a Co faculty, "
                    f"but no active Lab/IPCC Co assignment exists."
                )

            elif _safe_int(
                generated_co
            ) != _safe_int(
                expected_co[
                    "faculty_id"
                ]
            ):

                errors.append(
                    f"{subject_code} ({component}) "
                    f"was generated with Co faculty "
                    f"{item.get('co_faculty_name') or generated_co}, "
                    f"but the current assignment is "
                    f"{expected_co['faculty_name']}."
                )

        # ----------------------------------------------------
        # MAIN AND CO CANNOT BE SAME
        # ----------------------------------------------------

        if (
            generated_main not in (
                None,
                "",
            )

            and

            generated_co not in (
                None,
                "",
            )

            and

            _safe_int(
                generated_main
            )
            ==
            _safe_int(
                generated_co
            )
        ):

            errors.append(
                f"{subject_code} (Lab) "
                f"cannot use the same faculty "
                f"as Main and Co faculty."
            )

    return {
        "valid": not errors,
        "errors": errors,
    }


# ============================================================
# CONSTRAINT HELPER
# ============================================================

def _get_constraint(context):
    """
    Return ONLY the exact constraint row for the effective context.
    Never borrow another department or semester's rules.
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
# LIST TIMETABLE
# ============================================================

@bp.get("")
@require_auth()
def list_timetable():

    data = request.args.to_dict()

    context, missing = context_from(
        data
    )

    if missing:

        return fail(
            "Missing timetable filter: "
            + ", ".join(missing)
        )

    valid, message, semester = (
        _validate_semester_context(
            context
        )
    )

    if not valid:

        return fail(
            message,
            422,
        )

    cycle_sql = ""

    params = [
        context["department_id"],
        context["scheme_id"],
        context["academic_year"],
        context["semester_type"],
        context["semester_id"],
    ]

    if context.get("cycle") in (
        "P",
        "C",
    ):

        cycle_sql = (
            " AND t.cycle = %s "
        )

        params.append(
            context["cycle"]
        )

    else:

        cycle_sql = (
            " AND t.cycle IS NULL "
        )

    section = str(data.get("section") or context.get("section") or "").strip().upper()
    section_sql = ""
    if section:
        section_sql = " AND COALESCE(t.section, 'A') = %s "
        params.append(section)

    entries = rows(
        f"""
        SELECT
            t.*,

            s.subject_code,
            s.subject_name,

            f.faculty_name,

            cf.faculty_name AS co_faculty_name

        FROM timetable t

        LEFT JOIN subject s
            ON s.subject_id =
               t.subject_id

        LEFT JOIN faculty f
            ON f.faculty_id =
               t.faculty_id

        LEFT JOIN faculty cf
            ON cf.faculty_id =
               t.co_faculty_id

        WHERE t.department_id = %s
          AND t.scheme_id = %s
          AND t.academic_year = %s
          AND t.semester_type = %s
          AND t.semester_id = %s

          {cycle_sql}
          {section_sql}

        ORDER BY
            FIELD(
                t.day,
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday'
            ),
            t.period
        """,
        tuple(params),
    )

    return ok(
        entries
    )


# ============================================================
# GENERATE
# ============================================================

@bp.post("/generate")
@require_auth(EDITORS)
def generate_timetable():

    payload = request.get_json(
        silent=True
    ) or {}

    context, missing = context_from(
        payload
    )

    if missing:

        return fail(
            "Missing timetable configuration: "
            + ", ".join(missing)
        )

    valid, message, semester = (
        _validate_semester_context(
            context
        )
    )

    if not valid:

        return fail(
            message,
            422,
        )

    constraint = _get_constraint(
        context
    )

    if not constraint:

        return fail(
            "No timetable constraints are configured "
            "for the selected department/semester. "
            "Configure timetable_constraints before generating.",
            422,
        )

    try:

        # Pass number_of_outputs from payload
        # to context for alternative generation.

        number_of_outputs = payload.get(
            "number_of_outputs",
            payload.get(
                "numberOfOutputs",
                payload.get(
                    "number_of_alternatives",
                    payload.get(
                        "numberOfAlternatives",
                        1,
                    ),
                ),
            ),
        )

        context["number_of_outputs"] = (
            number_of_outputs
        )

        context["generation_seed"] = (
            payload.get(
                "generation_seed",
                payload.get(
                    "generationSeed"
                ),
            )
        )

        # Forward proctors, electives, and assignments from payload to context
        context["proctor_b1_faculty_id"] = payload.get("proctor_b1_faculty_id") or payload.get("proctor_faculty_id")
        context["proctor_b2_faculty_id"] = payload.get("proctor_b2_faculty_id")
        context["proctor_faculty_id"] = context["proctor_b1_faculty_id"]
        context["selected_subjects"] = payload.get("selected_subjects") or payload.get("selected_subject_ids") or []
        context["component_assignments"] = payload.get("component_assignments") or {}
        context["assignments"] = payload.get("assignments") or []
        if payload.get("extra_occupied"):
            context["extra_occupied"] = payload.get("extra_occupied")
        if payload.get("active_timetables"):
            context["active_timetables"] = payload.get("active_timetables")
        if payload.get("period_timings"):
            context["period_timings"] = payload.get("period_timings")

        # Auto-persist provided assignments so database always reflects user selections
        incoming_assignments = payload.get("assignments") or []
        if incoming_assignments:
            for assign in incoming_assignments:
                try:
                    s_id = assign.get("subject_id")
                    f_id = assign.get("faculty_id")
                    comp = str(assign.get("component") or "Theory").strip().title()
                    a_role = str(assign.get("assignment_role") or "Main").strip().title()
                    a_year = str(assign.get("academic_year") or context.get("academic_year") or "").strip()
                    b_batch = assign.get("batch") or None
                    if s_id and f_id and comp in ("Theory", "Lab") and a_year:
                        if b_batch:
                            execute(
                                """
                                UPDATE faculty_subject_assignment_detail
                                SET status='Inactive', updated_at=NOW()
                                WHERE subject_id=%s AND academic_year=%s AND component=%s 
                                  AND (batch=%s OR assignment_role=%s) AND status='Active'
                                """,
                                (s_id, a_year, comp, b_batch, a_role),
                            )
                        else:
                            execute(
                                """
                                UPDATE faculty_subject_assignment_detail
                                SET status='Inactive', updated_at=NOW()
                                WHERE subject_id=%s AND academic_year=%s AND component=%s AND assignment_role=%s AND status='Active'
                                """,
                                (s_id, a_year, comp, a_role),
                            )
                        execute(
                            """
                            INSERT INTO faculty_subject_assignment_detail
                                (subject_id, faculty_id, component, assignment_role, academic_year, batch, status)
                            VALUES
                                (%s, %s, %s, %s, %s, %s, 'Active')
                            """,
                            (s_id, f_id, comp, a_role, a_year, b_batch),
                        )
                except Exception as e:
                    print(f"[WARN] Error syncing assignment for subject {assign.get('subject_id')}: {e}")

        result = generate(
            context
        )

    except Exception as exc:

        import traceback

        traceback.print_exc()

        return fail(
            f"Timetable generation error: {exc}",
            500,
        )

    if not result.get(
        "success"
    ):

        validation = (
            result.get(
                "validation"
            )
            or {}
        )

        errors = (
            validation.get(
                "errors"
            )
            or
            result.get(
                "errors"
            )
            or []
        )

        conflicts = (
            validation.get(
                "conflicts"
            )
            or
            result.get(
                "conflicts"
            )
            or []
        )

        if errors:

            message = " ".join(
                str(error)
                for error in errors
            )

        elif conflicts:

            message = (
                "Timetable generation failed "
                "because of timetable conflicts."
            )

        else:

            message = (
                "Timetable generation failed."
            )

        notify(
            "Timetable generation needs attention",
            message,
            "warning",
        )

        return fail(
            message,
            422,
            validation=validation,
            timetable=result.get(
                "timetable",
                [],
            ),
            conflicts=conflicts,
            warnings=result.get(
                "warnings",
                [],
            ),
            summary=result.get(
                "summary",
                {},
            ),
        )

    generated_entries = _normalize_project_entries(
        result.get(
            "timetable",
            [],
        )
    )

    # ========================================================
    # FACULTY ASSIGNMENT CHECK
    #
    # Major Projects are automatically bypassed inside
    # _verify_generated_faculty_assignments().
    # ========================================================

    assignment_guard = (
        _verify_generated_faculty_assignments(
            generated_entries,
            context,
        )
    )

    if not assignment_guard.get(
        "valid"
    ):

        message = (
            "Generated timetable does not match "
            "the current faculty assignments: "
            +
            " ".join(
                assignment_guard.get(
                    "errors",
                    [],
                )
            )
        )

        notify(
            "Timetable generation needs attention",
            message,
            "warning",
        )

        return fail(
            message,
            422,
            validation={
                "valid": False,
                "errors":
                    assignment_guard.get(
                        "errors",
                        [],
                    ),
                "conflicts": [],
            },
            timetable=generated_entries,
            conflicts=[],
            warnings=[],
            summary=result.get(
                "summary",
                {},
            ),
        )

    # ========================================================
    # NORMAL TIMETABLE VALIDATION
    # ========================================================

    validation = _validate_timetable_entries(
        generated_entries,
        constraint,
        context,
    )

    if not validation.get(
        "valid"
    ):

        message = (
            "Generated timetable contains "
            "validation conflicts."
        )

        notify(
            "Timetable generation needs attention",
            message,
            "warning",
        )

        return fail(
            message,
            422,
            validation=validation,
            timetable=generated_entries,
            conflicts=validation.get(
                "conflicts",
                [],
            ),
            warnings=validation.get(
                "warnings",
                [],
            ),
            summary=validation.get(
                "summary",
                {},
            ),
        )

    # ========================================================
    # VALIDATE ALTERNATIVES
    # ========================================================

    validated_alternatives = []

    for alternative in (
        result.get(
            "alternatives",
            []
        )
        or []
    ):

        if not isinstance(
            alternative,
            dict,
        ):
            continue

        alternative_entries = (
            alternative.get(
                "timetable",
                [],
            )
            or []
        )

        alternative_assignment_guard = (
            _verify_generated_faculty_assignments(
                alternative_entries,
                context,
            )
        )

        if not alternative_assignment_guard.get(
            "valid"
        ):
            continue

        alternative_validation = (
            _validate_timetable_entries(
                alternative_entries,
                constraint,
                context,
            )
        )

        if not alternative_validation.get(
            "valid"
        ):
            continue

        alternative = dict(
            alternative
        )

        alternative["validation"] = (
            alternative_validation
        )

        alternative["conflicts"] = (
            alternative_validation.get(
                "conflicts",
                [],
            )
        )

        alternative["warnings"] = (
            alternative_validation.get(
                "warnings",
                [],
            )
        )

        alternative["summary"] = (
            alternative.get(
                "summary"
            )
            or
            alternative_validation.get(
                "summary",
                {},
            )
        )

        validated_alternatives.append(
            alternative
        )

    # ========================================================
    # AUDIT
    # ========================================================

    audit(
        "Generated Timetable Proposal",
        "Timetables",
        str(context),
    )

    notify(
        "Timetable generated",
        "A timetable proposal was generated "
        "and is ready to save.",
        "success",
    )

    return ok(
        {
            "context": context,

            "timetable":
                generated_entries,

            "alternatives":
                validated_alternatives,

            "validation":
                validation,

            "conflicts":
                validation.get(
                    "conflicts",
                    [],
                ),

            "warnings":
                validation.get(
                    "warnings",
                    [],
                ),

            "summary":
                result.get(
                    "summary",
                    {},
                ),
        }
    )


# ============================================================
# VALIDATE
# ============================================================

@bp.post("/validate")
@require_auth()
def validate():

    payload = request.get_json(
        silent=True
    ) or {}

    entries = payload.get(
        "entries"
    )

    context, missing = context_from(
        payload
    )

    if (
        missing
        and
        entries is None
    ):

        return fail(
            "Provide timetable entries "
            "or a complete timetable context."
        )

    if not missing:

        valid, message, semester = (
            _validate_semester_context(
                context
            )
        )

        if not valid:

            return fail(
                message,
                422,
            )

    if entries is None:

        cycle_sql = ""

        params = [
            context["department_id"],
            context["scheme_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ]

        if context.get(
            "cycle"
        ) in (
            "P",
            "C",
        ):

            cycle_sql = (
                " AND t.cycle = %s "
            )

            params.append(
                context["cycle"]
            )

        else:

            cycle_sql = (
                " AND t.cycle IS NULL "
            )

        entries = rows(
            f"""
            SELECT
                t.*,

                s.subject_code,
                s.subject_name,

                f.faculty_name,

                cf.faculty_name
                    AS co_faculty_name

            FROM timetable t

            LEFT JOIN subject s
                ON s.subject_id =
                   t.subject_id

            LEFT JOIN faculty f
                ON f.faculty_id =
                   t.faculty_id

            LEFT JOIN faculty cf
                ON cf.faculty_id =
                   t.co_faculty_id

            WHERE t.department_id = %s
              AND t.scheme_id = %s
              AND t.academic_year = %s
              AND t.semester_type = %s
              AND t.semester_id = %s

              {cycle_sql}

            ORDER BY
                FIELD(
                    t.day,
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday'
                ),
                t.period
            """,
            tuple(params),
        )

    constraint = None

    if not missing:

        constraint = _get_constraint(
            context
        )

    entries = _normalize_project_entries(entries)

    assignment_guard = {
        "valid": True,
        "errors": [],
    }

    if not missing:

        assignment_guard = (
            _verify_generated_faculty_assignments(
                entries,
                context,
            )
        )

    result = _validate_timetable_entries(
        entries,
        constraint,
        context
        if not missing
        else None,
    )

    if not assignment_guard.get(
        "valid"
    ):

        result = dict(
            result or {}
        )

        result["valid"] = False

        result["errors"] = list(
            result.get(
                "errors"
            )
            or []
        ) + assignment_guard.get(
            "errors",
            [],
        )

    return ok(
        {
            "validation":
                result,

            "conflicts":
                result.get(
                    "conflicts",
                    [],
                ),

            "warnings":
                result.get(
                    "warnings",
                    [],
                ),

            "summary":
                result.get(
                    "summary",
                    {},
                ),
        }
    )


# ============================================================
# AI ENGINE STATUS (MODEL 3 / CP-SAT)
# ============================================================

@bp.get("/ai-status")
def ai_status():
    return ok({
        "ready": True,
        "engine": "Central ASFA Engine (CP-SAT)",
        "model": "Model 3 (OR-Tools CP-SAT)",
        "status": "active",
        "solver": "Google CP-SAT Solver",
        "n8n_available": False,
        "ollama_available": False,
    })


# ============================================================
# SAVE
# ============================================================

@bp.post("/save")
@require_auth(EDITORS)
def save():

    payload = request.get_json(
        silent=True
    ) or {}

    context, missing = context_from(
        payload
    )

    if missing:

        return fail(
            "Missing timetable configuration: "
            + ", ".join(missing)
        )

    valid, message, semester = (
        _validate_semester_context(
            context
        )
    )

    if not valid:

        return fail(
            message,
            422,
        )

    entries = _normalize_project_entries(
        payload.get("entries") or []
    )

    if not entries:

        return fail(
            "There are no timetable entries to save."
        )

    # ========================================================
    # VERIFY ENTRY CONTEXT
    # ========================================================

    for index, item in enumerate(
        entries
    ):

        for field in CONTEXT:

            if field in item:

                if str(
                    item[field]
                ) != str(
                    context[field]
                ):

                    return fail(
                        f"Entry {index + 1} "
                        f"does not belong to "
                        f"the selected timetable context."
                    )

        item_cycle = item.get(
            "cycle"
        )

        if context.get(
            "cycle"
        ) in (
            "P",
            "C",
        ):

            if (
                str(
                    item_cycle
                    or ""
                ).strip().upper()
                !=
                context["cycle"]
            ):

                return fail(
                    f"Entry {index + 1} "
                    f"must belong to "
                    f"{context['cycle']} Cycle."
                )

        else:

            if item_cycle not in (
                None,
                "",
            ):

                return fail(
                    f"Entry {index + 1} "
                    f"must not contain "
                    f"a P/C cycle for Semester 3-8."
                )

    # ========================================================
    # CONSTRAINT
    # ========================================================

    constraint = _get_constraint(
        context
    )

    if not constraint:

        return fail(
            "No timetable constraints are configured "
            "for the selected academic grouping. "
            "Configure timetable_constraints before saving.",
            422,
        )

    # ========================================================
    # FACULTY ASSIGNMENT GUARD
    #
    # Major Projects are bypassed here.
    # Normal subjects are still checked.
    # ========================================================

    assignment_guard = (
        _verify_generated_faculty_assignments(
            entries,
            context,
        )
    )

    if not assignment_guard.get(
        "valid"
    ):

        message = (
            "Timetable faculty assignments are outdated. "
            "Generate the timetable again after the faculty "
            "assignment changes: "
            +
            " ".join(
                assignment_guard.get(
                    "errors",
                    [],
                )
            )
        )

        notify(
            "Timetable save blocked",
            message,
            "warning",
        )

        return fail(
            message,
            422,
            validation={
                "valid": False,

                "errors":
                    assignment_guard.get(
                        "errors",
                        [],
                    ),

                "conflicts": [],
            },

            conflicts=[],

            warnings=[],
        )

    # ========================================================
    # TIMETABLE VALIDATION
    # ========================================================

    validation = _validate_timetable_entries(
        entries,
        constraint,
        context,
    )

    if not validation.get(
        "valid"
    ):

        return fail(
            "Timetable has validation conflicts "
            "and was not saved.",

            422,

            validation=validation,

            conflicts=validation.get(
                "conflicts",
                [],
            ),

            warnings=validation.get(
                "warnings",
                [],
            ),

            summary=validation.get(
                "summary",
                {},
            ),
        )

    # ========================================================
    # TRANSACTIONAL SAVE
    # ========================================================

    saved = 0

    with connection() as conn:

        cursor = conn.cursor()

        # ----------------------------------------------------
        # DELETE PREVIOUS TIMETABLE
        # ----------------------------------------------------

        sec = str(context.get("section") or payload.get("section") or "A").strip().upper()

        if context.get(
            "cycle"
        ) in (
            "P",
            "C",
        ):

            cursor.execute(
                """
                DELETE FROM timetable
                WHERE department_id = %s
                  AND scheme_id = %s
                  AND academic_year = %s
                  AND semester_type = %s
                  AND semester_id = %s
                  AND cycle = %s
                  AND COALESCE(section, 'A') = %s
                """,
                (
                    context[
                        "department_id"
                    ],
                    context[
                        "scheme_id"
                    ],
                    context[
                        "academic_year"
                    ],
                    context[
                        "semester_type"
                    ],
                    context[
                        "semester_id"
                    ],
                    context[
                        "cycle"
                    ],
                    sec,
                ),
            )

        else:

            cursor.execute(
                """
                DELETE FROM timetable
                WHERE department_id = %s
                  AND scheme_id = %s
                  AND academic_year = %s
                  AND semester_type = %s
                  AND semester_id = %s
                  AND cycle IS NULL
                  AND COALESCE(section, 'A') = %s
                """,
                (
                    context[
                        "department_id"
                    ],
                    context[
                        "scheme_id"
                    ],
                    context[
                        "academic_year"
                    ],
                    context[
                        "semester_type"
                    ],
                    context[
                        "semester_id"
                    ],
                    sec,
                ),
            )

        # ----------------------------------------------------
        # INSERT NEW TIMETABLE
        # ----------------------------------------------------

        for item in entries:
            item_sec = str(item.get("section") or sec or "A").strip().upper()

            cursor.execute(
                """
                INSERT INTO timetable (
                    department_id,
                    scheme_id,
                    academic_year,
                    semester_type,
                    semester_id,
                    cycle,
                    section,
                    day,
                    period,
                    subject_id,
                    faculty_id,
                    co_faculty_id,
                    component,
                    batch
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s
                )
                """,
                (
                    context[
                        "department_id"
                    ],
                    context[
                        "scheme_id"
                    ],
                    context[
                        "academic_year"
                    ],
                    context[
                        "semester_type"
                    ],
                    context[
                        "semester_id"
                    ],
                    context.get("cycle"),
                    item_sec,
                    item.get("day"),
                    item.get("period"),
                    item.get("subject_id"),
                    item.get("faculty_id"),
                    item.get("co_faculty_id"),
                    item.get("component") or "Theory",
                    item.get("batch"),
                ),
            )
            saved += 1

    # ========================================================
    # AUDIT
    # ========================================================

    audit(
        "Saved Timetable",
        "Timetables",
        str(context),
    )

    notify(
        "Timetable saved",
        "The generated timetable was validated "
        "and saved successfully.",
        "success",
    )

    return ok(
        {
            "saved_entries":
                saved,

            "validation":
                validation,

            "context":
                context,

            "cycle":
                context.get(
                    "cycle"
                ),
        },
        201,
    )