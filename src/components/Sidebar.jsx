import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarRange,
  FileText,
  BookOpen,
  CalendarDays,
  CalendarCheck,
  BarChart3,
  Bot,
  Bell,
  Settings,
  ShieldCheck,
  Shield,
  History,
  Database,
  LogOut
} from 'lucide-react';
import SkitLogo from './SkitLogo';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'faculty', label: 'Faculty', icon: Users },
  { id: 'academic-years', label: 'Academic Years', icon: CalendarRange },
  { id: 'schemes', label: 'Schemes', icon: FileText },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'timetables', label: 'Timetable Generator', icon: CalendarDays },
  { id: 'generated-timetables', label: 'Generated Timetables', icon: CalendarCheck },
  { id: 'asfa-rules', label: 'ASFA Rules', icon: Shield, badge: 'Rules' },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'training-modules', label: 'Training Modules', icon: FileText },
  { id: 'ai-chatbot', label: 'AI Chatbot', icon: Bot, badge: 'AI' },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'roles', label: 'Role Management', icon: ShieldCheck },
  { id: 'audit-logs', label: 'Audit Logs', icon: History },
  { id: 'backup-restore', label: 'Backup & Restore', icon: Database },
];

export default function Sidebar({ activeTab, setActiveTab, onLogout }) {
  const handleNavigation = (itemId) => {
    // Don't update the state if the user clicks
    // the page that is already active.
    if (activeTab === itemId) {
      return;
    }

    setActiveTab(itemId);
  };

  return (
    <aside className="sidebar">

      {/* Sidebar Logo */}
      <div className="sidebar-logo">
        <SkitLogo size={42} />

        <div>
          <div className="logo-text-title">
            SKIT
          </div>

          <div className="logo-text-sub">
            AI Academic<br />
            Scheduling System
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavigation(item.id)}
            >
              <Icon className="nav-icon" />

              <span style={{ flex: 1 }}>
                {item.label}
              </span>

              {item.badge && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '99px',
                    background: isActive
                      ? '#FFFFFF'
                      : 'var(--primary-light)',
                    color: 'var(--primary)',
                    fontWeight: '800'
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="sidebar-footer">
        <button
          type="button"
          className="nav-item"
          onClick={onLogout}
          style={{ color: '#EF4444' }}
        >
          <LogOut
            className="nav-icon"
            style={{ color: '#EF4444' }}
          />

          <span>
            Logout
          </span>
        </button>
      </div>

    </aside>
  );
}