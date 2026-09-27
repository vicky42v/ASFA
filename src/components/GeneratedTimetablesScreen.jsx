import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  Eye,
  Trash2,
  RefreshCw,
  Building2,
  GraduationCap,
  Clock,
  Printer,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Layers,
  BookOpen,
} from 'lucide-react';
import {
  listGeneratedTimetables,
  removeGeneratedTimetable,
  getTimetablesGroupedByDepartmentAndSemester,
} from '../services/timetableStorage';
import { exportTimetableCsv, printTimetable } from '../services/timetableExport';
import { departmentApi, timetableApi } from '../services/api';

export default function GeneratedTimetablesScreen({ onOpen, onRegenerate }) {
  const [items, setItems] = useState(() => listGeneratedTimetables());
  const [departments, setDepartments] = useState([]);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [selectedSchemeFilter, setSelectedSchemeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDepts, setExpandedDepts] = useState({});
  const [previewTimetable, setPreviewTimetable] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load all registered academic departments
  const loadDepartments = async () => {
    try {
      const depts = await departmentApi.list();
      if (Array.isArray(depts)) {
        setDepartments(depts);
      }
    } catch (err) {
      console.warn('Could not load department list from API:', err);
    }
  };

  const refresh = () => {
    setLoading(true);
    setItems(listGeneratedTimetables());
    loadDepartments().finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  // Group saved timetables by department and semester
  const groupedData = useMemo(() => {
    // Start with all database-registered departments
    const deptMap = new Map();

    departments.forEach((d) => {
      const name = d.name || d.department_name || `Dept ${d.id}`;
      const code = d.code || d.department_code || name.split(' ')[0] || 'DEPT';
      const id = String(d.department_id || d.id || code);
      const effectiveHod = (code.toUpperCase() === 'AIML' && (!d.hod || d.hod.includes('Maheswari') || d.hod === '—'))
        ? 'Dr. Jayasudha K'
        : (d.hod || '');
      deptMap.set(code.toUpperCase(), {
        id,
        name,
        code: code.toUpperCase(),
        hod: effectiveHod,
        semesters: {},
        totalTimetables: 0,
      });
    });

    // Merge saved timetable items into department groups (filtered by scheme if chosen)
    items.forEach((item) => {
      if (selectedSchemeFilter !== 'ALL') {
        const is2025 = String(item.scheme_id) === '2' || String(item.title || '').includes('2025');
        if (selectedSchemeFilter === '2' && !is2025) return;
        if (selectedSchemeFilter === '1' && is2025) return;
      }

      const rawDeptName = String(item.department_name || item.department_code || item.department_id || 'AIML');
      const rawDeptCode = String(item.department_code || rawDeptName.split(' ')[0] || 'AIML').toUpperCase();
      const semNo = String(item.semester_no || item.semester || 'General');

      let deptEntry = deptMap.get(rawDeptCode);
      if (!deptEntry) {
        deptEntry = {
          id: String(item.department_id || rawDeptCode),
          name: rawDeptName,
          code: rawDeptCode,
          hod: '',
          semesters: {},
          totalTimetables: 0,
        };
        deptMap.set(rawDeptCode, deptEntry);
      }

      if (!deptEntry.semesters[semNo]) {
        deptEntry.semesters[semNo] = [];
      }
      deptEntry.semesters[semNo].push(item);
      deptEntry.totalTimetables += 1;
    });

    return Array.from(deptMap.values());
  }, [departments, items, selectedSchemeFilter]);

  // Filtered department groups based on search & filter pill
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return groupedData.filter((dept) => {
      if (selectedDeptFilter !== 'ALL' && dept.code !== selectedDeptFilter) {
        return false;
      }
      if (!q) return true;

      const matchesDept =
        dept.name.toLowerCase().includes(q) ||
        dept.code.toLowerCase().includes(q) ||
        (dept.hod && dept.hod.toLowerCase().includes(q));

      const matchesSem = Object.keys(dept.semesters).some((sem) =>
        `semester ${sem}`.includes(q) || `sem ${sem}`.includes(q)
      );

      return matchesDept || matchesSem;
    });
  }, [groupedData, selectedDeptFilter, searchQuery]);

  // Toggle department expansion
  const toggleExpand = (deptCode) => {
    setExpandedDepts((prev) => ({
      ...prev,
      [deptCode]: prev[deptCode] === undefined ? false : !prev[deptCode],
    }));
  };

  const isDeptExpanded = (deptCode) => {
    // Expand by default if department has saved timetables
    return expandedDepts[deptCode] !== false;
  };

  const handleDelete = (id, title) => {
    if (window.confirm(`Are you sure you want to delete "${title || 'this timetable'}"?`)) {
      removeGeneratedTimetable(id);
      refresh();
      if (previewTimetable?.id === id) {
        setPreviewTimetable(null);
      }
    }
  };

  // Helper to build timetable grid rows for preview modal
  const buildPreviewGrid = (entries) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.map((day) => {
      const dayEntries = (entries || []).filter((e) => e && e.day === day);
      const findPeriodEntries = (period) =>
        dayEntries.filter((e) => {
          const pNo = e.period_no !== undefined && e.period_no !== null ? Number(e.period_no) : Number(e.period);
          if (!isNaN(pNo) && pNo === period) return true;
          if (typeof e.period === 'string' && (e.period.includes(`Period ${period}`) || e.period.startsWith(`Period ${period}`))) return true;
          return false;
        });

      const isLab = (e) => {
        if (!e) return false;
        const comp = String(e.component || '').toLowerCase();
        const code = String(e.subject_code || e.code || '').toLowerCase();
        const name = String(e.subject_name || e.name || '').toLowerCase();
        return comp === 'lab' || code.includes('lab') || name.includes('lab');
      };

      const classify = (e) => {
        if (!e) return null;
        const name = String(e.subject_name || e.name || '').toUpperCase();
        const code = String(e.subject_code || e.code || '').toUpperCase();
        const cls = String(e.classification || '').toUpperCase();
        if (cls === 'PLACEMENT' || name.includes('PLACEMENT') || code.includes('PLACEMENT')) return 'PLACEMENT';
        if (cls === 'REMEDIAL' || name.includes('REMEDIAL') || code.includes('REMEDIAL')) return 'REMEDIAL';
        return null;
      };

      const rawSlots = [
        { type: 'period', period: 1, items: findPeriodEntries(1) },
        { type: 'period', period: 2, items: findPeriodEntries(2) },
        { type: 'break', breakType: 'tea' },
        { type: 'period', period: 3, items: findPeriodEntries(3) },
        { type: 'period', period: 4, items: findPeriodEntries(4) },
        { type: 'break', breakType: 'lunch' },
        { type: 'period', period: 5, items: findPeriodEntries(5) },
        { type: 'period', period: 6, items: findPeriodEntries(6) },
        { type: 'period', period: 7, items: findPeriodEntries(7) },
      ];

      // Detect lab spans across 2 periods
      for (let i = 0; i < rawSlots.length - 1; i++) {
        const curr = rawSlots[i];
        const next = rawSlots[i + 1];
        if (curr.type !== 'period' || next.type !== 'period') continue;
        if (curr.labContinuation) continue;

        const currItems = curr.items || [];
        const nextItems = next.items || [];
        if (currItems.length === 0 || nextItems.length === 0) continue;

        if (isLab(currItems[0]) && isLab(nextItems[0])) {
          curr.labSpan = 2;
          const merged = [...currItems];
          nextItems.forEach((ni) => {
            const exists = merged.some(
              (m) =>
                String(m.subject_code || m.code) === String(ni.subject_code || ni.code) &&
                String(m.batch || '') === String(ni.batch || '')
            );
            if (!exists) merged.push(ni);
          });
          curr.mergedLabItems = merged;
          next.labContinuation = true;
        }
      }

      // Tag Placement / Remedial
      rawSlots.forEach((slot) => {
        if (slot.type === 'period' && slot.items && slot.items.length > 0) {
          const c = classify(slot.items[0]);
          if (c) slot.specialClassification = c;
        }
      });

      return { day, slots: rawSlots };
    });
  };

  const totalPublishedTimetables = items.length;
  const totalDepartmentsWithTimetables = groupedData.filter((d) => d.totalTimetables > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* TOP HERO HEADER */}
      <div
        className="skit-card"
        style={{
          padding: '24px 28px',
          background: 'linear-gradient(135deg, #064E3B 0%, #005E38 50%, #047857 100%)',
          color: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 10px 25px -5px rgba(6, 78, 59, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CalendarDays size={26} style={{ color: '#6EE7B7' }} />
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#FFFFFF' }}>
                Final Generated Timetables
              </h1>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Official Repository
              </span>
            </div>
            <p style={{ margin: '8px 0 0', color: '#D1FAE5', fontSize: '0.84rem', maxWidth: 700, lineHeight: 1.5 }}>
              Saved timetable records grouped hierarchically by <strong>Department Blocks</strong> and their published <strong>Semesters</strong>. Featuring 2-Period continuous Lab display, Placement blocks, and Remedial tracking.
            </p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={refresh}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#FFFFFF',
              borderColor: 'rgba(255, 255, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.80rem',
              fontWeight: 700,
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Repository
          </button>
        </div>

        {/* STATS STRIP */}
        <div style={{ display: 'flex', gap: 14, marginTop: 20, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(0, 0, 0, 0.18)', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.15)' }}>
            <div style={{ fontSize: '0.68rem', color: '#A7F3D0', fontWeight: 700 }}>PUBLISHED TIMETABLES</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF' }}>{totalPublishedTimetables}</div>
          </div>
          <div style={{ background: 'rgba(0, 0, 0, 0.18)', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.15)' }}>
            <div style={{ fontSize: '0.68rem', color: '#A7F3D0', fontWeight: 700 }}>ACTIVE DEPARTMENTS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#FFFFFF' }}>{totalDepartmentsWithTimetables} / {groupedData.length}</div>
          </div>
          <div style={{ background: 'rgba(0, 0, 0, 0.18)', padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.15)' }}>
            <div style={{ fontSize: '0.68rem', color: '#A7F3D0', fontWeight: 700 }}>FORMAT SPECIFICATION</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>SKIT 2-Block Lab & Afternoon Placement</div>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div
        className="skit-card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          background: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <Search size={18} style={{ color: '#94A3B8' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by Department name, code (AIML, CSE), or Semester..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '0.84rem' }}
          />
        </div>

        {/* SCHEME PILLS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', marginRight: 4 }}>Scheme:</span>
          <button
            type="button"
            className={selectedSchemeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSelectedSchemeFilter('ALL')}
            style={{ fontSize: '0.74rem', padding: '5px 12px' }}
          >
            All Schemes
          </button>
          <button
            type="button"
            className={selectedSchemeFilter === '1' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSelectedSchemeFilter('1')}
            style={{ fontSize: '0.74rem', padding: '5px 12px' }}
          >
            2022 Scheme
          </button>
          <button
            type="button"
            className={selectedSchemeFilter === '2' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSelectedSchemeFilter('2')}
            style={{ fontSize: '0.74rem', padding: '5px 12px' }}
          >
            2025 Scheme
          </button>
        </div>

        {/* DEPARTMENT PILLS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', marginRight: 4 }}>Department:</span>
          <button
            type="button"
            className={selectedDeptFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setSelectedDeptFilter('ALL')}
            style={{ fontSize: '0.74rem', padding: '5px 12px' }}
          >
            All Departments ({groupedData.length})
          </button>
          {groupedData.map((dept) => (
            <button
              key={dept.code}
              type="button"
              className={selectedDeptFilter === dept.code ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setSelectedDeptFilter(dept.code)}
              style={{ fontSize: '0.74rem', padding: '5px 12px' }}
            >
              {dept.code} {dept.totalTimetables > 0 ? `(${dept.totalTimetables})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* NO DATA NOTIFICATION */}
      {filteredDepartments.length === 0 ? (
        <div className="skit-card" style={{ padding: 60, textAlign: 'center', color: '#64748B' }}>
          <CalendarDays size={42} style={{ color: '#CBD5E1', marginBottom: 12 }} />
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#334155' }}>No Matching Departments Found</div>
          <div style={{ fontSize: '0.82rem', marginTop: 6, color: '#94A3B8' }}>
            Try adjusting your search criteria or filter options.
          </div>
        </div>
      ) : (
        /* DEPARTMENT BLOCKS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {filteredDepartments.map((dept) => {
            const hasTimetables = dept.totalTimetables > 0;
            const semesters = Object.entries(dept.semesters).sort((a, b) => {
              const numA = Number(a[0]) || 0;
              const numB = Number(b[0]) || 0;
              return numB - numA; // Sort descending (Sem 7, Sem 5, Sem 3, Sem 1)
            });
            const expanded = isDeptExpanded(dept.code);

            return (
              <div
                key={dept.code}
                className="skit-card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  border: hasTimetables ? '1.5px solid #CBD5E1' : '1px solid #E2E8F0',
                  borderRadius: 12,
                  boxShadow: hasTimetables ? '0 4px 12px rgba(15, 23, 42, 0.05)' : 'none',
                  background: '#FFFFFF',
                }}
              >
                {/* DEPARTMENT BLOCK HEADER */}
                <div
                  style={{
                    padding: '16px 22px',
                    background: hasTimetables
                      ? 'linear-gradient(to right, #F8FAFC, #EFF6FF)'
                      : '#F8FAFC',
                    borderBottom: expanded ? '1px solid #E2E8F0' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => toggleExpand(dept.code)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: hasTimetables ? '#005E38' : '#64748B',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '0.92rem',
                        letterSpacing: '0.04em',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      }}
                    >
                      {dept.code}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#0F172A' }}>
                          {dept.name}
                        </span>
                        <span
                          style={{
                            fontSize: '0.70rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: hasTimetables ? '#DCFCE7' : '#F1F5F9',
                            color: hasTimetables ? '#166534' : '#64748B',
                          }}
                        >
                          {hasTimetables ? `✓ ${dept.totalTimetables} Timetables Saved` : 'No Saved Timetables'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>
                        Department Code: <strong>{dept.code}</strong> {dept.hod ? `· HOD: ${dept.hod}` : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerate?.({ department_id: dept.id, department_name: dept.name, department_code: dept.code });
                      }}
                    >
                      <RefreshCw size={13} /> + New Timetable
                    </button>
                    {expanded ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
                  </div>
                </div>

                {/* DEPARTMENT CONTENT: SEMESTER SUB-BLOCKS */}
                {expanded && (
                  <div style={{ padding: 22, background: '#F8FAFC' }}>
                    {!hasTimetables ? (
                      <div
                        style={{
                          padding: '30px 20px',
                          textAlign: 'center',
                          background: '#FFFFFF',
                          borderRadius: 8,
                          border: '1px dashed #CBD5E1',
                        }}
                      >
                        <Building2 size={28} style={{ color: '#94A3B8', marginBottom: 8 }} />
                        <div style={{ fontWeight: 700, fontSize: '0.90rem', color: '#475569' }}>
                          No timetable saved yet for {dept.name} ({dept.code})
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 4 }}>
                          Go to the Timetable Generator to assign faculty and generate the official schedule.
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ marginTop: 14, fontSize: '0.78rem' }}
                          onClick={() =>
                            onRegenerate?.({ department_id: dept.id, department_name: dept.name, department_code: dept.code })
                          }
                        >
                          Generate Timetable for {dept.code}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                        {semesters.map(([semNo, semItems]) => (
                          <div
                            key={semNo}
                            style={{
                              background: '#FFFFFF',
                              borderRadius: 10,
                              border: '1px solid #E2E8F0',
                              padding: 16,
                              boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                            }}
                          >
                            {/* SEMESTER STRIP HEADER */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: '1px solid #F1F5F9',
                                paddingBottom: 10,
                                marginBottom: 14,
                                flexWrap: 'wrap',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GraduationCap size={18} style={{ color: '#005E38' }} />
                                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                                  Semester {semNo}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: '#DBEAFE',
                                    color: '#1D4ED8',
                                  }}
                                >
                                  {semItems.length} {semItems.length === 1 ? 'Version Saved' : 'Versions Saved'}
                                </span>
                              </div>

                              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Format: <strong>2-Block Labs (B1/B2) · Placement · Remedial</strong>
                              </div>
                            </div>

                            {/* TIMETABLE CARDS GRID FOR THIS SEMESTER */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: 14,
                              }}
                            >
                              {semItems.map((item, idx) => (
                                <div
                                  key={item.id || idx}
                                  style={{
                                    padding: 14,
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: 8,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10,
                                    transition: 'border-color 0.15s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                      <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0F172A' }}>
                                        {item.title || `${dept.code} - Semester ${semNo} Timetable`}
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                                        {item.academic_year || '2026-27'} · {item.semester_type || 'Odd'} Semester
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                      <span
                                        style={{
                                          fontSize: '0.64rem',
                                          fontWeight: 800,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          background: String(item.scheme_id) === '2' || (item.title || '').includes('2025') ? '#DCFCE7' : '#EFF6FF',
                                          color: String(item.scheme_id) === '2' || (item.title || '').includes('2025') ? '#15803D' : '#1D4ED8',
                                          border: '1px solid currentColor',
                                        }}
                                      >
                                        {String(item.scheme_id) === '2' || (item.title || '').includes('2025') ? '2025 Scheme' : '2022 Scheme'}
                                      </span>
                                      <span className="badge badge-active" style={{ fontSize: '0.64rem' }}>
                                        Option {item.alternative_id || idx + 1}
                                      </span>
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 12,
                                      fontSize: '0.70rem',
                                      color: '#475569',
                                      background: '#FFFFFF',
                                      padding: '6px 10px',
                                      borderRadius: 6,
                                      border: '1px solid #E2E8F0',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <Clock size={12} color="#005E38" />
                                      <strong>{item.entries?.length || 0}</strong> Scheduled Sessions
                                    </div>
                                    <div>•</div>
                                    <div>{new Date(item.created_at).toLocaleDateString()}</div>
                                  </div>

                                  {/* ACTION BUTTONS */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      style={{ fontSize: '0.74rem', padding: '6px 8px', justifyContent: 'center' }}
                                      onClick={() => onOpen?.(item)}
                                      title="Open in full Timetable Editor"
                                    >
                                      <Eye size={13} /> Open Editor
                                    </button>

                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{ fontSize: '0.74rem', padding: '6px 8px', justifyContent: 'center' }}
                                      onClick={() => setPreviewTimetable(item)}
                                      title="Quick View full 2-block timetable grid"
                                    >
                                      <Layers size={13} /> Quick Preview
                                    </button>

                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{ fontSize: '0.72rem', padding: '5px 8px', justifyContent: 'center' }}
                                      onClick={() =>
                                        exportTimetableCsv(
                                          item.entries,
                                          `${dept.code}-Sem-${semNo}-Option-${item.alternative_id || 1}.csv`
                                        )
                                      }
                                      title="Download CSV file"
                                    >
                                      <Download size={13} /> CSV
                                    </button>

                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{ fontSize: '0.72rem', padding: '5px 8px', justifyContent: 'center' }}
                                      onClick={() =>
                                        printTimetable(
                                          item.entries,
                                          item.title || `${dept.name} - Semester ${semNo} Timetable`
                                        )
                                      }
                                      title="Print or Save as PDF"
                                    >
                                      <Printer size={13} /> Print / PDF
                                    </button>

                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      style={{
                                        gridColumn: '1 / -1',
                                        fontSize: '0.70rem',
                                        padding: '4px 8px',
                                        color: '#DC2626',
                                        borderColor: '#FCA5A5',
                                        background: '#FEF2F2',
                                        justifyContent: 'center',
                                      }}
                                      onClick={() => handleDelete(item.id, item.title)}
                                    >
                                      <Trash2 size={12} /> Delete Saved File
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* QUICK PREVIEW MODAL */}
      {previewTimetable && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={() => setPreviewTimetable(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              maxWidth: 1100,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0F172A', fontWeight: 900 }}>
                  {previewTimetable.title || 'Official Published Timetable'}
                </h3>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 2 }}>
                  {previewTimetable.department_name || 'Department'} · Semester {previewTimetable.semester_no || '—'} · {previewTimetable.entries?.length || 0} Sessions
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => {
                    onOpen?.(previewTimetable);
                    setPreviewTimetable(null);
                  }}
                >
                  <Eye size={14} /> Open in Main Editor
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px' }}
                  onClick={() => setPreviewTimetable(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* MODAL GRID BODY */}
            <div style={{ padding: 20, overflowX: 'auto' }}>
              <div style={{ minWidth: 960 }}>
                {/* GRID HEADER */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px repeat(9, 1fr)',
                    gap: 6,
                    marginBottom: 8,
                    textAlign: 'center',
                  }}
                >
                  <div className="tt-header-cell">Day</div>
                  <div className="tt-header-cell">I<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>9:00 - 9:55</span></div>
                  <div className="tt-header-cell">II<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>9:55 - 10:50</span></div>
                  <div className="tt-header-cell" style={{ background: '#FEF3C7', color: '#B45309' }}>Tea<br /><span style={{ fontSize: '0.64rem' }}>10:50 - 11:05</span></div>
                  <div className="tt-header-cell">III<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>11:05 - 12:00</span></div>
                  <div className="tt-header-cell">IV<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>12:00 - 12:55</span></div>
                  <div className="tt-header-cell" style={{ background: '#DCFCE7', color: '#15803D' }}>Lunch<br /><span style={{ fontSize: '0.64rem' }}>12:55 - 1:40</span></div>
                  <div className="tt-header-cell">V<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>1:40 - 2:35</span></div>
                  <div className="tt-header-cell">VI<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>2:35 - 3:30</span></div>
                  <div className="tt-header-cell">VII<br /><span style={{ fontSize: '0.64rem', fontWeight: 500 }}>3:30 - 4:25</span></div>
                </div>

                {/* GRID ROWS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {buildPreviewGrid(previewTimetable.entries).map((row, rIdx) => (
                    <div
                      key={rIdx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px repeat(9, 1fr)',
                        gap: 6,
                      }}
                    >
                      <div className="tt-day-cell">{row.day}</div>

                      {row.slots.map((slot, sIdx) => {
                        if (slot.type === 'break') {
                          return (
                            <div
                              key={sIdx}
                              className="tt-break-slot"
                              style={{
                                minHeight: 52,
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                color: slot.breakType === 'tea' ? '#B45309' : '#15803D',
                                background: slot.breakType === 'tea' ? '#FEF3C7' : '#DCFCE7',
                              }}
                            >
                              {slot.breakType === 'tea' ? 'Tea' : 'Lunch'}
                            </div>
                          );
                        }

                        if (slot.labContinuation) return null;

                        if (slot.labSpan === 2) {
                          const labItems = slot.mergedLabItems || slot.items || [];
                          const batchMap = new Map();
                          labItems.forEach((li) => {
                            const b = li.batch || 'B1';
                            if (!batchMap.has(b)) batchMap.set(b, li);
                          });
                          const batches = [...batchMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

                          return (
                            <div
                              key={sIdx}
                              style={{
                                gridColumn: 'span 2',
                                minHeight: 56,
                                border: '2px solid #6366F1',
                                backgroundColor: '#EEF2FF',
                                borderRadius: 6,
                                padding: '3px 4px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                justifyContent: 'center',
                              }}
                            >
                              <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#4F46E5', textAlign: 'center' }}>
                                LAB (2 Periods)
                              </div>
                              {batches.map(([bLabel, bItem]) => (
                                <div
                                  key={bLabel}
                                  style={{
                                    background: bLabel === 'B1' ? '#EFF6FF' : '#F0FDF4',
                                    border: bLabel === 'B1' ? '1px solid #BFDBFE' : '1px solid #BBF7D0',
                                    borderRadius: 4,
                                    padding: '2px 4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.65rem',
                                  }}
                                >
                                  <span style={{ fontWeight: 800, color: bLabel === 'B1' ? '#1E40AF' : '#166534' }}>
                                    {bLabel}
                                  </span>
                                  <span style={{ fontWeight: 800, color: 'var(--primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {bItem.subject_code || bItem.code}
                                  </span>
                                  <span style={{ fontSize: '0.58rem', color: '#475569' }}>
                                    {bItem.faculty_name || bItem.faculty}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        const item = slot.items && slot.items.length > 0 ? slot.items[0] : null;
                        const isPlacement = slot.specialClassification === 'PLACEMENT';
                        const isRemedial = slot.specialClassification === 'REMEDIAL';

                        return (
                          <div
                            key={sIdx}
                            className="tt-slot-card"
                            style={{
                              minHeight: 56,
                              borderRadius: 6,
                              padding: 4,
                              border: isPlacement
                                ? '1.5px solid #F59E0B'
                                : isRemedial
                                ? '1.5px solid #14B8A6'
                                : item
                                ? '1px solid #CBD5E1'
                                : '1px solid #E2E8F0',
                              backgroundColor: isPlacement
                                ? '#FFFBEB'
                                : isRemedial
                                ? '#F0FDFA'
                                : item
                                ? '#FFFFFF'
                                : '#F8FAFC',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                            }}
                          >
                            {item ? (
                              <>
                                <span
                                  style={{
                                    fontWeight: 800,
                                    fontSize: '0.70rem',
                                    color: isPlacement ? '#92400E' : isRemedial ? '#115E59' : 'var(--primary)',
                                  }}
                                >
                                  {isPlacement ? '🎯 PLACEMENT' : isRemedial ? '📖 REMEDIAL' : (item.subject_code || item.code)}
                                </span>
                                <span style={{ fontSize: '0.58rem', color: '#475569', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                  {item.faculty_name || item.faculty}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: '#CBD5E1', fontSize: '0.70rem' }}>—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
