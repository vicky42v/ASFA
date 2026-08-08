import React, { useEffect, useState } from 'react';
import { Database, Download, RefreshCw, HardDrive, CheckCircle2 } from 'lucide-react';
import { backupApi } from '../services/api';

export default function BackupRestoreScreen() {
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState('');
  const load = () => backupApi.list().then(setBackups).catch(() => setBackups([]));
  useEffect(load, []);
  const createBackup = async () => { try { const backup = await backupApi.create(); setMessage(`Created ${backup.filename}`); load(); } catch (error) { setMessage(error.message); } };
  const restoreBackup = async (backup) => { const confirmation = window.prompt(`Restore is destructive. Type RESTORE ${backup.filename} to continue.`); if (!confirmation) return; try { await backupApi.restore(backup.id, confirmation); setMessage(`Restore of ${backup.filename} completed.`); } catch (error) { setMessage(error.message); } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Database Backup & Disaster Recovery</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Create full SQL dumps or restore the system to a previous state.</p>
        </div>
        <button className="btn-primary" onClick={createBackup}><Database size={16} /> Create Manual Backup Now</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="skit-card">
          <div style={{ fontWeight: '800', fontSize: '1rem', marginBottom: '14px' }}>Backup History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {backups.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{b.filename}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{((b.size_bytes || 0) / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="action-icon-btn" onClick={() => window.open(`http://127.0.0.1:5000/api/backups/${b.id}/download`, '_blank')}><Download size={16} /></button>
                  <button className="action-icon-btn" onClick={() => restoreBackup(b)}><RefreshCw size={16} /></button>
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
