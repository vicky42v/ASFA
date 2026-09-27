import json
import os
import time
from typing import Any, Dict, List

import requests

from backend.db import row, rows
from backend.services.timetable_service import generate
from backend.services.timetable_validator import validate_entries


DEFAULT_N8N_WEBHOOK = "http://127.0.0.1:5678/webhook/ai-asfa-conflict"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen3:4b"


def _n8n_url() -> str:
    return os.getenv("AI_ASFA_N8N_WEBHOOK_URL", DEFAULT_N8N_WEBHOOK).strip()


def _ollama_url() -> str:
    return os.getenv("OLLAMA_BASE_URL", DEFAULT_OLLAMA_URL).rstrip("/")


def _model() -> str:
    return os.getenv("OLLAMA_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _json_safe(value):
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def _context_snapshot(context: Dict[str, Any]) -> Dict[str, Any]:
    """Build the smallest useful database snapshot for the AI planner."""
    subjects = rows(
        """
        SELECT
            s.subject_id,
            s.subject_code,
            s.subject_name,
            s.course_category,
            s.cycle,
            s.lecture_hours,
            s.tutorial_hours,
            s.practical_hours,
            sem.semester_no
        FROM subject s
        JOIN semester sem ON sem.semester_id = s.semester_id
        WHERE s.department_id = %s
          AND s.scheme_id = %s
          AND s.semester_id = %s
        ORDER BY s.subject_code
        """,
        (
            context["department_id"],
            context["scheme_id"],
            context["semester_id"],
        ),
    )

    assignments = rows(
        """
        SELECT
            d.subject_id,
            s.subject_code,
            d.component,
            d.assignment_role,
            d.faculty_id,
            f.faculty_name,
            f.max_workload
        FROM faculty_subject_assignment_detail d
        JOIN subject s ON s.subject_id = d.subject_id
        JOIN faculty f ON f.faculty_id = d.faculty_id
        WHERE d.academic_year = %s
          AND d.status = 'Active'
          AND s.department_id = %s
          AND s.scheme_id = %s
          AND s.semester_id = %s
        ORDER BY s.subject_code, d.component, d.assignment_role
        """,
        (
            context["academic_year"],
            context["department_id"],
            context["scheme_id"],
            context["semester_id"],
        ),
    )

    faculty = rows(
        """
        SELECT
            f.faculty_id,
            f.faculty_name,
            f.designation,
            f.max_workload,
            f.status
        FROM faculty f
        WHERE f.status = 'Active'
          AND f.department_id = %s
        ORDER BY f.faculty_name
        """,
        (context["department_id"],),
    )

    constraint = row(
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

    return {
        "subjects": _json_safe(subjects),
        "assignments": _json_safe(assignments),
        "faculty": _json_safe(faculty),
        "constraints": _json_safe(constraint or {}),
    }


def _extract_candidate(payload: Any) -> Dict[str, Any]:
    """Accept common n8n/Ollama response shapes."""
    if isinstance(payload, dict):
        for key in ("timetable", "proposal", "result", "data", "body"):
            value = payload.get(key)
            if isinstance(value, dict):
                nested = _extract_candidate(value)
                if nested:
                    return nested
        if isinstance(payload.get("timetable"), list):
            return payload
        if isinstance(payload.get("response"), str):
            return _extract_candidate(payload["response"])
        if isinstance(payload.get("text"), str):
            return _extract_candidate(payload["text"])
        return payload

    if isinstance(payload, str):
        text = payload.strip()
        if text.startswith("```"):
            text = text.replace("```json", "", 1).replace("```", "")
        try:
            parsed = json.loads(text)
            return _extract_candidate(parsed)
        except json.JSONDecodeError:
            # Qwen may surround JSON with a short explanation. Find the
            # outermost JSON object as a tolerant last attempt.
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    return _extract_candidate(json.loads(text[start:end + 1]))
                except json.JSONDecodeError:
                    return {}
    return {}


def _call_n8n(payload: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(
        _n8n_url(),
        json=payload,
        timeout=float(os.getenv("AI_ASFA_N8N_TIMEOUT", "90")),
    )
    response.raise_for_status()
    raw = response.json()
    candidate = _extract_candidate(raw)
    if not isinstance(candidate, dict):
        raise ValueError("n8n returned an unsupported response shape.")
    return candidate


def _validate(context, entries, constraint=None):
    constraint = constraint or row(
        """
        SELECT * FROM timetable_constraints
        WHERE department_id=%s AND scheme_id=%s AND academic_year=%s
          AND semester_type=%s AND semester_id=%s
        ORDER BY constraint_id DESC LIMIT 1
        """,
        (
            context["department_id"],
            context["scheme_id"],
            context["academic_year"],
            context["semester_type"],
            context["semester_id"],
        ),
    )
    return validate_entries(entries or [], constraint, context)


def _fallback_generate(context):
    """Use the existing deterministic CP-SAT generator as the safety net."""
    fallback_context = dict(context)
    fallback_context["number_of_outputs"] = 1
    fallback_context["generation_seed"] = int(time.time() * 1000) % 2147483647
    result = generate(fallback_context)
    if not result.get("success"):
        return None, result.get("validation") or {}, "cp-sat fallback"

    entries = result.get("timetable") or []
    validation = _validate(context, entries)
    if validation.get("valid"):
        return entries, validation, "cp-sat fallback"

    return None, validation, "cp-sat fallback"


def resolve_timetable(context: Dict[str, Any], entries: List[Dict[str, Any]], conflicts: List[Any], warnings: List[Any] = None) -> Dict[str, Any]:
    warnings = warnings or []
    current_validation = _validate(context, entries)

    snapshot = _context_snapshot(context)
    prompt_payload = {
        "task": "AI-ASFA timetable conflict resolution and alternative generation",
        "instructions": [
            "Return ONLY valid JSON. No markdown and no explanation outside JSON.",
            "Keep every subject_id, faculty_id, co_faculty_id, component and cycle tied to the database context.",
            "Do not invent faculty or subjects.",
            "Theory uses Main faculty only; Co faculty is allowed only for Lab.",
            "Keep Lab blocks contiguous and within the configured breaks/lunch rules.",
            "Do not solve a conflict by changing faculty assignments.",
            "You may move sessions to different valid day/period slots.",
            "If the current timetable is valid, generate ONE different valid alternative.",
            "The backend validator will reject any invalid proposal.",
            "Return {status, explanation, timetable} where timetable is an array of rows.",
        ],
        "context": _json_safe(context),
        "database": snapshot,
        "current_timetable": _json_safe(entries),
        "conflicts": _json_safe(conflicts),
        "warnings": _json_safe(warnings),
        "current_validation": _json_safe(current_validation),
        "model": _model(),
    }

    try:
        candidate = _call_n8n(prompt_payload)
        proposed = candidate.get("timetable") if isinstance(candidate, dict) else None
        if isinstance(proposed, list) and proposed:
            validation = _validate(context, proposed)
            if validation.get("valid"):
                return {
                    "success": True,
                    "source": "n8n + Ollama",
                    "timetable": proposed,
                    "validation": validation,
                    "conflicts": validation.get("conflicts", []),
                    "warnings": validation.get("warnings", []),
                    "explanation": candidate.get("explanation") or "AI generated a proposal that passed the backend validator.",
                    "ai_status": "available",
                }

            # Preserve the useful reason so the frontend can explain that
            # AI was rejected rather than silently accepting bad output.
            ai_validation = validation
        else:
            ai_validation = {"valid": False, "errors": ["n8n did not return a timetable array."], "conflicts": []}
    except (requests.RequestException, ValueError, KeyError) as exc:
        ai_validation = {"valid": False, "errors": [str(exc)], "conflicts": []}

    fallback_entries, fallback_validation, fallback_source = _fallback_generate(context)
    if fallback_entries:
        return {
            "success": True,
            "source": fallback_source,
            "timetable": fallback_entries,
            "validation": fallback_validation,
            "conflicts": fallback_validation.get("conflicts", []),
            "warnings": fallback_validation.get("warnings", []),
            "explanation": "The AI proposal was unavailable or invalid, so the existing CP-SAT generator produced a fresh validated timetable.",
            "ai_status": "fallback",
            "ai_validation": ai_validation,
        }

    return {
        "success": False,
        "source": "none",
        "timetable": [],
        "validation": fallback_validation or ai_validation,
        "conflicts": (fallback_validation or {}).get("conflicts", []),
        "warnings": (fallback_validation or {}).get("warnings", []),
        "explanation": "Neither the AI proposal nor the CP-SAT fallback produced a valid timetable.",
        "ai_status": "unavailable",
        "ai_validation": ai_validation,
    }


def service_status() -> Dict[str, Any]:
    status = {
        "n8n_url": _n8n_url(),
        "ollama_url": _ollama_url(),
        "model": _model(),
        "n8n_available": False,
        "ollama_available": False,
    }

    try:
        response = requests.get(_ollama_url() + "/api/tags", timeout=3)
        response.raise_for_status()
        models = response.json().get("models", [])
        status["ollama_available"] = any(
            str(item.get("name")) == _model() for item in models if isinstance(item, dict)
        )
    except requests.RequestException:
        pass

    try:
        base = _n8n_url().split("/webhook/", 1)[0].rstrip("/")
        response = requests.get(base, timeout=3)
        status["n8n_available"] = response.status_code < 500
    except requests.RequestException:
        pass

    status["ready"] = bool(status["n8n_available"] and status["ollama_available"])
    return status
