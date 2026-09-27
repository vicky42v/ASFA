import React, { useEffect, useState } from 'react';
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
import GeneratedTimetablesScreen from './components/GeneratedTimetablesScreen';
import ReportsScreen from './components/ReportsScreen';
import AsfaRulesScreen from './components/AsfaRulesScreen';
import TrainingModulesScreen from './components/TrainingModulesScreen';
import AiChatbotWidget from './components/AiChatbotWidget';
import NotificationsScreen from './components/NotificationsScreen';
import SettingsScreen from './components/SettingsScreen';
import RoleManagementScreen from './components/RoleManagementScreen';
import AuditLogsScreen from './components/AuditLogsScreen';
import BackupRestoreScreen from './components/BackupRestoreScreen';

import AddDepartmentModal from './components/AddDepartmentModal';
import UploadSchemeModal from './components/UploadSchemeModal';
import GlobalAiChatbotButton from './components/GlobalAiChatbotButton';
import { authApi, departmentApi } from './services/api';

const pageMetadata = {
  'dashboard': { title: 'Welcome, Admin', subtitle: 'Manage the entire academic scheduling system.', bc: [{ label: 'Dashboard' }] },
  'departments': { title: 'Departments', subtitle: 'Manage academic departments and assigned HODs.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Departments' }] },
  'faculty': { title: 'Faculty Management', subtitle: 'AI-powered faculty onboarding, profiles and workload management.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Faculty' }] },
  'academic-years': { title: 'Academic Years', subtitle: 'Manage academic year sessions and terms.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Academic Years' }] },
  'schemes': { title: 'Schemes & Syllabi', subtitle: 'Upload and manage academic schemes and syllabi.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Schemes' }] },
  'subjects': { title: 'Subjects Directory', subtitle: 'Manage and organize all subjects offered by departments.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Subjects' }] },
  'timetables': { title: 'Timetable Dashboard', subtitle: 'Generate and manage department timetables with AI assistance.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Timetables' }] },
  'generated-timetables': { title: 'Generated Timetables', subtitle: 'Catalog of published department timetables.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Generated Timetables' }] },
  'asfa-rules': { title: 'ASFA Scheduling Rules', subtitle: 'Manage institutional guidelines, AICTE constraints, and solver weights.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'ASFA Rules' }] },
  'reports': { title: 'Reports & Analytics', subtitle: 'Insights and analytics for academic scheduling.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Reports' }] },
  'training-modules': { title: 'ASFA Training & Models', subtitle: 'Train, evaluate, and monitor ASFA intelligent scheduling models.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Training Modules' }] },
  'ai-chatbot': { title: 'AI Assistant', subtitle: 'Ask anything about the academic scheduling system.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'AI Chatbot' }] },
  'notifications': { title: 'Notifications Center', subtitle: 'System updates and administrative alerts.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Notifications' }] },
  'settings': { title: 'System Settings', subtitle: 'Manage academic rules and preferences.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Settings' }] },
  'roles': { title: 'Users & Permissions', subtitle: 'Manage system users and access roles.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Role Management' }] },
  'audit-logs': { title: 'Audit Trail', subtitle: 'Security audit logs of system activity.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Audit Logs' }] },
  'backup-restore': { title: 'Backup & Recovery', subtitle: 'Manage system database backups.', bc: [{ label: 'Dashboard', action: 'dashboard' }, { label: 'Backup & Restore' }] },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [timetableDepartmentId, setTimetableDepartmentId] = useState('');
  const [selectedSavedTimetable, setSelectedSavedTimetable] = useState(null);
  
  // Modal states
  const [isAddDeptOpen, setIsAddDeptOpen] = useState(false);
  const [isUploadSchemeOpen, setIsUploadSchemeOpen] = useState(false);

  useEffect(() => { 
    authApi.me().then(() => setIsAuthenticated(true)).catch(() => setIsAuthenticated(false)).finally(() => setCheckingSession(false)); 
  }, []);

  // Global Ctrl + and Ctrl - keyboard zoom listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
          e.preventDefault();
          const currentZoom = parseFloat(document.documentElement.style.zoom || '1.0');
          const newZoom = Math.min(Math.round((currentZoom + 0.1) * 10) / 10, 2.0);
          document.documentElement.style.zoom = `${newZoom}`;
        } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          const currentZoom = parseFloat(document.documentElement.style.zoom || '1.0');
          const newZoom = Math.max(Math.round((currentZoom - 0.1) * 10) / 10, 0.6);
          document.documentElement.style.zoom = `${newZoom}`;
        } else if (e.key === '0' || e.code === 'Numpad0') {
          e.preventDefault();
          document.documentElement.style.zoom = '1.0';
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const logout = async () => { try { await authApi.logout(); } finally { setIsAuthenticated(false); } };

  if (checkingSession) return null;
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
        return <DepartmentsScreen onOpenAddDept={() => setIsAddDeptOpen(true)} onSelectDepartment={(department) => { setTimetableDepartmentId(department.department_id || department.id || ''); setActiveTab('timetables'); }} />;
      case 'faculty':
        return <FacultyScreen />;
      case 'academic-years':
        return <AcademicYearsScreen />;
      case 'schemes':
        return <SchemesScreen onOpenUploadScheme={() => setIsUploadSchemeOpen(true)} />;
      case 'subjects':
        return <SubjectsScreen />;
      case 'timetables':
        return (
          <TimetableDashboardScreen
            initialDepartmentId={timetableDepartmentId}
            initialTimetable={selectedSavedTimetable}
          />
        );
      case 'generated-timetables':
        return (
          <GeneratedTimetablesScreen
            onOpen={(savedItem) => {
              setSelectedSavedTimetable(savedItem);
              if (savedItem?.department_id) {
                setTimetableDepartmentId(savedItem.department_id);
              }
              setActiveTab('timetables');
            }}
            onRegenerate={(savedItem) => {
              setSelectedSavedTimetable(null);
              if (savedItem?.department_id) {
                setTimetableDepartmentId(savedItem.department_id);
              }
              setActiveTab('timetables');
            }}
          />
        );
      case 'asfa-rules':
        return <AsfaRulesScreen />;
      case 'reports':
        return <ReportsScreen />;
      case 'training-modules':
        return <TrainingModulesScreen />;
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
        onLogout={logout} 
      />

      <div className="main-wrapper">
        <TopHeader 
          title={meta.title} 
          subtitle={meta.subtitle}
          breadcrumbs={meta.bc}
          onNavigate={setActiveTab}
          onLogout={logout}
        />

        <main className="page-content">
          {renderContent()}
        </main>
      </div>

      {/* Modals */}
      <AddDepartmentModal 
        isOpen={isAddDeptOpen}
        onClose={() => setIsAddDeptOpen(false)}
        onSave={async (data) => { try { await departmentApi.create({ name: data.name, code: data.code }); setIsAddDeptOpen(false); } catch (error) { alert(error.message); } }}
      />

      <UploadSchemeModal 
        isOpen={isUploadSchemeOpen}
        onClose={() => setIsUploadSchemeOpen(false)}
        onSaveScheme={(extracted) => {
          alert(`Extracted scheme saved for ${extracted.department} (${extracted.semester})!`);
          setIsUploadSchemeOpen(false);
        }}
      />

      {/* Global AI Assistant Floating Button & Drawer (Hidden when already on dedicated AI Chatbot screen) */}
      <GlobalAiChatbotButton hide={activeTab === 'ai-chatbot'} />
    </div>
  );
}
