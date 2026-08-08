from flask import Blueprint, request
from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.audit_service import audit

bp = Blueprint("catalog", __name__, url_prefix="/api")
EDITORS = ["Admin", "Coordinator", "HOD"]

def status(entity, entity_id, active):
    execute("""INSERT INTO entity_status (entity_type,entity_id,is_active) VALUES (%s,%s,%s)
               ON DUPLICATE KEY UPDATE is_active=VALUES(is_active)""", (entity, entity_id, active))

@bp.get("/subjects")
@require_auth()
def subjects():
    filters=[]; params=[]; search=request.args.get("search", "")
    for key,column in [("department_id","s.department_id"),("scheme_id","s.scheme_id"),("semester_id","s.semester_id")]:
        if request.args.get(key): filters.append(f"{column}=%s"); params.append(request.args[key])
    where=" AND ".join(["(s.subject_code LIKE %s OR s.subject_name LIKE %s)"]+filters)
    params=[f"%{search}%",f"%{search}%"]+params
    items=rows(f"""SELECT s.subject_id AS id,s.subject_code AS code,s.subject_name AS name,s.department_id,s.scheme_id,s.semester_id,
                    d.department_name AS department,sem.semester_no,sem.semester_type,sg.group_name,s.cycle,s.is_optional,s.option_group_id,
                    s.lecture_hours,s.tutorial_hours,s.practical_hours,s.credits,COALESCE(es.is_active,1) AS is_active,
                    COUNT(DISTINCT fs.faculty_id) AS eligible_faculty,COUNT(DISTINCT a.assignment_id) AS assignments
             FROM subject s JOIN department d ON d.department_id=s.department_id JOIN semester sem ON sem.semester_id=s.semester_id
             JOIN subject_group sg ON sg.group_id=s.group_id LEFT JOIN entity_status es ON es.entity_type='subject' AND es.entity_id=s.subject_id
             LEFT JOIN faculty_subject fs ON fs.subject_id=s.subject_id LEFT JOIN faculty_subject_assignment a ON a.subject_id=s.subject_id AND a.status='Active'
             WHERE {where} GROUP BY s.subject_id,d.department_name,sem.semester_no,sem.semester_type,sg.group_name,es.is_active ORDER BY s.subject_code""",tuple(params))
    for item in items:
        item["type"]="Lab" if item["practical_hours"] else "Theory"; item["status"]="Active" if item.pop("is_active") else "Inactive"
    return ok(items)

@bp.get("/subjects/<int:subject_id>")
@require_auth()
def subject_detail(subject_id):
    item=row("SELECT * FROM subject WHERE subject_id=%s",(subject_id,))
    if not item:return fail("Subject not found.",404)
    item["eligible_faculty"]=rows("SELECT f.faculty_id,f.faculty_name FROM faculty_subject fs JOIN faculty f ON f.faculty_id=fs.faculty_id WHERE fs.subject_id=%s",(subject_id,))
    item["assignments"]=rows("SELECT assignment_id,faculty_id,academic_year,status FROM faculty_subject_assignment WHERE subject_id=%s",(subject_id,))
    return ok(item)

@bp.post("/subjects")
@require_auth(EDITORS)
def create_subject():
    d=request.get_json(silent=True) or {}; needed=("code","name","department_id","semester_id","scheme_id","group_id")
    if any(d.get(field) in (None,"") for field in needed): return fail("Code, name, department, semester, scheme, and group are required.")
    if row("SELECT 1 FROM subject WHERE subject_code=%s AND department_id=%s AND semester_id=%s AND scheme_id=%s",(d["code"].strip(),d["department_id"],d["semester_id"],d["scheme_id"])): return fail("This subject already exists for the selected academic grouping.",409)
    result=execute("""INSERT INTO subject (subject_code,subject_name,department_id,teaching_department_id,semester_id,scheme_id,group_id,cycle,is_optional,option_group_id,lecture_hours,tutorial_hours,practical_hours,credits)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",(d["code"].strip(),d["name"].strip(),d["department_id"],d.get("teaching_department_id"),d["semester_id"],d["scheme_id"],d["group_id"],d.get("cycle"),bool(d.get("is_optional",False)),d.get("option_group_id"),int(d.get("lecture_hours",0)),int(d.get("tutorial_hours",0)),int(d.get("practical_hours",0)),int(d.get("credits",0))))
    audit("Created Subject","Subjects",d["code"]); return ok({"id":result["id"]},201)

@bp.patch("/subjects/<int:subject_id>")
@require_auth(EDITORS)
def update_subject(subject_id):
    current=row("SELECT * FROM subject WHERE subject_id=%s",(subject_id,)); d=request.get_json(silent=True) or {}
    if not current:return fail("Subject not found.",404)
    fields=[("subject_code","code"),("subject_name","name"),("department_id","department_id"),("teaching_department_id","teaching_department_id"),("semester_id","semester_id"),("scheme_id","scheme_id"),("group_id","group_id"),("cycle","cycle"),("is_optional","is_optional"),("option_group_id","option_group_id"),("lecture_hours","lecture_hours"),("tutorial_hours","tutorial_hours"),("practical_hours","practical_hours"),("credits","credits")]
    values=[d.get(key,current[col]) for col,key in fields]; execute("UPDATE subject SET "+",".join(f"{col}=%s" for col,_ in fields)+" WHERE subject_id=%s",tuple(values+[subject_id])); audit("Updated Subject","Subjects",str(subject_id)); return ok({"id":subject_id})

@bp.delete("/subjects/<int:subject_id>")
@require_auth(EDITORS)
def deactivate_subject(subject_id):
    if not row("SELECT 1 FROM subject WHERE subject_id=%s",(subject_id,)):return fail("Subject not found.",404)
    status("subject",subject_id,False); audit("Deactivated Subject","Subjects",str(subject_id)); return ok({"id":subject_id,"status":"Inactive"})

@bp.get("/schemes")
@require_auth()
def schemes():
    items=rows("""SELECT sc.scheme_id AS id,sc.scheme_year,COALESCE(es.is_active,1) AS is_active,COUNT(DISTINCT s.subject_id) AS subjects,
                    COUNT(DISTINCT s.department_id) AS departments FROM scheme sc LEFT JOIN subject s ON s.scheme_id=sc.scheme_id
                    LEFT JOIN entity_status es ON es.entity_type='scheme' AND es.entity_id=sc.scheme_id GROUP BY sc.scheme_id,es.is_active ORDER BY sc.scheme_year DESC""")
    for i in items: i["name"]=f"VTU {i['scheme_year']} Scheme"; i["status"]="Active" if i.pop("is_active") else "Inactive"
    return ok(items)

@bp.post("/schemes")
@require_auth(EDITORS)
def create_scheme():
    d=request.get_json(silent=True) or {}; year=d.get("scheme_year")
    if not str(year).isdigit():return fail("A numeric scheme year is required.")
    if row("SELECT 1 FROM scheme WHERE scheme_year=%s",(year,)):return fail("This scheme year already exists.",409)
    result=execute("INSERT INTO scheme (scheme_year) VALUES (%s)",(year,)); audit("Created Scheme","Schemes",str(year));return ok({"id":result["id"],"scheme_year":int(year)},201)

@bp.patch("/schemes/<int:scheme_id>")
@require_auth(EDITORS)
def update_scheme(scheme_id):
    d=request.get_json(silent=True) or {}; year=d.get("scheme_year")
    if not str(year).isdigit():return fail("A numeric scheme year is required.")
    execute("UPDATE scheme SET scheme_year=%s WHERE scheme_id=%s",(year,scheme_id));audit("Updated Scheme","Schemes",str(scheme_id));return ok({"id":scheme_id})

@bp.delete("/schemes/<int:scheme_id>")
@require_auth(EDITORS)
def deactivate_scheme(scheme_id):
    if not row("SELECT 1 FROM scheme WHERE scheme_id=%s",(scheme_id,)):return fail("Scheme not found.",404)
    status("scheme",scheme_id,False);audit("Deactivated Scheme","Schemes",str(scheme_id));return ok({"id":scheme_id,"status":"Inactive"})

@bp.get("/semesters")
@require_auth()
def semesters(): return ok(rows("SELECT semester_id AS id,semester_no,semester_type FROM semester ORDER BY semester_no"))

@bp.post("/semesters")
@require_auth(["Admin"])
def create_semester():
    d=request.get_json(silent=True) or {}; no=d.get("semester_no"); typ=d.get("semester_type")
    if not isinstance(no,int) or typ not in ("Odd","Even"):return fail("Semester number and Odd/Even type are required.")
    result=execute("INSERT INTO semester (semester_no,semester_type) VALUES (%s,%s)",(no,typ)); audit("Created Semester","Semesters",str(no)); return ok({"id":result["id"]},201)

@bp.get("/faculty-subjects")
@require_auth()
def faculty_subjects(): return ok(rows("""SELECT fs.faculty_subject_id AS id,fs.faculty_id,fs.subject_id,f.faculty_name,s.subject_code,s.subject_name
                                     FROM faculty_subject fs JOIN faculty f ON f.faculty_id=fs.faculty_id JOIN subject s ON s.subject_id=fs.subject_id ORDER BY f.faculty_name,s.subject_code"""))

@bp.post("/faculty-subjects")
@require_auth(EDITORS)
def add_eligibility():
    d=request.get_json(silent=True) or {}
    if not d.get("faculty_id") or not d.get("subject_id"):return fail("Faculty and subject are required.")
    if row("SELECT 1 FROM faculty_subject WHERE faculty_id=%s AND subject_id=%s",(d["faculty_id"],d["subject_id"])):return fail("Eligibility already exists.",409)
    result=execute("INSERT INTO faculty_subject (faculty_id,subject_id) VALUES (%s,%s)",(d["faculty_id"],d["subject_id"]));audit("Added Faculty Subject Eligibility","Faculty Subjects",str(result["id"]));return ok({"id":result["id"]},201)

@bp.delete("/faculty-subjects/<int:item_id>")
@require_auth(EDITORS)
def delete_eligibility(item_id):
    execute("DELETE FROM faculty_subject WHERE faculty_subject_id=%s",(item_id,));audit("Removed Faculty Subject Eligibility","Faculty Subjects",str(item_id));return ok({"id":item_id})

@bp.get("/faculty-subject-assignments")
@require_auth()
def assignments():
    year=request.args.get("academic_year","")
    sql="""SELECT a.assignment_id AS id,a.faculty_id,a.subject_id,a.academic_year,a.status,a.created_at,a.updated_at,f.faculty_name,s.subject_code,s.subject_name
           FROM faculty_subject_assignment a JOIN faculty f ON f.faculty_id=a.faculty_id JOIN subject s ON s.subject_id=a.subject_id"""; params=()
    if year:sql+=" WHERE a.academic_year=%s";params=(year,)
    return ok(rows(sql+" ORDER BY a.created_at DESC",params))

@bp.post("/faculty-subject-assignments")
@require_auth(EDITORS)
def create_assignment():
    d=request.get_json(silent=True) or {}
    if not d.get("faculty_id") or not d.get("subject_id") or not d.get("academic_year"):return fail("Faculty, subject, and academic year are required.")
    # Assignment is accepted as eligibility for legacy data, while recording an explicit eligibility row where possible.
    if not row("SELECT 1 FROM faculty_subject WHERE faculty_id=%s AND subject_id=%s",(d["faculty_id"],d["subject_id"])):execute("INSERT INTO faculty_subject (faculty_id,subject_id) VALUES (%s,%s)",(d["faculty_id"],d["subject_id"]))
    result=execute("INSERT INTO faculty_subject_assignment (faculty_id,subject_id,academic_year,status) VALUES (%s,%s,%s,'Active')",(d["faculty_id"],d["subject_id"],d["academic_year"]));audit("Created Faculty Subject Assignment","Assignments",str(result["id"]));return ok({"id":result["id"]},201)

@bp.patch("/faculty-subject-assignments/<int:item_id>")
@require_auth(EDITORS)
def update_assignment(item_id):
    d=request.get_json(silent=True) or {}; state_value=d.get("status")
    if state_value not in ("Active","Inactive"):return fail("Status must be Active or Inactive.")
    execute("UPDATE faculty_subject_assignment SET status=%s,updated_at=NOW() WHERE assignment_id=%s",(state_value,item_id));audit("Updated Faculty Subject Assignment","Assignments",str(item_id));return ok({"id":item_id,"status":state_value})

@bp.get("/timetable-constraints")
@require_auth()
def constraints():
    filters=[];params=[]
    for key in ("department_id","scheme_id","academic_year","semester_type","semester_id"):
        if request.args.get(key):filters.append(f"{key}=%s");params.append(request.args[key])
    where=" WHERE "+" AND ".join(filters) if filters else ""
    return ok(rows("SELECT * FROM timetable_constraints"+where+" ORDER BY created_at DESC",tuple(params)))

@bp.post("/timetable-constraints")
@require_auth(EDITORS)
def create_constraint():
    d=request.get_json(silent=True) or {}; req=("department_id","scheme_id","academic_year","semester_type","semester_id","working_days","periods_per_day","college_start_time","period_duration","lunch_after_period","max_periods_per_day","max_periods_per_week")
    if any(d.get(x) in (None,"") for x in req):return fail("All core timetable constraint fields are required.")
    fields=["department_id","scheme_id","academic_year","semester_type","semester_id","working_days","periods_per_day","college_start_time","period_duration","lunch_after_period","short_break_after_period","short_break_duration","max_periods_per_day","max_periods_per_week","lab_duration"]
    result=execute("INSERT INTO timetable_constraints ("+",".join(fields)+") VALUES ("+",".join(["%s"]*len(fields))+")",tuple(d.get(f,3 if f=="lab_duration" else None) for f in fields));audit("Created Timetable Constraint","Constraints",str(result["id"]));return ok({"id":result["id"]},201)
