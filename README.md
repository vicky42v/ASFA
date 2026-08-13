# SKIT AI Academic Scheduling System

A state-of-the-art, high-performance Admin Dashboard UI/UX for the **Sri Krishna Institute of Technology (SKIT)** AI Academic Scheduling System built with React, Vite, Lucide Icons, Chart.js, and CSS design system.

## 🚀 Key Features & Modules

- **Dashboard**: High-level metrics, quick action triggers, recent published timetables, and embedded AI Assistant.
- **Department Management**: Complete department directory, HOD assignments, and faculty allocations modal.
- **AI-Powered Faculty Management**: Resume upload drag-and-drop zone with automated confidence scoring, faculty workload gauges, and complete profile preview.
- **AI Scheme PDF Upload**: Automated syllabus extractor table parsing department, semester, subject codes, credits, theory/lab hours, and elective statuses.
- **Timetable Generator**: Full interactive weekly grid matrix (Mon–Sat, Periods I–VII) with AI Assistant side-drawer for faculty slot recommendations and conflict resolution.
- **Reports & Analytics**: Interactive Chart.js graphs for subject type distribution, faculty workload, room utilization gauges, and department health indicators.
- **Role Management**: User directory with permission roles (Super Admin, HOD, Timetable Coordinator, Faculty) and role distribution analytics.
- **System Services**: Academic Sessions, Notifications Broadcast, Audit Trail Logs, Database Backup & Recovery, System Settings, and Glassmorphic Login.

## 🛠️ Technology Stack

- **Framework**: React 19 + Vite 6
- **Icons**: Lucide React
- **Charts**: Chart.js 4 + React-ChartJS-2
- **Styling**: Custom CSS Design System with CSS Variables & Tokens

## 💻 Getting Started

### Prerequisites

- Node.js v18+ and npm
- Python 3.10+ and MySQL 8+

### Installation & Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to view the application.

### Backend and database

1. Create `timetable_db` using the provided `timetable_db.sql` only when setting up a new local database. Do not import it into a database that already holds project data.
2. Copy `.env.example` to `.env` and enter local MySQL credentials.
   If the MySQL client is not on `PATH`, set `MYSQL_CLIENT_PATH` to its local executable.
3. Run the additive migrations once. They only add support tables/columns; they do not delete academic data.

```powershell
mysql -u root -p timetable_db < backend/migrations/001_admin_support.sql
mysql -u root -p timetable_db < backend/migrations/002_component_assignments_and_timetable_context.sql
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend/requirements.txt
.\.venv\Scripts\python -m backend.app
```

The API listens on `http://127.0.0.1:5000`. The browser communicates only with this API; MySQL credentials remain server-side. Create the first `Admin` account with the commented, password-hash-only example in the migration.

### Scheduling, backup, and chat

- `POST /api/timetable/generate` uses OR-Tools CP-SAT with actual subject hours, active assignments, timetable constraints, and existing faculty occupancy. A proposal is not saved until `POST /api/timetable/save` succeeds validation.
- The backup endpoint uses local `mysqldump`; restore requires an Admin role, a checksum-valid recorded backup, and the exact `RESTORE <filename>` confirmation. Restore is never automatic.
- `POST /api/chat` permits only controlled read-only database retrieval. Set `OLLAMA_MODEL` to use local Ollama; without it or when unavailable, the API returns a factual structured-data fallback.

### Building for Production

```bash
# Build production bundle
npm run build

# Preview production build
npm run preview
```

## 📁 Project Structure

```
admin/
├── public/
├── src/
│   ├── components/       # UI Components & Admin Screens
│   ├── data/             # Academic Mock Datasets
│   ├── App.jsx           # Main Shell & Route Handler
│   ├── index.css         # Custom Design System Tokens
│   └── main.jsx          # Entry point
├── index.html
├── package.json
└── vite.config.js
```

---
Developed for SKIT AI Academic Scheduling System.
