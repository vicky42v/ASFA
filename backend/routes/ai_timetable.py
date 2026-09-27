from flask import Blueprint, request

from backend.db import row, rows, connection
from backend.utils.http import ok, fail

from backend.services.timetable_validator import validate_entries


bp = Blueprint(
    "ai_timetable",
    __name__,
    url_prefix="/api/ai-timetable",
)


# ============================================================
# CONTEXT
# ============================================================

CONTEXT_FIELDS = (
    "department_id",
    "scheme_id",
    "academic_year",
    "semester_type",
    "semester_id",
)


# ============================================================
# HEALTH
# ============================================================

@bp.get("/health")
def health():

    return ok({
        "service": "ai-timetable",
        "status": "running",
    })


# ============================================================
# CONTEXT NORMALIZER
# ============================================================

def normalize_context(data):

    data = data or {}

    context = {}

    missing = []

    for field in CONTEXT_FIELDS:

        value = data.get(field)

        if value in (
            None,
            "",
        ):
            missing.append(field)

        context[field] = value

    if missing:

        return None, missing

    try:

        context["department_id"] = int(
            context["department_id"]
        )

        context["scheme_id"] = int(
            context["scheme_id"]
        )

        context["semester_id"] = int(
            context["semester_id"]
        )

    except (
        TypeError,
        ValueError,
    ):

        return None, [
            "department_id, scheme_id and semester_id "
            "must be integers."
        ]

    context["academic_year"] = str(
        context["academic_year"]
    ).strip()

    context["semester_type"] = str(
        context["semester_type"]
    ).strip()

    cycle = data.get("cycle")

    if cycle in (
        None,
        "",
    ):

        context["cycle"] = None

    else:

        cycle = str(
            cycle
        ).strip().upper()

        if cycle not in (
            "P",
            "C",
        ):

            return None, [
                "cycle must be P or C."
            ]

        context["cycle"] = cycle

    return context, []


# ============================================================
# SEMESTER VALIDATION
# ============================================================

def validate_context(context):

    semester = row(
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

    if not semester:

        return (
            False,
            "Selected semester does not exist.",
            None,
        )

    stored_type = str(
        semester.get("semester_type")
        or ""
    ).strip()

    selected_type = str(
        context.get("semester_type")
        or ""
    ).strip()

    if (
        stored_type
        and selected_type
        and stored_type.lower()
        != selected_type.lower()
    ):

        return (
            False,
            (
                f"Semester {semester.get('semester_no')} "
                f"belongs to {stored_type} semester type."
            ),
            semester,
        )

    semester_no = semester.get(
        "semester_no"
    )

    try:
        semester_no = int(
            semester_no
        )
    except (
        TypeError,
        ValueError,
    ):
        semester_no = 0

    context["semester_no"] = semester_no

    # --------------------------------------------------------
    # SEMESTER 1 / 2
    # --------------------------------------------------------

    if semester_no in (
        1,
        2,
    ):

        department_text = (
            f"{semester.get('department_name') or ''} "
            f"{semester.get('department_code') or ''}"
        ).lower()

        basic_science = (
            (
                "basic" in department_text
                and "science" in department_text
            )
            or "science and humanities"
            in department_text
            or department_text.strip()
            in (
                "bs",
                "bsc",
                "sh",
            )
        )

        if not basic_science:

            return (
                False,
                (
                    "Semester 1 and Semester 2 "
                    "must use the Basic Science department."
                ),
                semester,
            )

        if context.get("cycle") not in (
            "P",
            "C",
        ):

            return (
                False,
                (
                    "Semester 1 and Semester 2 "
                    "require P Cycle or C Cycle."
                ),
                semester,
            )

    else:

        # Semesters 3-8 should not carry a cycle.
        if context.get("cycle") not in (
            None,
            "",
        ):

            return (
                False,
                (
                    "Semester 3-8 must not contain "
                    "a P/C cycle."
                ),
                semester,
            )

        context["cycle"] = None

    return (
        True,
        None,
        semester,
    )


# ============================================================
# CONSTRAINT
# ============================================================

def get_constraint(context):

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
# VERIFY FACULTY ASSIGNMENTS
# ============================================================

def verify_faculty_assignments(
    entries,
    context,
):

    if not entries:

        return {
            "valid": True,
            "errors": [],
        }

    subject_ids = sorted({
        int(item["subject_id"])
        for item in entries
        if item.get("subject_id")
        is not None
    })

    if not subject_ids:

        return {
            "valid": True,
            "errors": [],
        }

    placeholders = ", ".join(
        ["%s"] * len(subject_ids)
    )

    assignments = rows(
        f"""
        SELECT
            d.subject_id,
            d.faculty_id,
            d.component,
            d.assignment_role,
            f.faculty_name
        FROM faculty_subject_assignment_detail d

        JOIN faculty f
            ON f.faculty_id = d.faculty_id

        JOIN subject s
            ON s.subject_id = d.subject_id

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
              {placeholders}
          )

        ORDER BY d.detail_id DESC
        """,
        (
            context["academic_year"],
            context["department_id"],
            context["scheme_id"],
            context["semester_id"],
            *subject_ids,
        ),
    )

    expected = {}

    for item in assignments:

        subject_id = int(
            item["subject_id"]
        )

        component = str(
            item.get("component")
            or ""
        ).strip().title()

        role = str(
            item.get("assignment_role")
            or ""
        ).strip().title()

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

        if key not in expected:

            expected[key] = {
                "faculty_id": int(
                    item["faculty_id"]
                ),
                "faculty_name":
                    item.get(
                        "faculty_name"
                    ),
            }

    errors = []

    for item in entries:

        subject_id = int(
            item["subject_id"]
        )

        component = str(
            item.get("component")
            or "Theory"
        ).strip().title()

        generated_faculty = item.get(
            "faculty_id"
        )

        expected_main = expected.get(
            (
                subject_id,
                component,
                "Main",
            )
        )

        if not expected_main:

            errors.append(
                (
                    f"Subject {subject_id} "
                    f"({component}) has no active "
                    f"Main faculty assignment."
                )
            )

            continue

        try:

            generated_faculty = int(
                generated_faculty
            )

        except (
            TypeError,
            ValueError,
        ):

            errors.append(
                (
                    f"Subject {subject_id} "
                    f"has invalid faculty_id."
                )
            )

            continue

        if (
            generated_faculty
            != expected_main["faculty_id"]
        ):

            errors.append(
                (
                    f"Subject {subject_id} "
                    f"({component}) must use faculty "
                    f"{expected_main['faculty_id']} "
                    f"({expected_main['faculty_name']})."
                )
            )

        # ----------------------------------------------------
        # CO FACULTY
        # ----------------------------------------------------

        generated_co = item.get(
            "co_faculty_id"
        )

        if component != "Lab":

            if generated_co not in (
                None,
                "",
            ):

                errors.append(
                    (
                        f"Subject {subject_id} "
                        "Theory cannot have a Co faculty."
                    )
                )

            continue

        expected_co = expected.get(
            (
                subject_id,
                "Lab",
                "Co",
            )
        )

        if generated_co in (
            None,
            "",
        ):

            continue

        if not expected_co:

            errors.append(
                (
                    f"Subject {subject_id} "
                    "has no active Lab Co faculty assignment."
                )
            )

            continue

        try:

            generated_co = int(
                generated_co
            )

        except (
            TypeError,
            ValueError,
        ):

            errors.append(
                (
                    f"Subject {subject_id} "
                    "has invalid co_faculty_id."
                )
            )

            continue

        if (
            generated_co
            != expected_co["faculty_id"]
        ):

            errors.append(
                (
                    f"Subject {subject_id} Lab "
                    f"must use Co faculty "
                    f"{expected_co['faculty_id']} "
                    f"({expected_co['faculty_name']})."
                )
            )

    return {
        "valid": not errors,
        "errors": errors,
    }


# ============================================================
# NORMALIZE AI ENTRIES
# ============================================================

def normalize_entries(
    entries,
    context,
):

    if not isinstance(
        entries,
        list,
    ):

        return None, [
            "timetable must be an array."
        ]

    normalized = []

    allowed_days = {
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    }

    for index, item in enumerate(
        entries
    ):

        if not isinstance(
            item,
            dict,
        ):

            return None, [
                f"Timetable entry {index + 1} "
                "must be an object."
            ]

        day = str(
            item.get("day")
            or ""
        ).strip()

        if day not in allowed_days:

            return None, [
                (
                    f"Timetable entry {index + 1} "
                    f"has invalid day: {day}"
                )
            ]

        try:

            period = int(
                item.get("period")
            )

            subject_id = int(
                item.get("subject_id")
            )

            faculty_id = int(
                item.get("faculty_id")
            )

        except (
            TypeError,
            ValueError,
        ):

            return None, [
                (
                    f"Timetable entry {index + 1} "
                    "contains invalid numeric values."
                )
            ]

        component = str(
            item.get("component")
            or "Theory"
        ).strip().title()

        if component not in (
            "Theory",
            "Lab",
        ):

            return None, [
                (
                    f"Timetable entry {index + 1} "
                    "component must be Theory or Lab."
                )
            ]

        co_faculty_id = item.get(
            "co_faculty_id"
        )

        if co_faculty_id in (
            None,
            "",
        ):

            co_faculty_id = None

        else:

            try:

                co_faculty_id = int(
                    co_faculty_id
                )

            except (
                TypeError,
                ValueError,
            ):

                return None, [
                    (
                        f"Timetable entry {index + 1} "
                        "has invalid co_faculty_id."
                    )
                ]

        # ----------------------------------------------------
        # AI MUST NOT CHANGE CONTEXT
        # ----------------------------------------------------

        for field in CONTEXT_FIELDS:

            if field in item:

                if str(
                    item[field]
                ) != str(
                    context[field]
                ):

                    return None, [
                        (
                            f"Timetable entry {index + 1} "
                            f"does not belong to "
                            f"{field}={context[field]}."
                        )
                    ]

        item_cycle = item.get(
            "cycle"
        )

        if context.get("cycle") in (
            "P",
            "C",
        ):

            if str(
                item_cycle or ""
            ).strip().upper() != context[
                "cycle"
            ]:

                return None, [
                    (
                        f"Timetable entry {index + 1} "
                        f"must belong to "
                        f"{context['cycle']} Cycle."
                    )
                ]

        else:

            if item_cycle not in (
                None,
                "",
            ):

                return None, [
                    (
                        f"Timetable entry {index + 1} "
                        "must not contain a cycle."
                    )
                ]

        normalized.append({
            "day": day,
            "period": period,
            "subject_id": subject_id,
            "faculty_id": faculty_id,
            "co_faculty_id": co_faculty_id,
            "component": component,
        })

    return normalized, []


# ============================================================
# SAVE AI TIMETABLE
# ============================================================

@bp.post("/n8n-result")
def n8n_result():

    payload = request.get_json(
        silent=True
    ) or {}

    if not payload:

        return fail(
            "Empty JSON request body.",
            400,
        )

    # --------------------------------------------------------
    # CONTEXT
    # --------------------------------------------------------

    incoming_context = (
        payload.get("context")
        or {}
    )

    context, missing = normalize_context(
        incoming_context
    )

    if missing:

        return fail(
            "Invalid timetable context: "
            + ", ".join(missing),
            400,
        )

    valid, message, semester = (
        validate_context(
            context
        )
    )

    if not valid:

        return fail(
            message,
            422,
        )

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    status = str(
        payload.get("status")
        or ""
    ).strip().lower()

    if status not in (
        "success",
        "resolved",
        "resolved_with_warnings",
    ):

        return fail(
            "Qwen did not return a successful timetable.",
            422,
            status=status,
            explanation=payload.get(
                "explanation"
            ),
            conflicts=payload.get(
                "conflicts",
                [],
            ),
        )

    # --------------------------------------------------------
    # CONFLICTS
    # --------------------------------------------------------

    conflicts = payload.get(
        "conflicts"
        or []
    )

    if conflicts:

        return fail(
            "Qwen returned unresolved conflicts.",
            422,
            conflicts=conflicts,
            explanation=payload.get(
                "explanation"
            ),
        )

    # --------------------------------------------------------
    # ENTRIES
    # --------------------------------------------------------

    raw_entries = payload.get(
        "timetable"
    )

    entries, errors = normalize_entries(
        raw_entries,
        context,
    )

    if errors:

        return fail(
            "Invalid AI timetable: "
            + " ".join(errors),
            422,
        )

    if not entries:

        return fail(
            "Qwen returned an empty timetable.",
            422,
        )

    # --------------------------------------------------------
    # CONSTRAINT
    # --------------------------------------------------------

    constraint = get_constraint(
        context
    )

    if not constraint:

        return fail(
            (
                "No timetable constraints are configured "
                "for this exact academic context."
            ),
            422,
        )

    # --------------------------------------------------------
    # FACULTY ASSIGNMENT GUARD
    # --------------------------------------------------------

    assignment_guard = (
        verify_faculty_assignments(
            entries,
            context,
        )
    )

    if not assignment_guard.get(
        "valid"
    ):

        return fail(
            (
                "Qwen timetable uses faculty assignments "
                "that do not match the current database assignments."
            ),
            422,
            conflicts=[],
            validation={
                "valid": False,
                "errors": assignment_guard.get(
                    "errors",
                    [],
                ),
                "conflicts": [],
            },
        )

    # --------------------------------------------------------
    # BACKEND VALIDATION
    # --------------------------------------------------------

    validation = validate_entries(
        entries,
        constraint,
        context,
    )

    if not validation.get(
        "valid",
        False,
    ):

        return fail(
            (
                "Qwen timetable failed the backend "
                "timetable validator."
            ),
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
        )

    # --------------------------------------------------------
    # DELETE + INSERT
    # --------------------------------------------------------

    saved = 0

    try:

        with connection() as conn:

            cursor = conn.cursor()

            if context.get("cycle") in (
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

                cursor.execute(
                    """
                    DELETE FROM timetable
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

            for item in entries:

                cursor.execute(
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
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s
                    )
                    """,
                    (
                        context["department_id"],
                        context["scheme_id"],
                        context["academic_year"],
                        context["semester_type"],
                        context["semester_id"],
                        context.get("cycle"),
                        item["day"],
                        item["period"],
                        item["subject_id"],
                        item["faculty_id"],
                        item["co_faculty_id"],
                        item["component"],
                    ),
                )

                saved += 1

            conn.commit()

    except Exception as error:

        print(
            "N8N AI timetable save error:",
            error,
        )

        return fail(
            (
                "The AI timetable was validated but "
                "could not be saved to MySQL."
            ),
            500,
            error=str(error),
        )

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return ok(
        {
            "status": "success",
            "source": "n8n + Ollama Qwen3 4B",
            "saved_entries": saved,
            "explanation": payload.get(
                "explanation",
                "",
            ),
            "context": context,
            "timetable": entries,
            "conflicts": [],
            "validation": validation,
        },
        201,
    )