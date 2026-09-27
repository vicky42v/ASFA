import os

from flask import Flask
from flask_cors import CORS
from mysql.connector import Error

from backend.config import Config
from backend.utils.http import fail

from backend.routes.auth import bp as auth_bp
from backend.routes.academic import bp as academic_bp
from backend.routes.catalog import bp as catalog_bp
from backend.routes.faculty_assignment_rules import bp as faculty_assignment_rules_bp
from backend.routes.timetable import bp as timetable_bp
from backend.routes.chatbot import bp as chatbot_bp
from backend.routes.ai_timetable import bp as ai_timetable_bp
from backend.routes.admin import bp as admin_bp
from backend.routes.asfa_rules import bp as asfa_rules_bp


def create_app():
    app = Flask(__name__)

    # Load configuration
    app.config.from_object(Config)

    # Session configuration
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax"
    )

    # CORS
    CORS(
        app,
        origins=r".*",
        supports_credentials=True
    )

    # Register all blueprints
    for blueprint in (
        auth_bp,
        academic_bp,
        catalog_bp,
        faculty_assignment_rules_bp,
        timetable_bp,
        ai_timetable_bp,
        admin_bp,
        chatbot_bp,
        asfa_rules_bp,
    ):
        app.register_blueprint(blueprint)

    # Health check
    @app.get("/api/health")
    def health():
        return {
            "success": True,
            "service": "ai-asfa-backend"
        }

    # Database error handler
    @app.errorhandler(Error)
    def database_error(error):
        return fail(
            "Database request could not be completed. "
            "Check the local MySQL configuration.",
            503
        )

    # 404 handler
    @app.errorhandler(404)
    def not_found(error):
        return fail(
            "Endpoint not found.",
            404
        )

    # 500 handler
    @app.errorhandler(500)
    def server_error(error):
        return fail(
            "The server could not complete this request.",
            500
        )

    return app


if __name__ == "__main__":
    app = create_app()

    # IMPORTANT:
    # 0.0.0.0 allows Docker/n8n to reach Flask
    # through host.docker.internal.
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=os.getenv("FLASK_DEBUG") == "1"
    )