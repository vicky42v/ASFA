import React, { useState } from 'react';
import { X, Search, Filter } from 'lucide-react';
import { facultyData } from '../data/mockData';

export default function AddDepartmentModal({ isOpen, onClose, onSave }) {
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedHodId, setSelectedHodId] = useState(null);
  const [searchFaculty, setSearchFaculty] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!deptName || !deptCode) {
      alert("Please enter Department Name and Code");
      return;
    }
    onSave({ name: deptName, code: deptCode, desc, hodId: selectedHodId });
    onClose();
  };

  const filteredFaculty = facultyData.filter(f => 
    f.name.toLowerCase().includes(searchFaculty.toLowerCase()) || 
    f.email.toLowerCase().includes(searchFaculty.toLowerCase())
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '880px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Add Department</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Department Details */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '14px', color: 'var(--text-dark)' }}>Department Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Department Name <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Enter department name" 
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Department Code <span style={{ color: '#EF4444' }}>*</span></label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Enter department code" 
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Description (Optional)</label>
              <textarea 
                className="form-input" 
                rows={3} 
                placeholder="Enter description"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>

          {/* Assign Faculty Table */}
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '800', marginBottom: '14px', color: 'var(--text-dark)' }}>Assign Faculty</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div className="search-input-wrapper" style={{ flex: 1, minWidth: '200px' }}>
                <Search className="search-icon" />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search faculty..." 
                  value={searchFaculty}
                  onChange={(e) => setSearchFaculty(e.target.value)}
                />
              </div>
              <select className="form-select">
                <option>All Designations</option>
                <option>Professor</option>
                <option>Associate Professor</option>
                <option>Assistant Professor</option>
              </select>
              <select className="form-select">
                <option>All Departments</option>
              </select>
              <select className="form-select">
                <option>All Status</option>
              </select>
              <button className="btn-secondary" style={{ padding: '8px 12px' }}>Clear Filters</button>
            </div>

            <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table className="skit-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}><input type="checkbox" /></th>
                    <th>Faculty Name</th>
                    <th>Current Department</th>
                    <th>Designation</th>
                    <th>Assign As</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFaculty.slice(0, 6).map((fac) => (
                    <tr key={fac.id}>
                      <td><input type="checkbox" /></td>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-dark)' }}>{fac.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{fac.email}</div>
                      </td>
                      <td>
                        <span className="badge badge-purple">{fac.dept}</span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{fac.designation}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <select className="form-select" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                            <option>{fac.designation}</option>
                          </select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="makeHod"
                              checked={selectedHodId === fac.id}
                              onChange={() => setSelectedHodId(fac.id)} 
                            />
                            Make as HOD
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '8px' }}>
              Showing 1 to {Math.min(6, filteredFaculty.length)} of {filteredFaculty.length} faculty members
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', marginRight: 'auto' }}>
            <input type="checkbox" defaultChecked />
            <span>Assign selected faculty to this department</span>
          </label>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate}>Create Department</button>
        </div>
      </div>
    </div>
  );
}
