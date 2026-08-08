import React, { useState } from 'react';
import { Search, UserPlus, FileSpreadsheet, Shield, Eye, Edit3, Trash2, Users, UserCheck, Clock } from 'lucide-react';
import { usersData } from '../data/mockData';
import { Doughnut } from 'react-chartjs-2';

export default function RoleManagementScreen() {
  const [users, setUsers] = useState(usersData);
  const [search, setSearch] = useState('');

  const donutData = {
    labels: ['Faculty (71.4%)', 'Timetable Coordinator (14.3%)', 'HOD (11.9%)', 'Super Admin (2.4%)'],
    datasets: [{
      data: [30, 6, 5, 1],
      backgroundColor: ['#005E38', '#3B82F6', '#8B5CF6', '#EF4444'],
      borderWidth: 0
    }]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><Users size={22} /></div>
          <div>
            <div className="stat-label">Total Users</div>
            <div className="stat-value">42</div>
            <div className="stat-subtext">Across all roles</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><UserCheck size={22} /></div>
          <div>
            <div className="stat-label">Active Users</div>
            <div className="stat-value">38</div>
            <div className="stat-subtext">90.5% of total</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#F3E8FF', color: '#8B5CF6' }}><Clock size={22} /></div>
          <div>
            <div className="stat-label">Inactive Users</div>
            <div className="stat-value">4</div>
            <div className="stat-subtext">9.5% of total</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#FEF3C7', color: '#D97706' }}><UserPlus size={22} /></div>
          <div>
            <div className="stat-label">New This Month</div>
            <div className="stat-value">6</div>
            <div className="stat-subtext">Joined in July 2026</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        
        {/* Main User Table */}
        <div className="skit-card">
          <div className="filters-bar">
            <div className="search-input-wrapper">
              <Search className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search by name, email or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select">
              <option>All Roles</option>
              <option>Super Admin</option>
              <option>HOD</option>
              <option>Timetable Coordinator</option>
              <option>Faculty</option>
            </select>
            <select className="form-select">
              <option>All Departments</option>
            </select>
          </div>

          <div className="table-container">
            <table className="skit-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: '800', color: '#64748B' }}>{u.id}</td>
                    <td style={{ fontWeight: '700' }}>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={
                        u.role === 'Super Admin' ? 'badge badge-purple' :
                        u.role === 'HOD' ? 'badge badge-info' :
                        u.role === 'Timetable Coordinator' ? 'badge badge-warning' : 'badge badge-active'
                      }>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.dept}</td>
                    <td><span className="badge badge-active">{u.status}</span></td>
                    <td style={{ fontSize: '0.78rem' }}>{u.lastLogin}</td>
                    <td>
                      <div className="table-actions">
                        <button className="action-icon-btn"><Eye size={16} /></button>
                        <button className="action-icon-btn"><Edit3 size={16} /></button>
                        <button className="action-icon-btn delete"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Role Distribution & Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="skit-card" style={{ textAlign: 'center' }}>
            <span className="card-title" style={{ marginBottom: '14px', justifyContent: 'center' }}>Role Distribution</span>
            <div style={{ width: '160px', height: '160px', margin: '0 auto' }}>
              <Doughnut data={donutData} options={{ plugins: { legend: { display: false } } }} />
            </div>
          </div>

          <div className="skit-card">
            <span className="card-title" style={{ marginBottom: '14px' }}>Quick Actions</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn-primary" style={{ width: '100%' }}><UserPlus size={16} /> Add New User</button>
              <button className="btn-secondary" style={{ width: '100%' }}><FileSpreadsheet size={16} /> Import Users (Excel)</button>
              <button className="btn-secondary" style={{ width: '100%' }}><Shield size={16} /> Manage Roles & Permissions</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
