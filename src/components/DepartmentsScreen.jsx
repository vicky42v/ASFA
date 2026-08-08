import React, { useEffect, useState } from 'react';
import { Building2, Users, CalendarDays, Plus, Search, Eye, Edit3, Trash2, Filter } from 'lucide-react';
import { departmentApi } from '../services/api';

export default function DepartmentsScreen({ onOpenAddDept }) {
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
    (d.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (d.code || '').toLowerCase().includes(search.toLowerCase()) ||
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
    </div>
  );
}
