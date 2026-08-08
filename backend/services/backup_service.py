import hashlib, os, shutil, subprocess
from datetime import datetime
from pathlib import Path
from flask import current_app, session
from backend.db import rows, execute

def _dir():
    path=current_app.config["BACKUP_DIR"]; path.mkdir(parents=True,exist_ok=True); return path

def _checksum(path):
    digest=hashlib.sha256()
    with open(path,"rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""):digest.update(chunk)
    return digest.hexdigest()

def create_backup():
    executable=shutil.which("mysqldump")
    if not executable: raise RuntimeError("mysqldump was not found. Install MySQL client tools and add them to PATH.")
    filename=f"timetable_db_{datetime.now():%Y%m%d_%H%M%S}.sql"; target=_dir()/filename; cfg=current_app.config["DB_CONFIG"]
    env=os.environ.copy(); env["MYSQL_PWD"]=cfg["password"]
    with open(target,"wb") as output:
        run=subprocess.run([executable,"--single-transaction","--routines","--events","--host",cfg["host"],"--port",str(cfg["port"]),"--user",cfg["user"],cfg["database"]],stdout=output,stderr=subprocess.PIPE,env=env,check=False)
    if run.returncode:
        target.unlink(missing_ok=True); raise RuntimeError(run.stderr.decode(errors="replace").strip() or "MySQL backup failed.")
    checksum=_checksum(target); result=execute("INSERT INTO backup_record (filename,checksum,size_bytes,created_by) VALUES (%s,%s,%s,%s)",(filename,checksum,target.stat().st_size,session["user"]["id"]))
    return {"id":result["id"],"filename":filename,"size_bytes":target.stat().st_size,"checksum":checksum}

def backups(): return rows("SELECT backup_id AS id,filename,checksum,size_bytes,created_at FROM backup_record ORDER BY created_at DESC")

def restore(backup_id, confirmation):
    record=rows("SELECT * FROM backup_record WHERE backup_id=%s",(backup_id,))
    if not record:raise ValueError("Backup record was not found.")
    record=record[0]
    if confirmation != f"RESTORE {record['filename']}": raise ValueError("Confirmation text does not match. No restore was performed.")
    path=_dir()/record["filename"]
    if not path.is_file() or _checksum(path)!=record["checksum"]:raise ValueError("Backup file is missing or its checksum is invalid.")
    configured=current_app.config.get("MYSQL_CLIENT_PATH")
    executable=configured if configured and Path(configured).is_file() else shutil.which("mysql")
    if not executable:raise RuntimeError("mysql client was not found. Install MySQL client tools and add them to PATH.")
    cfg=current_app.config["DB_CONFIG"]; env=os.environ.copy();env["MYSQL_PWD"]=cfg["password"]
    with open(path,"rb") as input_file:run=subprocess.run([executable,"--host",cfg["host"],"--port",str(cfg["port"]),"--user",cfg["user"],cfg["database"]],stdin=input_file,stderr=subprocess.PIPE,env=env,check=False)
    if run.returncode:raise RuntimeError(run.stderr.decode(errors="replace").strip() or "Restore failed.")
    return record
