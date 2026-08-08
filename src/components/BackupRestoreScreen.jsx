import React from 'react';
import { Database, Download, RefreshCw, HardDrive, CheckCircle2 } from 'lucide-react';

export default function BackupRestoreScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Database Backup & Disaster Recovery</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Create full SQL dumps or restore the system to a previous state.</p>
        </div>
        <button className="btn-primary"><Database size={16} /> Create Manual Backup Now</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="skit-card">
          <div style={{ fontWeight: '800', fontSize: '1rem', marginBottom: '14px' }}>Backup History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { name: 'backup_skit_2026_07_20.sql', size: '48.2 MB', date: '20/07/2026 02:00 AM' },
              { name: 'backup_skit_2026_07_19.sql', size: '47.9 MB', date: '19/07/2026 02:00 AM' },
              { name: 'backup_skit_2026_07_18.sql', size: '47.6 MB', date: '18/07/2026 02:00 AM' }
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{b.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.size} • {b.date}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="action-icon-btn"><Download size={16} /></button>
                  <button className="action-icon-btn"><RefreshCw size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="skit-card">
          <div style={{ fontWeight: '800', fontSize: '1rem', marginBottom: '14px' }}>Automated Cloud Backups</div>
          <div style={{ fontSize: '0.82rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ padding: '12px', background: '#DCFCE7', borderRadius: '8px', color: '#15803D', fontWeight: '700' }}>
              ✓ Daily Cloud Backup Enabled (Scheduled at 02:00 AM)
            </div>
            <div>Retention Policy: 30 Days</div>
            <div>Encrypted Storage: AES-256</div>
          </div>
        </div>
      </div>
    </div>
  );
}
