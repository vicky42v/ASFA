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
      try {
        const timingsObj = {
          collegeStartTime: settings.college_start_time || '09:00',
          periodDuration: Number(settings.class_duration) || 55,
          teaAfter: Number(settings.tea_break_after) || 2,
          teaDuration: Number(settings.tea_break_duration) || 15,
          lunchAfter: Number(settings.lunch_break_after) || 4,
          lunchDuration: Number(settings.lunch_break_duration) || 45,
          placementMaxPeriods: Number(settings.placement_max_periods) || 3,
        };
        localStorage.setItem('asfa_period_timings', JSON.stringify(timingsObj));
      } catch {}
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">College Start Time</label>
              <input 
                type="time" 
                className="form-input" 
                value={settings.college_start_time || '09:00'} 
                onChange={(e) => setSettings({ ...settings, college_start_time: e.target.value })} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Max Placement Periods / Block</label>
              <input 
                type="number" 
                min="1"
                max="3"
                className="form-input" 
                value={settings.placement_max_periods || '3'} 
                onChange={(e) => setSettings({ ...settings, placement_max_periods: e.target.value })} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div style={{ background: '#FFFBEB', padding: '12px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#B45309', marginBottom: '8px' }}>
                ☕ Tea Break
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.70rem', color: '#92400E', fontWeight: '700' }}>After Period</label>
                  <input
                    type="number"
                    min="1"
                    max="3"
                    className="form-input"
                    value={settings.tea_break_after || '2'}
                    onChange={(e) => setSettings({ ...settings, tea_break_after: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.70rem', color: '#92400E', fontWeight: '700' }}>Duration (Mins)</label>
                  <input
                    type="number"
                    min="10"
                    max="30"
                    className="form-input"
                    value={settings.tea_break_duration || '15'}
                    onChange={(e) => setSettings({ ...settings, tea_break_duration: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
              <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#166534', marginBottom: '8px' }}>
                🍱 Lunch Break
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.70rem', color: '#15803D', fontWeight: '700' }}>After Period</label>
                  <input
                    type="number"
                    min="3"
                    max="5"
                    className="form-input"
                    value={settings.lunch_break_after || '4'}
                    onChange={(e) => setSettings({ ...settings, lunch_break_after: e.target.value })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.70rem', color: '#15803D', fontWeight: '700' }}>Duration (Mins)</label>
                  <input
                    type="number"
                    min="30"
                    max="60"
                    className="form-input"
                    value={settings.lunch_break_duration || '45'}
                    onChange={(e) => setSettings({ ...settings, lunch_break_duration: e.target.value })}
                  />
                </div>
              </div>
            </div>
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
