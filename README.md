# AI-ASFA (SKIT) - Academic Scheduling & Faculty Allocation

AI Based Academic Scheduling and Faculty Allocation System for **Sri Krishna Institute of Technology (SKIT)**.
Built with React 19, Vite, Electron, Python Flask, OR-Tools CP-SAT, and MySQL.

---

## ⚡ Instant 1-Click Launch (Recommended)

When you clone or download this repository, you do **not** need to manually install dependencies. Simply run:

```cmd
Launch-AI-ASFA.bat
```

### What `Launch-AI-ASFA.bat` automatically does:
1. Verifies **Node.js** and **Python** are installed.
2. Creates `.env` configuration file from `.env.example` if not present.
3. Automatically creates Python virtual environment (`.venv`) and installs all Python packages (`requirements.txt`).
4. Automatically runs `npm install` if `node_modules` is not yet installed.
5. Launches the AI-ASFA Desktop application window!

---

## 🗄️ Database Setup (Complete Data Included)

This repository includes the complete, up-to-date database dump in `timetable_db.sql` (~21MB), including all departments, faculties, schemes, syllabus rules, and generated timetables.

### To import the database:
Double-click:
```cmd
setup_database.bat
```
*(Enter your MySQL root password when prompted, or default `root12345678`)*

Or run manually via command prompt / MySQL CLI:
```cmd
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS timetable_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p timetable_db < timetable_db.sql
```

---

## 📦 Manual Setup & Installation (Optional)

If you prefer installing dependencies manually step-by-step:

### 1. Python Backend
```cmd
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m backend.app
```
Backend runs at `http://127.0.0.1:5000`.

### 2. Frontend / Desktop
```cmd
npm install
npm run desktop    # For Electron desktop app
# OR
npm run dev        # For Web browser mode at http://localhost:5173
```

---

## 🚀 Key Features & Modules

- **AI-Driven Timetable Engine**: Constraint programming using Google OR-Tools CP-SAT with multi-shift, lab batching, cross-department sharing, and conflict resolution.
- **ASFA Custom Rule Engine**: Configurable strict/soft rules, consecutive period bounds, lunch locks, and gap minimization.
- **Faculty Management & Workload**: Automatic workload tracking, slot recommendations, and profile management.
- **Scheme Syllabus Extractor**: Parsing schemes, subject codes, credits, lecture/tutorial/practical distributions.
- **Export & Sync**: High-resolution print/PDF timetable exports, Excel exports, and local database backup/restore.
- **AI Chatbot & Assistant**: Embedded LLM assistant with local Ollama fallback for timetable queries.

---

## 📁 Repository Structure

```
AI-ASFA/
├── Launch-AI-ASFA.bat         # Automated launcher (installs dependencies & launches)
├── install_dependencies.bat   # Standalone package installer
├── setup_database.bat         # 1-click MySQL database importer
├── timetable_db.sql           # Complete project database dump with all records
├── requirements.txt           # Python backend dependencies
├── package.json               # Node.js & Electron dependencies
├── electron-main.cjs          # Electron desktop wrapper
├── backend/                   # Flask backend & OR-Tools CP-SAT scheduler
│   ├── app.py
│   ├── db.py
│   ├── routes/                # REST endpoints
│   ├── services/              # CP-SAT scheduler, ASFA rule engine, chat
│   └── migrations/            # SQL migration scripts
└── src/                       # React frontend
    ├── components/            # Dashboard screens, timetable matrix, rules
    ├── services/              # API services and export utilities
    └── assets/                # Logos, emblems, styling assets
```

---
Sri Krishna Institute of Technology (SKIT) — AI-ASFA Timetable System
