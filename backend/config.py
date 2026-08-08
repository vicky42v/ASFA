import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-your-local-env")
    DB_CONFIG = {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "database": os.getenv("DB_NAME", "timetable_db"),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
    }
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "")
    MYSQL_CLIENT_PATH = os.getenv("MYSQL_CLIENT_PATH", "")
    BACKUP_DIR = Path(os.getenv("BACKUP_DIR", Path(__file__).resolve().parents[1] / "backups"))
