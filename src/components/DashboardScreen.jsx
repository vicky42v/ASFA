import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  Users, 
  BookOpen, 
  CalendarDays, 
  UserPlus, 
  FileUp, 
  CalendarPlus, 
  ArrowRight,
  Clock,
  Sparkles,
  UserCheck,
  BellRing,
  BarChart3
} from 'lucide-react';
import AiChatbotWidget from './AiChatbotWidget';
import { dashboardApi } from '../services/api';

export default function DashboardScreen({ onNavigate, onOpenAddDept, onOpenUploadScheme }) {
  const [summary, setSummary] = useState({ counts: {}, recent_timetables: [] });
  useEffect(() => { dashboardApi.summary().then(setSummary).catch(() => {}); }, []);
  const handleQuickAction = (act) => {
    if (act === 'add-dept') onOpenAddDept();
    else if (act === 'upload-scheme') onOpenUploadScheme();
    else if (act === 'add-faculty') onNavigate('faculty');
    else if (act === 'generate-tt') onNavigate('timetables');
    else if (act === 'assign-hod') onNavigate('departments');
    else if (act === 'send-notif') onNavigate('notifications');
    else if (act === 'view-reports') onNavigate('reports');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Stat Cards Grid (Row 1) */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => onNavigate('departments')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon-wrapper"><Building2 size={26} /></div>
          <div className="stat-content">
            <span className="stat-label">Departments</span>
            <span className="stat-value">{summary.counts.departments ?? '—'}</span>
            <span className="stat-subtext">Total Departments</span>
          </div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('faculty')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon-wrapper"><Users size={26} /></div>
          <div className="stat-content">
            <span className="stat-label">Faculty</span>
            <span className="stat-value">{summary.counts.faculty ?? '—'}</span>
            <span className="stat-subtext">Total Faculty</span>
          </div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('subjects')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon-wrapper"><BookOpen size={26} /></div>
          <div className="stat-content">
            <span className="stat-label">Subjects</span>
            <span className="stat-value">{summary.counts.subjects ?? '—'}</span>
            <span className="stat-subtext">Active Subjects</span>
          </div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('timetables')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon-wrapper"><CalendarDays size={26} /></div>
          <div className="stat-content">
            <span className="stat-label">Timetables</span>
            <span className="stat-value">{summary.counts.timetable_groups ?? '—'}</span>
            <span className="stat-subtext">Active Timetables</span>
          </div>
        </div>
      </div>

      {/* Row 2: Quick Actions & Recent Timetables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* Quick Actions Card */}
        <div className="skit-card">
          <div className="card-header-row">
            <span className="card-title">Quick Actions</span>
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Frequent Admin Tasks</span>
          </div>

          <div className="quick-actions-grid">
            <div className="quick-action-btn" onClick={() => handleQuickAction('add-dept')}>
              <Building2 className="quick-action-icon" />
              <span className="quick-action-label">Add Department</span>
            </div>

            <div className="quick-action-btn" onClick={() => handleQuickAction('add-faculty')}>
              <UserPlus className="quick-action-icon" />
              <span className="quick-action-label">Add Faculty</span>
            </div>

            <div className="quick-action-btn" onClick={() => handleQuickAction('upload-scheme')}>
              <FileUp className="quick-action-icon" />
              <span className="quick-action-label">Upload Scheme</span>
            </div>

            <div className="quick-action-btn" onClick={() => handleQuickAction('generate-tt')}>
              <CalendarPlus className="quick-action-icon" />
              <span className="quick-action-label">Generate Timetable</span>
            </div>
          </div>
        </div>

        {/* Recent Timetables List Card */}
        <div className="skit-card">
          <div className="card-header-row">
            <span className="card-title">Recent Timetables</span>
            <button 
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
              onClick={() => onNavigate('generated-timetables')}
            >
              View All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {summary.recent_timetables.map((tt, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-dark)' }}>{tt.department_name} - {tt.semester_no} Sem</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Generated {tt.created_at ? new Date(tt.created_at).toLocaleString() : '—'}</div>
                </div>
                <span className="badge badge-published">{tt.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Embedded AI Assistant Card */}
      <AiChatbotWidget isFullPage={false} />

    </div>
  );
}
