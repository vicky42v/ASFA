import React from 'react';
import { Settings, Save, Clock, Shield, Bell } from 'lucide-react';

export default function SettingsScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card">
        <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)', marginBottom: '4px' }}>System Settings & Academic Constraints</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '20px' }}>Configure default period timings, max daily workloads, and AI generator parameters.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
          <div className="form-group">
            <label className="form-label">Institution Name</label>
            <input type="text" className="form-input" defaultValue="Sri Krishna Institute of Technology (SKIT)" />
          </div>

          <div className="form-group">
            <label className="form-label">Default Class Duration (Minutes)</label>
            <input type="number" className="form-input" defaultValue={55} />
          </div>

          <div className="form-group">
            <label className="form-label">Max Faculty Teaching Hours Per Day</label>
            <input type="number" className="form-input" defaultValue={4} />
          </div>

          <div className="form-group">
            <label className="form-label">AI Optimization Mode</label>
            <select className="form-select">
              <option>Strict (Zero Conflicts & Balanced Workload)</option>
              <option>Flexible (Allow Consecutive Labs)</option>
            </select>
          </div>

          <button className="btn-primary" style={{ width: 'fit-content', marginTop: '10px' }}>
            <Save size={16} /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
