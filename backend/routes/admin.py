from flask import Blueprint, request, send_from_directory, session
from backend.db import rows, row, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.audit_service import audit, notify
from backend.services.backup_service import create_backup, backups, restore, _dir
from werkzeug.security import generate_password_hash

bp=Blueprint("admin",__name__,url_prefix="/api")

@bp.get("/users")
@require_auth(["Admin"])
def users():
    return ok(rows("""SELECT u.user_id AS id,u.full_name AS name,u.email,u.role,u.department_id,u.status,u.last_login,d.department_name AS department
                    FROM app_user u LEFT JOIN department d ON d.department_id=u.department_id ORDER BY u.full_name"""))

@bp.post("/users")
@require_auth(["Admin"])
def create_user():
    data=request.get_json(silent=True) or {}
    if not data.get("full_name") or not data.get("email") or not data.get("password") or data.get("role") not in ("Admin","Coordinator","HOD"):
        return fail("Name, email, password, and a valid role are required.")
    result=execute("INSERT INTO app_user (full_name,email,password_hash,role,department_id,status) VALUES (%s,%s,%s,%s,%s,'Active')",(data["full_name"].strip(),data["email"].strip().lower(),generate_password_hash(data["password"]),data["role"],data.get("department_id")))
    audit("Created User","Roles",str(result["id"]));return ok({"id":result["id"]},201)

@bp.patch("/users/<int:user_id>")
@require_auth(["Admin"])
def update_user(user_id):
    data=request.get_json(silent=True) or {}; current=row("SELECT * FROM app_user WHERE user_id=%s",(user_id,))
    if not current:return fail("User not found.",404)
    fields={"full_name":data.get("full_name",current["full_name"]),"role":data.get("role",current["role"]),"department_id":data.get("department_id",current["department_id"]),"status":data.get("status",current["status"])}
    execute("UPDATE app_user SET full_name=%s,role=%s,department_id=%s,status=%s WHERE user_id=%s",(*fields.values(),user_id));audit("Updated User","Roles",str(user_id));return ok({"id":user_id})

@bp.get("/dashboard")
@require_auth()
def dashboard():
    counts={"departments":row("SELECT COUNT(*) AS n FROM department")["n"],"faculty":row("SELECT COUNT(*) AS n FROM faculty WHERE status='Active'")["n"],"subjects":row("SELECT COUNT(*) AS n FROM subject")["n"],"timetable_groups":row("SELECT COUNT(DISTINCT CONCAT(department_id,'|',scheme_id,'|',academic_year,'|',semester_type,'|',semester_id)) AS n FROM timetable")["n"]}
    recent=rows("""SELECT d.department_name,s.semester_no,t.academic_year,t.semester_type,MAX(t.created_at) AS created_at FROM timetable t JOIN department d ON d.department_id=t.department_id JOIN semester s ON s.semester_id=t.semester_id GROUP BY d.department_name,s.semester_no,t.academic_year,t.semester_type ORDER BY created_at DESC LIMIT 6""")
    return ok({"counts":counts,"recent_timetables":recent})

@bp.get("/reports/summary")
@require_auth()
def report_summary():
    data = {
        "subject_types": rows("SELECT CASE WHEN practical_hours>0 THEN 'Lab' ELSE 'Theory' END AS type,COUNT(*) AS count FROM subject GROUP BY type"),
        "faculty_workload": rows("""
            SELECT 
                f.faculty_id,
                f.faculty_name,
                COALESCE(
                    NULLIF(
                        (
                            SELECT SUM(
                                CASE
                                    WHEN s_d.course_category = 'PROJ'
                                      OR d_assign.assignment_role = 'Coordinator'
                                      OR UPPER(COALESCE(s_d.subject_name, '')) LIKE '%PROJECT%'
                                      OR UPPER(COALESCE(s_d.subject_code, '')) LIKE '%PROJ%'
                                      OR UPPER(COALESCE(s_d.subject_name, '')) LIKE '%PLACEMENT%'
                                      OR UPPER(COALESCE(s_d.subject_code, '')) LIKE '%PLACEMENT%'
                                    THEN 0
                                    WHEN d_assign.component = 'Lab' THEN COALESCE(s_d.practical_hours, 0)
                                    ELSE COALESCE(s_d.lecture_hours, 0) + COALESCE(s_d.tutorial_hours, 0)
                                END
                            )
                            FROM faculty_subject_assignment_detail d_assign
                            JOIN subject s_d ON s_d.subject_id = d_assign.subject_id
                            WHERE d_assign.faculty_id = f.faculty_id
                              AND d_assign.status = 'Active'
                        ),
                        0
                    ),
                    (
                        SELECT SUM(
                            CASE
                                WHEN s_leg.course_category = 'PROJ'
                                  OR UPPER(COALESCE(s_leg.subject_name, '')) LIKE '%PROJECT%'
                                  OR UPPER(COALESCE(s_leg.subject_code, '')) LIKE '%PROJ%'
                                THEN 0
                                ELSE COALESCE(s_leg.lecture_hours, 0) + COALESCE(s_leg.tutorial_hours, 0) + COALESCE(s_leg.practical_hours, 0)
                            END
                        )
                        FROM faculty_subject_assignment a_leg
                        JOIN subject s_leg ON s_leg.subject_id = a_leg.subject_id
                        WHERE a_leg.faculty_id = f.faculty_id
                          AND a_leg.status = 'Active'
                    ),
                    0
                ) AS hours
            FROM faculty f
            WHERE f.status = 'Active'
            ORDER BY hours DESC, f.faculty_name ASC
            LIMIT 15
        """),
        "departments": rows("""SELECT d.department_id,d.department_name,COUNT(DISTINCT f.faculty_id) AS faculty,COUNT(DISTINCT s.subject_id) AS subjects,COUNT(DISTINCT CONCAT(t.academic_year,'|',t.semester_type,'|',t.semester_id)) AS timetables FROM department d LEFT JOIN faculty f ON f.department_id=d.department_id AND f.status='Active' LEFT JOIN subject s ON s.department_id=d.department_id LEFT JOIN timetable t ON t.department_id=d.department_id GROUP BY d.department_id,d.department_name"""),
        "assignment_status": rows("""SELECT s.subject_id,s.subject_code,s.subject_name,COUNT(a.assignment_id) AS assignments FROM subject s LEFT JOIN faculty_subject_assignment a ON a.subject_id=s.subject_id AND a.status='Active' GROUP BY s.subject_id,s.subject_code,s.subject_name HAVING assignments=0"""),
    }
    return ok(data)

@bp.get("/notifications")
@require_auth()
def notifications(): return ok(rows("SELECT * FROM notification WHERE user_id IS NULL OR user_id=%s ORDER BY created_at DESC LIMIT 100",(session["user"]["id"],)))

@bp.post("/notifications")
@require_auth(["Admin","Coordinator"])
def create_notification():
    d=request.get_json(silent=True) or {}
    if not d.get("title") or not d.get("message"):return fail("Title and message are required.")
    notify(d["title"],d["message"],d.get("level","info"),d.get("user_id"));audit("Sent Notification","Notifications",d["title"]);return ok({"message":"Notification created."},201)

@bp.patch("/notifications/<int:item_id>/read")
@require_auth()
def mark_read(item_id): execute("UPDATE notification SET is_read=1 WHERE notification_id=%s",(item_id,));return ok({"id":item_id})

@bp.get("/audit-logs")
@require_auth(["Admin"])
def audit_logs(): return ok(rows("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 250"))

@bp.get("/settings")
@require_auth()
def settings(): return ok(rows("SELECT setting_key,setting_value,updated_at FROM system_setting ORDER BY setting_key"))

@bp.put("/settings")
@require_auth(["Admin"])
def save_settings():
    values=request.get_json(silent=True) or {}
    if not isinstance(values,dict):return fail("Settings must be a JSON object.")
    for key,value in values.items():execute("INSERT INTO system_setting (setting_key,setting_value,updated_by) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by=VALUES(updated_by)",(str(key),str(value),session["user"]["id"]))
    audit("Updated Settings","Settings");return ok({"saved":list(values)})

@bp.get("/backups")
@require_auth(["Admin"])
def list_backups():return ok(backups())

@bp.post("/backups")
@require_auth(["Admin"])
def backup():
    try: result=create_backup()
    except RuntimeError as exc:return fail(str(exc),503)
    audit("Created Backup","Backup",result["filename"]);return ok(result,201)

@bp.get("/backups/<int:backup_id>/download")
@require_auth(["Admin"])
def download_backup(backup_id):
    item=row("SELECT filename FROM backup_record WHERE backup_id=%s",(backup_id,))
    if not item:return fail("Backup not found.",404)
    return send_from_directory(_dir(),item["filename"],as_attachment=True)

@bp.post("/backups/<int:backup_id>/restore")
@require_auth(["Admin"])
def restore_backup(backup_id):
    try: record=restore(backup_id,(request.get_json(silent=True) or {}).get("confirmation",""))
    except ValueError as exc:return fail(str(exc),400)
    except RuntimeError as exc:return fail(str(exc),503)
    audit("Restored Backup","Backup",record["filename"]);notify("Database restored","A confirmed database restore completed.","warning");return ok({"filename":record["filename"]})
