from werkzeug.security import check_password_hash
from backend.db import row, execute


def authenticate(email, password):
    identifier = (email or '').strip().lower()
    user = row(
        """SELECT u.user_id, u.full_name, u.email, u.password_hash, u.role, u.department_id,
                  d.department_name
           FROM app_user u LEFT JOIN department d ON d.department_id = u.department_id
           WHERE (u.email=%s OR (u.role='Admin' AND %s IN ('admin', 'admin@skit.ac.in'))) AND u.status='Active'""",
        (identifier, identifier)
    )
    if not user or not check_password_hash(user["password_hash"], password):
        return None
    execute("UPDATE app_user SET last_login=NOW() WHERE user_id=%s", (user["user_id"],))
    return {
        "id": user["user_id"], "name": user["full_name"], "email": user["email"],
        "role": user["role"], "department_id": user["department_id"],
        "department": user["department_name"],
    }
