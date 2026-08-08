from functools import wraps
from flask import jsonify, session


def ok(data=None, status=200, **extra):
    payload = {"success": True, "data": data}
    payload.update(extra)
    return jsonify(payload), status


def fail(message, status=400, **extra):
    payload = {"success": False, "message": message}
    payload.update(extra)
    return jsonify(payload), status


def require_auth(roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            user = session.get("user")
            if not user:
                return fail("Authentication is required.", 401)
            if roles and user["role"] not in roles:
                return fail("You do not have permission for this action.", 403)
            return fn(*args, **kwargs)
        return wrapped
    return decorator


def json_body(required=()):
    from flask import request
    body = request.get_json(silent=True) or {}
    missing = [field for field in required if body.get(field) in (None, "")]
    return body, missing
