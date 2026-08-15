from collections import defaultdict

from flask import Blueprint, request

from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.audit_service import audit

bp = Blueprint("faculty_assignment_rules", __name__, url_prefix="/api")
EDITORS = ["Admin", "Coordinator", "HOD"]


def _truthy(value):
    return value in (True, 1, "1", "true", "True", "yes", "Yes", "Y")


def _basic_science(department):
    text = " ".join([
        str(department.get("department_name") or ""),
        str(department.get("department_code") or ""),
    ]).strip().lower()
    return (
        ("basic" in text and "science" in text)
        or "science and humanities" in text
        or text in {
            "bs", "bsc", "basic science", "basic sciences", "sh"
        }
    )


def _component_rows(subject):
    lecture = int(subject.get("lecture_hours") or 0)
    tutorial = int(subject.get("tutorial_hours") or 0)
    practical = int(subject.get("practical_hours") or 0)

    components = []
    if lecture + tutorial > 0:
        components.append("Theory")
    if practical > 0:
        components.append("Lab")
    return components


def _subject(subject_id):
    return row("""
        SELECT
            s.*,
            sem.semester_no,
            sem.semester_type,
            d.department_name,
            d.department_code,
            COALESCE(es.is_active, 1) AS is_active
        FROM subject s
        JOIN semester sem ON sem.semester_id=s.semester_id
        JOIN department d ON d.department_id=s.department_id
        LEFT JOIN entity_status es
            ON es.entity_type='subject' AND es.entity_id=s.subject_id
        WHERE s.subject_id=%s
    """, (subject_id,))


def _validate_context_for_subject(subject, payload):
    if not subject:
        return "Subject not found."
    if not bool(subject.get("is_active", 1)):
        return "Subject is inactive."

    semester_no = int(subject.get("semester_no") or 0)
    department_id = payload.get("department_id")
    if department_id and str(department_id) != str(subject.get("department_id")):
        return "The selected subject does not belong to the selected department."

    if semester_no in (1, 2):
        department = {
            "department_name": subject.get("department_name"),
            "department_code": subject.get("department_code"),
        }
        if not _basic_science(department):
            return "1st and 2nd semester subjects must belong to the Basic Science department."

        cycle = str(payload.get("cycle") or subject.get("cycle") or "").strip().upper()
        if cycle not in ("P", "C"):
            return "For 1st and 2nd semester, select a valid cycle: P Cycle or C Cycle."

        stored_cycle = str(subject.get("cycle") or "").strip().upper()
        if stored_cycle in ("P", "C") and stored_cycle != cycle:
            return f"This subject belongs to {stored_cycle} Cycle and cannot be assigned under {cycle} Cycle."

    return None


def _validate_faculty(faculty_id, subject, role):
    faculty = row("""
        SELECT
            f.faculty_id,
            f.faculty_name,
            f.department_id,
            f.status,
            f.max_workload,
            d.department_name,
            d.department_code
        FROM faculty f
        JOIN department d ON d.department_id=f.department_id
        WHERE f.faculty_id=%s
    """, (faculty_id,))

    if not faculty:
        return None, "Faculty member not found."
    if str(faculty.get("status") or "Active").lower() != "active":
        return None, f"{faculty.get('faculty_name','Faculty')} is not active."

    semester_no = int(subject.get("semester_no") or 0)
    if semester_no in (1, 2):
        if not _basic_science(faculty):
            return None, "For 1st and 2nd semester, only Basic Science faculty can be assigned."
    elif str(faculty.get("department_id")) != str(subject.get("department_id")):
        return None, "Faculty must belong to the selected department for this semester."

    if role == "Co" and int(subject.get("practical_hours") or 0) <= 0:
        return None, "Co-faculty is available only for lab components."

    return faculty, None


def _validate_eligibility(faculty_id, subject_id):
    """Eligibility is an explicit prerequisite for a teaching assignment."""
    if row(
        """
        SELECT 1 FROM faculty_subject
        WHERE faculty_id=%s AND subject_id=%s
        """,
        (faculty_id, subject_id),
    ):
        return None
    return "Faculty is not eligible to teach this subject. Add faculty-subject eligibility first."


@bp.get("/faculty-assignment-details")
@require_auth()
def list_details():
    academic_year = request.args.get("academic_year", "")
    department_id = request.args.get("department_id", "")
    semester_id = request.args.get("semester_id", "")
    semester_type = request.args.get("semester_type", "")

    filters = ["1=1"]
    params = []
    if academic_year:
        filters.append("a.academic_year=%s"); params.append(academic_year)
    if department_id:
        filters.append("s.department_id=%s"); params.append(department_id)
    if semester_id:
        filters.append("s.semester_id=%s"); params.append(semester_id)
    if semester_type:
        filters.append("sem.semester_type=%s"); params.append(semester_type)

    return ok(rows(f"""
        SELECT
            a.detail_id AS id,
            a.detail_id,
            a.subject_id,
            a.faculty_id,
            a.academic_year,
            a.component,
            a.assignment_role,
            a.status,
            f.faculty_name,
            f.designation,
            s.subject_code,
            s.subject_name,
            s.department_id,
            s.scheme_id,
            s.semester_id,
            s.course_category,
            s.cycle,
            s.lecture_hours,
            s.tutorial_hours,
            s.practical_hours,
            sem.semester_no,
            sem.semester_type
        FROM faculty_subject_assignment_detail a
        JOIN faculty f ON f.faculty_id=a.faculty_id
        JOIN subject s ON s.subject_id=a.subject_id
        JOIN semester sem ON sem.semester_id=s.semester_id


        JOIN department d ON d.department_id=s.department_id
        WHERE {' AND '.join(filters)}
        ORDER BY sem.semester_no DESC, s.subject_code, a.component, a.assignment_role
    """, tuple(params)))


@bp.post("/faculty-assignment-details")
@require_auth(EDITORS)
def save_detail_assignment():
    """Create/update exactly one component-role assignment.

    Main and Co are independent roles:
      - Theory: Main only
      - Lab: Main + optional Co

    Saving Lab/Co must NEVER deactivate Lab/Main, and saving Main must
    NEVER deactivate Lab/Co. The component-detail table is the source
    of truth for timetable generation.

    A Save operation may mark the first request with replace_semester=true.
    That starts a fresh save for the selected semester only: old assignments
    in that semester are deactivated, while assignments in other semesters
    remain active for global workload calculation.
    """
    payload = request.get_json(silent=True) or {}

    subject_id = payload.get("subject_id")
    academic_year = str(payload.get("academic_year") or "").strip()
    component = str(payload.get("component") or "").strip().title()
    role = str(payload.get("assignment_role") or "Main").strip().title()
    faculty_id = payload.get("faculty_id")

    # When Save Assignments starts for a semester, the frontend sends
    # replace_semester=true on the FIRST assignment request. This makes
    # the selected semester behave like a fresh assignment sheet:
    # old assignments for this semester are deactivated first, while
    # assignments from every other semester remain untouched.
    replace_semester = _truthy(payload.get("replace_semester"))

    if not subject_id or not academic_year or component not in ("Theory", "Lab"):
        return fail(
            "Subject, academic year and a valid component (Theory/Lab) are required.",
            422,
        )

    if role not in ("Main", "Co"):
        return fail("assignment_role must be Main or Co.", 422)

    if role == "Co" and component != "Lab":
        return fail("Co-faculty can only be assigned to the Lab component.", 422)

    if not faculty_id:
        return fail(f"{role} faculty is required.", 422)

    subject = _subject(subject_id)
    error = _validate_context_for_subject(subject, payload)
    if error:
        return fail(error, 422)

    valid_components = _component_rows(subject)
    if component not in valid_components:
        return fail(
            f"{component} component is not valid for {subject.get('subject_code')}. "
            "Check the subject's L-T-P values.",
            422,
        )

    selected_faculty, error = _validate_faculty(faculty_id, subject, role)
    if error:
        return fail(error, 422)

    error = _validate_eligibility(faculty_id, subject_id)
    if error:
        return fail(error, 422)

    # ---------------------------------------------------------
    # CURRENT OTHER ROLE
    # ---------------------------------------------------------
    current_other_role = "Co" if role == "Main" else "Main"
    other_role_row = row("""
        SELECT faculty_id
        FROM faculty_subject_assignment_detail
        WHERE subject_id=%s
          AND academic_year=%s
          AND component=%s
          AND assignment_role=%s
          AND status='Active'
        ORDER BY detail_id DESC
        LIMIT 1
    """, (subject_id, academic_year, component, current_other_role))

    if other_role_row and str(other_role_row.get("faculty_id")) == str(faculty_id):
        return fail(
            "Main faculty and Co-faculty must be different.",
            422,
        )

    # ---------------------------------------------------------
    # EXACT WORKLOAD CHECK
    # ---------------------------------------------------------
    component_hours = (
        int(subject.get("practical_hours") or 0)
        if component == "Lab"
        else int(subject.get("lecture_hours") or 0)
        + int(subject.get("tutorial_hours") or 0)
    )

    if replace_semester:
        # The whole selected semester is about to be replaced. Therefore
        # the workload check must ignore its OLD assignments and keep
        # assignments from all other semesters. This prevents stale
        # semester workload from blocking a valid replacement.
        current = row("""
            SELECT COALESCE(SUM(
                CASE
                    WHEN a.component='Lab' THEN COALESCE(s.practical_hours,0)
                    ELSE COALESCE(s.lecture_hours,0) + COALESCE(s.tutorial_hours,0)
                END
            ),0) AS workload
            FROM faculty_subject_assignment_detail a
            JOIN subject s ON s.subject_id=a.subject_id
            WHERE a.faculty_id=%s
              AND a.academic_year=%s
              AND a.status='Active'
              AND NOT (
                  s.department_id=%s
                  AND s.scheme_id=%s
                  AND s.semester_id=%s
              )
        """, (
            faculty_id,
            academic_year,
            subject.get("department_id"),
            subject.get("scheme_id"),
            subject.get("semester_id"),
        ))
    else:
        # Normal subsequent request in the same Save operation: only
        # replace the exact component/role being written.
        current = row("""
            SELECT COALESCE(SUM(
                CASE
                    WHEN a.component='Lab' THEN COALESCE(s.practical_hours,0)
                    ELSE COALESCE(s.lecture_hours,0) + COALESCE(s.tutorial_hours,0)
                END
            ),0) AS workload
            FROM faculty_subject_assignment_detail a
            JOIN subject s ON s.subject_id=a.subject_id
            WHERE a.faculty_id=%s
              AND a.academic_year=%s
              AND a.status='Active'
              AND NOT (
                  a.subject_id=%s
                  AND a.component=%s
                  AND a.assignment_role=%s
              )
        """, (faculty_id, academic_year, subject_id, component, role))

    maximum = float(selected_faculty.get("max_workload") or 0)
    projected = float(current.get("workload") or 0) + component_hours
    if maximum > 0 and projected > maximum:
        return fail(
            f"{selected_faculty.get('faculty_name')} would have {projected:g} hours, "
            f"exceeding the configured maximum of {maximum:g} hours.",
            422,
        )

    # ---------------------------------------------------------
    # FRESH SEMESTER SAVE
    # ---------------------------------------------------------
    # This runs only for the first assignment request of a Save
    # operation. It clears the selected department/scheme/semester
    # from both assignment tables, but never touches another semester.
    if replace_semester:
        execute("""
            UPDATE faculty_subject_assignment_detail d
            JOIN subject s ON s.subject_id=d.subject_id
            SET d.status='Inactive', d.updated_at=NOW()
            WHERE d.academic_year=%s
              AND d.status='Active'
              AND s.department_id=%s
              AND s.scheme_id=%s
              AND s.semester_id=%s
        """, (
            academic_year,
            subject.get("department_id"),
            subject.get("scheme_id"),
            subject.get("semester_id"),
        ))

        execute("""
            UPDATE faculty_subject_assignment a
            JOIN subject s ON s.subject_id=a.subject_id
            SET a.status='Inactive', a.updated_at=NOW()
            WHERE a.academic_year=%s
              AND a.status='Active'
              AND s.department_id=%s
              AND s.scheme_id=%s
              AND s.semester_id=%s
        """, (
            academic_year,
            subject.get("department_id"),
            subject.get("scheme_id"),
            subject.get("semester_id"),
        ))

    # ---------------------------------------------------------
    # OPTION GROUP: only one subject in a PEC/OEC group can remain active.
    # ---------------------------------------------------------
    option_group_id = subject.get("option_group_id")
    if option_group_id:
        execute("""
            UPDATE faculty_subject_assignment_detail d
            JOIN subject s ON s.subject_id=d.subject_id
            SET d.status='Inactive', d.updated_at=NOW()
            WHERE s.option_group_id=%s
              AND d.academic_year=%s
              AND d.status='Active'
              AND s.subject_id<>%s
        """, (option_group_id, academic_year, subject_id))

        execute("""
            UPDATE faculty_subject_assignment a
            JOIN subject s ON s.subject_id=a.subject_id
            SET a.status='Inactive', a.updated_at=NOW()
            WHERE s.option_group_id=%s
              AND a.academic_year=%s
              AND a.status='Active'
              AND s.subject_id<>%s
        """, (option_group_id, academic_year, subject_id))

    # ---------------------------------------------------------
    # DEACTIVATE ONLY THE ROLE BEING REPLACED.
    # ---------------------------------------------------------
    execute("""
        UPDATE faculty_subject_assignment_detail
        SET status='Inactive', updated_at=NOW()
        WHERE subject_id=%s
          AND academic_year=%s
          AND component=%s
          AND assignment_role=%s
          AND status='Active'
    """, (subject_id, academic_year, component, role))

    # Re-use the newest historical row for this exact role when possible.
    existing = row("""
        SELECT detail_id
        FROM faculty_subject_assignment_detail
        WHERE subject_id=%s
          AND academic_year=%s
          AND component=%s
          AND assignment_role=%s
        ORDER BY detail_id DESC
        LIMIT 1
    """, (subject_id, academic_year, component, role))

    if existing:
        execute("""
            UPDATE faculty_subject_assignment_detail
            SET faculty_id=%s,
                status='Active',
                updated_at=NOW()
            WHERE detail_id=%s
        """, (int(faculty_id), existing["detail_id"]))
        detail_id = existing["detail_id"]
    else:
        result = execute("""
            INSERT INTO faculty_subject_assignment_detail
                (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s,%s,%s,%s,%s,'Active')
        """, (subject_id, int(faculty_id), academic_year, component, role))
        detail_id = result["id"]

    # ---------------------------------------------------------
    # LEGACY PARENT TABLE
    # It represents the subject's Main faculty only.
    # Never overwrite it when saving a Co faculty.
    # ---------------------------------------------------------
    if role == "Main":
        legacy = row("""
            SELECT assignment_id
            FROM faculty_subject_assignment
            WHERE subject_id=%s
              AND academic_year=%s
            ORDER BY (status='Active') DESC, assignment_id DESC
            LIMIT 1
        """, (subject_id, academic_year))

        if legacy:
            execute("""
                UPDATE faculty_subject_assignment
                SET faculty_id=%s,
                    status='Active',
                    updated_at=NOW()
                WHERE assignment_id=%s
            """, (int(faculty_id), legacy["assignment_id"]))
        else:
            execute("""
                INSERT INTO faculty_subject_assignment
                    (faculty_id, subject_id, academic_year, status)
                VALUES (%s,%s,%s,'Active')
            """, (int(faculty_id), subject_id, academic_year))

    audit(
        "Saved Faculty Component Assignment",
        "Assignments",
        f"{subject_id}:{component}:{role}",
    )

    return ok({
        "subject_id": int(subject_id),
        "component": component,
        "assignment_role": role,
        "faculty_id": int(faculty_id),
        "detail_id": detail_id,
    }, 201)


@bp.delete("/faculty-assignment-details/<int:subject_id>/<component>")
@require_auth(EDITORS)
def clear_component(subject_id, component):
    academic_year = request.args.get("academic_year", "")
    assignment_role = str(request.args.get("assignment_role", "")).strip().title()

    if component not in ("Theory", "Lab") or not academic_year:
        return fail("Academic year and valid component are required.", 422)

    if assignment_role and assignment_role not in ("Main", "Co"):
        return fail("assignment_role must be Main or Co.", 422)

    if assignment_role == "Co" and component != "Lab":
        return fail("Co-faculty can only be cleared from the Lab component.", 422)

    if assignment_role:
        execute("""
            UPDATE faculty_subject_assignment_detail
            SET status='Inactive', updated_at=NOW()
            WHERE subject_id=%s
              AND academic_year=%s
              AND component=%s
              AND assignment_role=%s
        """, (subject_id, academic_year, component, assignment_role))
    else:
        execute("""
            UPDATE faculty_subject_assignment_detail
            SET status='Inactive', updated_at=NOW()
            WHERE subject_id=%s
              AND academic_year=%s
              AND component=%s
        """, (subject_id, academic_year, component))

    # Rebuild the legacy parent from an ACTIVE Main assignment only.
    # A remaining Co assignment must never keep the parent active.
    active_main = row("""
        SELECT faculty_id
        FROM faculty_subject_assignment_detail
        WHERE subject_id=%s
          AND academic_year=%s
          AND assignment_role='Main'
          AND status='Active'
        ORDER BY detail_id DESC
        LIMIT 1
    """, (subject_id, academic_year))

    legacy = row("""
        SELECT assignment_id
        FROM faculty_subject_assignment
        WHERE subject_id=%s
          AND academic_year=%s
        ORDER BY assignment_id DESC
        LIMIT 1
    """, (subject_id, academic_year))

    if active_main:
        if legacy:
            execute("""
                UPDATE faculty_subject_assignment
                SET faculty_id=%s,
                    status='Active',
                    updated_at=NOW()
                WHERE assignment_id=%s
            """, (int(active_main["faculty_id"]), legacy["assignment_id"]))
        else:
            execute("""
                INSERT INTO faculty_subject_assignment
                    (faculty_id, subject_id, academic_year, status)
                VALUES (%s,%s,%s,'Active')
            """, (int(active_main["faculty_id"]), subject_id, academic_year))
    elif legacy:
        execute("""
            UPDATE faculty_subject_assignment
            SET status='Inactive', updated_at=NOW()
            WHERE assignment_id=%s
        """, (legacy["assignment_id"],))

    audit(
        "Cleared Faculty Component Assignment",
        "Assignments",
        f"{subject_id}:{component}:{assignment_role or 'ALL'}",
    )
    return ok({
        "subject_id": subject_id,
        "component": component,
        "assignment_role": assignment_role or None,
    })
