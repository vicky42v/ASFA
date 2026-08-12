from flask import Blueprint, request

from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.audit_service import audit


bp = Blueprint("academic", __name__, url_prefix="/api")

EDITORS = ["Admin", "Coordinator", "HOD"]
ADMINS = ["Admin"]


# ============================================================
# ENTITY STATUS
# ============================================================

def state(entity, entity_id, active):
    execute(
        """
        INSERT INTO entity_status
            (entity_type, entity_id, is_active)
        VALUES
            (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            is_active = VALUES(is_active)
        """,
        (entity, entity_id, active),
    )


# ============================================================
# DEPARTMENTS
# ============================================================

@bp.get("/departments")
@require_auth()
def departments():
    search = request.args.get("search", "").strip()

    items = rows(
        """
        SELECT
            d.department_id AS id,
            d.department_name AS name,
            d.department_code AS code,

            COALESCE(es.is_active, 1) AS is_active,

            COUNT(
                DISTINCT CASE
                    WHEN f.status = 'Active'
                    THEN f.faculty_id
                END
            ) AS total_faculty,

            COUNT(
                DISTINCT CONCAT(
                    t.academic_year,
                    '|',
                    t.semester_type,
                    '|',
                    t.semester_id
                )
            ) AS active_timetables,

            COALESCE(
                MAX(
                    CASE
                        WHEN f.designation LIKE '%Head%'
                          OR f.designation LIKE '%HOD%'
                        THEN f.faculty_name
                    END
                ),
                '—'
            ) AS hod

        FROM department d

        LEFT JOIN entity_status es
            ON es.entity_type = 'department'
            AND es.entity_id = d.department_id

        LEFT JOIN faculty f
            ON f.department_id = d.department_id

        LEFT JOIN timetable t
            ON t.department_id = d.department_id

        WHERE
            d.department_name LIKE %s
            OR d.department_code LIKE %s

        GROUP BY
            d.department_id,
            d.department_name,
            d.department_code,
            es.is_active

        ORDER BY
            d.department_name
        """,
        (
            f"%{search}%",
            f"%{search}%",
        ),
    )

    for item in items:
        item["status"] = (
            "Active"
            if item.pop("is_active")
            else "Inactive"
        )

    return ok(items)


@bp.get("/departments/<int:department_id>")
@require_auth()
def department(department_id):

    item = row(
        """
        SELECT
            department_id AS id,
            department_name AS name,
            department_code AS code
        FROM department
        WHERE department_id = %s
        """,
        (department_id,),
    )

    if not item:
        return fail("Department not found.", 404)

    return ok(item)


@bp.post("/departments")
@require_auth(EDITORS)
def create_department():

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    code = str(data.get("code", "")).strip().upper()

    if not name or not code:
        return fail(
            "Department name and code are required."
        )

    existing = row(
        """
        SELECT 1
        FROM department
        WHERE department_code = %s
        """,
        (code,),
    )

    if existing:
        return fail(
            "A department with this code already exists.",
            409,
        )

    result = execute(
        """
        INSERT INTO department
            (department_name, department_code)
        VALUES
            (%s, %s)
        """,
        (name, code),
    )

    audit(
        "Created Department",
        "Departments",
        name,
    )

    return ok(
        {
            "id": result["id"],
            "name": name,
            "code": code,
        },
        201,
    )


@bp.patch("/departments/<int:department_id>")
@require_auth(EDITORS)
def update_department(department_id):

    data = request.get_json(silent=True) or {}

    existing = row(
        """
        SELECT *
        FROM department
        WHERE department_id = %s
        """,
        (department_id,),
    )

    if not existing:
        return fail(
            "Department not found.",
            404,
        )

    name = str(
        data.get(
            "name",
            existing["department_name"],
        )
    ).strip()

    code = str(
        data.get(
            "code",
            existing["department_code"],
        )
    ).strip().upper()

    if not name or not code:
        return fail(
            "Department name and code are required."
        )

    duplicate = row(
        """
        SELECT 1
        FROM department
        WHERE department_code = %s
          AND department_id <> %s
        """,
        (
            code,
            department_id,
        ),
    )

    if duplicate:
        return fail(
            "A department with this code already exists.",
            409,
        )

    execute(
        """
        UPDATE department
        SET
            department_name = %s,
            department_code = %s
        WHERE department_id = %s
        """,
        (
            name,
            code,
            department_id,
        ),
    )

    audit(
        "Updated Department",
        "Departments",
        name,
    )

    return ok(
        {
            "id": department_id,
            "name": name,
            "code": code,
        }
    )


@bp.delete("/departments/<int:department_id>")
@require_auth(ADMINS)
def deactivate_department(department_id):

    existing = row(
        """
        SELECT 1
        FROM department
        WHERE department_id = %s
        """,
        (department_id,),
    )

    if not existing:
        return fail(
            "Department not found.",
            404,
        )

    state(
        "department",
        department_id,
        False,
    )

    audit(
        "Deactivated Department",
        "Departments",
        str(department_id),
    )

    return ok(
        {
            "id": department_id,
            "status": "Inactive",
        }
    )


# ============================================================
# FACULTY
# ============================================================

@bp.get("/faculty")
@require_auth()
def faculty():

    search = request.args.get(
        "search",
        "",
    ).strip()

    department_id = request.args.get(
        "department_id"
    )

    sql = """
        SELECT
            f.faculty_id AS id,
            f.faculty_name AS name,
            f.department_id,
            d.department_name AS department,
            f.designation,
            f.max_workload,
            f.status,

            COALESCE(
                SUM(
                    COALESCE(s.lecture_hours, 0)
                    + COALESCE(s.tutorial_hours, 0)
                    + COALESCE(s.practical_hours, 0)
                ),
                0
            ) AS workload

        FROM faculty f

        INNER JOIN department d
            ON d.department_id = f.department_id

        LEFT JOIN faculty_subject_assignment a
            ON a.faculty_id = f.faculty_id
            AND a.status = 'Active'

        LEFT JOIN subject s
            ON s.subject_id = a.subject_id

        WHERE
            (
                f.faculty_name LIKE %s
                OR d.department_name LIKE %s
            )
    """

    params = [
        f"%{search}%",
        f"%{search}%",
    ]

    if department_id:
        sql += """
            AND f.department_id = %s
        """

        params.append(department_id)

    sql += """
        GROUP BY
            f.faculty_id,
            f.faculty_name,
            f.department_id,
            d.department_name,
            f.designation,
            f.max_workload,
            f.status

        ORDER BY
            f.faculty_name
    """

    return ok(
        rows(
            sql,
            tuple(params),
        )
    )


# ============================================================
# FACULTY DETAIL
# ============================================================

@bp.get("/faculty/<int:faculty_id>")
@require_auth()
def faculty_detail(faculty_id):

    item = row(
        """
        SELECT
            f.faculty_id AS id,
            f.faculty_name AS name,
            f.department_id,
            d.department_name AS department,
            f.designation,
            f.max_workload,
            f.status,

            COALESCE(
                (
                    SELECT SUM(
                        COALESCE(s2.lecture_hours, 0)
                        + COALESCE(s2.tutorial_hours, 0)
                        + COALESCE(s2.practical_hours, 0)
                    )
                    FROM faculty_subject_assignment a2
                    INNER JOIN subject s2
                        ON s2.subject_id = a2.subject_id
                    WHERE a2.faculty_id = f.faculty_id
                      AND a2.status = 'Active'
                ),
                0
            ) AS workload

        FROM faculty f

        INNER JOIN department d
            ON d.department_id = f.department_id

        WHERE f.faculty_id = %s
        """,
        (faculty_id,),
    )

    if not item:
        return fail(
            "Faculty member not found.",
            404,
        )

    # --------------------------------------------------------
    # Existing subject assignments
    # --------------------------------------------------------

    item["assignments"] = rows(
        """
        SELECT
            a.assignment_id,
            a.academic_year,
            a.status,

            s.subject_id,
            s.subject_code,
            s.subject_name,

            COALESCE(s.lecture_hours, 0)
                AS lecture_hours,

            COALESCE(s.tutorial_hours, 0)
                AS tutorial_hours,

            COALESCE(s.practical_hours, 0)
                AS practical_hours

        FROM faculty_subject_assignment a

        INNER JOIN subject s
            ON s.subject_id = a.subject_id

        WHERE a.faculty_id = %s

        ORDER BY
            a.academic_year DESC,
            s.subject_code
        """,
        (faculty_id,),
    )

    # --------------------------------------------------------
    # Keep eligibility information for existing frontend
    # compatibility.
    # --------------------------------------------------------

    item["eligible_subjects"] = rows(
        """
        SELECT
            s.subject_id,
            s.subject_code,
            s.subject_name
        FROM faculty_subject fs

        INNER JOIN subject s
            ON s.subject_id = fs.subject_id

        WHERE fs.faculty_id = %s

        ORDER BY
            s.subject_code
        """,
        (faculty_id,),
    )

    return ok(item)


# ============================================================
# CREATE FACULTY
# ============================================================

@bp.post("/faculty")
@require_auth(EDITORS)
def create_faculty():

    data = request.get_json(silent=True) or {}

    name = str(
        data.get("name", "")
    ).strip()

    department_id = data.get(
        "department_id"
    )

    designation = str(
        data.get("designation", "")
    ).strip()

    max_workload = data.get(
        "max_workload",
        0,
    )

    if (
        not name
        or not department_id
        or not designation
    ):
        return fail(
            "Name, department, and designation are required."
        )

    department = row(
        """
        SELECT department_id
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
        max_workload = int(
            max_workload or 0
        )
    except (
        TypeError,
        ValueError,
    ):
        return fail(
            "Maximum workload must be a valid number."
        )

    if max_workload < 0:
        return fail(
            "Maximum workload cannot be negative."
        )

    result = execute(
        """
        INSERT INTO faculty
            (
                faculty_name,
                department_id,
                designation,
                max_workload,
                status
            )
        VALUES
            (
                %s,
                %s,
                %s,
                %s,
                'Active'
            )
        """,
        (
            name,
            department_id,
            designation,
            max_workload,
        ),
    )

    audit(
        "Created Faculty",
        "Faculty",
        name,
    )

    return ok(
        {
            "id": result["id"],
            "name": name,
            "department_id": department_id,
            "designation": designation,
            "max_workload": max_workload,
            "status": "Active",
        },
        201,
    )


# ============================================================
# UPDATE FACULTY
# ============================================================

@bp.patch("/faculty/<int:faculty_id>")
@require_auth(EDITORS)
def update_faculty(faculty_id):

    current = row(
        """
        SELECT *
        FROM faculty
        WHERE faculty_id = %s
        """,
        (faculty_id,),
    )

    if not current:
        return fail(
            "Faculty member not found.",
            404,
        )

    data = request.get_json(silent=True) or {}

    name = str(
        data.get(
            "name",
            current["faculty_name"],
        )
    ).strip()

    department_id = data.get(
        "department_id",
        current["department_id"],
    )

    designation = str(
        data.get(
            "designation",
            current["designation"],
        )
    ).strip()

    status = data.get(
        "status",
        current["status"],
    )

    max_workload = data.get(
        "max_workload",
        current["max_workload"],
    )

    if not name:
        return fail(
            "Faculty name is required."
        )

    if not designation:
        return fail(
            "Faculty designation is required."
        )

    # --------------------------------------------------------
    # Validate department
    # --------------------------------------------------------

    department = row(
        """
        SELECT department_id
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

    # --------------------------------------------------------
    # Validate workload
    # --------------------------------------------------------

    try:
        max_workload = int(
            max_workload or 0
        )
    except (
        TypeError,
        ValueError,
    ):
        return fail(
            "Maximum workload must be a valid number."
        )

    if max_workload < 0:
        return fail(
            "Maximum workload cannot be negative."
        )

    # --------------------------------------------------------
    # Validate status
    # --------------------------------------------------------

    if status not in (
        "Active",
        "Inactive",
    ):
        return fail(
            "Status must be Active or Inactive."
        )

    # --------------------------------------------------------
    # Update
    # --------------------------------------------------------

    execute(
        """
        UPDATE faculty

        SET
            faculty_name = %s,
            department_id = %s,
            designation = %s,
            max_workload = %s,
            status = %s

        WHERE faculty_id = %s
        """,
        (
            name,
            department_id,
            designation,
            max_workload,
            status,
            faculty_id,
        ),
    )

    audit(
        "Updated Faculty",
        "Faculty",
        str(faculty_id),
    )

    return ok(
        {
            "id": faculty_id,
            "name": name,
            "department_id": department_id,
            "designation": designation,
            "max_workload": max_workload,
            "status": status,
        }
    )


# ============================================================
# DEACTIVATE FACULTY
# ============================================================

@bp.delete("/faculty/<int:faculty_id>")
@require_auth(EDITORS)
def deactivate_faculty(faculty_id):

    result = execute(
        """
        UPDATE faculty
        SET status = 'Inactive'
        WHERE faculty_id = %s
        """,
        (faculty_id,),
    )

    if not result["affected"]:
        return fail(
            "Faculty member not found.",
            404,
        )

    audit(
        "Deactivated Faculty",
        "Faculty",
        str(faculty_id),
    )

    return ok(
        {
            "id": faculty_id,
            "status": "Inactive",
        }
    )