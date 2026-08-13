from flask import Blueprint, request

from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.timetable_service import generate
from backend.services.timetable_validator import validate_entries
from backend.services.audit_service import audit, notify


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

    cycle = data.get("cycle")

    if cycle not in (None, ""):
        cycle = str(cycle).strip().upper()

        if cycle not in ("P", "C"):
            return None, [
                "cycle must be P or C"
            ]

        context["cycle"] = cycle
    else:
        context["cycle"] = None

    return context, []


# ============================================================
# SEMESTER INFORMATION
# ============================================================

def _get_semester(context):
    return row(
        """
        SELECT
            sem.*,
            d.department_name,
            d.department_code
        FROM semester sem
        LEFT JOIN department d
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
# SEMESTER / CYCLE VALIDATION
# ============================================================

def _validate_semester_context(context):
    semester = _get_semester(context)

    if not semester:
        return (
            False,
            "Selected semester does not exist.",
            None,
        )

    try:
        semester_no = int(
            semester.get("semester_no")
        )
    except (TypeError, ValueError):
        semester_no = 0

    context["semester_no"] = semester_no

    if semester_no in (1, 2):

        if not _is_basic_science(semester):
            return (
                False,
                "Semester 1 and Semester 2 can only be handled under the Basic Science department.",
                semester,
            )

        cycle = context.get("cycle")

        if cycle not in ("P", "C"):
            return (
                False,
                "Select P Cycle or C Cycle for Semester 1 or Semester 2.",
                semester,
            )

    else:
        context["cycle"] = None

    return True, None, semester


# ============================================================
# CONSTRAINT HELPER
# ============================================================

def _get_constraint(context):

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
        (
            context["department_id"],
            context["scheme_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ),
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

    return fallback


# ============================================================
# LIST TIMETABLE
# ============================================================

@bp.get("")
@require_auth()
def list_timetable():

    data = request.args.to_dict()

    context, missing = context_from(data)

    if missing:
        return fail(
            "Missing timetable filter: "
            + ", ".join(missing)
        )

    valid, message, semester = _validate_semester_context(
        context
    )

    if not valid:
        return fail(message, 422)

    cycle_sql = ""
    params = [
        context["department_id"],
        context["scheme_id"],
        context["academic_year"],
        context["semester_type"],
        context["semester_id"],
    ]

    if context.get("cycle") in ("P", "C"):
        cycle_sql = " AND t.cycle = %s "
        params.append(context["cycle"])
    else:
        cycle_sql = " AND t.cycle IS NULL "

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
            ON s.subject_id = t.subject_id

        LEFT JOIN faculty f
            ON f.faculty_id = t.faculty_id

        LEFT JOIN faculty cf
            ON cf.faculty_id = t.co_faculty_id

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

    return ok(entries)


# ============================================================
# GENERATE
# ============================================================

@bp.post("/generate")
@require_auth(EDITORS)
def generate_timetable():

    payload = request.get_json(
        silent=True
    ) or {}

    context, missing = context_from(payload)

    if missing:
        return fail(
            "Missing timetable configuration: "
            + ", ".join(missing)
        )

    valid, message, semester = _validate_semester_context(
        context
    )

    if not valid:
        return fail(message, 422)

    constraint = _get_constraint(context)

    if not constraint:
        return fail(
            "No timetable rules are configured for the selected department, academic year and semester.",
            422,
        )

    try:
        # Pass number_of_outputs from payload to context for alternative generation
        number_of_outputs = payload.get(
            "number_of_outputs",
            payload.get("number_of_alternatives", 1),
        )
        context["number_of_outputs"] = number_of_outputs

        result = generate(context)

    except Exception as exc:

        import traceback
        traceback.print_exc()

        return fail(
            f"Timetable generation error: {exc}",
            500,
        )

    if not result.get("success"):

        validation = (
            result.get("validation")
            or {}
        )

        errors = (
            validation.get("errors")
            or result.get("errors")
            or []
        )

        conflicts = (
            validation.get("conflicts")
            or result.get("conflicts")
            or []
        )

        if errors:
            message = " ".join(
                str(error)
                for error in errors
            )
        elif conflicts:
            message = (
                "Timetable generation failed because of timetable conflicts."
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

    generated_entries = result.get(
        "timetable",
        [],
    )

    validation = validate_entries(
        generated_entries,
        constraint,
        context,
    )

    if not validation.get("valid"):

        message = (
            "Generated timetable contains validation conflicts."
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

    audit(
        "Generated Timetable Proposal",
        "Timetables",
        str(context),
    )

    notify(
        "Timetable generated",
        "A timetable proposal was generated and is ready to save.",
        "success",
    )

    return ok(
        {
            "context": context,
            "timetable": generated_entries,
            "alternatives": result.get(
                "alternatives",
                [],
            ),
            "validation": validation,
            "conflicts": validation.get(
                "conflicts",
                [],
            ),
            "warnings": validation.get(
                "warnings",
                [],
            ),
            "summary": result.get(
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

    entries = payload.get("entries")

    context, missing = context_from(payload)

    if missing and entries is None:
        return fail(
            "Provide timetable entries or a complete timetable context."
        )

    if not missing:

        valid, message, semester = _validate_semester_context(
            context
        )

        if not valid:
            return fail(message, 422)

    if entries is None:

        cycle_sql = ""
        params = [
            context["department_id"],
            context["scheme_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ]

        if context.get("cycle") in ("P", "C"):
            cycle_sql = " AND t.cycle = %s "
            params.append(context["cycle"])
        else:
            cycle_sql = " AND t.cycle IS NULL "

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
                ON s.subject_id = t.subject_id

            LEFT JOIN faculty f
                ON f.faculty_id = t.faculty_id

            LEFT JOIN faculty cf
                ON cf.faculty_id = t.co_faculty_id

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
        constraint = _get_constraint(context)

    result = validate_entries(
        entries,
        constraint,
        context if not missing else None,
    )

    return ok(
        {
            "validation": result,
            "conflicts": result.get(
                "conflicts",
                [],
            ),
            "warnings": result.get(
                "warnings",
                [],
            ),
            "summary": result.get(
                "summary",
                {},
            ),
        }
    )


# ============================================================
# SAVE
# ============================================================

@bp.post("/save")
@require_auth(EDITORS)
def save():

    payload = request.get_json(
        silent=True
    ) or {}

    context, missing = context_from(payload)

    if missing:
        return fail(
            "Missing timetable configuration: "
            + ", ".join(missing)
        )

    valid, message, semester = _validate_semester_context(
        context
    )

    if not valid:
        return fail(message, 422)

    entries = payload.get("entries") or []

    if not entries:
        return fail(
            "There are no timetable entries to save."
        )

    # --------------------------------------------------------
    # Verify entry context
    # --------------------------------------------------------

    for index, item in enumerate(entries):

        for field in CONTEXT:

            if field in item:

                if str(item[field]) != str(
                    context[field]
                ):

                    return fail(
                        f"Entry {index + 1} does not belong to the selected timetable context."
                    )

        if context.get("cycle") in ("P", "C"):

            item_cycle = item.get("cycle")

            if (
                item_cycle not in (None, "")
                and str(item_cycle).upper()
                != context["cycle"]
            ):
                return fail(
                    f"Entry {index + 1} belongs to a different cycle."
                )

    # --------------------------------------------------------
    # Existing timetable
    # --------------------------------------------------------

    if context.get("cycle") in ("P", "C"):

        existing = row(
            """
            SELECT COUNT(*) AS count
            FROM timetable
            WHERE department_id = %s
              AND scheme_id = %s
              AND academic_year = %s
              AND semester_type = %s
              AND semester_id = %s
              AND cycle = %s
            """,
            (
                context["department_id"],
                context["scheme_id"],
                context["academic_year"],
                context["semester_type"],
                context["semester_id"],
                context["cycle"],
            ),
        )

    else:

        existing = row(
            """
            SELECT COUNT(*) AS count
            FROM timetable
            WHERE department_id = %s
              AND scheme_id = %s
              AND academic_year = %s
              AND semester_type = %s
              AND semester_id = %s
              AND cycle IS NULL
            """,
            (
                context["department_id"],
                context["scheme_id"],
                context["academic_year"],
                context["semester_type"],
                context["semester_id"],
            ),
        )

    if existing and int(
        existing.get("count", 0)
    ) > 0:

        return fail(
            "A timetable already exists for this exact academic grouping and cycle. Existing records were preserved.",
            409,
        )

    constraint = _get_constraint(context)

    if not constraint:
        return fail(
            "No timetable rules are configured for this academic grouping.",
            422,
        )

    validation = validate_entries(
        entries,
        constraint,
        context,
    )

    if not validation.get("valid"):

        return fail(
            "Timetable has validation conflicts and was not saved.",
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

    # --------------------------------------------------------
    # SAVE
    # --------------------------------------------------------

    saved = 0

    for item in entries:

        execute(
            """
            INSERT INTO timetable (
                department_id,
                scheme_id,
                academic_year,
                semester_type,
                semester_id,
                cycle,
                day,
                period,
                subject_id,
                faculty_id,
                co_faculty_id,
                component
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
                %s
            )
            """,
            (
                context["department_id"],
                context["scheme_id"],
                context["academic_year"],
                context["semester_type"],
                context["semester_id"],
                context.get("cycle"),
                item.get("day"),
                item.get("period"),
                item.get("subject_id"),
                item.get("faculty_id"),
                item.get("co_faculty_id"),
                item.get("component", "Theory"),
            ),
        )

        saved += 1

    audit(
        "Saved Timetable",
        "Timetables",
        str(context),
    )

    notify(
        "Timetable saved",
        "The generated timetable was validated and saved successfully.",
        "success",
    )

    return ok(
        {
            "saved_entries": saved,
            "validation": validation,
            "context": context,
            "cycle": context.get("cycle"),
        },
        201,
    )
