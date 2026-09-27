import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Save,
  UserRound,
  Clock,
  Sparkles,
} from 'lucide-react';
import { asfaApi } from '../services/api';

export default function EditFacultyScreen({
  faculty,
  departments = [],
  onSave,
  onCancel,
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    designation: '',
    max_workload: '',
    status: 'Active',
    preferred_time: 'No_Preference',
    priority_percentage: 75,
  });

  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------
  // LOAD FACULTY DATA
  // ---------------------------------------------------------
  useEffect(() => {
    if (!faculty) return;

    setFormData({
      name: faculty.name || '',
      email: faculty.email || '',
      department: faculty.department || '',
      designation: faculty.designation || '',
      max_workload:
        faculty.max_workload ??
        faculty.maxWorkload ??
        '',
      status: faculty.status || 'Active',
      preferred_time: faculty.preferred_time || 'No_Preference',
      priority_percentage: faculty.priority_percentage ?? 75,
    });

    if (faculty.id) {
      asfaApi.getFacultyPreference(faculty.id).then((pref) => {
        if (pref && pref.preferred_time) {
          setFormData((prev) => ({
            ...prev,
            preferred_time: pref.preferred_time,
            priority_percentage: pref.priority_percentage ?? 75,
          }));
        }
      }).catch(() => {});
    }
  }, [faculty]);

  // ---------------------------------------------------------
  // HANDLE INPUT CHANGE
  // ---------------------------------------------------------
  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ---------------------------------------------------------
  // SAVE FACULTY
  // ---------------------------------------------------------
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!faculty?.id) {
      alert('Faculty ID is missing.');
      return;
    }

    if (!formData.name.trim()) {
      alert('Faculty name is required.');
      return;
    }

    if (!formData.department) {
      alert('Please select a department.');
      return;
    }

    if (!formData.designation) {
      alert('Please select a designation.');
      return;
    }

    // Find the actual department record from the database
    const department = departments.find(
      (item) =>
        String(item.name).trim().toLowerCase() ===
        String(formData.department).trim().toLowerCase()
    );

    if (!department) {
      alert(
        'The selected department could not be found in the database.'
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        department_id: department.id,
        designation: formData.designation,
        status: formData.status,
      };

      // Only send workload if the user actually entered it
      if (
        formData.max_workload !== '' &&
        formData.max_workload !== null
      ) {
        payload.max_workload = Number(
          formData.max_workload
        );
      }

      await onSave(faculty.id, payload);

      // Save soft preference
      try {
        await asfaApi.saveFacultyPreference(faculty.id, {
          preferred_time: formData.preferred_time,
          priority_percentage: Number(formData.priority_percentage),
        });
      } catch (prefErr) {
        console.warn('Could not save faculty preference:', prefErr);
      }
    } catch (error) {
      console.error(
        'Failed to update faculty:',
        error
      );

      alert(
        error.message ||
          'Failed to update faculty.'
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------
  // NO FACULTY SELECTED
  // ---------------------------------------------------------
  if (!faculty) {
    return (
      <div
        className="skit-card"
        style={{
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            color: '#64748B',
            marginBottom: '20px',
          }}
        >
          No faculty member selected.
        </p>

        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
        >
          Go Back
        </button>
      </div>
    );
  }

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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <button
            type="button"
            className="action-icon-btn"
            title="Back to Faculty"
            onClick={onCancel}
            disabled={saving}
          >
            <ArrowLeft size={18} />
          </button>

          <div>
            <h2
              style={{
                fontSize: '1.2rem',
                fontWeight: '800',
                color: 'var(--text-dark)',
                margin: 0,
              }}
            >
              Edit Faculty
            </h2>

            <p
              style={{
                fontSize: '0.82rem',
                color: '#64748B',
                margin: '5px 0 0',
              }}
            >
              Manually update faculty information.
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          FORM
      ====================================================== */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {/* =================================================
              BASIC INFORMATION
          ================================================== */}
          <div
            className="skit-card"
            style={{
              padding: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                marginBottom: '22px',
              }}
            >
              <UserRound
                size={19}
                style={{
                  color: 'var(--primary)',
                }}
              />

              <span className="card-title">
                Faculty Information
              </span>
            </div>

            {/* FACULTY ID */}
            <div className="form-group">
              <label className="form-label">
                Employee ID
              </label>

              <input
                type="text"
                className="form-input"
                value={faculty.id || ''}
                readOnly
                disabled
                style={{
                  background: '#F8FAFC',
                  color: '#64748B',
                }}
              />

              <div
                style={{
                  marginTop: '5px',
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Employee ID cannot be changed.
              </div>
            </div>

            {/* NAME */}
            <div className="form-group">
              <label className="form-label">
                Faculty Name *
              </label>

              <input
                type="text"
                name="name"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter faculty name"
                disabled={saving}
              />
            </div>

            {/* EMAIL */}
            <div className="form-group">
              <label className="form-label">
                Email
              </label>

              <input
                type="email"
                name="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter faculty email"
                disabled={saving}
              />
            </div>
          </div>

          {/* =================================================
              ACADEMIC INFORMATION
          ================================================== */}
          <div
            className="skit-card"
            style={{
              padding: '24px',
            }}
          >
            <div
              style={{
                marginBottom: '22px',
              }}
            >
              <span className="card-title">
                Academic Information
              </span>
            </div>

            {/* DEPARTMENT */}
            <div className="form-group">
              <label className="form-label">
                Department *
              </label>

              <select
                name="department"
                className="form-select"
                value={formData.department}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">
                  Select Department
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
            </div>

            {/* DESIGNATION */}
            <div className="form-group">
              <label className="form-label">
                Designation *
              </label>

              <select
                name="designation"
                className="form-select"
                value={formData.designation}
                onChange={handleChange}
                disabled={saving}
              >
                <option value="">
                  Select Designation
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

                <option value="HOD">
                  HOD
                </option>

                <option value="Lecturer">
                  Lecturer
                </option>
              </select>
            </div>

            {/* MAX WORKLOAD */}
            <div className="form-group">
              <label className="form-label">
                Maximum Workload (Hours)
              </label>

              <input
                type="number"
                name="max_workload"
                className="form-input"
                min="0"
                step="1"
                value={formData.max_workload}
                onChange={handleChange}
                placeholder="Example: 18"
                disabled={saving}
              />

              <div
                style={{
                  marginTop: '5px',
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Maximum teaching workload allowed for
                this faculty member.
              </div>
            </div>

            {/* STATUS */}
            <div className="form-group">
              <label className="form-label">
                Status
              </label>

              <div
                style={{
                  display: 'flex',
                  gap: '20px',
                  marginTop: '8px',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value="Active"
                    checked={
                      formData.status === 'Active'
                    }
                    onChange={handleChange}
                    disabled={saving}
                  />

                  Active
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="status"
                    value="Inactive"
                    checked={
                      formData.status === 'Inactive'
                    }
                    onChange={handleChange}
                    disabled={saving}
                  />

                  Inactive
                </label>
              </div>
            </div>

            {/* SCHEDULE PREFERENCE (ASFA SOFT CONSTRAINT) */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Clock size={16} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-dark)' }}>
                  Teaching Time Preference
                </span>
                <span className="badge badge-active" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                  AI Soft Constraint
                </span>
              </div>

              {/* PREFERRED TIME */}
              <div className="form-group">
                <label className="form-label">Preferred Time Slot</label>
                <select
                  name="preferred_time"
                  className="form-select"
                  value={formData.preferred_time}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="No_Preference">No Preference (Flexible)</option>
                  <option value="Morning">Morning Preference (Periods 1 - 3)</option>
                  <option value="Evening">Evening Preference (Periods 4 - 6)</option>
                </select>
                <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#94A3B8' }}>
                  AI scheduler aims to schedule this faculty during their preferred window.
                </div>
              </div>

              {/* PRIORITY SLIDER */}
              {formData.preferred_time !== 'No_Preference' && (
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Preference Priority Weight
                    </label>
                    <span style={{ fontWeight: '800', fontSize: '0.85rem', color: 'var(--primary)' }}>
                      {formData.priority_percentage}%
                    </span>
                  </div>
                  <input
                    type="range"
                    name="priority_percentage"
                    min="0"
                    max="100"
                    step="5"
                    value={formData.priority_percentage}
                    onChange={handleChange}
                    disabled={saving}
                    style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94A3B8', marginTop: '2px' }}>
                    <span>0% (Lowest)</span>
                    <span>50% (Standard)</span>
                    <span>100% (Strict Soft)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================
            CURRENT RECORD
        ====================================================== */}
        <div
          className="skit-card"
          style={{
            marginTop: '24px',
            padding: '20px',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: '#64748B',
              fontWeight: '700',
              marginBottom: '14px',
            }}
          >
            Current Faculty Record
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '18px',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Employee ID
              </div>

              <div
                style={{
                  fontWeight: '700',
                  color: 'var(--text-dark)',
                  marginTop: '4px',
                }}
              >
                {faculty.id || '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Current Department
              </div>

              <div
                style={{
                  fontWeight: '700',
                  color: 'var(--text-dark)',
                  marginTop: '4px',
                }}
              >
                {faculty.department || '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Current Designation
              </div>

              <div
                style={{
                  fontWeight: '700',
                  color: 'var(--text-dark)',
                  marginTop: '4px',
                }}
              >
                {faculty.designation || '—'}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94A3B8',
                }}
              >
                Current Status
              </div>

              <div
                style={{
                  fontWeight: '700',
                  color: 'var(--text-dark)',
                  marginTop: '4px',
                }}
              >
                {faculty.status || 'Active'}
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================
            ACTION BUTTONS
        ====================================================== */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '24px',
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Cancel
          </button>

          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Save size={16} />

            {saving
              ? 'Saving Changes...'
              : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}