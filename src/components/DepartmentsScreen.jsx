import React, { useEffect, useState } from 'react';
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { departmentApi } from '../services/api';

export default function DepartmentsScreen({ onOpenAddDept, onSelectDepartment }) {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);

  const loadDepartments = () => {
    departmentApi
      .list()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
      await departmentApi.deactivate(id);
      loadDepartments();
    } catch (err) {
      alert(err.message || 'Failed to delete department.');
    }
  };

  const filtered = departments.filter((d) => {
    const name = d.name || d.department_name || '';
    const code = d.code || d.department_code || '';
    const hod = d.hod || '';

    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      code.toLowerCase().includes(search.toLowerCase()) ||
      hod.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ margin: 0 }}>Departments</h1>
        <p style={{ marginTop: '6px', color: '#64748B' }}>
          Manage academic departments and assigned HODs.
        </p>
      </div>

      {/* Stat Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 420px)',
          gap: '20px',
        }}
      >
        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Building2 size={24} />
          </div>
          <div>
            <div className="stat-label">Total Departments</div>
            <div className="stat-value">{departments.length}</div>
          </div>
        </div>
      </div>

      {/* Search + Actions */}
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

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: editMode ? '#F1F5F9' : '#FFFFFF',
              color: '#334155',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Pencil size={16} />
            {editMode ? 'Done' : 'Edit'}
          </button>

          <button className="btn-primary" onClick={onOpenAddDept}>
            <Plus size={16} /> Add Department
          </button>
        </div>
      </div>

      {/* Department Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {filtered.map((department) => {
          const id = department.department_id || department.id;
          const name = department.department_name || department.name;
          const code = department.department_code || department.code;

          return (
            <div
              key={id}
              className="skit-card"
              onClick={() => !editMode && onSelectDepartment?.(department)}
              style={{
                position: 'relative',
                textAlign: 'left',
                cursor: editMode ? 'default' : 'pointer',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                padding: '18px',
              }}
              title={`Open ${name} timetable workflow`}
            >
              {editMode && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeactivate(id, name);
                  }}
                  title={`Delete ${name}`}
                  aria-label={`Delete ${name}`}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    border: '1px solid #FECACA',
                    borderRadius: '7px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  paddingRight: '30px',
                }}
              >
                <div className="stat-icon-wrapper">
                  <Building2 size={20} />
                </div>

                <div>
                  <div style={{ fontWeight: '800' }}>{name}</div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748B',
                      marginTop: '3px',
                    }}
                  >
                    {code || 'Department'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '14px',
                  fontSize: '0.75rem',
                  color: 'var(--primary)',
                  fontWeight: '800',
                }}
              >
                Open subject and timetable workflow
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
