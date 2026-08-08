from flask import Blueprint, request, current_app
from backend.utils.http import ok, fail, require_auth
from backend.services.chatbot_service import answer

bp=Blueprint("chatbot",__name__,url_prefix="/api")

@bp.post("/chat")
@require_auth()
def chat():
    message=(request.get_json(silent=True) or {}).get("message","").strip()
    if not message:return fail("A chat message is required.")
    return ok(answer(message,current_app.config["OLLAMA_BASE_URL"],current_app.config["OLLAMA_MODEL"]))
