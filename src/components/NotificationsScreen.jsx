import React from 'react';
import { Bell, Send, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export default function NotificationsScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Admin Notifications Center</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Send broadcasts or review automated system alert notifications.</p>
        </div>
        <button className="btn-primary"><Send size={16} /> Broadcast Notification</button>
      </div>

      <div className="skit-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[
          { title: 'Scheme PDF Extracted', time: '10 minutes ago', desc: 'AI successfully parsed VTU 2025 Scheme syllabus for AI & Machine Learning.', type: 'success' },
          { title: 'Timetable Published', time: '1 hour ago', desc: 'Computer Science 5th Sem timetable generated and published with 0 clashes.', type: 'info' },
          { title: 'Room Maintenance Alert', time: 'Yesterday', desc: 'Workstation upgrade completed in Lab-1.', type: 'success' }
        ].map((notif, i) => (
          <div key={i} style={{ display: 'flex', gap: '14px', padding: '14px', background: '#F8FAFC', borderRadius: '10px', borderLeft: '4px solid var(--primary)' }}>
            <Bell size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--text-dark)' }}>{notif.title}</div>
              <div style={{ fontSize: '0.82rem', color: '#64748B', margin: '2px 0 4px 0' }}>{notif.desc}</div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{notif.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
