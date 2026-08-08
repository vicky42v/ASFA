import React from 'react';
import { History, Shield, CheckCircle2 } from 'lucide-react';

export default function AuditLogsScreen() {
  const logs = [
    { time: '20/07/2026 10:30:15 AM', user: 'Admin User', action: 'Created Department', module: 'Departments', ip: '192.168.1.10', status: 'Success' },
    { time: '20/07/2026 09:45:02 AM', user: 'Dr. Mahesh B', action: 'Generated Timetable', module: 'Timetables', ip: '192.168.1.24', status: 'Success' },
    { time: '19/07/2026 04:12:44 PM', user: 'Prof. Ramesh K', action: 'Uploaded Scheme PDF', module: 'Schemes', ip: '192.168.1.55', status: 'Success' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card">
        <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Security Audit Trail</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '16px' }}>Immutable log of administrative actions and access logs.</p>

        <div className="table-container">
          <table className="skit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>IP Address</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.78rem' }}>{l.time}</td>
                  <td style={{ fontWeight: '700' }}>{l.user}</td>
                  <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{l.action}</td>
                  <td>{l.module}</td>
                  <td style={{ fontSize: '0.78rem', color: '#64748B' }}>{l.ip}</td>
                  <td><span className="badge badge-active">{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
