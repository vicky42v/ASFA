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
    return "basic" in text and "science" in text or text in {
        "bs", "bsc", "basic science", "basic sciences"
    }


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
            d.department_code
        FROM subject s
        JOIN semester sem ON sem.semester_id=s.semester_id
        JOIN department d ON d.department_id=s.department_id
        WHERE s.subject_id=%s
    """, (subject_id,))


def _validate_context_for_subject(subject, payload):
    if not subject:
        return "Subject not found."

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
    payload = request.get_json(silent=True) or {}

    subject_id = payload.get("subject_id")
    academic_year = str(payload.get("academic_year") or "").strip()
    component = str(payload.get("component") or "").strip().title()
    main_faculty_id = payload.get("main_faculty_id")
    co_faculty_id = payload.get("co_faculty_id")

    if not subject_id or not academic_year or component not in ("Theory", "Lab"):
        return fail("Subject, academic year and a valid component (Theory/Lab) are required.")

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

    if not main_faculty_id:
        return fail("Main faculty is required.", 422)

    main_faculty, error = _validate_faculty(main_faculty_id, subject, "Main")
    if error:
        return fail(error, 422)

    co_faculty = None
    if co_faculty_id not in (None, "", 0, "0"):
        if component != "Lab":
            return fail("Co-faculty can only be assigned to the Lab component.", 422)
        if str(main_faculty_id) == str(co_faculty_id):
            return fail("Main faculty and Co-faculty must be different.", 422)
        co_faculty, error = _validate_faculty(co_faculty_id, subject, "Co")
        if error:
            return fail(error, 422)

    semester_id = subject["semester_id"]

    # Exact workload check. Theory contributes L+T hours; Lab contributes P hours.
    # For a lab, Main and Co each receive the lab hours because both teach it.
    component_hours = (
        int(subject.get("practical_hours") or 0)
        if component == "Lab"
        else int(subject.get("lecture_hours") or 0) + int(subject.get("tutorial_hours") or 0)
    )

    def current_workload(faculty_id):
        result = row("""
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
              AND NOT (a.subject_id=%s AND a.component=%s)
        """, (faculty_id, academic_year, subject_id, component))
        return float(result.get("workload") or 0)

    for selected_faculty, selected_name in ((main_faculty, "Main faculty"), (co_faculty, "Co-faculty")):
        if not selected_faculty:
            continue
        maximum = float(selected_faculty.get("max_workload") or 0)
        if maximum > 0:
            projected = current_workload(int(selected_faculty["faculty_id"])) + component_hours
            if projected > maximum:
                return fail(
                    f"{selected_faculty.get('faculty_name')} would have {projected:g} hours, exceeding the configured maximum of {maximum:g} hours.",
                    422,
                )

    # Core rule: within the same semester and academic year, a faculty
    # member may handle only ONE different subject. The same subject may
    # legitimately use that faculty for Theory + Lab.
    faculty_ids = [int(main_faculty_id)]
    if co_faculty:
        faculty_ids.append(int(co_faculty_id))

    for faculty_id in faculty_ids:
        conflict = row("""
            SELECT
                a.subject_id,
                s.subject_code,
                s.subject_name,
                a.component,
                a.assignment_role
            FROM faculty_subject_assignment_detail a
            JOIN subject s ON s.subject_id=a.subject_id
            WHERE a.faculty_id=%s
              AND a.academic_year=%s
              AND a.status='Active'
              AND s.semester_id=%s
              AND s.subject_id<>%s
            LIMIT 1
        """, (faculty_id, academic_year, semester_id, subject_id))
        if conflict:
            return fail(
                f"{main_faculty.get('faculty_name') if faculty_id == int(main_faculty_id) else co_faculty.get('faculty_name')} "
                f"is already assigned to {conflict.get('subject_code')} in the same semester. "
                "One faculty member cannot handle different subjects in the same semester.",
                409,
            )

    # Remove previous assignment rows for this subject/component/year.
    execute("""
        UPDATE faculty_subject_assignment_detail
        SET status='Inactive'
        WHERE subject_id=%s AND academic_year=%s AND component=%s AND status='Active'
    """, (subject_id, academic_year, component))

    def upsert_detail(faculty_id, role):
        existing = row("""
            SELECT detail_id
            FROM faculty_subject_assignment_detail
            WHERE subject_id=%s AND academic_year=%s
              AND component=%s AND assignment_role=%s
            ORDER BY detail_id DESC LIMIT 1
        """, (subject_id, academic_year, component, role))
        if existing:
            execute("""
                UPDATE faculty_subject_assignment_detail
                SET faculty_id=%s, status='Active', updated_at=NOW()
                WHERE detail_id=%s
            """, (faculty_id, existing["detail_id"]))
            return existing["detail_id"]
        result = execute("""
            INSERT INTO faculty_subject_assignment_detail
                (subject_id, faculty_id, academic_year, component, assignment_role, status)
            VALUES (%s,%s,%s,%s,%s,'Active')
        """, (subject_id, faculty_id, academic_year, component, role))
        return result["id"]

    main_detail_id = upsert_detail(int(main_faculty_id), "Main")
    co_detail_id = None
    if co_faculty:
        co_detail_id = upsert_detail(int(co_faculty_id), "Co")

    # Keep the legacy table synchronized with the main faculty so old
    # screens continue to work. The generator no longer depends on it.
    legacy = row("""
        SELECT assignment_id
        FROM faculty_subject_assignment
        WHERE subject_id=%s AND academic_year=%s AND status='Active'
        ORDER BY assignment_id DESC LIMIT 1
    """, (subject_id, academic_year))

    if legacy:
        execute("""
            UPDATE faculty_subject_assignment
            SET faculty_id=%s, updated_at=NOW()
            WHERE assignment_id=%s
        """, (int(main_faculty_id), legacy["assignment_id"]))
    else:
        execute("""
            INSERT INTO faculty_subject_assignment
                (faculty_id, subject_id, academic_year, status)
            VALUES (%s,%s,%s,'Active')
        """, (int(main_faculty_id), subject_id, academic_year))

    # Preserve legacy eligibility as a convenience, but eligibility is
    # not a scheduling requirement anymore.
    for faculty_id in faculty_ids:
        if not row("SELECT 1 FROM faculty_subject WHERE faculty_id=%s AND subject_id=%s", (faculty_id, subject_id)):
            execute("INSERT INTO faculty_subject (faculty_id, subject_id) VALUES (%s,%s)", (faculty_id, subject_id))

    audit("Saved Faculty Component Assignment", "Assignments", str(subject_id))

    return ok({
        "subject_id": int(subject_id),
        "component": component,
        "main_faculty_id": int(main_faculty_id),
        "co_faculty_id": int(co_faculty_id) if co_faculty else None,
        "main_detail_id": main_detail_id,
        "co_detail_id": co_detail_id,
    }, 201)


@bp.delete("/faculty-assignment-details/<int:subject_id>/<component>")
@require_auth(EDITORS)
def clear_component(subject_id, component):
    academic_year = request.args.get("academic_year", "")
    if component not in ("Theory", "Lab") or not academic_year:
        return fail("Academic year and valid component are required.")

    execute("""
        UPDATE faculty_subject_assignment_detail
        SET status='Inactive'
        WHERE subject_id=%s AND academic_year=%s AND component=%s
    """, (subject_id, academic_year, component))

    audit("Cleared Faculty Component Assignment", "Assignments", f"{subject_id}:{component}")
    return ok({"subject_id": subject_id, "component": component})
