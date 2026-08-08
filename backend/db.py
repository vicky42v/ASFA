"""Small MySQL data-access helpers. All values are parameterized."""
from contextlib import contextmanager
import mysql.connector
from mysql.connector import Error
from flask import current_app


@contextmanager
def connection():
    conn = None
    try:
        conn = mysql.connector.connect(**current_app.config["DB_CONFIG"])
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
