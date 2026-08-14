import React, { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, Plus, Search, Eye, Edit3, Trash2, Filter } from 'lucide-react';
import { departmentApi } from '../services/api';

export default function DepartmentsScreen({ onOpenAddDept, onSelectDepartment }) {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const loadDepartments = () => { departmentApi.list().then(setDepartments).catch(() => setDepartments([])); };
  useEffect(() => { loadDepartments(); }, []);

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate ${name}?`)) return;
    try {
      await departmentApi.deactivate(id);
      loadDepartments();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = departments.filter(d => 
    (d.name || d.department_name || '').toLowerCase().includes(search.toLowerCase()) || 
    (d.code || d.department_code || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.hod || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stat Header Cards (Matching screenshot 4) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '20px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><Building2 size={24} /></div>
          <div>
            <div className="stat-label">Total Departments</div>
            <div className="stat-value">{departments.length}</div>
            <button className="btn-primary" style={{ padding: '4px 12px' }}>1</button>
            <button className="btn-secondary" style={{ padding: '4px 10px' }}>&gt;</button>
          </div>
        </div>
      </div>

      <div className="skit-card">
        <div className="filters-bar">
          <div className="search-input-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search departments..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={onOpenAddDept}><Plus size={16} /> Add Department</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {filtered.map((department) => {
            const id = department.department_id || department.id;
            const name = department.department_name || department.name;
            const code = department.department_code || department.code;
            return (
              <button
                type="button"
                key={id}
                className="skit-card"
                onClick={() => onSelectDepartment?.(department)}
                style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #E2E8F0', background: '#FFFFFF', padding: '18px' }}
                title={`Open ${name} timetable workflow`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="stat-icon-wrapper"><Building2 size={20} /></div>
                  <div>
                    <div style={{ fontWeight: '800' }}>{name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '3px' }}>{code || 'Department'}</div>
                  </div>
                </div>
                <div style={{ marginTop: '14px', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800' }}>Open subject and timetable workflow</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
