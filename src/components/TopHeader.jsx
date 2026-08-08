import React, { useState } from 'react';
import { Bell, ChevronDown, User, LogOut, Settings, Shield } from 'lucide-react';

export default function TopHeader({ title, subtitle, breadcrumbs, onNavigate, onLogout }) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="top-header">
      <div className="header-title-container">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="breadcrumbs">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span>&gt;</span>}
                <span 
                  className={bc.action ? "breadcrumb-link" : ""}
                  onClick={() => bc.action && onNavigate(bc.action)}
                >
                  {bc.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>

      <div className="header-right">
        {/* Notifications Icon Button */}
        <div style={{ position: 'relative' }}>
          <button 
            className="icon-btn" 
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            <Bell size={20} />
            <span className="unread-badge">3</span>
          </button>

          {showNotifications && (
            <div 
              style={{
                position: 'absolute',
                top: '50px',
                right: 0,
                width: '320px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: 'var(--shadow-dropdown)',
                zIndex: 50,
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', pb: '8px' }}>
                <span style={{ fontWeight: '800', fontSize: '0.92rem' }}>Admin Notifications</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '700', cursor: 'pointer' }}>Mark all read</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '0.82rem', padding: '8px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                  <div style={{ fontWeight: '700' }}>Scheme PDF Extracted</div>
                  <div style={{ fontSize: '0.76rem', color: '#64748B' }}>VTU 2025 Scheme successfully processed for AI&ML.</div>
                </div>
                <div style={{ fontSize: '0.82rem', padding: '8px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '3px solid #3B82F6' }}>
                  <div style={{ fontWeight: '700' }}>Timetable Generated</div>
                  <div style={{ fontSize: '0.76rem', color: '#64748B' }}>CSE 5th Sem timetable has 0 conflicts.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Menu */}
        <div style={{ position: 'relative' }}>
          <div 
            className="user-profile-menu" 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
          >
            <div className="avatar-circle">
              <User size={18} />
            </div>
            <span className="user-name">Admin</span>
            <ChevronDown size={16} style={{ color: '#64748B' }} />
          </div>

          {showProfileMenu && (
            <div 
              style={{
                position: 'absolute',
                top: '50px',
                right: 0,
                width: '200px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: 'var(--shadow-dropdown)',
                zIndex: 50,
                padding: '8px'
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '4px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.88rem' }}>System Administrator</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>admin@skit.ac.in</div>
              </div>
              <button 
                onClick={() => { onNavigate('settings'); setShowProfileMenu(false); }}
                style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '8px', fontSize: '0.85rem' }}
              >
                <Settings size={16} /> Account Settings
              </button>
              <button 
                onClick={() => { onNavigate('roles'); setShowProfileMenu(false); }}
                style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '8px', fontSize: '0.85rem' }}
              >
                <Shield size={16} /> Role & Permissions
              </button>
              <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />
              <button 
                onClick={onLogout}
                style={{ width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '8px', fontSize: '0.85rem', color: '#EF4444' }}
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
