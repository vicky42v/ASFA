"""Read-only, intent-routed context for the local administrative assistant."""
import requests
from backend.db import row, rows

def context_for(question):
    q=question.lower()
    if any(word in q for word in ("faculty", "workload", "teach")):
        return {"kind":"faculty", "data":rows("""SELECT f.faculty_name, d.department_name, f.status, COALESCE(SUM(s.lecture_hours+s.tutorial_hours+s.practical_hours),0) AS weekly_hours
                                              FROM faculty f JOIN department d ON d.department_id=f.department_id LEFT JOIN faculty_subject_assignment a ON a.faculty_id=f.faculty_id AND a.status='Active' LEFT JOIN subject s ON s.subject_id=a.subject_id GROUP BY f.faculty_id,d.department_name ORDER BY weekly_hours DESC, f.faculty_name LIMIT 50""")}
    if "unassigned" in q or "missing assignment" in q or "before generating" in q:
        return {"kind":"unassigned_subjects", "data":rows("""SELECT s.subject_code,s.subject_name,d.department_name,sem.semester_no FROM subject s JOIN department d ON d.department_id=s.department_id JOIN semester sem ON sem.semester_id=s.semester_id LEFT JOIN faculty_subject_assignment a ON a.subject_id=s.subject_id AND a.status='Active' GROUP BY s.subject_id,s.subject_code,s.subject_name,d.department_name,sem.semester_no HAVING COUNT(a.assignment_id)=0""")}
    if "subject" in q:
        return {"kind":"subjects", "data":rows("SELECT s.subject_code,s.subject_name,d.department_name,sem.semester_no,s.credits FROM subject s JOIN department d ON d.department_id=s.department_id JOIN semester sem ON sem.semester_id=s.semester_id ORDER BY d.department_name,sem.semester_no,s.subject_code LIMIT 100")}
    if "scheme" in q:
        return {"kind":"schemes", "data":rows("SELECT scheme_id,scheme_year FROM scheme ORDER BY scheme_year DESC")}
    if "semester" in q:
        return {"kind":"semesters", "data":rows("SELECT semester_no,semester_type FROM semester ORDER BY semester_no")}
    if "constraint" in q:
        return {"kind":"constraints", "data":rows("SELECT department_id,scheme_id,academic_year,semester_type,semester_id,working_days,periods_per_day,max_periods_per_day,max_periods_per_week FROM timetable_constraints ORDER BY created_at DESC LIMIT 30")}
    if "timetable" in q or "conflict" in q:
        return {"kind":"timetables", "data":rows("""SELECT d.department_name,sem.semester_no,t.academic_year,t.semester_type,COUNT(*) AS entries,MAX(t.created_at) AS generated_at FROM timetable t JOIN department d ON d.department_id=t.department_id JOIN semester sem ON sem.semester_id=t.semester_id GROUP BY d.department_name,sem.semester_no,t.academic_year,t.semester_type ORDER BY generated_at DESC LIMIT 30""")}
    return {"kind":"overview", "data":{"departments":row("SELECT COUNT(*) AS count FROM department")["count"],"faculty":row("SELECT COUNT(*) AS count FROM faculty WHERE status='Active'")["count"],"subjects":row("SELECT COUNT(*) AS count FROM subject")["count"],"assignments":row("SELECT COUNT(*) AS count FROM faculty_subject_assignment WHERE status='Active'")["count"],"timetable_entries":row("SELECT COUNT(*) AS count FROM timetable")["count"]}}

def fallback(context):
    data=context["data"]
    if context["kind"]=="overview":return f"The system currently has {data['departments']} departments, {data['faculty']} active faculty members, {data['subjects']} subjects, {data['assignments']} active faculty-subject assignments, and {data['timetable_entries']} saved timetable entries."
    if context["kind"]=="unassigned_subjects":return "Subjects without active assignments: " + (", ".join(f"{x['subject_code']} ({x['department_name']}, Semester {x['semester_no']})" for x in data) if data else "none.")
    if not data:return "No matching academic data is configured yet."
    return "Here is the matching read-only system data: " + "; ".join(" — ".join(str(v) for v in item.values()) for item in data[:12])

def answer(question, base_url, model):
    context=context_for(question)
    if not model:return {"answer":fallback(context),"source":"structured database context","ollama_available":False}
    prompt=("You are AI-ASFA's admin assistant. Answer only using this controlled, read-only database context. "
            "Never claim you performed an action. Be concise and state missing configuration plainly.\n"
            f"Question: {question}\nContext type: {context['kind']}\nContext: {context['data']}")
    try:
        response=requests.post(f"{base_url}/api/generate",json={"model":model,"prompt":prompt,"stream":False},timeout=45)
        response.raise_for_status(); text=response.json().get("response","").strip()
        if text:return {"answer":text,"source":"Ollama with controlled database context","ollama_available":True}
    except requests.RequestException:
        pass
    return {"answer":fallback(context),"source":"structured database context; Ollama unavailable","ollama_available":False}
