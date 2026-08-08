import React from 'react';
import { CalendarRange, Plus, CheckCircle2 } from 'lucide-react';

export default function AcademicYearsScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Academic Year Sessions</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Configure academic year bounds, term start dates, and odd/even semester active statuses.</p>
        </div>
        <button className="btn-primary"><Plus size={16} /> New Academic Year</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="skit-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>2024 - 2025</span>
            <span className="badge badge-active">CURRENT ACTIVE</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>Odd Semesters: Aug 2024 - Dec 2024</div>
            <div>Even Semesters: Jan 2025 - May 2025</div>
            <div>Active Term: Odd Semesters</div>
          </div>
        </div>

        <div className="skit-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>2025 - 2026</span>
            <span className="badge badge-purple">UPCOMING</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>Odd Semesters: Aug 2025 - Dec 2025</div>
            <div>Even Semesters: Jan 2026 - May 2026</div>
          </div>
        </div>
      </div>
    </div>
  );
}
