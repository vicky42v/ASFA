import React, { useEffect, useState } from 'react';
import { BookOpen, Plus, FileSpreadsheet, Search, Filter, Eye, Edit3, Trash2 } from 'lucide-react';
import { subjectApi } from '../services/api';
import { Doughnut } from 'react-chartjs-2';

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState('');
  const loadSubjects = () => { subjectApi.list().then(setSubjects).catch(() => setSubjects([])); };
  useEffect(() => { loadSubjects(); }, []);

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate subject ${name}?`)) return;
    try {
      await subjectApi.deactivate(id);
      loadSubjects();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = subjects.filter(s => 
    (s.code || '').toLowerCase().includes(search.toLowerCase()) || 
    (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  const donutData = {
    labels: ['Theory', 'Lab'],
    datasets: [{
      data: [subjects.filter(s => s.type === 'Theory').length, subjects.filter(s => s.type === 'Lab').length],
      backgroundColor: ['#005E38', '#3B82F6', '#F59E0B'],
      borderWidth: 0
    }]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><BookOpen size={24} /></div>
          <div>
            <div className="stat-label">Total Subjects</div>
            <div className="stat-value">{subjects.length}</div>
            <div className="stat-subtext">Across all departments</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><BookOpen size={24} /></div>
          <div>
            <div className="stat-label">Theory Subjects</div>
            <div className="stat-value">{subjects.filter(s => s.type === 'Theory').length}</div>
            <div className="stat-subtext">69.5% of total</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#F3E8FF', color: '#8B5CF6' }}><BookOpen size={24} /></div>
          <div>
            <div className="stat-label">Lab Subjects</div>
            <div className="stat-value">{subjects.filter(s => s.type === 'Lab').length}</div>
            <div className="stat-subtext">25.0% of total</div>
          </div>
        </div>

        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: '8px' }}>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}><Plus size={16} /> Add New Subject</button>
          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}><FileSpreadsheet size={14} /> Import Subjects (Excel)</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
        
        {/* Table Card */}
        <div className="skit-card">
          <div className="filters-bar">
            <select className="form-select">
              <option>All Departments</option>
            </select>
            <select className="form-select">
              <option>All Semesters</option>
            </select>
            <select className="form-select">
              <option>All Types</option>
            </select>
            <div className="search-input-wrapper">
              <Search className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search subjects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container">
            <table className="skit-table">
              <thead>
                <tr>
                  <th>Subject Code</th>
                  <th>Subject Name</th>
                  <th>Department</th>
                  <th>Sem</th>
                  <th>Type</th>
                  <th>Credit</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: '800', color: 'var(--primary)' }}>{s.code}</td>
                    <td style={{ fontWeight: '700' }}>{s.name}</td>
                    <td style={{ fontSize: '0.82rem' }}>{s.department}</td>
                    <td>{s.semester_no}</td>
                    <td>
                      <span className={s.type === 'Lab' ? 'badge badge-info' : 'badge badge-active'}>
                        {s.type}
                      </span>
                    </td>
                    <td>{s.credits}</td>
                    <td><span className={s.status === 'Inactive' ? "badge badge-gray" : "badge badge-active"}>{s.status || 'Active'}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="action-icon-btn" title="View Details"><Eye size={16} /></button>
                        <button className="action-icon-btn" title="Edit Subject"><Edit3 size={16} /></button>
                        <button className="action-icon-btn delete" title="Deactivate Subject" onClick={() => handleDeactivate(s.id, s.name)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="skit-card" style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '12px' }}>Subject Type Distribution</div>
            <div style={{ width: '150px', height: '150px', margin: '0 auto' }}>
              <Doughnut data={donutData} options={{ plugins: { legend: { display: false } } }} />
            </div>
          </div>

          <div className="skit-card">
            <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '10px' }}>Recent Subjects Added</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
              <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <div style={{ fontWeight: '700' }}>Machine Learning</div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>CSE - V Sem</div>
              </div>
              <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <div style={{ fontWeight: '700' }}>Python Programming Lab</div>
                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>CSE - III Sem</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
