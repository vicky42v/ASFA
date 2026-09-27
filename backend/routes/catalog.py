# backend/routes/catalog.py

from flask import Blueprint, request

from backend.db import connection, row, rows, execute
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
# WORKLOAD POLICY
# ============================================================

def workload_bounds(faculty):
    """
    Return (minimum, maximum) workload hours for a faculty member.

    Policy:
      Assistant Professor -> 16-18
      Associate Professor -> 14-16
      Professor            -> 14-16
      HOD                  -> 8-12

    HOD takes precedence over designation.
    """
    # A value explicitly configured for a faculty member is the source of
    # truth.  The designation policy is a fallback for the imported rows
    # where max_workload is still 0.
    configured_min = int(faculty.get("min_workload") or 0)
    configured_max = int(faculty.get("max_workload") or 0)
    if configured_max > 0:
        return configured_min, configured_max

    designation = str(
        faculty.get("designation") or ""
    ).strip().lower()

    role = str(
        faculty.get("role") or ""
    ).strip().lower()

    if (
        role == "hod"
        or "hod" in designation
        or "head of the department" in designation
        or "head of department" in designation
    ):
        return 8, 12

    if "assistant professor" in designation:
        return 16, 18

    if "associate professor" in designation:
        return 14, 16

    if (
        designation == "professor"
        or designation.startswith("professor ")
    ):
        return 14, 16

    return (
        int(faculty.get("min_workload") or 0),
        int(faculty.get("max_workload") or 18),
    )


def component_hours(subject, component):
    if component == "Theory":
        return (
            int(subject.get("lecture_hours") or 0)
            + int(subject.get("tutorial_hours") or 0)
        )

    if component == "Lab":
        return int(
            subject.get("practical_hours") or 0
        )

    return 0


def current_global_workload(
    faculty_id,
    academic_year,
    exclude_detail_id=None,
):
    """
    Workload is global across departments for an academic year.

    Every active component assignment contributes its full component
    hours. Lab Co-faculty therefore receives the same practical-hours
    credit as Lab Main.
    """
    filters = [
        "d.faculty_id = %s",
        "d.academic_year = %s",
        "d.status = 'Active'",
    ]
    params = [
        faculty_id,
        academic_year,
    ]

    if exclude_detail_id:
        filters.append(
            "d.detail_id <> %s"
        )
        params.append(
            exclude_detail_id
        )

    result = row(
        f"""
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN d.component = 'Theory'
                            THEN COALESCE(s.lecture_hours, 0)
                               + COALESCE(s.tutorial_hours, 0)
                        WHEN d.component = 'Lab'
                            THEN COALESCE(s.practical_hours, 0)
                        ELSE 0
                    END
                ),
                0
            ) AS total_hours
        FROM faculty_subject_assignment_detail d
        INNER JOIN subject s
            ON s.subject_id = d.subject_id
        WHERE {' AND '.join(filters)}
        """,
        tuple(params),
    )

    return float(
        result.get("total_hours", 0)
        if result
        else 0
    )


def get_faculty_for_workload(faculty_id):
    return row(
        """
        SELECT
            faculty_id,
            faculty_name,
            department_id,
            designation,
            role,
            min_workload,
            max_workload,
            status
        FROM faculty
        WHERE faculty_id = %s
        """,
        (faculty_id,),
    )


def validate_projected_workload(
    faculty_id,
    academic_year,
    added_hours,
    exclude_detail_id=None,
):
    faculty = get_faculty_for_workload(
        faculty_id
    )

    if not faculty:
        return {
            "ok": False,
            "error": "Faculty member not found.",
            "status": 404,
        }

    if str(
        faculty.get("status") or ""
    ).lower() != "active":
        return {
            "ok": False,
            "error": "Faculty member is inactive.",
            "status": 422,
        }

    minimum, maximum = workload_bounds(
        faculty
    )

    current = current_global_workload(
        faculty_id,
        academic_year,
        exclude_detail_id=exclude_detail_id,
    )

    projected = current + float(
        added_hours or 0
    )

    if projected > maximum:
        return {
            "ok": False,
            "error": (
                f"{faculty.get('faculty_name')} would have "
                f"{projected:g}h, exceeding the maximum "
                f"{maximum:g}h workload."
            ),
            "status": 422,
            "faculty": faculty,
            "current": current,
            "projected": projected,
            "minimum": minimum,
            "maximum": maximum,
        }

    return {
        "ok": True,
        "faculty": faculty,
        "current": current,
        "projected": projected,
        "minimum": minimum,
        "maximum": maximum,
    }


def workload_summary(faculty_id, academic_year):
    faculty = get_faculty_for_workload(
        faculty_id
    )

    if not faculty:
        return None

    minimum, maximum = workload_bounds(
        faculty
    )

    current = current_global_workload(
        faculty_id,
        academic_year,
    )

    return {
        "faculty_id": faculty["faculty_id"],
        "faculty_name": faculty["faculty_name"],
        "designation": faculty.get("designation"),
        "role": faculty.get("role"),
        "min_workload": minimum,
        "max_workload": maximum,
        "current_workload": current,
        "remaining_workload": max(
            0,
            maximum - current,
        ),
        "overloaded": current > maximum,
        "below_minimum": current < minimum,
    }


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
# DELETE DEPARTMENT
# ============================================================
#
# Used by the Departments screen's Edit/Delete mode.
#
# This is a REAL database delete, not a soft delete:
#   DELETE FROM department WHERE department_id = %s
#
# We intentionally do not silently delete subjects, faculty, timetables,
# or other dependent records. If MySQL has related rows protected by
# foreign keys, the API returns a clear conflict instead of partially
# deleting the department.
# ============================================================

@bp.delete("/departments/<int:department_id>")
@require_auth(["Admin"])
def delete_department(department_id):

    department = row(
        """
        SELECT
            department_id,
            department_name,
            department_code
        FROM department
        WHERE department_id = %s
        """,
        (department_id,),
    )

    if not department:
        return fail(
            "Department not found.",
            404,
        )

    try:
        # Remove any generic status entry first, if one exists.
        # This does not touch the department's actual data.
        execute(
            """
            DELETE FROM entity_status
            WHERE entity_type = 'department'
              AND entity_id = %s
            """,
            (department_id,),
        )

        # Hard delete from the actual department table.
        execute(
            """
            DELETE FROM department
            WHERE department_id = %s
            """,
            (department_id,),
        )

    except Exception as exc:
        # Do not hide an FK/data-integrity problem. The department stays
        # intact and the frontend receives a useful error message.
        error_text = str(exc)

        if (
            "foreign key" in error_text.lower()
            or "1451" in error_text
        ):
            return fail(
                "This department cannot be deleted because it still has "
                "related records such as subjects, faculty, or timetables. "
                "Remove those records first.",
                409,
            )

        return fail(
            f"Unable to delete department: {error_text}",
            500,
        )

    audit(
        "Deleted Department",
        "Departments",
        str(department_id),
    )

    return ok(
        {
            "id": department_id,
            "department_name": department["department_name"],
            "department_code": department.get("department_code"),
            "deleted": True,
        }
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

    scheme_id = request.args.get(
        "scheme_id",
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

    if scheme_id:

        filters.append(
            "s.scheme_id = %s"
        )

        params.append(
            scheme_id
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

def create_assignment_internal(faculty_id, subject_id, academic_year):
    """
    Save/replace the parent faculty assignment.

    IMPORTANT:
    faculty_subject_assignment_detail is the component-level source of truth
    used by timetable_service.py.

    Parent table:
        faculty_subject_assignment

    Detail table:
        faculty_subject_assignment_detail

    Theory/Main and Lab/Main are synchronized here. Existing Lab/Co rows are
    intentionally preserved when the Main faculty changes.
    """

    subject = row(
        """
        SELECT
            s.*,
            sem.semester_no,
            sem.semester_type,
            COALESCE(es.is_active, 1) AS is_active
        FROM subject s
        INNER JOIN semester sem
            ON sem.semester_id = s.semester_id
        LEFT JOIN entity_status es
            ON es.entity_type = 'subject'
           AND es.entity_id = s.subject_id
        WHERE s.subject_id = %s
        """,
        (subject_id,),
    )

    if not subject:
        return {
            "error": "Subject not found.",
            "status": 404,
        }

    if not subject.get("is_active"):
        return {
            "error": "Subject is inactive.",
            "status": 422,
        }

    faculty = get_faculty_for_workload(int(faculty_id))

    if not faculty:
        return {
            "error": "Faculty member not found.",
            "status": 404,
        }

    if str(faculty.get("status") or "").lower() != "active":
        return {
            "error": "Faculty member is inactive.",
            "status": 422,
        }

    # Keep eligibility synchronized with an explicit UI assignment.
    if not row(
        """
        SELECT 1
        FROM faculty_subject
        WHERE faculty_id = %s
          AND subject_id = %s
        LIMIT 1
        """,
        (faculty_id, subject_id),
    ):
        execute(
            """
            INSERT INTO faculty_subject
                (faculty_id, subject_id)
            VALUES
                (%s, %s)
            """,
            (faculty_id, subject_id),
        )

    existing = row(
        """
        SELECT
            assignment_id,
            faculty_id
        FROM faculty_subject_assignment
        WHERE
            subject_id = %s
            AND academic_year = %s
            AND status = 'Active'
        ORDER BY assignment_id DESC
        LIMIT 1
        """,
        (subject_id, academic_year),
    )

    # Same parent assignment: no new parent row is needed. The component
    # detail save will still update the selected component.
    if existing and str(existing["faculty_id"]) == str(faculty_id):
        return {
            "id": existing["assignment_id"],
            "existing": True,
        }

    if existing:
        execute(
            """
            UPDATE faculty_subject_assignment
            SET
                status = 'Inactive',
                updated_at = NOW()
            WHERE assignment_id = %s
            """,
            (existing["assignment_id"],),
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

    assignment_id = result["id"]

    # Component rows are intentionally NOT rewritten here.
    # /faculty-assignment-details is responsible for the exact
    # Theory/Main or Lab/Main row being saved. This prevents changing
    # Theory faculty from accidentally overwriting Lab faculty.

    return {
        "id": assignment_id,
        "existing": False,
    }


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

    faculty_id = d.get("faculty_id")
    subject_id = d.get("subject_id")
    academic_year = str(
        d.get("academic_year") or ""
    ).strip()

    if (
        not faculty_id
        or not subject_id
        or not academic_year
    ):
        return fail(
            "Faculty, subject, and academic year are required."
        )

    result = create_assignment_internal(
        faculty_id=int(faculty_id),
        subject_id=int(subject_id),
        academic_year=academic_year,
    )

    if result.get("error"):
        return fail(
            result["error"],
            result.get("status", 422),
        )

    audit(
        "Created Faculty Subject Assignment",
        "Assignments",
        str(result["id"]),
    )

    return ok(
        {
            "id": result["id"],
            "faculty_id": int(faculty_id),
            "subject_id": int(subject_id),
            "academic_year": academic_year,
            "status": "Active",
            "existing": bool(result.get("existing")),
        },
        201 if not result.get("existing") else 200,
    )


@bp.get("/faculty-workload")
@require_auth()
def faculty_workload():

    academic_year = str(
        request.args.get(
            "academic_year",
            "",
        )
    ).strip()

    department_id = request.args.get(
        "department_id",
        "",
    )

    if not academic_year:
        return fail(
            "Academic year is required."
        )

    filters = []
    params = []

    if department_id:
        filters.append(
            "f.department_id = %s"
        )
        params.append(
            department_id
        )

    where = (
        "WHERE " + " AND ".join(filters)
        if filters
        else ""
    )

    faculty_list = rows(
        f"""
        SELECT
            f.faculty_id,
            f.faculty_name,
            f.department_id,
            f.designation,
            f.role,
            f.min_workload,
            f.max_workload,
            f.status
        FROM faculty f
        {where}
        ORDER BY
            f.faculty_name
        """,
        tuple(params),
    )

    result = []

    for faculty in faculty_list:
        if str(
            faculty.get("status") or ""
        ).lower() != "active":
            continue

        result.append(
            workload_summary(
                faculty["faculty_id"],
                academic_year,
            )
        )

    return ok(
        [
            item
            for item in result
            if item is not None
        ]
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
        WHERE assignment_id = %s
        """,
        (assignment_id,),
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

    status_value = str(
        d.get(
            "status",
            current["status"],
        )
    ).strip()

    if status_value not in (
        "Active",
        "Inactive",
    ):
        return fail(
            "Status must be Active or Inactive."
        )

    execute(
        """
        UPDATE faculty_subject_assignment
        SET
            status = %s,
            updated_at = NOW()
        WHERE
            assignment_id = %s
        """,
        (
            status_value,
            assignment_id,
        ),
    )

    # Keep component rows synchronized when the parent assignment is
    # explicitly activated/deactivated by an older screen.
    execute(
        """
        UPDATE faculty_subject_assignment_detail
        SET
            status = %s,
            updated_at = NOW()
        WHERE
            subject_id = %s
            AND academic_year = %s
            AND faculty_id = %s
            AND status <> %s
        """,
        (
            status_value,
            current["subject_id"],
            current["academic_year"],
            current["faculty_id"],
            status_value,
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
