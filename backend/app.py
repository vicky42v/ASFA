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
from backend.routes.admin import bp as admin_bp
from backend.routes.chatbot import bp as chatbot_bp

def create_app():
    app=Flask(__name__); app.config.from_object(Config)
    app.config.update(SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE="Lax")
    CORS(app,origins=r".*",supports_credentials=True)
    for blueprint in (auth_bp,academic_bp,catalog_bp,faculty_assignment_rules_bp,timetable_bp,admin_bp,chatbot_bp):app.register_blueprint(blueprint)
    @app.get("/api/health")
    def health(): return {"success":True,"service":"ai-asfa-backend"}
    @app.errorhandler(Error)
    def database_error(error): return fail("Database request could not be completed. Check the local MySQL configuration.",503)
    @app.errorhandler(404)
    def not_found(error): return fail("Endpoint not found.",404)
    @app.errorhandler(500)
    def server_error(error): return fail("The server could not complete this request.",500)
    return app

if __name__=="__main__": create_app().run(host="127.0.0.1",port=5000,debug=os.getenv("FLASK_DEBUG") == "1")
