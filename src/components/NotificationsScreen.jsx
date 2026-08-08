import React, { useEffect, useState } from 'react';
import { Bell, Send, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { notificationApi } from '../services/api';

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const loadNotifications = () => { notificationApi.list().then(setNotifications).catch(() => setNotifications([])); };
  useEffect(() => { loadNotifications(); }, []);

  const handleBroadcast = async () => {
    const title = window.prompt("Enter Notification Title:");
    if (!title) return;
    const message = window.prompt("Enter Notification Message:");
    if (!message) return;
    try {
      await notificationApi.create({ title, message, level: 'info' });
      loadNotifications();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Admin Notifications Center</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Send broadcasts or review automated system alert notifications.</p>
        </div>
        <button className="btn-primary" onClick={handleBroadcast}><Send size={16} /> Broadcast Notification</button>
      </div>

      <div className="skit-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {notifications.map((notif) => (
          <div key={notif.notification_id} style={{ display: 'flex', gap: '14px', padding: '14px', background: '#F8FAFC', borderRadius: '10px', borderLeft: '4px solid var(--primary)' }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--text-dark)' }}>{notif.title}</div>
              <div style={{ fontSize: '0.82rem', color: '#64748B', margin: '2px 0 4px 0' }}>{notif.message}</div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{notif.created_at ? new Date(notif.created_at).toLocaleString() : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
