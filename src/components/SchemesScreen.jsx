import React, { useState } from 'react';
import { FileText, UploadCloud, Download, Search, Filter, Eye, MoreVertical, CheckCircle2 } from 'lucide-react';
import { schemesData } from '../data/mockData';
import { Doughnut } from 'react-chartjs-2';

export default function SchemesScreen({ onOpenUploadScheme }) {
  const [schemes, setSchemes] = useState(schemesData);
  const [search, setSearch] = useState('');

  const filtered = schemes.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.dept.toLowerCase().includes(search.toLowerCase())
  );

  const donutData = {
    labels: ['UG - 2022 (66.7%)', 'UG - 2025 (25.0%)', 'PG - 2022 (8.3%)'],
    datasets: [{
      data: [8, 3, 1],
      backgroundColor: ['#005E38', '#3B82F6', '#F59E0B'],
      borderWidth: 0
    }]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 4 Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><FileText size={24} /></div>
          <div>
            <div className="stat-label">Total Schemes</div>
            <div className="stat-value">12</div>
            <div className="stat-subtext">Across all departments</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><UploadCloud size={24} /></div>
          <div>
            <div className="stat-label">Uploaded Files</div>
            <div className="stat-value">28</div>
            <div className="stat-subtext">PDF / Excel / Docs</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><CheckCircle2 size={24} /></div>
          <div>
            <div className="stat-label">Active Schemes</div>
            <div className="stat-value">10</div>
            <div className="stat-subtext">Currently in use</div>
          </div>
        </div>

        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: '8px' }}>
          <button className="btn-primary" onClick={onOpenUploadScheme} style={{ width: '100%', justifyContent: 'center' }}>
            <UploadCloud size={16} /> Upload New Scheme
          </button>
          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}>
            <Download size={14} /> Download Template
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px' }}>
        
        {/* Scheme Table Card */}
        <div className="skit-card">
          <div className="filters-bar">
            <select className="form-select">
              <option>All Departments</option>
            </select>
            <select className="form-select">
              <option>All Academic Years</option>
            </select>
            <select className="form-select">
              <option>All Types</option>
            </select>
            <div className="search-input-wrapper">
              <Search className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search schemes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container">
            <table className="skit-table">
              <thead>
                <tr>
                  <th>Scheme Name</th>
                  <th>Department</th>
                  <th>Scheme Type</th>
                  <th>Academic Year</th>
                  <th>File</th>
                  <th>Uploaded On</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--text-dark)' }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.desc}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{s.dept}</td>
                    <td><span className="badge badge-purple">{s.type}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>{s.year}</td>
                    <td><span className="badge badge-gray">{s.file}</span></td>
                    <td style={{ fontSize: '0.78rem' }}>{s.date}</td>
                    <td><span className="badge badge-active">{s.status}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="action-icon-btn"><Eye size={16} /></button>
                        <button className="action-icon-btn"><Download size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Upload Guidelines & Donut */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="skit-card" style={{ fontSize: '0.82rem' }}>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '10px' }}>ⓘ Scheme Upload Guidelines</div>
            <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#475569' }}>
              <li>Upload files in PDF format only</li>
              <li>File size should not exceed 10MB</li>
              <li>Name format: [Dept]_[Scheme]_[Year].pdf</li>
              <li>Includes complete semester course breakdown</li>
            </ul>
          </div>

          <div className="skit-card" style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '12px' }}>Scheme Types</div>
            <div style={{ width: '150px', height: '150px', margin: '0 auto' }}>
              <Doughnut data={donutData} options={{ plugins: { legend: { display: false } } }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
