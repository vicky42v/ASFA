import sys
from PySide6.QtWidgets import QApplication
from login import LoginWindow

app = QApplication(sys.argv)

window = LoginWindow()
window.show()

sys.exit(app.exec())