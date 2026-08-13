# backend/routes/catalog.py

from flask import Blueprint, request

from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.audit_service import audit


bp = Blueprint(
    "catalog",
    __name__,
    url_prefix="/api",
)

EDITORS = [
    "Admin",
    "Coordinator",
    "HOD",
]


# ============================================================
# ENTITY STATUS
# ============================================================

def status(entity, entity_id, active):
    execute(
        """
        INSERT INTO entity_status
            (entity_type, entity_id, is_active)
        VALUES
            (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            is_active = VALUES(is_active)
        """,
        (
            entity,
            entity_id,
            active,
        ),
    )


# ============================================================
# SUBJECTS
# ============================================================

@bp.get("/subjects")
@require_auth()
def subjects():

    filters = []
    params = []

    search = request.args.get(
        "search",
        "",
    ).strip()

    # --------------------------------------------------------
    # OPTIONAL FILTERS
    # --------------------------------------------------------

    for key, column in [
        ("department_id", "s.department_id"),
        ("scheme_id", "s.scheme_id"),
        ("semester_id", "s.semester_id"),
    ]:

        value = request.args.get(key)

        if value:
            filters.append(
                f"{column} = %s"
            )

            params.append(value)

    # --------------------------------------------------------
    # SEARCH
    # --------------------------------------------------------

    where_parts = [
        """
        (
            s.subject_code LIKE %s
            OR s.subject_name LIKE %s
        )
        """
    ]

    params = [
        f"%{search}%",
        f"%{search}%",
        *params,
    ]

    where_parts.extend(filters)

    where = " AND ".join(
        where_parts
    )

    # --------------------------------------------------------
    # IMPORTANT FIX
    #
    # subject_group MUST be LEFT JOIN.
    #
    # Previously:
    #
    # JOIN subject_group sg
    #
    # That removed subjects whose group_id was NULL or whose
    # group record did not exist.
    #
    # Subjects such as normal theory subjects can legitimately
    # have no subject_group record.
    # --------------------------------------------------------

    items = rows(
        f"""
        SELECT

            s.subject_id AS id,

            s.subject_id,

            s.subject_code AS code,

            s.subject_code,

            s.subject_name AS name,

            s.subject_name,

            s.department_id,

            s.teaching_department_id,

            s.scheme_id,

            s.semester_id,

            d.department_name AS department,

            sem.semester_no,

            sem.semester_no AS semester_number,

            sem.semester_no AS semester,

            sem.semester_type,

            sem.semester_type AS semesterType,

            sg.group_name,

            sg.group_name AS group_name,

            s.course_category,

            s.course_category AS category,

            s.course_structure,

            s.cycle,

            s.is_optional,

            s.is_optional AS optional,

            s.option_group_id,

            s.option_group_id AS optionGroupId,

            s.lecture_hours,

            s.tutorial_hours,

            s.practical_hours,

            s.credits,

            COALESCE(
                es.is_active,
                1
            ) AS is_active,

            COUNT(
                DISTINCT fs.faculty_id
            ) AS eligible_faculty,

            COUNT(
                DISTINCT CASE
                    WHEN a.status = 'Active'
                    THEN a.assignment_id
                END
            ) AS assignments

        FROM subject s

        INNER JOIN department d
            ON d.department_id =
               s.department_id

        INNER JOIN semester sem
            ON sem.semester_id =
               s.semester_id

        LEFT JOIN subject_group sg
            ON sg.group_id =
               s.group_id

        LEFT JOIN entity_status es
            ON es.entity_type =
               'subject'
            AND es.entity_id =
                s.subject_id

        LEFT JOIN faculty_subject fs
            ON fs.subject_id =
               s.subject_id

        LEFT JOIN faculty_subject_assignment a
            ON a.subject_id =
               s.subject_id
            AND a.status =
                'Active'

        WHERE
            {where}

        GROUP BY
            s.subject_id,
            s.subject_code,
            s.subject_name,
            s.department_id,
            s.teaching_department_id,
            s.scheme_id,
            s.semester_id,
            d.department_name,
            sem.semester_no,
            sem.semester_type,
            sg.group_name,
            s.course_category,
            s.course_structure,
            s.cycle,
            s.is_optional,
            s.option_group_id,
            s.lecture_hours,
            s.tutorial_hours,
            s.practical_hours,
            s.credits,
            es.is_active

        ORDER BY
            sem.semester_no DESC,
            s.subject_code
        """,
        tuple(params),
    )

    # --------------------------------------------------------
    # RESPONSE NORMALIZATION
    # --------------------------------------------------------

    for item in items:

        item["type"] = (
            "Lab"
            if int(
                item.get(
                    "practical_hours",
                    0,
                )
                or 0
            ) > 0
            else "Theory"
        )

        item["status"] = (
            "Active"
            if item.pop(
                "is_active",
                1,
            )
            else "Inactive"
        )

        item["is_active"] = (
            1
            if item["status"] == "Active"
            else 0
        )

        item["semester_no"] = (
            item.get("semester_no")
            or item.get("semester_number")
        )

        item["semester_number"] = (
            item.get("semester_number")
            or item.get("semester_no")
        )

        item["scheme_id"] = item.get("scheme_id")

        item["department_id"] = item.get(
            "department_id"
        )

        # L-T-P helper for frontend
        item["LTP"] = (
            f"{item.get('lecture_hours', 0)}-"
            f"{item.get('tutorial_hours', 0)}-"
            f"{item.get('practical_hours', 0)}"
        )

    return ok(items)


# ============================================================
# SUBJECT DETAIL
# ============================================================

@bp.get("/subjects/<int:subject_id>")
@require_auth()
def subject_detail(subject_id):

    item = row(
        """
        SELECT
            s.*,

            d.department_name
                AS department,

            sem.semester_no,

            sem.semester_type,

            sg.group_name

        FROM subject s

        INNER JOIN department d
            ON d.department_id =
               s.department_id

        INNER JOIN semester sem
            ON sem.semester_id =
               s.semester_id

        LEFT JOIN subject_group sg
            ON sg.group_id =
               s.group_id

        WHERE
            s.subject_id = %s
        """,
        (
            subject_id,
        ),
    )

    if not item:

        return fail(
            "Subject not found.",
            404,
        )

    item["eligible_faculty"] = rows(
        """
        SELECT
            f.faculty_id,
            f.faculty_name,
            f.designation,
            f.department_id,
            f.status

        FROM faculty_subject fs

        INNER JOIN faculty f
            ON f.faculty_id =
               fs.faculty_id

        WHERE
            fs.subject_id = %s

        ORDER BY
            f.faculty_name
        """,
        (
            subject_id,
        ),
    )

    item["assignments"] = rows(
        """
        SELECT
            a.assignment_id,
            a.faculty_id,
            a.academic_year,
            a.status,
            f.faculty_name

        FROM faculty_subject_assignment a

        INNER JOIN faculty f
            ON f.faculty_id =
               a.faculty_id

        WHERE
            a.subject_id = %s

        ORDER BY
            a.created_at DESC
        """,
        (
            subject_id,
        ),
    )

    return ok(item)


# ============================================================
# CREATE SUBJECT
# ============================================================

@bp.post("/subjects")
@require_auth(EDITORS)
def create_subject():

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    code = str(
        d.get(
            "code",
            "",
        )
    ).strip()

    name = str(
        d.get(
            "name",
            "",
        )
    ).strip()

    department_id = d.get(
        "department_id"
    )

    semester_id = d.get(
        "semester_id"
    )

    scheme_id = d.get(
        "scheme_id"
    )

    group_id = d.get(
        "group_id"
    )

    if not code:

        return fail(
            "Subject code is required."
        )

    if not name:

        return fail(
            "Subject name is required."
        )

    if not department_id:

        return fail(
            "Department is required."
        )

    if not semester_id:

        return fail(
            "Semester is required."
        )

    if not scheme_id:

        return fail(
            "Scheme is required."
        )

    # --------------------------------------------------------
    # VALIDATE REFERENCES
    # --------------------------------------------------------

    if not row(
        """
        SELECT 1
        FROM department
        WHERE department_id = %s
        """,
        (
            department_id,
        ),
    ):

        return fail(
            "Department not found.",
            404,
        )

    if not row(
        """
        SELECT 1
        FROM semester
        WHERE semester_id = %s
        """,
        (
            semester_id,
        ),
    ):

        return fail(
            "Semester not found.",
            404,
        )

    if not row(
        """
        SELECT 1
        FROM scheme
        WHERE scheme_id = %s
        """,
        (
            scheme_id,
        ),
    ):

        return fail(
            "Scheme not found.",
            404,
        )

    # --------------------------------------------------------
    # DUPLICATE CHECK
    # --------------------------------------------------------

    if row(
        """
        SELECT 1
        FROM subject

        WHERE
            subject_code = %s
            AND department_id = %s
            AND semester_id = %s
            AND scheme_id = %s
        """,
        (
            code,
            department_id,
            semester_id,
            scheme_id,
        ),
    ):

        return fail(
            "This subject already exists for "
            "the selected academic grouping.",
            409,
        )

    # --------------------------------------------------------
    # INSERT
    # --------------------------------------------------------

    result = execute(
        """
        INSERT INTO subject
        (
            subject_code,
            subject_name,
            department_id,
            teaching_department_id,
            semester_id,
            scheme_id,
            group_id,
            cycle,
            is_optional,
            option_group_id,
            lecture_hours,
            tutorial_hours,
            practical_hours,
            credits
        )

        VALUES
        (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            %s, %s
        )
        """,
        (
            code,
            name,
            department_id,
            d.get(
                "teaching_department_id"
            ),
            semester_id,
            scheme_id,
            group_id,
            d.get(
                "cycle"
            ),
            bool(
                d.get(
                    "is_optional",
                    False,
                )
            ),
            d.get(
                "option_group_id"
            ),
            int(
                d.get(
                    "lecture_hours",
                    0,
                )
                or 0
            ),
            int(
                d.get(
                    "tutorial_hours",
                    0,
                )
                or 0
            ),
            int(
                d.get(
                    "practical_hours",
                    0,
                )
                or 0
            ),
            int(
                d.get(
                    "credits",
                    0,
                )
                or 0
            ),
        ),
    )

    audit(
        "Created Subject",
        "Subjects",
        code,
    )

    return ok(
        {
            "id": result["id"],
        },
        201,
    )


# ============================================================
# UPDATE SUBJECT
# ============================================================

@bp.patch("/subjects/<int:subject_id>")
@require_auth(EDITORS)
def update_subject(subject_id):

    current = row(
        """
        SELECT *
        FROM subject
        WHERE subject_id = %s
        """,
        (
            subject_id,
        ),
    )

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    if not current:

        return fail(
            "Subject not found.",
            404,
        )

    fields = [
        (
            "subject_code",
            "code",
        ),
        (
            "subject_name",
            "name",
        ),
        (
            "department_id",
            "department_id",
        ),
        (
            "teaching_department_id",
            "teaching_department_id",
        ),
        (
            "semester_id",
            "semester_id",
        ),
        (
            "scheme_id",
            "scheme_id",
        ),
        (
            "group_id",
            "group_id",
        ),
        (
            "cycle",
            "cycle",
        ),
        (
            "is_optional",
            "is_optional",
        ),
        (
            "option_group_id",
            "option_group_id",
        ),
        (
            "lecture_hours",
            "lecture_hours",
        ),
        (
            "tutorial_hours",
            "tutorial_hours",
        ),
        (
            "practical_hours",
            "practical_hours",
        ),
        (
            "credits",
            "credits",
        ),
    ]

    values = [
        d.get(
            key,
            current[column],
        )
        for column, key in fields
    ]

    execute(
        """
        UPDATE subject
        SET
        """
        + ",".join(
            f"{column}=%s"
            for column, _ in fields
        )
        + """
        WHERE subject_id=%s
        """,
        tuple(
            values
            + [
                subject_id,
            ]
        ),
    )

    audit(
        "Updated Subject",
        "Subjects",
        str(subject_id),
    )

    return ok(
        {
            "id": subject_id,
        }
    )


# ============================================================
# DEACTIVATE SUBJECT
# ============================================================

@bp.delete("/subjects/<int:subject_id>")
@require_auth(EDITORS)
def deactivate_subject(subject_id):

    if not row(
        """
        SELECT 1
        FROM subject
        WHERE subject_id = %s
        """,
        (
            subject_id,
        ),
    ):

        return fail(
            "Subject not found.",
            404,
        )

    status(
        "subject",
        subject_id,
        False,
    )

    audit(
        "Deactivated Subject",
        "Subjects",
        str(subject_id),
    )

    return ok(
        {
            "id": subject_id,
            "status": "Inactive",
        }
    )


# ============================================================
# SCHEMES
# ============================================================

@bp.get("/schemes")
@require_auth()
def schemes():

    items = rows(
        """
        SELECT

            sc.scheme_id AS id,

            sc.scheme_year,

            COALESCE(
                es.is_active,
                1
            ) AS is_active,

            COUNT(
                DISTINCT s.subject_id
            ) AS subjects,

            COUNT(
                DISTINCT s.department_id
            ) AS departments

        FROM scheme sc

        LEFT JOIN subject s
            ON s.scheme_id =
               sc.scheme_id

        LEFT JOIN entity_status es
            ON es.entity_type =
               'scheme'
            AND es.entity_id =
                sc.scheme_id

        GROUP BY
            sc.scheme_id,
            sc.scheme_year,
            es.is_active

        ORDER BY
            sc.scheme_year DESC
        """
    )

    for item in items:

        item["name"] = (
            f"VTU {item['scheme_year']} Scheme"
        )

        item["status"] = (
            "Active"
            if item.pop(
                "is_active",
                1,
            )
            else "Inactive"
        )

    return ok(items)


# ============================================================
# CREATE SCHEME
# ============================================================

@bp.post("/schemes")
@require_auth(EDITORS)
def create_scheme():

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    year = d.get(
        "scheme_year"
    )

    if not year:

        return fail(
            "Scheme year is required."
        )

    if row(
        """
        SELECT 1
        FROM scheme
        WHERE scheme_year = %s
        """,
        (
            year,
        ),
    ):

        return fail(
            "This scheme already exists.",
            409,
        )

    result = execute(
        """
        INSERT INTO scheme
            (scheme_year)
        VALUES
            (%s)
        """,
        (
            year,
        ),
    )

    audit(
        "Created Scheme",
        "Schemes",
        str(year),
    )

    return ok(
        {
            "id": result["id"],
            "scheme_year": year,
            "name": f"VTU {year} Scheme",
        },
        201,
    )


# ============================================================
# SEMESTERS
# ============================================================

@bp.get("/semesters")
@require_auth()
def semesters():

    return ok(
        rows(
            """
            SELECT
                semester_id,
                semester_id AS id,
                semester_no,
                semester_no AS semester_number,
                semester_type

            FROM semester

            ORDER BY
                semester_no
            """
        )
    )


# ============================================================
# CREATE SEMESTER
# ============================================================

@bp.post("/semesters")
@require_auth(EDITORS)
def create_semester():

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    semester_no = d.get(
        "semester_no"
    )

    semester_type = d.get(
        "semester_type"
    )

    if semester_no in (
        None,
        "",
    ):

        return fail(
            "Semester number is required."
        )

    if not semester_type:

        return fail(
            "Semester type is required."
        )

    if row(
        """
        SELECT 1
        FROM semester
        WHERE semester_no = %s
        """,
        (
            semester_no,
        ),
    ):

        return fail(
            "This semester already exists.",
            409,
        )

    result = execute(
        """
        INSERT INTO semester
            (
                semester_no,
                semester_type
            )
        VALUES
            (
                %s,
                %s
            )
        """,
        (
            semester_no,
            semester_type,
        ),
    )

    audit(
        "Created Semester",
        "Semesters",
        str(semester_no),
    )

    return ok(
        {
            "id": result["id"],
        },
        201,
    )


# ============================================================
# FACULTY ↔ SUBJECT ELIGIBILITY
# ============================================================

@bp.get("/faculty-subjects")
@require_auth()
def faculty_subjects():

    return ok(
        rows(
            """
            SELECT

                fs.faculty_subject_id AS id,

                fs.faculty_id,

                fs.subject_id,

                f.faculty_name,

                s.subject_code,

                s.subject_name

            FROM faculty_subject fs

            INNER JOIN faculty f
                ON f.faculty_id =
                   fs.faculty_id

            INNER JOIN subject s
                ON s.subject_id =
                   fs.subject_id

            ORDER BY
                f.faculty_name,
                s.subject_code
            """
        )
    )


@bp.post("/faculty-subjects")
@require_auth(EDITORS)
def add_eligibility():

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    if (
        not d.get("faculty_id")
        or not d.get("subject_id")
    ):

        return fail(
            "Faculty and subject are required."
        )

    if row(
        """
        SELECT 1
        FROM faculty_subject

        WHERE
            faculty_id = %s
            AND subject_id = %s
        """,
        (
            d["faculty_id"],
            d["subject_id"],
        ),
    ):

        return fail(
            "Eligibility already exists.",
            409,
        )

    result = execute(
        """
        INSERT INTO faculty_subject
            (
                faculty_id,
                subject_id
            )
        VALUES
            (
                %s,
                %s
            )
        """,
        (
            d["faculty_id"],
            d["subject_id"],
        ),
    )

    audit(
        "Added Faculty Subject Eligibility",
        "Faculty Subjects",
        str(result["id"]),
    )

    return ok(
        {
            "id": result["id"],
        },
        201,
    )


@bp.delete(
    "/faculty-subjects/<int:item_id>"
)
@require_auth(EDITORS)
def delete_eligibility(item_id):

    execute(
        """
        DELETE FROM faculty_subject
        WHERE faculty_subject_id = %s
        """,
        (
            item_id,
        ),
    )

    audit(
        "Removed Faculty Subject Eligibility",
        "Faculty Subjects",
        str(item_id),
    )

    return ok(
        {
            "id": item_id,
        }
    )


# ============================================================
# FACULTY ↔ SUBJECT ASSIGNMENTS
# ============================================================

@bp.get(
    "/faculty-subject-assignments"
)
@require_auth()
def assignments():

    academic_year = request.args.get(
        "academic_year",
        "",
    )

    department_id = request.args.get(
        "department_id",
        "",
    )

    semester_id = request.args.get(
        "semester_id",
        "",
    )

    semester_type = request.args.get(
        "semester_type",
        "",
    )

    filters = []
    params = []

    if academic_year:

        filters.append(
            "a.academic_year = %s"
        )

        params.append(
            academic_year
        )

    if department_id:

        filters.append(
            "s.department_id = %s"
        )

        params.append(
            department_id
        )

    if semester_id:

        filters.append(
            "s.semester_id = %s"
        )

        params.append(
            semester_id
        )

    if semester_type:

        filters.append(
            "sem.semester_type = %s"
        )

        params.append(
            semester_type
        )

    where = ""

    if filters:

        where = (
            "WHERE "
            + " AND ".join(filters)
        )

    return ok(
        rows(
            f"""
            SELECT

                a.assignment_id AS id,

                a.assignment_id,

                a.faculty_id,

                a.subject_id,

                a.academic_year,

                a.status,

                a.created_at,

                a.updated_at,

                f.faculty_name,

                f.department_id
                    AS faculty_department_id,

                f.designation,

                s.subject_code,

                s.subject_name,

                s.department_id
                    AS subject_department_id,

                s.semester_id,

                s.scheme_id,

                sem.semester_no,

                sem.semester_type

            FROM faculty_subject_assignment a

            INNER JOIN faculty f
                ON f.faculty_id =
                   a.faculty_id

            INNER JOIN subject s
                ON s.subject_id =
                   a.subject_id

            INNER JOIN semester sem
                ON sem.semester_id =
                   s.semester_id

            {where}

            ORDER BY
                a.created_at DESC
            """,
            tuple(params),
        )
    )


# ============================================================
# CREATE FACULTY SUBJECT ASSIGNMENT
# ============================================================

@bp.post(
    "/faculty-subject-assignments"
)
@require_auth(EDITORS)
def create_assignment():

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    faculty_id = d.get(
        "faculty_id"
    )

    subject_id = d.get(
        "subject_id"
    )

    academic_year = d.get(
        "academic_year"
    )

    if (
        not faculty_id
        or not subject_id
        or not academic_year
    ):

        return fail(
            "Faculty, subject, and academic year are required."
        )

    # This legacy endpoint represents a Theory/Main assignment.  The
    # component-aware endpoint below is used for Labs and Co-faculty.
    subject = row(
        """
        SELECT s.*, sem.semester_no, COALESCE(es.is_active, 1) AS is_active
        FROM subject s
        JOIN semester sem ON sem.semester_id = s.semester_id
        LEFT JOIN entity_status es
            ON es.entity_type = 'subject' AND es.entity_id = s.subject_id
        WHERE s.subject_id = %s
        """,
        (subject_id,),
    )

    if not subject:
        return fail("Subject not found.", 404)
    if not subject.get("is_active"):
        return fail("Subject is inactive.", 422)
    if int(subject.get("lecture_hours") or 0) + int(subject.get("tutorial_hours") or 0) <= 0:
        return fail(
            "This subject has no Theory component. Use the component assignment endpoint for Lab assignments.",
            422,
        )

    faculty = row(
        """
        SELECT faculty_id, faculty_name, status
        FROM faculty WHERE faculty_id = %s
        """,
        (faculty_id,),
    )
    if not faculty:
        return fail("Faculty member not found.", 404)
    if str(faculty.get("status") or "").lower() != "active":
        return fail("Faculty member is inactive.", 422)
    if not row(
        """
        SELECT 1 FROM faculty_subject
        WHERE faculty_id = %s AND subject_id = %s
        """,
        (faculty_id, subject_id),
    ):
        return fail(
            "Faculty is not eligible to teach this subject. Add faculty-subject eligibility first.",
            422,
        )

    # A faculty may cover Theory + Lab for the same subject, but may not
    # cover another subject in the same semester and academic year.
    conflict = row(
        """
        SELECT s.subject_code
        FROM faculty_subject_assignment_detail a
        JOIN subject s ON s.subject_id = a.subject_id
        WHERE a.faculty_id = %s
          AND a.academic_year = %s
          AND a.status = 'Active'
          AND s.semester_id = %s
          AND a.subject_id <> %s
        LIMIT 1
        """,
        (faculty_id, academic_year, subject["semester_id"], subject_id),
    )
    if conflict:
        return fail(
            "Faculty is already assigned to another subject in this semester "
            f"({conflict['subject_code']}).",
            409,
        )

    # --------------------------------------------------------
    # PREVENT DUPLICATE ACTIVE ASSIGNMENT
    # --------------------------------------------------------

    existing = row(
        """
        SELECT
            assignment_id,
            faculty_id,
            status

        FROM faculty_subject_assignment

        WHERE
            subject_id = %s
            AND academic_year = %s
            AND status = 'Active'

        ORDER BY
            assignment_id DESC

        LIMIT 1
        """,
        (
            subject_id,
            academic_year,
        ),
    )

    if existing:

        if (
            str(
                existing["faculty_id"]
            )
            == str(faculty_id)
        ):

            return ok(
                {
                    "id":
                        existing[
                            "assignment_id"
                        ],
                    "existing": True,
                }
            )

        # Deactivate previous faculty
        execute(
            """
            UPDATE faculty_subject_assignment

            SET
                status = 'Inactive'

            WHERE
                assignment_id = %s
            """,
            (
                existing[
                    "assignment_id"
                ],
            ),
        )

    result = execute(
        """
        INSERT INTO faculty_subject_assignment
        (
            faculty_id,
            subject_id,
            academic_year,
            status
        )

        VALUES
        (
            %s,
            %s,
            %s,
            'Active'
        )
        """,
        (
            faculty_id,
            subject_id,
            academic_year,
        ),
    )

    # Keep the component source of truth synchronized for older callers.
    execute(
        """
        INSERT INTO faculty_subject_assignment_detail
            (subject_id, faculty_id, academic_year, component, assignment_role, status)
        VALUES (%s, %s, %s, 'Theory', 'Main', 'Active')
        ON DUPLICATE KEY UPDATE
            faculty_id = VALUES(faculty_id),
            status = 'Active',
            updated_at = NOW()
        """,
        (subject_id, faculty_id, academic_year),
    )

    audit(
        "Created Faculty Subject Assignment",
        "Assignments",
        str(result["id"]),
    )

    return ok(
        {
            "id": result["id"],
        },
        201,
    )


# ============================================================
# UPDATE FACULTY SUBJECT ASSIGNMENT
# ============================================================

@bp.patch(
    "/faculty-subject-assignments/<int:assignment_id>"
)
@require_auth(EDITORS)
def update_assignment(
    assignment_id
):

    current = row(
        """
        SELECT *
        FROM faculty_subject_assignment

        WHERE
            assignment_id = %s
        """,
        (
            assignment_id,
        ),
    )

    if not current:

        return fail(
            "Faculty subject assignment not found.",
            404,
        )

    d = (
        request.get_json(
            silent=True
        )
        or {}
    )

    status_value = d.get(
        "status",
        current["status"],
    )

    execute(
        """
        UPDATE faculty_subject_assignment

        SET
            status = %s

        WHERE
            assignment_id = %s
        """,
        (
            status_value,
            assignment_id,
        ),
    )

    audit(
        "Updated Faculty Subject Assignment",
        "Assignments",
        str(assignment_id),
    )

    return ok(
        {
            "id": assignment_id,
            "status": status_value,
        }
    )
