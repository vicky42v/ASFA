import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import LoginScreen from './components/LoginScreen';

import DashboardScreen from './components/DashboardScreen';
import DepartmentsScreen from './components/DepartmentsScreen';
import FacultyScreen from './components/FacultyScreen';
import AcademicYearsScreen from './components/AcademicYearsScreen';
import SchemesScreen from './components/SchemesScreen';
import SubjectsScreen from './components/SubjectsScreen';
import TimetableDashboardScreen from './components/TimetableDashboardScreen';
import ReportsScreen from './components/ReportsScreen';
import AiChatbotWidget from './components/AiChatbotWidget';
import NotificationsScreen from './components/NotificationsScreen';
import SettingsScreen from './components/SettingsScreen';
import RoleManagementScreen from './components/RoleManagementScreen';
import AuditLogsScreen from './components/AuditLogsScreen';
import BackupRestoreScreen from './components/BackupRestoreScreen';

import AddDepartmentModal from './components/AddDepartmentModal';
import UploadSchemeModal from './components/UploadSchemeModal';

const pageMetadata = {
  'dashboard': { title: 'Welcome, Admin', subtitle: 'Manage the entire academic scheduling system.', bc: [{ label: 'Dashboard' }] },
  'departments': { title: 'Departments', subtitle: 'Manage academic departments and assigned HODs.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Departments' }] },
  'faculty': { title: 'Faculty Management', subtitle: 'AI-powered faculty onboarding, profiles and workload management.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Faculty' }] },
  'academic-years': { title: 'Academic Years', subtitle: 'Manage academic year sessions and terms.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Academic Years' }] },
  'schemes': { title: 'Schemes & Syllabi', subtitle: 'Upload and manage academic schemes and syllabi.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Schemes' }] },
  'subjects': { title: 'Subjects Directory', subtitle: 'Manage and organize all subjects offered by departments.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Subjects' }] },
  'timetables': { title: 'Timetable Dashboard', subtitle: 'Generate and manage department timetables with AI assistance.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Timetables' }] },
  'generated-timetables': { title: 'Generated Timetables', subtitle: 'Catalog of published department timetables.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Generated Timetables' }] },
  'reports': { title: 'Reports & Analytics', subtitle: 'Insights and analytics for academic scheduling.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Reports' }] },
  'ai-chatbot': { title: 'AI Assistant', subtitle: 'Ask anything about the academic scheduling system.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'AI Chatbot' }] },
  'notifications': { title: 'Notifications Center', subtitle: 'System updates and administrative alerts.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Notifications' }] },
  'settings': { title: 'System Settings', subtitle: 'Manage academic rules and preferences.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Settings' }] },
  'roles': { title: 'Users & Permissions', subtitle: 'Manage system users and access roles.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Role Management' }] },
  'audit-logs': { title: 'Audit Trail', subtitle: 'Security audit logs of system activity.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Audit Logs' }] },
  'backup-restore': { title: 'Backup & Recovery', subtitle: 'Manage system database backups.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Backup & Restore' }] },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Modal states
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [isUploadSchemeOpen, setIsUploadSchemeOpen] = useState(false);

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  const meta = pageMetadata[activeTab] || pageMetadata['dashboard'];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardScreen 
            onNavigate={setActiveTab}
            onOpenAddDept={() => setIsAddDeptOpen(true)}
            onOpenUploadScheme={() => setIsUploadSchemeOpen(true)}
          />
        );
      case 'departments':
        return <DepartmentsScreen onOpenAddDept={() => setIsAddDeptOpen(true)} />;
      case 'faculty':
        return <FacultyScreen />;
      case 'academic-years':
        return <AcademicYearsScreen />;
      case 'schemes':
        return <SchemesScreen onOpenUploadScheme={() => setIsUploadSchemeOpen(true)} />;
      case 'subjects':
        return <SubjectsScreen />;
      case 'timetables':
      case 'generated-timetables':
        return <TimetableDashboardScreen />;
      case 'reports':
        return <ReportsScreen />;
      case 'ai-chatbot':
        return <AiChatbotWidget isFullPage={true} />;
      case 'notifications':
        return <NotificationsScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'roles':
        return <RoleManagementScreen />;
      case 'audit-logs':
        return <AuditLogsScreen />;
      case 'backup-restore':
        return <BackupRestoreScreen />;
      default:
        return <DashboardScreen onNavigate={setActiveTab} onOpenAddDept={() => setIsAddDeptOpen(true)} onOpenUploadScheme={() => setIsUploadSchemeOpen(true)} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={() => setIsAuthenticated(false)} 
      />

      <div className="main-wrapper">
        <TopHeader 
          title={meta.title} 
          subtitle={meta.subtitle}
          breadcrumbs={meta.bc}
          onNavigate={setActiveTab}
          onLogout={() => setIsAuthenticated(false)}
        />

        <main className="page-content">
          {renderContent()}
        </main>
      </div>

      {/* Modals */}
      <AddDepartmentModal 
        isOpen={isAddDeptOpen}
        onClose={() => setIsAddDeptOpen(false)}
        onSave={(data) => {
          alert(`Department "${data.name}" successfully created!`);
          setIsAddDeptOpen(false);
        }}
      />

      <UploadSchemeModal 
        isOpen={isUploadSchemeOpen}
        onClose={() => setIsUploadSchemeOpen(false)}
        onSaveScheme={(extracted) => {
          alert(`Extracted scheme saved for ${extracted.department} (${extracted.semester})!`);
          setIsUploadSchemeOpen(false);
        }}
      />
    </div>
  );
}
