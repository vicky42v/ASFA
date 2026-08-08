from flask import Blueprint, request, session
from backend.services.auth_service import authenticate
from backend.services.audit_service import audit
from backend.utils.http import ok, fail, require_auth

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email, password = data.get("email", ""), data.get("password", "")
    if not email or not password: return fail("Email and password are required.")
    user = authenticate(email, password)
    if not user: return fail("Invalid email or password.", 401)
    session.clear(); session["user"] = user
    audit("Login", "Authentication")
    return ok(user)

@bp.post("/logout")
@require_auth()
def logout():
    audit("Logout", "Authentication"); session.clear(); return ok({"message": "Signed out."})

@bp.get("/me")
def me():
    user = session.get("user")
    return ok(user) if user else fail("No active session.", 401)
