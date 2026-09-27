import sys, os
sys.path.insert(0, os.path.abspath('.'))
from backend.app import create_app
from backend.db import rows

app = create_app()
with app.app_context():
    schemes = rows('SELECT * FROM scheme LIMIT 5')
    print("Schemes:", schemes)
