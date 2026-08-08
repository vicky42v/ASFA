import React, { useEffect, useState } from 'react';
import { Users, Plus, Search, Filter, Eye, Edit3, Trash2, Sparkles, UserPlus } from 'lucide-react';
import { departmentApi, facultyApi } from '../services/api';
import AddFacultyAiScreen from './AddFacultyAiScreen';
import FacultyProfilePreview from './FacultyProfilePreview';

export default function FacultyScreen() {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'add-ai' | 'preview'
  const [facultyList, setFacultyList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [search, setSearch] = useState('');
  const loadFaculty = () => facultyApi.list().then(setFacultyList).catch(() => setFacultyList([]));
  useEffect(() => { loadFaculty(); departmentApi.list().then(setDepartments).catch(() => {}); }, []);

  const filtered = facultyList.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    (f.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveFaculty = async (newFac) => {
    const department = departments.find((item) => item.name === newFac.department);
    if (!department) return alert('Select a department that exists in the database.');
    try {
      await facultyApi.create({ name: newFac.name, department_id: department.id, designation: newFac.designation });
      await loadFaculty(); setViewMode('list');
    } catch (error) { alert(error.message); }
  };

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate faculty member ${name}?`)) return;
    try {
      await facultyApi.deactivate(id);
      loadFaculty();
    } catch (err) {
      alert(err.message);
    }
  };

  if (viewMode === 'add-ai') {
    return <AddFacultyAiScreen departments={departments} onSaveFaculty={handleSaveFaculty} onCancel={() => setViewMode('list')} />;
  }

  if (viewMode === 'preview') {
    return <FacultyProfilePreview faculty={selectedFaculty} onBack={() => setViewMode('list')} onEdit={() => setViewMode('add-ai')} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Action Banner */}
      <div className="skit-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-dark)' }}>Faculty Directory</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Manage all academic faculty members across departments.</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={() => setViewMode('add-ai')}>
            <Sparkles size={16} /> Add Faculty (AI Powered)
          </button>
        </div>
      </div>

      {/* Faculty Table Card */}
      <div className="skit-card">
        <div className="filters-bar">
          <div className="search-input-wrapper">
            <Search className="search-icon" />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search faculty by name, email or department..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="form-select">
            <option>All Departments</option>
            {departments.map(d => <option key={d.id}>{d.name}</option>)}
          </select>
          <select className="form-select">
            <option>All Designations</option>
            <option>Professor</option>
            <option>Associate Professor</option>
            <option>Assistant Professor</option>
          </select>
        </div>

        <div className="table-container">
          <table className="skit-table">
            <thead>
              <tr>
                <th>Emp ID</th>
                <th>Faculty Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Role</th>
                <th>Workload</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((fac) => (
                <tr key={fac.id}>
                  <td style={{ fontWeight: '800', color: '#64748B' }}>{fac.id}</td>
                  <td>
                    <div 
                      style={{ fontWeight: '700', color: 'var(--primary)', cursor: 'pointer' }}
                      onClick={() => { setSelectedFaculty(fac); setViewMode('preview'); }}
                    >
                      {fac.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{fac.status}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{fac.department}</td>
                  <td style={{ fontSize: '0.82rem' }}>{fac.designation}</td>
                  <td><span className="badge badge-purple">Faculty</span></td>
                  <td style={{ fontSize: '0.82rem', fontWeight: '700' }}>{fac.workload}/{fac.max_workload || '—'} hrs</td>
                  <td><span className={fac.status === 'Inactive' ? "badge badge-gray" : "badge badge-active"}>{fac.status}</span></td>
                  <td>
                    <div className="table-actions">
                      <button 
                        className="action-icon-btn" 
                        title="View Profile Preview"
                        onClick={() => { setSelectedFaculty(fac); setViewMode('preview'); }}
                      >
                        <Eye size={16} />
                      </button>
                      <button className="action-icon-btn" title="Edit Faculty"><Edit3 size={16} /></button>
                      <button className="action-icon-btn delete" title="Deactivate Faculty" onClick={() => handleDeactivate(fac.id, fac.name)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
