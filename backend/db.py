"""Small MySQL data-access helpers. All values are parameterized."""
from contextlib import contextmanager
import mysql.connector
from mysql.connector import Error, pooling
from flask import current_app

_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        cfg = dict(current_app.config["DB_CONFIG"])
        if cfg.get("host") == "localhost":
            cfg["host"] = "127.0.0.1"
        cfg["pool_name"] = "asfa_pool"
        cfg["pool_size"] = 15
        cfg["pool_reset_session"] = True
        _pool = pooling.MySQLConnectionPool(**cfg)
    return _pool


@contextmanager
def connection():
    conn = None
    try:
        try:
            conn = _get_pool().get_connection()
        except Exception:
            cfg = dict(current_app.config["DB_CONFIG"])
            if cfg.get("host") == "localhost":
                cfg["host"] = "127.0.0.1"
            conn = mysql.connector.connect(**cfg)
        yield conn
        conn.commit()
    except Error:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn and conn.is_connected():
            conn.close()


def rows(sql, params=()):
    with connection() as conn:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params)
        result = cursor.fetchall()
        cursor.close()
        return result


def row(sql, params=()):
    result = rows(sql, params)
    return result[0] if result else None


def execute(sql, params=()):
    with connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        result = {"id": cursor.lastrowid, "affected": cursor.rowcount}
        cursor.close()
        return result
