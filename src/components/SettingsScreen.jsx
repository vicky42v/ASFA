import React, { useEffect, useState } from 'react';
import { Settings, Save, Clock, Shield, Bell } from 'lucide-react';
import { settingsApi } from '../services/api';

export default function SettingsScreen() {
  const [settings, setSettings] = useState({
    institution_name: 'Sri Krishna Institute of Technology (SKIT)',
    class_duration: '55',
    max_faculty_hours: '4',
    ai_optimization_mode: 'Strict (Zero Conflicts & Balanced Workload)'
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    settingsApi.list().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        const map = {};
        list.forEach(item => { map[item.setting_key] = item.setting_value; });
        setSettings(prev => ({ ...prev, ...map }));
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await settingsApi.save(settings);
      setMessage('Settings saved successfully.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card">
        <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)', marginBottom: '4px' }}>System Settings & Academic Constraints</h2>
        <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '20px' }}>Configure default period timings, max daily workloads, and AI generator parameters.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
          <div className="form-group">
            <label className="form-label">Institution Name</label>
            <input 
              type="text" 
              className="form-input" 
              value={settings.institution_name} 
              onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Default Class Duration (Minutes)</label>
            <input 
              type="number" 
              className="form-input" 
              value={settings.class_duration} 
              onChange={(e) => setSettings({ ...settings, class_duration: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Max Faculty Teaching Hours Per Day</label>
            <input 
              type="number" 
              className="form-input" 
              value={settings.max_faculty_hours} 
              onChange={(e) => setSettings({ ...settings, max_faculty_hours: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">AI Optimization Mode</label>
            <select 
              className="form-select"
              value={settings.ai_optimization_mode}
              onChange={(e) => setSettings({ ...settings, ai_optimization_mode: e.target.value })}
            >
              <option>Strict (Zero Conflicts & Balanced Workload)</option>
              <option>Flexible (Allow Consecutive Labs)</option>
            </select>
          </div>

          {message && <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: '700' }}>{message}</div>}

          <button className="btn-primary" style={{ width: 'fit-content', marginTop: '10px' }} onClick={handleSave}>
            <Save size={16} /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
