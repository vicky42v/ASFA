import sys
sys.path.insert(0, '.')
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    r = rows("SELECT * FROM asfa_rule WHERE rule_code = 'RULE_SEM7_ACTIVITY_REPLACEMENT'")
    for x in r:
        print(x)
