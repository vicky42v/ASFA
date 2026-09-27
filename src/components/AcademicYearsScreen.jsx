import React, { useState, useEffect } from 'react';
import { CalendarRange, Plus, CheckCircle2, Check, X, Clock, Layers } from 'lucide-react';

const DEFAULT_YEARS = ['2026-27', '2025-26', '2024-25', '2027-28', '2028-29'];

function formatYearDisplay(rawYear) {
  const clean = String(rawYear).trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    let startYear = parts[0];
    let endYear = parts[1];
    if (endYear.length === 2) {
      endYear = `${startYear.slice(0, 2)}${endYear}`;
    }
    return `${startYear} – ${endYear}`;
  }
  return clean;
}

function parseYears(rawYear) {
  const clean = String(rawYear).trim();
  if (clean.includes('-')) {
    const parts = clean.split('-');
    let y1 = parseInt(parts[0], 10);
    let y2 = parts[1].length === 2 ? parseInt(`${parts[0].slice(0, 2)}${parts[1]}`, 10) : parseInt(parts[1], 10);
    return { y1, y2 };
  }
  const y = parseInt(clean, 10) || 2026;
  return { y1: y, y2: y + 1 };
}

export default function AcademicYearsScreen() {
  const [academicYears, setAcademicYears] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_academic_years');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_YEARS;
  });

  const [activeYear, setActiveYear] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_active_academic_year');
      if (saved) return saved;
    } catch {}
    return '2026-27';
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const saveYears = (updatedYears, newActive = null) => {
    setAcademicYears(updatedYears);
    try {
      localStorage.setItem('asfa_academic_years', JSON.stringify(updatedYears));
      if (newActive) {
        localStorage.setItem('asfa_active_academic_year', newActive);
        setActiveYear(newActive);
      }
    } catch {}
  };

  const handleSetActive = (yr) => {
    setActiveYear(yr);
    try {
      localStorage.setItem('asfa_active_academic_year', yr);
    } catch {}
  };

  const handleAddYear = (e) => {
    e.preventDefault();
    const yr = newYearInput.trim();
    if (!yr) {
      setErrorMsg('Please enter an academic year (e.g. 2029-30).');
      return;
    }
    if (academicYears.includes(yr)) {
      setErrorMsg('This academic year already exists.');
      return;
    }
    const updated = [yr, ...academicYears];
    saveYears(updated);
    setNewYearInput('');
    setErrorMsg('');
    setShowAddModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div className="skit-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-dark)', margin: 0 }}>
              Academic Year Sessions
            </h2>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', padding: '3px 8px', borderRadius: '6px', background: '#DCFCE7', color: '#166534' }}>
              ✓ Synced with Timetable Generator
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px', margin: 0 }}>
            Configure active academic year bounds, term start dates, and odd/even semester active statuses for SKIT.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> New Academic Year
        </button>
      </div>

      {/* Grid of Academic Years */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {academicYears.map((yr) => {
          const isActive = yr === activeYear || (activeYear === '2026-27' && yr.includes('2026'));
          const { y1, y2 } = parseYears(yr);
          const isUpcoming = y1 > 2026;
          const isArchived = y1 < 2026 && !isActive;

          return (
            <div
              key={yr}
              className="skit-card"
              style={{
                borderLeft: isActive ? '5px solid var(--primary)' : '1px solid #E2E8F0',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 4px 14px rgba(0, 94, 56, 0.12)' : 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-dark)' }}>
                  {formatYearDisplay(yr)}
                </span>
                {isActive ? (
                  <span className="badge badge-active" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> CURRENT ACTIVE
                  </span>
                ) : isUpcoming ? (
                  <span className="badge badge-purple">UPCOMING</span>
                ) : (
                  <span className="badge" style={{ background: '#F1F5F9', color: '#64748B' }}>
                    ARCHIVED
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#0F172A', fontWeight: '700', minWidth: '110px' }}>Odd Semesters:</span>
                  <span>Aug {y1} – Dec {y1}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#0F172A', fontWeight: '700', minWidth: '110px' }}>Even Semesters:</span>
                  <span>Jan {y2} – May {y2}</span>
                </div>
                {isActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: '800', marginTop: '4px' }}>
                    <Clock size={14} /> Active Term: Odd Semesters (Sem 1, 3, 5, 7)
                  </div>
                )}
              </div>

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                  Generator Code: <strong style={{ color: '#334155' }}>{yr}</strong>
                </span>
                {!isActive && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSetActive(yr)}
                    style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                  >
                    Set as Active
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Academic Year Modal */}
      {showAddModal && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content skit-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0F172A', margin: 0 }}>
                Add New Academic Year
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddYear}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Academic Year Format (e.g., 2029-30)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2029-30"
                  value={newYearInput}
                  onChange={(e) => {
                    setNewYearInput(e.target.value);
                    setErrorMsg('');
                  }}
                  className="input-field"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem' }}
                  autoFocus
                />
                {errorMsg && (
                  <p style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '6px', fontWeight: '600' }}>
                    {errorMsg}
                  </p>
                )}
              </div>

              <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '18px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px' }}>
                ℹ️ Adding a year here immediately makes it available in the Timetable Generator dropdown across all departments.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Academic Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
