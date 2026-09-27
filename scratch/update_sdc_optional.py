import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import execute, rows

app = create_app()
with app.app_context():
    cnt = execute("UPDATE subject SET is_optional = 1 WHERE course_category = 'SDC'")
    print(f"Updated SDC subjects to is_optional=1: {cnt}")
    
    # Also check if any SDC subjects have is_optional=0
    remaining = rows("SELECT count(*) as c FROM subject WHERE course_category = 'SDC' AND is_optional = 0")
    print(f"Remaining SDC with is_optional=0: {remaining[0]['c']}")
