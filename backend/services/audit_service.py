from flask import request, session
from backend.db import execute


def audit(action, module, details=None, outcome="Success"):
    user = session.get("user", {})
    try:
        execute(
            """INSERT INTO audit_log (user_id, actor_name, action, module, details, ip_address, outcome)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (user.get("id"), user.get("name", "System"), action, module, details,
             request.headers.get("X-Forwarded-For", request.remote_addr), outcome),
        )
    except Exception:
        # Audit must never make a successful academic action fail if support migration is absent.
        pass


def notify(title, message, level="info", user_id=None):
    try:
        execute(
            "INSERT INTO notification (user_id, title, message, level) VALUES (%s,%s,%s,%s)",
            (user_id, title, message, level),
        )
    except Exception:
        pass
