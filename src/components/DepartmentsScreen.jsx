import React, { useState } from 'react';
import { Building2, Users, CalendarDays, Plus, Search, Eye, Edit3, Trash2, Filter } from 'lucide-react';
import { departmentsData } from '../data/mockData';

export default function DepartmentsScreen({ onOpenAddDept }) {
  const [departments, setDepartments] = useState(departmentsData);
  const [search, setSearch] = useState('');

  const filtered = departments.filter(d => 
    d.name.toLowerCase().includes(search.toLowerCase()) || 
    d.code.toLowerCase().includes(search.toLowerCase()) ||
    d.hod.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Stat Header Cards (Matching screenshot 4) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '20px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><Building2 size={24} /></div>
          <div>
            <div className="stat-label">Total Departments</div>
            <div className="stat-value">8</div>
            <div className="stat-subtext">All Departments</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><Users size={24} /></div>
          <div>
            <div className="stat-label">Total Faculty</div>
            <div className="stat-value">124</div>
            <div className="stat-subtext">Across All Departments</div>
          </div>
        </div>

        <div className="stat-card" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="stat-icon-wrapper"><CalendarDays size={24} /></div>
            <div>
              <div className="stat-label">Active Timetables</div>
              <div className="stat-value">24</div>
              <div className="stat-subtext">Across All Departments</div>
            </div>
          </div>

          <button className="btn-primary" onClick={onOpenAddDept}>
            <Plus size={16} /> Add Department
          </button>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="skit-card">
        <div className="card-header-row" style={{ marginBottom: '16px' }}>
          <span className="card-title">All Departments</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="search-input-wrapper" style={{ width: '280px' }}>
              <Search className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search departments..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="btn-secondary"><Filter size={16} /> Filters</button>
          </div>
        </div>

        <div className="table-container">
          <table className="skit-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Department Name</th>
                <th>HOD</th>
                <th>Total Faculty</th>
                <th>Active Timetables</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dept, idx) => (
                <tr key={dept.id}>
                  <td style={{ color: '#64748B', fontWeight: '700' }}>{idx + 1}</td>
                  <td style={{ fontWeight: '700', color: 'var(--text-dark)' }}>{dept.name}</td>
                  <td>{dept.hod}</td>
                  <td>{dept.totalFaculty}</td>
                  <td>{dept.activeTimetables}</td>
                  <td><span className="badge badge-active">{dept.status}</span></td>
                  <td>
                    <div className="table-actions">
                      <button className="action-icon-btn" title="View Details"><Eye size={16} /></button>
                      <button className="action-icon-btn" title="Edit Department"><Edit3 size={16} /></button>
                      <button className="action-icon-btn delete" title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', fontSize: '0.8rem', color: '#64748B' }}>
          <span>Showing 1 to {filtered.length} of {filtered.length} departments.</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn-secondary" style={{ padding: '4px 10px' }}>&lt;</button>
            <button className="btn-primary" style={{ padding: '4px 12px' }}>1</button>
            <button className="btn-secondary" style={{ padding: '4px 10px' }}>&gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
}
