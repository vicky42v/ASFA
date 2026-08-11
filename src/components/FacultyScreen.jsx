import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  Eye,
  Edit3,
  Trash2,
  Sparkles,
} from 'lucide-react';

import { departmentApi, facultyApi } from '../services/api';
import AddFacultyAiScreen from './AddFacultyAiScreen';
import FacultyProfilePreview from './FacultyProfilePreview';
import EditFacultyScreen from './EditFacultyScreen';

export default function FacultyScreen() {
  // ---------------------------------------------------------
  // VIEW STATE
  // ---------------------------------------------------------
  const [viewMode, setViewMode] = useState('list');
  // list | add-ai | preview | edit

  // ---------------------------------------------------------
  // DATA STATE
  // ---------------------------------------------------------
  const [facultyList, setFacultyList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedFaculty, setSelectedFaculty] = useState(null);

  // ---------------------------------------------------------
  // FILTER STATE
  // ---------------------------------------------------------
  const [search, setSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');

  // ---------------------------------------------------------
  // UI STATE
  // ---------------------------------------------------------
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------
  // LOAD FACULTY
  // ---------------------------------------------------------
  const loadFaculty = async () => {
    try {
      setLoading(true);

      const data = await facultyApi.list();

      setFacultyList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load faculty:', error);
      setFacultyList([]);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // LOAD DEPARTMENTS
  // ---------------------------------------------------------
  const loadDepartments = async () => {
    try {
      const data = await departmentApi.list();

      setDepartments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load departments:', error);
      setDepartments([]);
    }
  };

  // ---------------------------------------------------------
  // INITIAL LOAD
  // ---------------------------------------------------------
  useEffect(() => {
    loadFaculty();
    loadDepartments();
  }, []);

  // ---------------------------------------------------------
  // FILTER FACULTY
  // ---------------------------------------------------------
  const filtered = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return facultyList.filter((faculty) => {
      const matchesSearch =
        !searchText ||
        (faculty.name || '').toLowerCase().includes(searchText) ||
        (faculty.email || '').toLowerCase().includes(searchText) ||
        (faculty.department || '').toLowerCase().includes(searchText);

      const facultyDepartment = (faculty.department || '')
        .toString()
        .trim()
        .toLowerCase();

      const selectedDept = selectedDepartment
        .toString()
        .trim()
        .toLowerCase();

      const matchesDepartment =
        !selectedDepartment ||
        facultyDepartment === selectedDept;

      const facultyDesignation = (faculty.designation || '')
        .toString()
        .trim()
        .toLowerCase();

      const selectedDesig = selectedDesignation
        .toString()
        .trim()
        .toLowerCase();

      const matchesDesignation =
        !selectedDesignation ||
        facultyDesignation === selectedDesig;

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesDesignation
      );
    });
  }, [
    facultyList,
    search,
    selectedDepartment,
    selectedDesignation,
  ]);

  // ---------------------------------------------------------
  // SAVE FACULTY - AI ADD
  // ---------------------------------------------------------
  const handleSaveFaculty = async (newFac) => {
    const department = departments.find(
      (item) => item.name === newFac.department
    );

    if (!department) {
      alert('Select a department that exists in the database.');
      return;
    }

    try {
      await facultyApi.create({
        name: newFac.name,
        department_id: department.id,
        designation: newFac.designation,
      });

      await loadFaculty();

      setViewMode('list');
    } catch (error) {
      console.error('Failed to save faculty:', error);
      alert(error.message || 'Failed to save faculty.');
    }
  };

  // ---------------------------------------------------------
  // SAVE MANUAL EDIT
  // ---------------------------------------------------------
  const handleUpdateFaculty = async (facultyId, updatedFaculty) => {
    try {
      await facultyApi.update(facultyId, updatedFaculty);

      await loadFaculty();

      setSelectedFaculty(null);
      setViewMode('list');
    } catch (error) {
      console.error('Failed to update faculty:', error);

      alert(
        error.message || 'Failed to update faculty.'
      );
    }
  };

  // ---------------------------------------------------------
  // DEACTIVATE FACULTY
  // ---------------------------------------------------------
  const handleDeactivate = async (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate faculty member ${name}?`
    );

    if (!confirmed) return;

    try {
      await facultyApi.deactivate(id);

      await loadFaculty();
    } catch (error) {
      console.error('Failed to deactivate faculty:', error);

      alert(
        error.message ||
          'Failed to deactivate faculty.'
      );
    }
  };

  // ---------------------------------------------------------
  // CLEAR FILTERS
  // ---------------------------------------------------------
  const clearFilters = () => {
    setSearch('');
    setSelectedDepartment('');
    setSelectedDesignation('');
  };

  // ---------------------------------------------------------
  // ADD FACULTY - AI SCREEN
  // KEEPING THIS EXACTLY AS A SEPARATE FEATURE
  // ---------------------------------------------------------
  if (viewMode === 'add-ai') {
    return (
      <AddFacultyAiScreen
        departments={departments}
        onSaveFaculty={handleSaveFaculty}
        onCancel={() => setViewMode('list')}
      />
    );
  }

  // ---------------------------------------------------------
  // MANUAL EDIT FACULTY SCREEN
  // ---------------------------------------------------------
  if (viewMode === 'edit') {
    return (
      <EditFacultyScreen
        faculty={selectedFaculty}
        departments={departments}
        onSave={handleUpdateFaculty}
        onCancel={() => {
          setSelectedFaculty(null);
          setViewMode('list');
        }}
      />
    );
  }

  // ---------------------------------------------------------
  // FACULTY PROFILE PREVIEW
  // ---------------------------------------------------------
  if (viewMode === 'preview') {
    return (
      <FacultyProfilePreview
        faculty={selectedFaculty}
        onBack={() => {
          setSelectedFaculty(null);
          setViewMode('list');
        }}
        onEdit={() => {
          setViewMode('edit');
        }}
      />
    );
  }

  // ---------------------------------------------------------
  // MAIN FACULTY LIST
  // ---------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* =====================================================
          HEADER
      ====================================================== */}
      <div
        className="skit-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.2rem',
              fontWeight: '800',
              color: 'var(--text-dark)',
              margin: 0,
            }}
          >
            Faculty Directory
          </h2>

          <p
            style={{
              fontSize: '0.82rem',
              color: '#64748B',
              margin: '5px 0 0',
            }}
          >
            Manage all academic faculty members across departments.
          </p>
        </div>

        {/* AI ADD FACULTY - UNCHANGED */}
        <button
          className="btn-primary"
          onClick={() => setViewMode('add-ai')}
        >
          <Sparkles size={16} />
          Add Faculty (AI Powered)
        </button>
      </div>

      {/* =====================================================
          FACULTY TABLE
      ====================================================== */}
      <div className="skit-card">

        {/* =================================================
            FILTER BAR
        ================================================== */}
        <div className="filters-bar">

          {/* SEARCH */}
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

          {/* DEPARTMENT */}
          <select
            className="form-select"
            value={selectedDepartment}
            onChange={(e) =>
              setSelectedDepartment(e.target.value)
            }
          >
            <option value="">
              All Departments
            </option>

            {departments.map((department) => (
              <option
                key={department.id}
                value={department.name}
              >
                {department.name}
              </option>
            ))}
          </select>

          {/* DESIGNATION */}
          <select
            className="form-select"
            value={selectedDesignation}
            onChange={(e) =>
              setSelectedDesignation(e.target.value)
            }
          >
            <option value="">
              All Designations
            </option>

            <option value="Professor">
              Professor
            </option>

            <option value="Associate Professor">
              Associate Professor
            </option>

            <option value="Assistant Professor">
              Assistant Professor
            </option>
          </select>

        </div>

        {/* =================================================
            FILTER STATUS
        ================================================== */}
        {(search ||
          selectedDepartment ||
          selectedDesignation) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '14px',
              padding: '8px 4px',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: '#64748B',
              }}
            >
              Showing{' '}
              <strong>{filtered.length}</strong>{' '}
              of{' '}
              <strong>{facultyList.length}</strong>{' '}
              faculty members
            </span>

            <button
              type="button"
              onClick={clearFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* =================================================
            TABLE
        ================================================== */}
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

              {/* LOADING */}
              {loading && (
                <tr>
                  <td
                    colSpan="8"
                    style={{
                      textAlign: 'center',
                      padding: '40px',
                      color: '#64748B',
                    }}
                  >
                    Loading faculty...
                  </td>
                </tr>
              )}

              {/* EMPTY */}
              {!loading &&
                filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan="8"
                      style={{
                        textAlign: 'center',
                        padding: '50px',
                        color: '#64748B',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <Users
                          size={35}
                          style={{ opacity: 0.5 }}
                        />

                        <strong>
                          No faculty members found
                        </strong>

                        <span
                          style={{
                            fontSize: '0.8rem',
                          }}
                        >
                          Try changing your search or filters.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}

              {/* FACULTY ROWS */}
              {!loading &&
                filtered.map((fac) => (
                  <tr key={fac.id}>

                    {/* EMP ID */}
                    <td
                      style={{
                        fontWeight: '800',
                        color: '#64748B',
                      }}
                    >
                      {fac.id}
                    </td>

                    {/* FACULTY NAME */}
                    <td>
                      <div
                        style={{
                          fontWeight: '700',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setSelectedFaculty(fac);
                          setViewMode('preview');
                        }}
                      >
                        {fac.name}
                      </div>

                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748B',
                        }}
                      >
                        {fac.status}
                      </div>
                    </td>

                    {/* DEPARTMENT */}
                    <td
                      style={{
                        fontSize: '0.82rem',
                      }}
                    >
                      {fac.department || '—'}
                    </td>

                    {/* DESIGNATION */}
                    <td
                      style={{
                        fontSize: '0.82rem',
                      }}
                    >
                      {fac.designation || '—'}
                    </td>

                    {/* ROLE */}
                    <td>
                      <span className="badge badge-purple">
                        {fac.role || 'Faculty'}
                      </span>
                    </td>

                    {/* WORKLOAD */}
                    <td
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: '700',
                      }}
                    >
                      {fac.workload ?? 0}/
                      {fac.max_workload || '—'} hrs
                    </td>

                    {/* STATUS */}
                    <td>
                      <span
                        className={
                          fac.status === 'Inactive'
                            ? 'badge badge-gray'
                            : 'badge badge-active'
                        }
                      >
                        {fac.status || 'Active'}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td>
                      <div className="table-actions">

                        {/* VIEW */}
                        <button
                          className="action-icon-btn"
                          title="View Profile Preview"
                          onClick={() => {
                            setSelectedFaculty(fac);
                            setViewMode('preview');
                          }}
                        >
                          <Eye size={16} />
                        </button>

                        {/* NORMAL MANUAL EDIT */}
                        <button
                          className="action-icon-btn"
                          title="Edit Faculty"
                          onClick={() => {
                            setSelectedFaculty(fac);
                            setViewMode('edit');
                          }}
                        >
                          <Edit3 size={16} />
                        </button>

                        {/* DEACTIVATE */}
                        <button
                          className="action-icon-btn delete"
                          title="Deactivate Faculty"
                          onClick={() =>
                            handleDeactivate(
                              fac.id,
                              fac.name
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>

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