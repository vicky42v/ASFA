import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  FileSpreadsheet,
  FileText,
  Search,
  Eye,
  Edit3,
  Trash2,
  X,
} from 'lucide-react';
import { subjectApi } from '../services/api';
import { Doughnut } from 'react-chartjs-2';

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [subjectFile, setSubjectFile] = useState(null);

  const loadSubjects = () => {
    subjectApi
      .list()
      .then((data) => {
        const rows = Array.isArray(data)
          ? data
          : data?.subjects ||
            data?.items ||
            data?.rows ||
            data?.data ||
            [];

        setSubjects(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setSubjects([]));
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const handleDeactivate = async (id, name) => {
    if (
      !window.confirm(
        `Are you sure you want to deactivate subject ${name}?`
      )
    ) {
      return;
    }

    try {
      await subjectApi.deactivate(id);
      loadSubjects();
    } catch (err) {
      alert(err.message);
    }
  };

  // ------------------------------------------------------------
  // Subject classification
  // ------------------------------------------------------------

  const categoryOf = (subject) => {
    const direct = subject.course_category || subject.category;
    if (direct && String(direct).trim().toUpperCase() !== 'UNCATEGORIZED' && String(direct).trim().toUpperCase() !== 'UNCLASSIFIED') {
      return String(direct).trim().toUpperCase();
    }
    const code = String(subject.subject_code || subject.code || '').toUpperCase();
    const name = String(subject.subject_name || subject.name || '').toUpperCase();
    if (name.includes('PROJECT') || code.includes('705') || code.includes('786')) return 'PROJ';
    if (code.startsWith('BMAT') || code.startsWith('BPHY') || code.startsWith('BCHE') || code.startsWith('BBOC')) return 'BSC';
    if (code.startsWith('BPLC')) return 'PLC';
    if (code.startsWith('BESC') || code.startsWith('BETC') || code.startsWith('BCED')) return 'ESC';
    if (code.includes('358') || code.includes('456') || code.startsWith('BAEC') || code.startsWith('BSEC')) return 'AEC';
    if (code.endsWith('A') || code.endsWith('B') || code.endsWith('C') || code.endsWith('D')) return 'PEC';
    if (code.includes('(IPCC)') || name.includes('LAB') || /L\d{3}/.test(code)) return 'IPCC';
    return 'PCC';
  };

  const structureOf = (subject) => {
    const theory =
      Number(subject.lecture_hours || 0) +
      Number(subject.tutorial_hours || 0);

    const lab = Number(subject.practical_hours || 0);

    if (theory > 0 && lab > 0) return 'Integrated';
    if (lab > 0) return 'Lab Only';
    if (theory > 0) return 'Theory Only';

    // Some imported records may not have L-T-P populated.
    // Fall back to the stored course_structure when available.
    const storedStructure = String(
      subject.course_structure || ''
    ).trim().toUpperCase();

    if (storedStructure === 'INTEGRATED') return 'Integrated';
    if (storedStructure === 'THEORY') return 'Theory Only';

    return 'Other';
  };

  const displayTypeOf = (subject) => {
    const category = categoryOf(subject);
    const structure = structureOf(subject);

    return { category, structure };
  };

  const ltpOf = (subject) =>
    subject.LTP ||
    `${subject.lecture_hours || 0}-${subject.tutorial_hours || 0}-${subject.practical_hours || 0}`;

  // ------------------------------------------------------------
  // Dropdown options
  // ------------------------------------------------------------

  const departments = useMemo(() => {
    return [...new Set(
      subjects
        .map((s) => s.department || s.department_name)
        .filter(Boolean)
    )].sort((a, b) => String(a).localeCompare(String(b)));
  }, [subjects]);

  const semesters = useMemo(() => {
    return [...new Set(
      subjects
        .map((s) => s.semester_no ?? s.semester)
        .filter((value) => value !== undefined && value !== null && value !== '')
    )].sort((a, b) => Number(a) - Number(b));
  }, [subjects]);

  const categories = useMemo(() => {
    const preferredOrder = [
      'PCC',
      'IPCC',
      'PEC',
      'OEC',
      'PROJ',
      'INT',
      'MC',
    ];

    const existing = [
      ...new Set(
        subjects
          .map((s) => categoryOf(s))
          .filter((value) => value && value !== 'Uncategorized')
      ),
    ];

    return existing.sort((a, b) => {
      const ai = preferredOrder.indexOf(String(a).toUpperCase());
      const bi = preferredOrder.indexOf(String(b).toUpperCase());

      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;

      return String(a).localeCompare(String(b));
    });
  }, [subjects]);

  const typeOptions = useMemo(() => {
    return [
      ...categories,
      'Theory Only',
      'Lab Only',
      'Integrated',
    ];
  }, [categories]);

  // ------------------------------------------------------------
  // Filtering
  // ------------------------------------------------------------

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return subjects.filter((s) => {
      const code = String(
        s.subject_code || s.code || ''
      ).toLowerCase();

      const name = String(
        s.subject_name || s.name || ''
      ).toLowerCase();

      const department = String(
        s.department || s.department_name || ''
      ).toLowerCase();

      const semester = String(
        s.semester_no ?? s.semester ?? ''
      );

      const category = categoryOf(s);
      const structure = structureOf(s);

      const matchesSearch =
        !query ||
        code.includes(query) ||
        name.includes(query) ||
        department.includes(query) ||
        category.toLowerCase().includes(query);

      const matchesDepartment =
        !departmentFilter ||
        String(
          s.department || s.department_name || ''
        ) === departmentFilter;

      const matchesSemester =
        !semesterFilter ||
        semester === String(semesterFilter);

      const matchesType =
        !typeFilter ||
        category === typeFilter ||
        structure === typeFilter;

      const matchesScheme =
        !schemeFilter ||
        String(s.scheme_id ?? s.schemeId ?? '1') === String(schemeFilter);

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesSemester &&
        matchesType &&
        matchesScheme
      );
    });
  }, [
    subjects,
    search,
    departmentFilter,
    semesterFilter,
    typeFilter,
    schemeFilter,
  ]);

  // ------------------------------------------------------------
  // Statistics
  // ------------------------------------------------------------

  const theoryCount = subjects.filter(
    (s) => structureOf(s) === 'Theory Only'
  ).length;

  const labCount = subjects.filter(
    (s) => structureOf(s) === 'Lab Only'
  ).length;

  const integratedCount = subjects.filter(
    (s) => structureOf(s) === 'Integrated'
  ).length;

  const categoryCounts = categories.map((category) => ({
    category,
    count: subjects.filter(
      (s) => categoryOf(s) === category
    ).length,
  }));

  const chartLabels = [
    ...categoryCounts.map((item) => item.category),
    'Theory Only',
    'Lab Only',
    'Integrated',
  ];

  const chartData = [
    ...categoryCounts.map((item) => item.count),
    theoryCount,
    labCount,
    integratedCount,
  ];

  const categoryCards = [
    'PCC',
    'IPCC',
    'PEC',
    'OEC',
    'PROJ',
    'INT',
    'MC',
    ...categories.filter(
      (category) =>
        !['PCC', 'IPCC', 'PEC', 'OEC', 'PROJ', 'INT', 'MC'].includes(
          String(category).toUpperCase()
        )
    ),
  ].filter(
    (value, index, list) =>
      value && list.indexOf(value) === index
  );

  const categoryCardCount = (category) =>
    subjects.filter(
      (subject) =>
        String(categoryOf(subject)).toUpperCase() ===
        String(category).toUpperCase()
    ).length;

  const handleSubjectFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setSubjectFile(null);
      return;
    }

    const allowedExtensions = ['.pdf', '.xlsx', '.xls'];
    const lowerName = file.name.toLowerCase();
    const valid = allowedExtensions.some((ext) =>
      lowerName.endsWith(ext)
    );

    if (!valid) {
      alert('Please select a PDF, XLSX, or XLS file.');
      event.target.value = '';
      setSubjectFile(null);
      return;
    }

    setSubjectFile(file);
  };

  const closeAddSubject = () => {
    setShowAddSubject(false);
    setSubjectFile(null);
  };

  const continueAddSubject = () => {
    if (!subjectFile) {
      alert('Please select the subject file first.');
      return;
    }

    // The current subjectApi.create() accepts JSON, not multipart/form-data.
    // Keep the file selected in the UI now; the multipart upload endpoint
    // will be wired when we update the backend subject-import route.
    alert(
      `File selected: ${subjectFile.name}\n\nThe upload UI is ready. Next we will connect this file to the Flask subject-import endpoint.`
    );
    closeAddSubject();
  };

  const donutData = {
    labels: chartLabels,
    datasets: [
      {
        data: chartData,
        backgroundColor: [
          '#005E38',
          '#3B82F6',
          '#8B5CF6',
          '#F59E0B',
          '#EF4444',
          '#14B8A6',
          '#6366F1',
          '#22C55E',
          '#A855F7',
          '#F97316',
        ],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        <button
          className="btn-primary"
          onClick={() => setShowAddSubject(true)}
        >
          <Plus size={16} /> Add New Subject
        </button>

        <button
          className="btn-secondary"
          onClick={() => setShowAddSubject(true)}
        >
          <FileSpreadsheet size={15} /> Import Subjects (Excel)
        </button>
      </div>

      {/* Subject Category Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        {[
          {
            key: '',
            label: 'All Categories',
            count: subjects.length,
            subtitle: 'All subjects',
          },
          ...categoryCards.map((category) => ({
            key: category,
            label: category,
            count: categoryCardCount(category),
            subtitle: 'Subjects available',
          })),
        ].map((card) => {
          const active =
            String(typeFilter).toUpperCase() ===
            String(card.key).toUpperCase();

          return (
            <button
              key={card.key || 'all-categories'}
              type="button"
              onClick={() => setTypeFilter(card.key)}
              className="skit-card"
              style={{
                border: active
                  ? '2px solid #006B40'
                  : '1px solid #E2E8F0',
                background: active ? '#F0FDF7' : '#FFFFFF',
                padding: '16px',
                minHeight: '94px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: active
                  ? '0 4px 14px rgba(0, 107, 64, 0.10)'
                  : '0 1px 4px rgba(15, 23, 42, 0.04)',
              }}
              title={`Show ${card.label} subjects`}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? '#DDF7EA' : '#F1F5F9',
                    color: active ? '#006B40' : '#475569',
                    fontWeight: 900,
                    fontSize: '0.78rem',
                  }}
                >
                  {card.label === '' ? 'ALL' : card.label.slice(0, 3)}
                </div>

                <div
                  style={{
                    fontSize: '1.35rem',
                    lineHeight: 1,
                    fontWeight: 900,
                    color: active ? '#006B40' : '#0F172A',
                  }}
                >
                  {card.count}
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  fontSize: '0.86rem',
                  fontWeight: 900,
                  color: '#0F172A',
                }}
              >
                {card.label || 'All Categories'}
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: '0.68rem',
                  color: '#64748B',
                }}
              >
                {card.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 280px',
          gap: '24px',
        }}
      >
        {/* Table Card */}
        <div className="skit-card">
          <div className="filters-bar">
            {/* Scheme Filter */}
            <select
              className="form-select"
              value={schemeFilter}
              onChange={(e) =>
                setSchemeFilter(e.target.value)
              }
              style={{
                minWidth: '160px',
                fontWeight: '700',
                color: schemeFilter === '2' ? '#047857' : schemeFilter === '1' ? '#1D4ED8' : 'inherit',
                borderColor: schemeFilter === '2' ? '#10B981' : schemeFilter === '1' ? '#3B82F6' : undefined,
              }}
            >
              <option value="">All Schemes</option>
              <option value="1">2022 Scheme</option>
              <option value="2">2025 Scheme</option>
            </select>

            {/* Department */}
            <select
              className="form-select"
              value={departmentFilter}
              onChange={(e) =>
                setDepartmentFilter(e.target.value)
              }
            >
              <option value="">All Departments</option>
              {departments.map((department) => (
                <option
                  key={department}
                  value={department}
                >
                  {department}
                </option>
              ))}
            </select>

            {/* Semester */}
            <select
              className="form-select"
              value={semesterFilter}
              onChange={(e) =>
                setSemesterFilter(e.target.value)
              }
            >
              <option value="">All Semesters</option>
              {semesters.map((semester) => (
                <option
                  key={semester}
                  value={semester}
                >
                  Semester {semester}
                </option>
              ))}
            </select>

            {/* Type / Category */}
            <select
              className="form-select"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value)
              }
            >
              <option value="">All Types</option>

              {categories.length > 0 && (
                <optgroup label="Category">
                  {categories.map((category) => (
                    <option
                      key={`category-${category}`}
                      value={category}
                    >
                      {category}
                    </option>
                  ))}
                </optgroup>
              )}

              <optgroup label="Structure">
                <option value="Theory Only">
                  Theory Only
                </option>
                <option value="Lab Only">
                  Lab Only
                </option>
                <option value="Integrated">
                  Integrated
                </option>
              </optgroup>
            </select>

            {/* Search */}
            <div className="search-input-wrapper">
              <Search className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search subjects..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
              />
            </div>
          </div>

          {/* Active filters */}
          {(departmentFilter ||
            semesterFilter ||
            typeFilter ||
            schemeFilter ||
            search) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 0 12px',
                fontSize: '0.78rem',
                color: '#64748B',
              }}
            >
              <span>
                Showing {filtered.length} of {subjects.length}{' '}
                subjects
                {schemeFilter && ` (${schemeFilter === '2' ? '2025 Scheme' : '2022 Scheme'})`}
              </span>

              <button
                type="button"
                className="btn-secondary"
                style={{
                  padding: '4px 9px',
                  fontSize: '0.72rem',
                }}
                onClick={() => {
                  setDepartmentFilter('');
                  setSemesterFilter('');
                  setTypeFilter('');
                  setSchemeFilter('');
                  setSearch('');
                }}
              >
                Clear Filters
              </button>
            </div>
          )}

          <div className="table-container">
            <table className="skit-table">
              <thead>
                <tr>
                  <th>Subject Code</th>
                  <th>Subject Name</th>
                  <th>Scheme</th>
                  <th>Department</th>
                  <th>Sem</th>
                  <th>Type</th>
                  <th>Credit</th>
                  <th>L-T-P</th>
                  <th>Category / Option</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((s) => {
                  const { category, structure } =
                    displayTypeOf(s);

                  return (
                    <tr
                      key={s.subject_id || s.id}
                    >
                      <td
                        style={{
                          fontWeight: '800',
                          color: 'var(--primary)',
                        }}
                      >
                        {s.subject_code || s.code}
                      </td>

                      <td
                        style={{
                          fontWeight: '700',
                        }}
                      >
                        {s.subject_name || s.name}
                      </td>

                      <td>
                        <span
                          style={{
                            fontSize: '0.70rem',
                            fontWeight: '800',
                            padding: '3px 7px',
                            borderRadius: '5px',
                            background: String(s.scheme_id ?? s.schemeId) === '2' ? '#ECFDF5' : '#EFF6FF',
                            color: String(s.scheme_id ?? s.schemeId) === '2' ? '#065F46' : '#1E40AF',
                            border: `1px solid ${String(s.scheme_id ?? s.schemeId) === '2' ? '#A7F3D0' : '#BFDBFE'}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {String(s.scheme_id ?? s.schemeId) === '2' ? '2025 Scheme' : '2022 Scheme'}
                        </span>
                      </td>

                      <td
                        style={{
                          fontSize: '0.82rem',
                        }}
                      >
                        {s.department ||
                          s.department_name}
                      </td>

                      <td>
                        {s.semester_no ??
                          s.semester ??
                          '—'}
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px',
                            alignItems:
                              'flex-start',
                          }}
                        >
                          <span
                            className="badge badge-active"
                          >
                            {category}
                          </span>

                          <span
                            className="badge badge-info"
                            style={{
                              fontSize: '0.68rem',
                            }}
                          >
                            {structure}
                          </span>
                        </div>
                      </td>

                      <td>{s.credits ?? '—'}</td>

                      <td
                        style={{
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ltpOf(s)}
                      </td>

                      <td
                        style={{
                          fontSize: '0.75rem',
                        }}
                      >
                        <div>
                          {category !==
                          'Uncategorized'
                            ? category
                            : '—'}
                        </div>

                        {(s.option_group_id ||
                          s.optionGroupId) && (
                          <div
                            style={{
                              color: '#64748B',
                            }}
                          >
                            Option{' '}
                            {s.option_group_id ||
                              s.optionGroupId}
                          </div>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            s.status === 'Inactive'
                              ? 'badge badge-gray'
                              : 'badge badge-active'
                          }
                        >
                          {s.status || 'Active'}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            className="action-icon-btn"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            className="action-icon-btn"
                            title="Edit Subject"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            className="action-icon-btn delete"
                            title="Deactivate Subject"
                            onClick={() =>
                              handleDeactivate(
                                s.subject_id ||
                                  s.id,
                                s.subject_name ||
                                  s.name
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan="10"
                      style={{
                        textAlign: 'center',
                        padding: '40px',
                        color: '#64748B',
                      }}
                    >
                      No subjects match the selected
                      filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div
            className="skit-card"
            style={{ textAlign: 'center' }}
          >
            <div
              style={{
                fontWeight: '800',
                fontSize: '0.9rem',
                marginBottom: '12px',
              }}
            >
              Subject Type Distribution
            </div>

            <div
              style={{
                width: '150px',
                height: '150px',
                margin: '0 auto',
              }}
            >
              <Doughnut
                data={donutData}
                options={{
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                }}
              />
            </div>

            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                textAlign: 'left',
                fontSize: '0.72rem',
              }}
            >
              {categoryCounts
                .filter((item) => item.count > 0)
                .slice(0, 8)
                .map((item) => (
                  <div
                    key={item.category}
                    style={{
                      display: 'flex',
                      justifyContent:
                        'space-between',
                    }}
                  >
                    <span>{item.category}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
            </div>
          </div>

          <div className="skit-card">
            <div
              style={{
                fontWeight: '800',
                fontSize: '0.9rem',
                marginBottom: '10px',
              }}
            >
              Subjects
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.82rem',
              }}
            >
              {filtered.slice(0, 2).map((subject) => (
                <div
                  key={
                    subject.subject_id ||
                    subject.id
                  }
                  style={{
                    padding: '8px 10px',
                    background: '#F8FAFC',
                    borderRadius: '8px',
                  }}
                >
                  <div
                    style={{ fontWeight: '700' }}
                  >
                    {subject.subject_name ||
                      subject.name}
                  </div>

                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#64748B',
                    }}
                  >
                    {subject.department ||
                      subject.department_name}{' '}
                    - Sem{' '}
                    {subject.semester_no ??
                      subject.semester ??
                      '—'}
                  </div>

                  <div
                    style={{
                      fontSize: '0.7rem',
                      marginTop: '3px',
                    }}
                  >
                    {categoryOf(subject)} ·{' '}
                    {structureOf(subject)}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div
                  style={{
                    color: '#64748B',
                    fontSize: '0.75rem',
                  }}
                >
                  No matching subjects.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Add Subject / File Upload Modal */}
      {showAddSubject && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={closeAddSubject}
        >
          <div
            className="skit-card"
            style={{
              width: 'min(560px, 100%)',
              background: '#FFFFFF',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.22)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    color: '#0F172A',
                  }}
                >
                  Add New Subject
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: '#64748B',
                    marginTop: 4,
                  }}
                >
                  Upload the subject/syllabus file to add subject details.
                </div>
              </div>

              <button
                type="button"
                className="action-icon-btn"
                onClick={closeAddSubject}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: '12px',
                padding: '28px 20px',
                textAlign: 'center',
                background: '#F8FAFC',
              }}
            >
              <FileText
                size={34}
                style={{
                  color: '#006B40',
                  marginBottom: 8,
                }}
              />

              <div
                style={{
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  color: '#0F172A',
                }}
              >
                Subject file is required
              </div>

              <div
                style={{
                  color: '#64748B',
                  fontSize: '0.75rem',
                  margin: '6px 0 16px',
                }}
              >
                Supported formats: PDF, XLSX, XLS
              </div>

              <label
                className="btn-secondary"
                style={{
                  display: 'inline-flex',
                  cursor: 'pointer',
                }}
              >
                <FileSpreadsheet size={15} />
                Choose File
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,application/pdf"
                  onChange={handleSubjectFileChange}
                  style={{ display: 'none' }}
                />
              </label>

              {subjectFile && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: '#ECFDF5',
                    color: '#166534',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    wordBreak: 'break-word',
                  }}
                >
                  Selected: {subjectFile.name}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 18,
                padding: '10px 12px',
                background: '#FFF7ED',
                border: '1px solid #FED7AA',
                borderRadius: 8,
                fontSize: '0.72rem',
                color: '#9A3412',
              }}
            >
              The file upload screen is ready. The next backend step is to
              connect this file to the Flask import endpoint so the system can
              read the subject data and insert it into MySQL.
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAddSubject}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-primary"
                disabled={!subjectFile}
                onClick={continueAddSubject}
                style={{
                  opacity: subjectFile ? 1 : 0.5,
                  cursor: subjectFile ? 'pointer' : 'not-allowed',
                }}
              >
                <Plus size={15} />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
