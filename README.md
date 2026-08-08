# SKIT AI Academic Scheduling System - Frontend Admin Dashboard

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

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/vicky42v/AI-ASFA.git

# Navigate to project directory
cd AI-ASFA

# Install dependencies
npm install

# Start local dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

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
