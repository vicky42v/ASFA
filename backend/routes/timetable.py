from flask import Blueprint, request
from backend.db import row, rows, execute
from backend.utils.http import ok, fail, require_auth
from backend.services.timetable_service import generate
from backend.services.timetable_validator import validate_entries
from backend.services.audit_service import audit, notify

bp = Blueprint("timetable", __name__, url_prefix="/api/timetable")
EDITORS = ["Admin", "Coordinator", "HOD"]
CONTEXT = ("department_id","scheme_id","academic_year","semester_type","semester_id")

def context_from(data):
    missing=[field for field in CONTEXT if data.get(field) in (None,"")]
    return ({field:data[field] for field in CONTEXT},missing) if not missing else (None,missing)

@bp.get("")
@require_auth()
def list_timetable():
    data=request.args.to_dict(); context,missing=context_from(data)
    if missing:return fail("Missing timetable filter: "+", ".join(missing))
    entries=rows("""SELECT t.*,s.subject_code,s.subject_name,f.faculty_name FROM timetable t
                    LEFT JOIN subject s ON s.subject_id=t.subject_id LEFT JOIN faculty f ON f.faculty_id=t.faculty_id
                    WHERE t.department_id=%s AND t.scheme_id=%s AND t.academic_year=%s AND t.semester_type=%s AND t.semester_id=%s
                    ORDER BY FIELD(t.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'),t.period""",tuple(context.values()))
    return ok(entries)

@bp.post("/generate")
@require_auth(EDITORS)
def generate_timetable():
    context,missing=context_from(request.get_json(silent=True) or {})
    if missing:return fail("Missing timetable configuration: "+", ".join(missing))
    result=generate(context)
    if result["success"]:
        audit("Generated Timetable Proposal","Timetables",str(context));notify("Timetable generated","A timetable proposal was generated and is ready to save.","success")
        return ok(result)
    notify("Timetable generation needs attention","; ".join(result["validation"].get("errors",[])),"warning")
    return ok(result, 422)

@bp.post("/validate")
@require_auth()
def validate():
    payload=request.get_json(silent=True) or {}; entries=payload.get("entries")
    if entries is None:
        context,missing=context_from(payload)
        if missing:return fail("Provide entries or a complete timetable context.")
        entries=rows("SELECT * FROM timetable WHERE department_id=%s AND scheme_id=%s AND academic_year=%s AND semester_type=%s AND semester_id=%s",tuple(context.values()))
    constraint=None
    if payload.get("department_id"):
        context,_=context_from(payload)
        if context:constraint=row("SELECT * FROM timetable_constraints WHERE department_id=%s AND scheme_id=%s AND academic_year=%s AND semester_type=%s AND semester_id=%s ORDER BY constraint_id DESC LIMIT 1",tuple(context.values()))
    result=validate_entries(entries,constraint)
    return ok({"validation":result,"conflicts":result["conflicts"],"warnings":result["warnings"],"summary":result["summary"]})

@bp.post("/save")
@require_auth(EDITORS)
def save():
    payload=request.get_json(silent=True) or {}; context,missing=context_from(payload); entries=payload.get("entries",[])
    if missing:return fail("Missing timetable configuration: "+", ".join(missing))
    if not entries:return fail("There are no timetable entries to save.")
    existing=row("SELECT COUNT(*) AS count FROM timetable WHERE department_id=%s AND scheme_id=%s AND academic_year=%s AND semester_type=%s AND semester_id=%s",tuple(context.values()))
    if existing["count"]:return fail("A timetable already exists for this academic grouping. Existing records were preserved; use a deliberate manual change workflow rather than overwriting them.",409)
    constraint=row("SELECT * FROM timetable_constraints WHERE department_id=%s AND scheme_id=%s AND academic_year=%s AND semester_type=%s AND semester_id=%s ORDER BY constraint_id DESC LIMIT 1",tuple(context.values()))
    validation=validate_entries(entries,constraint)
    if not validation["valid"]:return fail("Timetable has validation conflicts and was not saved.",422,validation=validation)
    for item in entries:
        execute("""INSERT INTO timetable (department_id,scheme_id,academic_year,semester_type,semester_id,day,period,subject_id,faculty_id)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",(context["department_id"],context["scheme_id"],context["academic_year"],context["semester_type"],context["semester_id"],item["day"],item["period"],item.get("subject_id"),item.get("faculty_id")))
    audit("Saved Timetable","Timetables",str(context));notify("Timetable saved","The generated timetable was validated and saved.","success")
    return ok({"saved_entries":len(entries),"validation":validation},201)
