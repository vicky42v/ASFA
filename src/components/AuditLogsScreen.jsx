import React, { useEffect, useState } from 'react';
import { History, Shield, CheckCircle2 } from 'lucide-react';
import { auditApi } from '../services/api';

export default function AuditLogsScreen() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { auditApi.list().then(setLogs).catch(() => setLogs([])); }, []);

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
              {logs.map((l) => (
                <tr key={l.audit_id}>
                  <td style={{ fontSize: '0.78rem' }}>{l.created_at ? new Date(l.created_at).toLocaleString() : ''}</td>
                  <td style={{ fontWeight: '700' }}>{l.actor_name}</td>
                  <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{l.action}</td>
                  <td>{l.module}</td>
                  <td style={{ fontSize: '0.78rem', color: '#64748B' }}>{l.ip_address}</td>
                  <td><span className="badge badge-active">{l.outcome}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
