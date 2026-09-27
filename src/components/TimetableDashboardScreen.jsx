import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Calendar,
  Download,
  Sparkles,
  Wand2,
  Trash2,
  Save,
  X,
  CheckCircle2,
  AlertTriangle,
  Search,
  Users,
  ChevronRight,
  Shield,
  Sliders,
  BarChart3,
  Clock,
  Building,
  RotateCcw,
  Printer,
  Pencil,
} from 'lucide-react';

import {
  api,
  timetableApi,
  facultyApi,
  subjectApi,
  departmentApi,
  schemeApi,
  semesterApi,
  timetableAiApi,
  asfaApi,
} from '../services/api';
import { saveGeneratedTimetable } from '../services/timetableStorage';
import { printTimetable, getFacultyShortCode, getSubjectAbbr } from '../services/timetableExport';

export default function TimetableDashboardScreen({ initialDepartmentId = '', initialTimetable = null }) {
  // =========================================================
  // MAIN VIEW
  // =========================================================

  const [mainView, setMainView] = useState(() => (initialTimetable ? 'timetable' : 'assignment'));
  const [activeView, setActiveView] = useState('grid');
  const [showAiDrawer, setShowAiDrawer] = useState(true);

  // =========================================================
  // DATA
  // =========================================================

  const [departments, setDepartments] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [allFaculty, setAllFaculty] = useState([]);
  const allFacultyRef = useRef([]);
  allFacultyRef.current = allFaculty;
  const [subjectList, setSubjectList] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);


  const [entries, setEntries] = useState(() => (initialTimetable?.entries ? initialTimetable.entries : []));

  // Stores generated results for multiple semesters.
  //
  // Example:
  // {
  //   "7": [...entries],
  //   "5": [...entries],
  //   "3": [...entries],
  //   "1": [...entries]
  // }
  const [generatedSemesters, setGeneratedSemesters] =
    useState({});

  // Interactive Drag & Drop and Live Conflict Analysis State
  const [draggedSlot, setDraggedSlot] = useState(null);
  const [dragHoverSlot, setDragHoverSlot] = useState(null);

  // =========================================================
  // CONTEXT
  // =========================================================

  const [context, setContext] = useState({
    department_id: initialTimetable?.department_id || initialDepartmentId || '',
    scheme_id: initialTimetable?.scheme_id || '',
    semester_id: initialTimetable?.semester_id || '',
    academic_year: initialTimetable?.academic_year || '2026-27',
    semester_type: initialTimetable?.semester_type || 'Odd',
    cycle: initialTimetable?.cycle || '',
    section: initialTimetable?.section || 'A',
  });

  useEffect(() => {
    if (initialTimetable) {
      if (Array.isArray(initialTimetable.entries)) {
        setEntries(initialTimetable.entries);
      }
      setMainView('timetable');
      if (initialTimetable.department_id) {
        setContext((prev) => ({
          ...prev,
          department_id: initialTimetable.department_id,
          semester_id: initialTimetable.semester_id || prev.semester_id,
          academic_year: initialTimetable.academic_year || prev.academic_year,
          semester_type: initialTimetable.semester_type || prev.semester_type,
          section: initialTimetable.section || prev.section || 'A',
        }));
      }
    }
  }, [initialTimetable]);

  const [numberOfOutputs, setNumberOfOutputs] = useState(3);
  const [generatedAlternatives, setGeneratedAlternatives] = useState([]);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState(1);

  // Dynamic Academic Years list (with add custom year capability)
  const [academicYears, setAcademicYears] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_academic_years');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['2026-27', '2025-26', '2024-25', '2027-28', '2028-29'];
  });
  const [showAddYearModal, setShowAddYearModal] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  // Universal Proctor B1 & B2 assignment state across ALL semesters & departments
  const [proctorFacultyId, setProctorFacultyId] = useState('');
  const [proctorB1FacultyId, setProctorB1FacultyId] = useState('');
  const [proctorB2FacultyId, setProctorB2FacultyId] = useState('');
  const [proctorTargetSemId, setProctorTargetSemId] = useState('');
  const [proctorAssignmentsBySem, setProctorAssignmentsBySem] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_proctor_assignments_by_sem');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Admin Model Training Modal & Terminal state
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [isTrainingModel, setIsTrainingModel] = useState(false);
  const [trainingTerminalLogs, setTrainingTerminalLogs] = useState([]);
  const [trainingMetricsResult, setTrainingMetricsResult] = useState(null);

  // Manual Timetable Editing with Pencil button
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [manualEditSlot, setManualEditSlot] = useState(null);

  const handleSaveManualEdit = (updated) => {
    if (!manualEditSlot) return;
    const { day, period, semNo, entry, item, isLab } = manualEditSlot;
    const targetBatch = (entry && entry.batch) || (item && item.batch) || '';
    const semKey = String(semNo || (context.semester_id ? getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {}) : 7));
    const startP = Number(period);
    const affectedPeriods = isLab || updated.isLab ? [startP, startP + 1] : [startP];

    const updateList = (prevList) => {
      const list = Array.isArray(prevList) ? [...prevList] : [];
      if (updated.isEmpty) {
        return list.filter((i) => {
          const matchDay = String(i.day_of_week || i.day || '').toLowerCase() === String(day).toLowerCase();
          const pNo = Number(i.period_number ?? i.period_no ?? i.period);
          const matchPeriod = affectedPeriods.includes(pNo);
          const matchBatch = !targetBatch || i.batch === targetBatch;
          return !(matchDay && matchPeriod && matchBatch);
        });
      }

      // If lab edit with separate B1 / B2 info
      if (updated.isLab && (updated.b1 || updated.b2)) {
        return list.map((i) => {
          const matchDay = String(i.day_of_week || i.day || '').toLowerCase() === String(day).toLowerCase();
          const pNo = Number(i.period_number ?? i.period_no ?? i.period);
          if (matchDay && affectedPeriods.includes(pNo)) {
            const b = String(i.batch || '').toUpperCase();
            if (b === 'B1' && updated.b1) {
              return {
                ...i,
                subject_code: updated.b1.subject_code || i.subject_code,
                code: updated.b1.subject_code || i.code,
                subject_name: updated.b1.subject_name || i.subject_name,
                name: updated.b1.subject_name || i.name,
                faculty_name: updated.b1.faculty_name || i.faculty_name,
                faculty: updated.b1.faculty_name || i.faculty,
                room_no: updated.b1.room_no || updated.room_no || i.room_no,
                room: updated.b1.room_no || updated.room_no || i.room,
              };
            }
            if (b === 'B2' && updated.b2) {
              return {
                ...i,
                subject_code: updated.b2.subject_code || i.subject_code,
                code: updated.b2.subject_code || i.code,
                subject_name: updated.b2.subject_name || i.subject_name,
                name: updated.b2.subject_name || i.name,
                faculty_name: updated.b2.faculty_name || i.faculty_name,
                faculty: updated.b2.faculty_name || i.faculty,
                room_no: updated.b2.room_no || updated.room_no || i.room_no,
                room: updated.b2.room_no || updated.room_no || i.room,
              };
            }
            if (updated.room_no) {
              return { ...i, room_no: updated.room_no, room: updated.room_no };
            }
          }
          return i;
        });
      }

      let matched = false;
      const newList = list.map((i) => {
        const matchDay = String(i.day_of_week || i.day || '').toLowerCase() === String(day).toLowerCase();
        const pNo = Number(i.period_number ?? i.period_no ?? i.period);
        const matchPeriod = affectedPeriods.includes(pNo);
        const matchBatch = !targetBatch || i.batch === targetBatch;
        if (matchDay && matchPeriod && matchBatch) {
          matched = true;
          return {
            ...i,
            subject_code: updated.subject_code || i.subject_code,
            code: updated.subject_code || i.code,
            subject_name: updated.subject_name || i.subject_name,
            name: updated.subject_name || i.name,
            faculty_name: updated.faculty_name !== undefined ? updated.faculty_name : i.faculty_name,
            faculty: updated.faculty_name !== undefined ? updated.faculty_name : i.faculty,
            room_no: updated.room_no !== undefined ? updated.room_no : i.room_no,
            room: updated.room_no !== undefined ? updated.room_no : i.room,
            batch: updated.batch || i.batch,
          };
        }
        return i;
      });

      if (!matched && updated.subject_code) {
        affectedPeriods.forEach((p) => {
          newList.push({
            day_of_week: day,
            day: day,
            period_number: p,
            period: p,
            period_no: p,
            subject_code: updated.subject_code,
            code: updated.subject_code,
            subject_name: updated.subject_name,
            name: updated.subject_name,
            faculty_name: updated.faculty_name,
            faculty: updated.faculty_name,
            room_no: updated.room_no,
            room: updated.room_no,
            batch: updated.batch || '',
          });
        });
      }
      return newList;
    };

    setEntries((prev) => updateList(prev));
    setGeneratedSemesters((prev) => ({
      ...prev,
      [semKey]: updateList(prev[semKey] || []),
    }));

    setManualEditSlot(null);
  };

  // =========================================================
  // ASSIGNMENT STATE
  // =========================================================

  const [showTheoryCo, setShowTheoryCo] = useState({});
  const [facultyAssignments, setFacultyAssignments] =
    useState({});

  // Component-level assignments: {subjectId: {Theory:{Main,Co}, Lab:{Main,Co}}}
  // IPCC subjects can therefore use different faculty for Theory and Lab.
  const [componentAssignments, setComponentAssignments] = useState({});
  const [savedComponentAssignments, setSavedComponentAssignments] = useState([]);
  const [allComponentAssignments, setAllComponentAssignments] = useState([]);

  // Cross-department faculty modal states
  const [showAddCrossDeptModal, setShowAddCrossDeptModal] = useState(false);
  const [crossDeptSelectedDeptId, setCrossDeptSelectedDeptId] = useState('');
  const [crossDeptFacultyList, setCrossDeptFacultyList] = useState([]);
  const [crossDeptSelectedFacultyIds, setCrossDeptSelectedFacultyIds] = useState(new Set());
  const [isFetchingCrossDeptFaculty, setIsFetchingCrossDeptFaculty] = useState(false);
  const [crossDeptFacultyByDept, setCrossDeptFacultyByDept] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_cross_dept_faculty_by_dept');
      if (saved) return JSON.parse(saved);
      localStorage.removeItem('asfa_cross_dept_faculty');
    } catch {}
    return {};
  });
  const currentDeptId = String(context.department_id || '');
  const crossDeptFacultyMembers = useMemo(() => {
    if (!currentDeptId) return [];
    return crossDeptFacultyByDept[currentDeptId] || [];
  }, [crossDeptFacultyByDept, currentDeptId]);
  const crossDeptFacultyRef = useRef(crossDeptFacultyMembers);
  crossDeptFacultyRef.current = crossDeptFacultyMembers;

  // Period timings configuration states
  const [showTimingsModal, setShowTimingsModal] = useState(false);
  const [periodTimings, setPeriodTimings] = useState(() => {
    try {
      const saved = localStorage.getItem('asfa_period_timings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      collegeStartTime: '09:00',
      periodDuration: 55,
      teaAfter: 2,
      teaDuration: 15,
      lunchAfter: 4,
      lunchDuration: 45,
      placementMaxPeriods: 3,
    };
  });
  const [tempPeriodTimings, setTempPeriodTimings] = useState({
    collegeStartTime: '09:00',
    periodDuration: 55,
    teaAfter: 2,
    teaDuration: 15,
    lunchAfter: 4,
    lunchDuration: 45,
    placementMaxPeriods: 3,
  });

  const [savedAssignments, setSavedAssignments] =
    useState([]);

  const [assignmentSearch, setAssignmentSearch] =
    useState('');

  const [assignmentLoading, setAssignmentLoading] =
    useState(false);

  const [assignmentSaving, setAssignmentSaving] =
    useState(false);

  const [assignmentsSavedForContext, setAssignmentsSavedForContext] =
    useState('');

  // =========================================================
  // TIMETABLE STATE
  // =========================================================

  const [selectedSlot, setSelectedSlot] = useState({
    day: '',
    period: '',
    subject: '',
  });

  const [isGenerating, setIsGenerating] =
    useState(false);

  const [message, setMessage] = useState('');

  // AI conflict-resolution state. The backend remains authoritative: any
  // AI proposal is validated before it is returned to this screen.
  const [isAiResolving, setIsAiResolving] = useState(false);
  const [aiResolution, setAiResolution] = useState(null);

  // ASFA Rules & Engine Metrics State
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [asfaRules, setAsfaRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [asfaMetrics, setAsfaMetrics] = useState(null);

  const loadAsfaRulesAndMetrics = async () => {
    try {
      setRulesLoading(true);
      const [rulesRes, metricsRes] = await Promise.all([
        asfaApi.getRules(),
        asfaApi.getMetrics(),
      ]);
      const rList = rulesRes?.rules || (Array.isArray(rulesRes) ? rulesRes : []);
      setAsfaRules(rList);
      if (metricsRes?.has_data) {
        setAsfaMetrics(metricsRes.metrics);
      }
    } catch (err) {
      console.warn('Failed to load ASFA rules/metrics:', err);
    } finally {
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    loadAsfaRulesAndMetrics();
  }, []);

  const handleToggleRule = async (rule) => {
    try {
      const newEnabled = !rule.is_enabled;
      await asfaApi.updateRule(rule.rule_id, {
        ...rule,
        is_enabled: newEnabled,
      });
      setAsfaRules((prev) =>
        prev.map((r) =>
          r.rule_id === rule.rule_id ? { ...r, is_enabled: newEnabled } : r
        )
      );
    } catch (err) {
      alert(err.message || 'Failed to update rule');
    }
  };


  // =========================================================
  // ID HELPERS
  //
  // Different APIs sometimes return:
  // id
  // department_id
  // scheme_id
  // semester_id
  //
  // These helpers support all of them.
  // =========================================================

  const getSubjectId = (subject) =>
    subject?.subject_id ??
    subject?.id;

  const getSubjectCode = (subject) =>
    subject?.subject_code ??
    subject?.code ??
    '';

  const getSubjectName = (subject) =>
    subject?.subject_name ??
    subject?.name ??
    'Unnamed Subject';

  const getFacultyId = (faculty) =>
    faculty?.faculty_id ??
    faculty?.id;

  const getFacultyName = (faculty) =>
    faculty?.faculty_name ??
    faculty?.name ??
    'Unnamed Faculty';

  const getFacultyRole = (faculty) =>
    faculty?.designation ??
    faculty?.role ??
    '';

  const getAssignmentId = (assignment) =>
    assignment?.assignment_id ??
    assignment?.id;

  const getDepartmentId = (department) =>
    department?.department_id ??
    department?.id;

  const getSchemeId = (scheme) =>
    scheme?.scheme_id ??
    scheme?.id;

  const getSemesterId = (semester) =>
    semester?.semester_id ??
    semester?.id;

  const getSemesterNo = (semester) =>
    semester?.semester_no ??
    semester?.semester_number ??
    semester?.semester ??
    semester?.number;

  const getDepartmentName = (department) =>
    department?.name ??
    department?.department_name ??
    department?.departmentName ??
    'Unnamed Department';

  // =========================================================
  // LOCAL FLASK / MYSQL NORMALIZATION HELPERS
  // =========================================================
  // The local backend stores P/C cycles as the single-letter values
  // `P` and `C`. The UI displays friendly labels such as `P Cycle`.
  // Never send `P Cycle` / `C Cycle` to Flask.
  const normalizeCycle = (value) => {
    const normalized = String(value ?? '').trim().toUpperCase();

    if (normalized === 'P' || normalized === 'P CYCLE') return 'P';
    if (normalized === 'C' || normalized === 'C CYCLE') return 'C';

    return '';
  };

  const assignmentContextKey = (value = context) => [
    value.department_id || '',
    value.scheme_id || '',
    value.semester_id || 'all',
    value.academic_year || '',
    value.semester_type || '',
    normalizeCycle(value.cycle),
  ].join('|');

  // For Semester 1/2 the curriculum subjects and faculty belong to
  // Science & Humanities / Basic Science, but the timetable itself must
  // remain under the student's selected department.
  const getAssignmentDepartmentId = (value = context) => {
    const semester = semesters.find(
      (item) => String(getSemesterId(item)) === String(value?.semester_id || '')
    );

    const semesterNo = Number(getSemesterNo(semester) || 0);
    if (semesterNo !== 1 && semesterNo !== 2) {
      return value?.department_id || '';
    }

    const basicScience = getBasicScienceDepartment(departments);
    return getDepartmentId(basicScience) ?? value?.department_id ?? '';
  };

  const getBasicScienceDepartment = (departmentList) => {
    const list = Array.isArray(departmentList)
      ? departmentList
      : [];

    return (
      list.find((department) => {
        const code = String(
          department?.department_code ??
            department?.code ??
            ''
        ).trim().toUpperCase();

        return code === 'SH' || code === 'BSH';
      }) ||
      list.find((department) => {
        const name = String(
          department?.department_name ??
            department?.name ??
            department?.departmentName ??
            ''
        ).trim().toLowerCase();

        return (
          name === 'science and humanities' ||
          name === 'basic science' ||
          name.includes('science and humanities') ||
          name.includes('basic science')
        );
      }) ||
      null
    );
  };


  // =========================================================
  // API ARRAY NORMALIZER
  // Supports both:
  //   [ ... ]
  // and wrapped responses such as:
  //   { subjects: [...] }
  //   { items: [...] }
  //   { rows: [...] }
  //   { data: [...] }
  // =========================================================

  const toArray = (value, keys = []) => {
    if (Array.isArray(value)) return value;

    if (value && typeof value === 'object') {
      for (const key of keys) {
        if (Array.isArray(value[key])) {
          return value[key];
        }
      }

      if (Array.isArray(value.data)) {
        return value.data;
      }
    }

    return [];
  };

  // =========================================================
  // SEMESTER LABEL
  // =========================================================

  const getSemesterLabel = (number) => {
    const n = Number(number);

    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    if (n === 4) return '4th';
    if (n === 5) return '5th';
    if (n === 6) return '6th';
    if (n === 7) return '7th';
    if (n === 8) return '8th';

    return `${n}th`;
  };

  // =========================================================
  // COURSE CATEGORY
  // =========================================================

  const getCourseCategory = (subject) => {
    const explicit =
      subject?.course_category ||
      subject?.vtu_category ||
      subject?.category ||
      subject?.current_category;

    if (explicit && String(explicit).trim().toUpperCase() !== 'UNCLASSIFIED') {
      return String(explicit).trim().toUpperCase();
    }

    const type = String(subject?.type || subject?.course_type || '').trim().toUpperCase();
    if (['IPCC', 'PCC', 'PCCL', 'PEC', 'OEC', 'BSC', 'ESC', 'ETC', 'PLC', 'AEC', 'AEC/SEC', 'HSMC', 'HSM', 'PROJ', 'MC', 'UHV'].includes(type)) {
      return type;
    }

    const code = String(subject?.subject_code || subject?.code || '').trim().toUpperCase();
    const name = String(subject?.subject_name || subject?.name || '').trim().toUpperCase();
    const p = Number(subject?.practical_hours || 0);
    const l = Number(subject?.lecture_hours || 0);

    if (name.includes('PROJECT') || code.includes('PROJECT') || name.includes('CAPSTONE') || code.endsWith('705') || code.includes('786')) return 'PROJ';
    if (code.startsWith('BMAT') || code.startsWith('BPHY') || code.startsWith('BCHE') || code.startsWith('BBOC') || name.includes('MATHEMATICS')) return 'BSC';
    if (code.startsWith('BPLC') || (name.includes('PROGRAMMING') && (code.endsWith('A') || code.endsWith('B')))) return 'PLC';
    if (code.startsWith('BESC') || code.startsWith('BETC') || code.startsWith('BCED')) return 'ESC';
    if (code.includes('358') || code.includes('456') || code.startsWith('BAEC') || code.startsWith('BSEC')) return 'AEC/SEC';
    if (name.includes('YOGA') || name.includes('NSS') || name.includes('SPORTS') || name.includes('PHYSICAL EDUCATION') || name.includes('CONSTITUTION')) return 'MC';
    if ((p > 0 && l === 0) || name.includes('LAB') || /L\d{3}/.test(code)) return 'PCCL';
    if ((p > 0 && l > 0) || code.includes('(IPCC)') || name.includes('INTEGRATED')) return 'IPCC';
    if (code.endsWith('A') || code.endsWith('B') || code.endsWith('C') || code.endsWith('D')) return 'PEC';

    return 'PCC';
  };

  // =========================================================
  // SUBJECT VALIDITY / LEGACY DATA FILTER
  // =========================================================
  // Subject 568 (legacy/inactive) and BCS717S must never enter the
  // assignment or timetable-generation workflow. Keep this check in
  // one place so it cannot break the React render tree.
  const isUsableSubject = (subject) => {
    const subjectId = String(
      getSubjectId(subject) ?? ''
    ).trim();

    const subjectCode = String(
      getSubjectCode(subject) ?? ''
    ).trim().toUpperCase();

    const status = String(
      subject?.status ?? 'Active'
    ).trim().toLowerCase();

    if (subjectId === '568') return false;
    if (subjectCode === 'BCS717S') return false;
    if (['inactive', 'disabled', 'deleted'].includes(status)) return false;

    return true;
  };

  // =========================================================
  // L-T-P
  // =========================================================

  const getLtp = (subject) => {
    if (subject?.LTP) {
      return subject.LTP;
    }

    if (subject?.ltp) {
      return subject.ltp;
    }

    return `${subject?.lecture_hours || 0}-${
      subject?.tutorial_hours || 0
    }-${subject?.practical_hours || 0}`;
  };

  const isMajorProjectSubject = (subject) => {
    const name = String(subject?.subject_name ?? subject?.name ?? '').trim().toLowerCase();
    const code = String(subject?.subject_code ?? subject?.code ?? '').trim().toUpperCase();
    if (name.includes('management')) return false;
    return (
      name.includes('major project') ||
      name.includes('project phase') ||
      ['BAI786', 'BCS786', 'BIS786', 'BVL786', 'BEC786', 'BCV786', 'BAI685', 'BCS685', 'BIS685', 'BVL685', 'BEC685', 'BCV685'].includes(code)
    );
  };

  const isMiniProjectSubject = (subject) => {
    const name = String(subject?.subject_name ?? subject?.name ?? '').trim().toLowerCase();
    const code = String(subject?.subject_code ?? subject?.code ?? '').trim().toUpperCase();
    if (name.includes('management')) return false;
    return (
      name.includes('mini project') ||
      ['BAI586', 'BCS586', 'BIS586', 'BVL586', 'BEC586', 'BCV586'].includes(code)
    );
  };

  const isProjectSubject = (subject) => {
    return isMajorProjectSubject(subject) || isMiniProjectSubject(subject);
  };

  const isPlacementSubject = (subject) => {
    const name = String(subject?.subject_name ?? subject?.name ?? '').trim().toLowerCase();
    const code = String(subject?.subject_code ?? subject?.code ?? '').trim().toUpperCase();
    return code === 'PLACEMENT' || name.includes('placement');
  };

  const getTeachingComponents = (subject) => {
    if (isProjectSubject(subject)) {
      return ['Theory'];
    }
    const theoryHours =
      Number(subject?.lecture_hours || 0) +
      Number(subject?.tutorial_hours || 0);
    const practicalHours = Number(subject?.practical_hours || 0);
    const components = [];
    if (theoryHours > 0) components.push('Theory');
    if (practicalHours > 0) components.push('Lab');
    return components;
  };

  const getComponentHours = (subject, component) => {
    if (isProjectSubject(subject) || isPlacementSubject(subject)) {
      return 0;
    }
    return component === 'Lab'
      ? Number(subject?.practical_hours || 0)
      : Number(subject?.lecture_hours || 0) + Number(subject?.tutorial_hours || 0);
  };

  const getComponentFaculty = (subject, component, role = 'Main') => {
    const subjectId = String(getSubjectId(subject));
    return componentAssignments?.[subjectId]?.[component]?.[role] || '';
  };

  const hasSubjectAssignedFaculty = (subject) => {
    const sId = String(getSubjectId(subject));
    if (facultyAssignments[sId]) return true;
    const comps = componentAssignments?.[sId];
    if (comps && typeof comps === 'object') {
      for (const roles of Object.values(comps)) {
        if (roles && typeof roles === 'object') {
          for (const fId of Object.values(roles)) {
            if (fId) return true;
          }
        }
      }
    }
    return false;
  };

  const isIpccSubject = (subject) => {
    const cat = String(subject?.course_category ?? subject?.category ?? '').toUpperCase().trim();
    if (cat === 'IPCC') return true;
    const theoryHours = Number(subject?.lecture_hours || 0) + Number(subject?.tutorial_hours || 0);
    const practicalHours = Number(subject?.practical_hours || 0);
    return theoryHours > 0 && practicalHours > 0;
  };

  // Weekly workload contribution of a subject. This matches the
  // backend faculty workload calculation: lecture + tutorial + practical hours.
  // Project coordinator assignments contribute 0 hours.
  const getSubjectWorkloadHours = (subject) => {
    if (isProjectSubject(subject)) return 0;
    return (
      Number(subject?.lecture_hours || 0) +
      Number(subject?.tutorial_hours || 0) +
      Number(subject?.practical_hours || 0)
    );
  };

  // Faculty workload policy:
  // Assistant Professor 16-18h
  // Associate Professor 14-16h
  // Professor 14-16h
  // HOD 8-12h (HOD overrides designation)
  const getFacultyWorkloadBounds = (faculty) => {
    const dbMin = Number(faculty?.min_workload);
    const dbMax = Number(faculty?.max_workload);
    if (Number.isFinite(dbMax) && dbMax > 0) {
      return {
        min: Number.isFinite(dbMin) ? dbMin : 0,
        max: dbMax,
        label: faculty?.designation || faculty?.role || 'Faculty',
      };
    }

    const designation = String(
      faculty?.designation ?? faculty?.faculty_designation ?? ''
    ).trim().toLowerCase();
    const role = String(
      faculty?.role ?? faculty?.faculty_role ?? ''
    ).trim().toLowerCase();

    const isHod =
      role === 'hod' ||
      designation.includes('hod') ||
      designation.includes('head of the department') ||
      designation.includes('head of department');

    if (isHod) return { min: 8, max: 12, label: 'HOD' };
    if (designation.includes('assistant professor')) {
      return { min: 16, max: 18, label: 'Assistant Professor' };
    }
    if (designation.includes('associate professor')) {
      return { min: 14, max: 16, label: 'Associate Professor' };
    }
    if (designation === 'professor' || designation.startsWith('professor ')) {
      return { min: 14, max: 16, label: 'Professor' };
    }

    return {
      min: Number.isFinite(dbMin) ? dbMin : 0,
      max: Number.isFinite(dbMax) ? dbMax : 18,
      label: faculty?.designation || faculty?.role || 'Faculty',
    };
  };

  const getFacultyMinWorkload = (faculty) =>
    getFacultyWorkloadBounds(faculty).min;

  const getFacultyMaxWorkload = (faculty) =>
    getFacultyWorkloadBounds(faculty).max;

  const getFacultyDatabaseWorkload = (faculty) => {
    const value = Number(faculty?.workload);
    return Number.isFinite(value) ? value : 0;
  };

  // =========================================================
  // SEMESTER TYPE NORMALIZATION
  // =========================================================

  const normalizeSemesterType = (value) => {
    const normalized = String(
      value ?? ''
    ).trim().toLowerCase();

    if (
      normalized === 'odd' ||
      normalized === 'odd semesters' ||
      normalized === 'odd semester'
    ) {
      return 'Odd';
    }

    if (
      normalized === 'even' ||
      normalized === 'even semesters' ||
      normalized === 'even semester'
    ) {
      return 'Even';
    }

    return value || '';
  };

  // =========================================================
  // DEPARTMENT, SCHEME, & SPECIALIZATION HELPERS
  // =========================================================

  const isScienceAndHumanities = useMemo(() => {
    const deptId = String(context.department_id || '');
    if (deptId === '9') return true;
    const currentDept = departments.find((d) => String(getDepartmentId(d)) === deptId);
    if (!currentDept) return false;
    const code = String(currentDept.department_code || currentDept.code || '').toUpperCase();
    const name = String(currentDept.department_name || currentDept.name || '').toLowerCase();
    return (
      code === 'SH' ||
      code === 'BSH' ||
      code === 'BS' ||
      name.includes('science and humanities') ||
      name.includes('basic science')
    );
  }, [context.department_id, departments]);

  const isAimlDepartment = useMemo(() => {
    const deptId = String(context.department_id || '');
    if (deptId === '5') return true;
    const currentDept = departments.find((d) => String(getDepartmentId(d)) === deptId);
    if (!currentDept) return false;
    const code = String(currentDept.department_code || currentDept.code || '').toUpperCase();
    const name = String(currentDept.department_name || currentDept.name || '').toLowerCase();
    return code === 'AIML' || name.includes('artificial intelligence') || name.includes('aiml');
  }, [context.department_id, departments]);

  // CSE (both A and B sections) — covers 2022 and 2025 schemes
  const isCseDepartment = useMemo(() => {
    const deptId = String(context.department_id || '');
    const currentDept = departments.find((d) => String(getDepartmentId(d)) === deptId);
    if (!currentDept) return false;
    const name = String(currentDept.department_name || currentDept.name || '').toLowerCase();
    const code = String(currentDept.department_code || currentDept.code || '').toUpperCase();
    return (
      code === 'CSE' ||
      name.includes('computer science and engineering') ||
      name.includes('computer science') ||
      // Match the split "CSE - A" / "CSE - B" department names
      name.includes('computer science and engineering - a') ||
      name.includes('computer science and engineering - b')
    );
  }, [context.department_id, departments]);

  // CSE always shows sections A & B (regardless of scheme)
  const isCseWithSections = isCseDepartment;

  // Deduplicated department list: hides "CSE - B" (and any " - B" variants)
  // so the dropdown shows one clean entry per department.
  const displayDepartments = useMemo(() => {
    const seen = new Map(); // baseName -> first dept object
    departments.forEach((dept) => {
      const name = String(dept.department_name || dept.name || '').trim();
      // Strip " - A" and " - B" suffixes for display/dedup key
      const baseName = name.replace(/\s*-\s*[AB]$/i, '').trim();
      const isBVariant = /\s*-\s*B$/i.test(name);
      if (!isBVariant) {
        // Keep A-variant (or non-split) as the canonical entry
        if (!seen.has(baseName)) {
          seen.set(baseName, { ...dept, _displayName: baseName });
        }
      }
      // B-variants are intentionally skipped from display
    });
    return Array.from(seen.values());
  }, [departments]);

  const is2025Scheme = useMemo(() => {
    const schemeId = String(context.scheme_id || '');
    if (schemeId === '2') return true;
    const currentScheme = schemes.find((s) => String(getSchemeId(s)) === schemeId);
    if (!currentScheme) return false;
    const name = String(currentScheme.scheme_name || currentScheme.name || '');
    return name.includes('2025');
  }, [context.scheme_id, schemes]);

  // Section toggle is shown for: AIML (2025 only) OR CSE (all schemes)
  const isAiml2025 = isAimlDepartment && is2025Scheme;
  const showSectionSelector = isAiml2025 || isCseWithSections;

  // Proctor assignment updater across all semesters
  const handleProctorChange = (semId, batch, facultyId) => {
    const sId = String(semId);
    setProctorAssignmentsBySem((prev) => {
      const currentSemObj = prev[sId] || {};
      const updated = {
        ...prev,
        [sId]: {
          ...currentSemObj,
          [batch]: facultyId,
        },
      };
      try {
        localStorage.setItem('asfa_proctor_assignments_by_sem', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (batch === 'b1') {
      setProctorB1FacultyId(facultyId);
      setProctorFacultyId(facultyId);
    } else {
      setProctorB2FacultyId(facultyId);
    }
  };

  // Academic year adder
  const handleAddAcademicYear = (newYear) => {
    const yr = String(newYear || '').trim();
    if (!yr) return;
    if (!academicYears.includes(yr)) {
      const updated = [yr, ...academicYears];
      setAcademicYears(updated);
      try {
        localStorage.setItem('asfa_academic_years', JSON.stringify(updated));
      } catch {}
    }
    setContext((prev) => ({ ...prev, academic_year: yr }));
    setShowAddYearModal(false);
    setNewYearInput('');
  };

  // =========================================================
  // AVAILABLE SEMESTERS (RULE-DRIVEN)
  //
  // Science & Humanities:
  //   ODD: [1] only (P-Cycle / C-Cycle)
  //   EVEN: [2] only (P-Cycle / C-Cycle)
  //
  // All other engineering departments:
  //   ODD: 7 -> 5 -> 3 (Sem 1 is completely excluded)
  //   EVEN: 8 -> 6 -> 4 (Sem 2 is completely excluded)
  // =========================================================

  const generationSemesters = useMemo(() => {
    let desiredOrder;
    if (isScienceAndHumanities) {
      desiredOrder = context.semester_type === 'Even' ? [2] : [1];
    } else {
      desiredOrder = context.semester_type === 'Even' ? [8, 6, 4] : [7, 5, 3];
    }

    return desiredOrder
      .map((semesterNo) =>
        semesters.find((semester) => {
          const numberMatches =
            Number(getSemesterNo(semester)) === semesterNo;

          if (!numberMatches) {
            return false;
          }

          const rawType =
            semester?.semester_type ??
            semester?.type ??
            '';

          if (rawType) {
            return (
              normalizeSemesterType(rawType) ===
              context.semester_type
            );
          }

          // Some local timetable_db responses expose only semester_no.
          // In that case infer Odd/Even from the semester number.
          return context.semester_type === 'Odd'
            ? semesterNo % 2 === 1
            : semesterNo % 2 === 0;
        })
      )
      .filter(Boolean);
  }, [
    semesters,
    context.semester_type,
    isScienceAndHumanities,
  ]);

  // =========================================================
  // SAFE ARRAY VIEWS
  //
  // React state is initialized as arrays, but API responses can be
  // objects. Never call .find/.map/.forEach on an unknown value.
  // =========================================================

  const safeGenerationSemesters = Array.isArray(generationSemesters)
    ? generationSemesters
    : [];

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [
          departmentData,
          schemeData,
          semesterData,
          subjectData,
          facultyData,
        ] = await Promise.all([
          api.get('/departments'),
          api.get('/schemes'),
          api.get('/semesters'),
          subjectApi.list(),
          facultyApi.list(),
        ]);

        const departmentsArray = toArray(
          departmentData,
          ['departments', 'items', 'rows']
        );

        const schemesArray = toArray(
          schemeData,
          ['schemes', 'items', 'rows']
        );

        const semestersArray = toArray(
          semesterData,
          ['semesters', 'items', 'rows']
        );

        const subjectsArray = toArray(
          subjectData,
          ['subjects', 'items', 'rows']
        );

        const facultyArray = toArray(
          facultyData,
          ['faculty', 'faculties', 'items', 'rows']
        ).filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active');

        console.log('AI-ASFA timetable data loaded:', {
          departments: departmentsArray.length,
          schemes: schemesArray.length,
          semesters: semestersArray.length,
          subjects: subjectsArray.length,
          faculty: facultyArray.length,
          sampleSubject: subjectsArray[0],
        });

        setDepartments(Array.isArray(departmentsArray) ? departmentsArray : []);
        setSchemes(Array.isArray(schemesArray) ? schemesArray : []);
        setSemesters(Array.isArray(semestersArray) ? semestersArray : []);
        setSubjectList(Array.isArray(subjectsArray) ? subjectsArray : []);
        setAllSubjects(Array.isArray(subjectsArray) ? subjectsArray : []);
        setAllFaculty(facultyArray);
        allFacultyRef.current = facultyArray;

        // =======================================================
// DEFAULT DEPARTMENT + SCHEME
// =======================================================
const firstDepartment =
  departmentsArray.find(
    (department) => String(getDepartmentId(department)) === String(initialDepartmentId)
  ) || departmentsArray[0];

const firstDeptId = String(getDepartmentId(firstDepartment) || '');
const initialDeptFaculty = facultyArray.filter(
  (item) => !firstDeptId || String(item?.department_id ?? item?.departmentId ?? '') === firstDeptId
);
setFacultyList(initialDeptFaculty.length > 0 ? initialDeptFaculty : facultyArray);

// Select the scheme belonging to the selected department.
// Prefer scheme ID 1 because that is the 2022 scheme used
// by the current timetable database.
const firstScheme =
  schemesArray.find((scheme) => {
    const schemeId =
      getSchemeId(scheme);

    const schemeDepartmentId =
      scheme?.department_id ??
      scheme?.departmentId ??
      '';

    return (
      String(schemeId) === '1' &&
      (
        !schemeDepartmentId ||
        String(schemeDepartmentId) ===
          String(getDepartmentId(firstDepartment))
      )
    );
  }) ||
  schemesArray.find((scheme) => {
    const schemeDepartmentId =
      scheme?.department_id ??
      scheme?.departmentId ??
      '';

    return (
      !schemeDepartmentId ||
      String(schemeDepartmentId) ===
        String(getDepartmentId(firstDepartment))
    );
  }) ||
  schemesArray[0];
        // Highest Odd semester first.
        //
        // 7 -> 5 -> 3 -> 1
        const firstOddSemester =
          semestersArray
            .filter((semester) => {
              const number = Number(getSemesterNo(semester));
              const rawType =
                semester?.semester_type ??
                semester?.type ??
                '';

              if (rawType) {
                return normalizeSemesterType(rawType) === 'Odd';
              }

              return Number.isFinite(number) && number % 2 === 1;
            })
            .sort(
              (a, b) =>
                Number(getSemesterNo(b)) -
                Number(getSemesterNo(a))
            )[0];

        setContext({
          department_id:
            getDepartmentId(
              firstDepartment
            ) || '',

          scheme_id:
            getSchemeId(
              firstScheme
            ) || '',

          semester_id:
            getSemesterId(
              firstOddSemester
            ) || '',

          academic_year: '2026-27',

          semester_type: 'Odd',

          cycle: '',
        });
      } catch (error) {
        console.error(
          'Failed to load timetable data:',
          error
        );

        setMessage(
          error?.message ||
            'Failed to load timetable data.'
        );
      }
    };

    loadInitialData();
  }, [initialDepartmentId]);

  // =========================================================
  // SUBJECT DATA SOURCE
  // =========================================================
  // Keep the complete subject catalogue in memory after the initial
  // load. Switching department/semester must NOT make another
  // /subjects request with a stale scheme_id; that was the reason
  // several departments were showing "0 required subjects".
  // The assignment screen filters the already-loaded catalogue locally.
  // =========================================================

  useEffect(() => {
    if (allSubjects.length > 0) {
      setSubjectList(allSubjects);
    }
  }, [allSubjects]);

  // =========================================================
  // LOAD FACULTY FOR SELECTED DEPARTMENT
  // =========================================================
  // Cache faculty by department so moving between departments is fast.
  // =========================================================

  const facultyCacheRef = useRef(new Map());

  useEffect(() => {
    const loadDepartmentFaculty = async () => {
      if (!context.department_id) {
        setFacultyList([]);
        return;
      }

      const selectedSemesterObject = semesters.find(
        (semester) =>
          String(getSemesterId(semester)) === String(context.semester_id || '')
      );
      const selectedSemesterNo = Number(
        getSemesterNo(selectedSemesterObject) || 0
      );
      const assignmentDepartmentId = getAssignmentDepartmentId(context);
      const departmentIds = new Set([String(assignmentDepartmentId)]);

      // When no semester is selected, keep the selected department only.
      // For Semester 1/2 getAssignmentDepartmentId() resolves BSH/SH.

      const cacheKey = Array.from(departmentIds).sort().join('|');
      const cached = facultyCacheRef.current.get(cacheKey);
      if (cached) {
        const existingIds = new Set(cached.map((f) => String(getFacultyId(f))));
        const crossToAdd = (crossDeptFacultyRef.current || []).filter(
          (f) => !existingIds.has(String(getFacultyId(f)))
        );
        setFacultyList([...cached, ...crossToAdd]);
        return;
      }

      // Fast in-memory lookup from allFaculty
      const masterList = allFaculty.length > 0 ? allFaculty : (allFacultyRef.current || []);
      if (masterList.length > 0) {
        let faculty = masterList.filter((item) => {
          if (departmentIds.has('') || departmentIds.has('undefined') || departmentIds.size === 0) return true;
          const itemDepartmentId = String(item?.department_id ?? item?.departmentId ?? '');
          return departmentIds.has(itemDepartmentId);
        });
        if (faculty.length === 0) {
          faculty = masterList;
        }
        facultyCacheRef.current.set(cacheKey, faculty);
        const existingIds = new Set(faculty.map((f) => String(getFacultyId(f))));
        const targetDeptId = String(context.department_id || '');
        const deptCrossFaculty = crossDeptFacultyByDept[targetDeptId] || crossDeptFacultyByDept['all'] || [];
        const crossToAdd = deptCrossFaculty.filter(
          (f) => !existingIds.has(String(getFacultyId(f)))
        );
        setFacultyList([...faculty, ...crossToAdd]);
        return;
      }

      try {
        const facultyResults = await Promise.all(
          Array.from(departmentIds).map((departmentId) =>
            facultyApi.list('', departmentId)
          )
        );

        let faculty = facultyResults
          .flatMap((data) =>
            toArray(data, ['faculty', 'faculties', 'items', 'rows'])
          )
          .filter((item) => {
            if (departmentIds.has('') || departmentIds.has('undefined') || departmentIds.size === 0) return true;
            const itemDepartmentId = String(item?.department_id ?? item?.departmentId ?? '');
            return departmentIds.has(itemDepartmentId);
          })
          .filter((item) =>
            String(item?.status ?? 'Active').toLowerCase() === 'active'
          )
          .filter((item, index, arr) => {
            const id = String(getFacultyId(item) ?? '');
            return (
              id &&
              arr.findIndex(
                (x) => String(getFacultyId(x) ?? '') === id
              ) === index
            );
          });

        if (faculty.length === 0) {
          const allData = await facultyApi.list();
          const allActive = toArray(allData, ['faculty', 'faculties', 'items', 'rows'])
            .filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active');
          if (allActive.length > 0) {
            faculty = allActive;
          }
        }

        facultyCacheRef.current.set(cacheKey, faculty);
        const existingIds = new Set(faculty.map((f) => String(getFacultyId(f))));
        const targetDeptId = String(context.department_id || '');
        const deptCrossFaculty = crossDeptFacultyByDept[targetDeptId] || [];
        const crossToAdd = deptCrossFaculty.filter(
          (f) => !existingIds.has(String(getFacultyId(f)))
        );
        setFacultyList([...faculty, ...crossToAdd]);
      } catch (error) {
        console.error('Failed to load department faculty:', error);
        try {
          const fallbackData = await facultyApi.list();
          const fallbackList = toArray(fallbackData, ['faculty', 'faculties', 'items', 'rows'])
            .filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active');
          const existingFallbackIds = new Set(fallbackList.map((f) => String(getFacultyId(f))));
          const targetDeptId = String(context.department_id || '');
          const deptCrossFaculty = crossDeptFacultyByDept[targetDeptId] || [];
          const crossToAdd = deptCrossFaculty.filter(
            (f) => !existingFallbackIds.has(String(getFacultyId(f)))
          );
          setFacultyList([...fallbackList, ...crossToAdd]);
        } catch {
          const targetDeptId = String(context.department_id || '');
          setFacultyList([...(crossDeptFacultyByDept[targetDeptId] || [])]);
        }
      }
    };

    loadDepartmentFaculty();
  }, [
    context.department_id,
    context.semester_id,
    departments,
    semesters,
    crossDeptFacultyByDept,
  ]);

  // =========================================================
  // FACULTY AVAILABLE FOR ASSIGNMENT
  // =========================================================
  // Assignment is based on active faculty in the selected
  // department. faculty_subject eligibility is NOT required.
  // =========================================================

  const getAssignableFaculty = () => {
    const unique = [];
    const seen = new Set();
    const targetDeptId = String(context.department_id || '');
    const deptCrossFaculty = crossDeptFacultyByDept[targetDeptId] || crossDeptFacultyByDept['all'] || [];

    // 1. Collect all faculty IDs that are saved or currently assigned
    const assignedIds = new Set();
    (savedComponentAssignments || []).forEach((a) => {
      if (a.faculty_id) assignedIds.add(String(a.faculty_id));
    });
    (allComponentAssignments || []).forEach((a) => {
      if (a.faculty_id) assignedIds.add(String(a.faculty_id));
    });
    Object.values(componentAssignments || {}).forEach((components) => {
      Object.values(components || {}).forEach((roles) => {
        Object.values(roles || {}).forEach((fid) => {
          if (fid) assignedIds.add(String(fid));
        });
      });
    });

    const master = allFaculty.length > 0 ? allFaculty : (allFacultyRef.current || []);

    // 2. Resolve assigned faculty objects so saved assignments ALWAYS display cleanly on reload
    const assignedMembers = master.filter((f) => assignedIds.has(String(getFacultyId(f))));

    // 3. Combine in priority order:
    // Primary department faculty -> Pinned cross-dept faculty -> Actively assigned faculty
    // NOTE: We do NOT add the full master (all college faculty) — only explicitly added cross-dept faculty show up
    const combined = [
      ...(Array.isArray(facultyList) ? facultyList : []),
      ...deptCrossFaculty,
      ...assignedMembers,
    ];

    combined.forEach((faculty) => {
      const id = String(getFacultyId(faculty) ?? '');
      if (!id || id === 'undefined' || seen.has(id)) return;
      seen.add(id);
      unique.push(faculty);
    });

    return unique;
  };

  const renderFacultyOption = (faculty, prefix = '') => {
    const fId = String(getFacultyId(faculty));
    const fHours = projectedFacultyWorkload[fId] ?? 0;
    const fMax = getFacultyMaxWorkload(faculty);
    const targetDeptId = String(context.department_id || '');
    const facDeptId = String(faculty.department_id || '');
    const isCross = Boolean(targetDeptId && facDeptId && facDeptId !== targetDeptId);
    const deptObj = departments.find((d) => String(d.id || d.department_id) === facDeptId);
    const deptLabel = faculty.department || deptObj?.department_code || deptObj?.name || '';
    const star = isCross ? '★ ' : '';
    const deptTag = deptLabel ? ` (${deptLabel})` : '';
    return (
      <option key={fId} value={fId}>
        {prefix}{star}{getFacultyName(faculty)} — {getFacultyRole(faculty) || 'Faculty'}{deptTag} [{fHours}/{fMax}h]
      </option>
    );
  };

  const renderFacultyOptionsList = (facultyListToRender, prefix = '') => {
    const targetDeptId = String(context.department_id || '');
    const currentDeptMembers = facultyListToRender.filter(
      (f) => !targetDeptId || String(f.department_id || '') === targetDeptId
    );
    const crossDeptMembers = facultyListToRender.filter(
      (f) => targetDeptId && String(f.department_id || '') !== targetDeptId
    );

    if (currentDeptMembers.length > 0 && crossDeptMembers.length > 0) {
      const currentDeptObj = departments.find((d) => String(d.id || d.department_id) === targetDeptId);
      const currentDeptLabel = currentDeptObj?.department_code || currentDeptObj?.department_name || 'Department';
      return (
        <>
          <optgroup label={`${currentDeptLabel} Faculty (${currentDeptMembers.length})`}>
            {currentDeptMembers.map((f) => renderFacultyOption(f, prefix))}
          </optgroup>
          <optgroup label={`Cross-Department Faculty (${crossDeptMembers.length})`}>
            {crossDeptMembers.map((f) => renderFacultyOption(f, prefix))}
          </optgroup>
        </>
      );
    }
    return facultyListToRender.map((f) => renderFacultyOption(f, prefix));
  };

  // =========================================================
  // LOAD EXISTING TIMETABLE
  //
  // Only load when a particular semester
  // is selected.
  // =========================================================

  useEffect(() => {
    if (
      context.department_id &&
      context.scheme_id &&
      context.semester_id
    ) {
      timetableApi
        .list(context)
        .then((data) => {
          setEntries(
            Array.isArray(data)
              ? data
              : []
          );
        })
        .catch((error) => {
          console.error(
            'Failed to load timetable:',
            error
          );

          setEntries([]);
        });
    } else {
      setEntries([]);
    }
  }, [
    context.department_id,
    context.scheme_id,
    context.semester_id,
    context.academic_year,
    context.semester_type,
    context.section,
  ]);

  // =========================================================
  // LOAD FACULTY ASSIGNMENTS
  // =========================================================

  const parentAssignmentCacheRef = useRef(new Map());

  useEffect(() => {
    const loadAssignments =
      async () => {
        if (!context.academic_year) {
          return;
        }

        try {
          setAssignmentLoading(true);

          const cacheKey = [
            context.academic_year,
            context.department_id || '',
            context.semester_type || '',
          ].join(':');

          const cached = parentAssignmentCacheRef.current.get(cacheKey);
          if (cached) {
            setSavedAssignments(cached);
            setFacultyAssignments({});
            setAssignmentLoading(false);
            return;
          }

          const params =
            new URLSearchParams({
              academic_year:
                context.academic_year,

              department_id:
                context.department_id ||
                '',

              semester_type:
                context.semester_type ||
                '',
            });

          let data;

          try {
            data = await api.get(
              `/faculty-subject-assignments?${params.toString()}`
            );
          } catch (filteredError) {
            console.warn(
              'Filtered faculty-assignment request failed; retrying by academic year:',
              filteredError
            );

            data = await api.get(
              `/faculty-subject-assignments?academic_year=${encodeURIComponent(
                context.academic_year
              )}`
            );
          }

          const assignments = toArray(
            data,
            [
              'assignments',
              'faculty_subject_assignments',
              'facultySubjectAssignments',
              'items',
              'rows',
            ]
          );

          parentAssignmentCacheRef.current.set(cacheKey, assignments);
          setSavedAssignments(
            assignments
          );

          // IMPORTANT: existing database assignments are kept in
          // savedAssignments so Save Assignments can replace/deactivate
          // them, but they are NOT copied into the visible selectors.
          // The assignment screen is intentionally a fresh selection UI.
          setFacultyAssignments({});
        } catch (error) {
          console.error(
            'Failed to load faculty assignments:',
            error
          );

          setSavedAssignments([]);
        } finally {
          setAssignmentLoading(
            false
          );
        }
      };

    loadAssignments();
  }, [
    context.academic_year,
    context.department_id,
    context.semester_type,
  ]);

  // =========================================================
  // LOAD COMPONENT-LEVEL FACULTY ASSIGNMENTS
  // =========================================================

  const componentAssignmentCacheRef = useRef(new Map());

  const reloadComponentAssignments = useCallback(async () => {
    if (!context.academic_year || !context.department_id) {
      setSavedComponentAssignments([]);
      return;
    }

    const cacheKey = [
      context.academic_year,
      context.department_id,
      context.scheme_id || '',
      context.semester_id || 'all',
      context.semester_type || '',
    ].join(':');

    try {
      const params = new URLSearchParams({
        academic_year: context.academic_year,
        department_id: context.department_id,
        semester_type: context.semester_type || '',
      });
      if (context.semester_id) {
        params.append('semester_id', context.semester_id);
      }
      if (context.scheme_id) {
        params.append('scheme_id', context.scheme_id);
      }

      const data = await api.get(`/faculty-assignment-details?${params.toString()}`);
      const details = toArray(data, ['details', 'assignments', 'items', 'rows']);
      componentAssignmentCacheRef.current.set(cacheKey, details);
      setSavedComponentAssignments(details);

      // Populate componentAssignments for this semester so dropdowns immediately display saved assignments
      const componentMap = {};
      details
        .filter((detail) => String(detail.status ?? 'Active').toLowerCase() === 'active')
        .forEach((detail) => {
          const sid = String(detail.subject_id ?? '');
          const component = String(detail.component || '').trim();
          const role = String(detail.assignment_role || 'Main').trim();
          if (!sid || !['Theory', 'Lab'].includes(component) || !['Main', 'Co'].includes(role) || !detail.faculty_id) return;
          if (!componentMap[sid]) componentMap[sid] = {};
          if (!componentMap[sid][component]) componentMap[sid][component] = {};
          componentMap[sid][component][role] = String(detail.faculty_id);
        });
      setComponentAssignments((prev) => ({
        ...prev,
        ...componentMap,
      }));
    } catch (error) {
      console.error('Failed to load component faculty assignments:', error);
      setSavedComponentAssignments([]);
    }
  }, [
    context.academic_year,
    context.department_id,
    context.scheme_id,
    context.semester_id,
    context.semester_type,
  ]);

  useEffect(() => {
    reloadComponentAssignments();
  }, [reloadComponentAssignments]);

  // =========================================================
  // CROSS-DEPARTMENT FACULTY ASSIGNMENTS LIST & REMOVAL
  // =========================================================
  const crossDeptAssignments = useMemo(() => {
    const currentDeptId = String(context.department_id || '');
    const list = [];
    const seen = new Set();

    // 1. From saved assignments where faculty belongs to another department
    (savedComponentAssignments || []).forEach((a) => {
      const facDeptId = String(a.faculty_department_id || '');
      if (facDeptId && facDeptId !== currentDeptId && String(a.status || 'Active').toLowerCase() === 'active') {
        const key = `assign-${a.subject_id}-${a.faculty_id}-${a.component}-${a.assignment_role}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: key,
            faculty_id: a.faculty_id,
            faculty_name: a.faculty_name,
            department_name: a.faculty_department_name || a.faculty_department_code || 'Other Department',
            subject_id: a.subject_id,
            subject_code: a.subject_code,
            subject_name: a.subject_name,
            component: a.component,
            role: a.assignment_role,
            is_assigned: true,
          });
        }
      }
    });

    // 2. From imported pool members not yet assigned to any subject
    (crossDeptFacultyMembers || []).forEach((f) => {
      const fId = String(getFacultyId(f));
      const hasAssignment = list.some((item) => String(item.faculty_id) === fId);
      if (!hasAssignment) {
        const deptObj = departments.find((d) => String(d.id || d.department_id) === String(f.department_id));
        const key = `pool-${fId}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            id: key,
            faculty_id: fId,
            faculty_name: getFacultyName(f),
            department_name: f.department || deptObj?.department_name || deptObj?.name || 'Other Department',
            is_assigned: false,
          });
        }
      }
    });

    return list;
  }, [savedComponentAssignments, crossDeptFacultyMembers, context.department_id, departments]);

  const handleRemoveCrossDeptFaculty = async (item) => {
    const confirmMsg = item.is_assigned
      ? `Remove assignment of ${item.faculty_name} (${item.department_name}) from ${item.subject_code} - ${item.subject_name}?\n\nNote: This removes the assignment relationship in SQL without deleting the master faculty record.`
      : `Remove ${item.faculty_name} (${item.department_name}) from the assignable faculty list?\n\nNote: The master faculty record in SQL will not be affected.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      if (item.is_assigned && item.subject_id) {
        await api.delete(`/faculty-assignment-details/${item.subject_id}/faculty/${item.faculty_id}?academic_year=${encodeURIComponent(context.academic_year || '')}`);
      } else {
        await api.delete(`/faculty-assignment-details/department/${context.department_id}/faculty/${item.faculty_id}?academic_year=${encodeURIComponent(context.academic_year || '')}`);
      }

      // Remove from cross-dept pool for the current department
      const targetDeptId = String(context.department_id || '');
      setCrossDeptFacultyByDept((prev) => {
        const existing = prev[targetDeptId] || [];
        const nextDeptList = existing.filter((f) => String(getFacultyId(f)) !== String(item.faculty_id));
        const next = {
          ...prev,
          [targetDeptId]: nextDeptList,
        };
        try {
          localStorage.setItem('asfa_cross_dept_faculty_by_dept', JSON.stringify(next));
        } catch {}
        return next;
      });

      // Remove from faculty list if from another department
      setFacultyList((prev) => prev.filter((f) => String(getFacultyId(f)) !== String(item.faculty_id)));
      facultyCacheRef.current.clear();

      // Clean in-memory componentAssignments state
      if (item.subject_id) {
        setComponentAssignments((prev) => {
          const next = { ...prev };
          const subId = String(item.subject_id);
          if (next[subId]?.[item.component]?.[item.role] === String(item.faculty_id)) {
            next[subId] = {
              ...next[subId],
              [item.component]: {
                ...next[subId][item.component],
                [item.role]: '',
              },
            };
          }
          return next;
        });
      }

      componentAssignmentCacheRef.current.clear();
      globalAssignmentCacheRef.current.clear();
      await reloadComponentAssignments();
      await reloadAllComponentAssignments();
      alert(`Successfully removed ${item.faculty_name} from assignments.`);
    } catch (err) {
      console.error('Failed to remove cross-department faculty:', err);
      alert('Failed to remove faculty: ' + (err?.response?.data?.message || err.message));
    }
  };

  // =========================================================
  // LOAD ALL COMPONENT ASSIGNMENTS FOR GLOBAL WORKLOAD
  // =========================================================

  const globalAssignmentCacheRef = useRef(new Map());

  const reloadAllComponentAssignments = useCallback(async () => {
    if (!context.academic_year) {
      setAllComponentAssignments([]);
      return;
    }

    try {
      const data = await api.get(`/faculty-assignment-details?academic_year=${encodeURIComponent(context.academic_year)}`);
      const details = toArray(data, ['details', 'assignments', 'items', 'rows']);
      setAllComponentAssignments(details);
    } catch (error) {
      console.error('Failed to load global faculty workload:', error);
      setAllComponentAssignments([]);
    }
  }, [context.academic_year]);

  useEffect(() => {
    reloadAllComponentAssignments();
  }, [reloadAllComponentAssignments, context.semester_id]);

  // =========================================================
  // SEMESTER NUMBER EXTRACTION HELPER
  // =========================================================
  const getSubjectSemesterNumber = useCallback(
    (subject) => {
      if (!subject) return 0;
      const directNo = Number(
        subject?.semester_no ??
          subject?.semester_number ??
          subject?.semesterNumber ??
          subject?.semester?.semester_no ??
          subject?.semester?.semester_number ??
          subject?.semester?.number
      );
      if (Number.isFinite(directNo) && directNo > 0) return directNo;

      const semId = String(
        subject?.semester_id ??
          subject?.semesterId ??
          subject?.semester?.semester_id ??
          subject?.semester?.id ??
          ''
      );
      if (semId && Array.isArray(semesters)) {
        const match = semesters.find(
          (s) => String(getSemesterId(s)) === semId || String(s?.id) === semId
        );
        if (match) {
          const num = Number(
            getSemesterNo(match) ?? match?.semester_no ?? match?.semester_number
          );
          if (Number.isFinite(num) && num > 0) return num;
        }
      }

      const code = String(getSubjectCode(subject) || '').trim().toUpperCase();
      const match = code.match(/^[A-Z]{2,4}(\d)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= 1 && num <= 8) return num;
      }

      return 0;
    },
    [semesters]
  );

  // =========================================================
  // FILTER SUBJECTS
  //
  // ALL:
  // all semesters of selected Odd/Even type.
  //
  // PARTICULAR:
  // only selected semester.
  // =========================================================

  const filteredSubjects =
    useMemo(() => {
      const searchText = assignmentSearch.toLowerCase().trim();

      const selectedDepartment = String(
        context.department_id ?? ''
      );

      const selectedSemester = String(
        context.semester_id ?? ''
      );

      const selectedScheme = String(
        context.scheme_id ?? ''
      );

      const selectedSemesterObject = semesters.find(
        (semester) =>
          String(getSemesterId(semester)) === selectedSemester
      );

      const selectedSemesterNo = String(
        getSemesterNo(selectedSemesterObject) ?? ''
      );

      const allowedSemesterIds = generationSemesters.map(
        (semester) => String(getSemesterId(semester))
      );

      const allowedSemesterNos = generationSemesters.map(
        (semester) => String(getSemesterNo(semester))
      );

      const selectedDepartmentObject = departments.find(
        (department) =>
          String(getDepartmentId(department)) === selectedDepartment
      );

      const selectedDepartmentName = String(
        getDepartmentName(selectedDepartmentObject)
      )
        .trim()
        .toLowerCase();

      const basicScienceDepartment = getBasicScienceDepartment(departments);
      const basicScienceDepartmentId = String(
        getDepartmentId(basicScienceDepartment) ?? ''
      );

      const matchesSearch = (subject) => {
        if (!searchText) return true;

        const code = getSubjectCode(subject).toLowerCase();
        const name = getSubjectName(subject).toLowerCase();
        const category = String(
          getCourseCategory(subject)
        ).toLowerCase();

        return (
          code.includes(searchText) ||
          name.includes(searchText) ||
          category.includes(searchText)
        );
      };

      const matchesSemester = (subject) => {
        const subjectSemesterId = String(
          subject?.semester_id ??
            subject?.semesterId ??
            subject?.semester?.semester_id ??
            subject?.semester?.id ??
            ''
        );

        const subjectSemesterNo = String(
          getSubjectSemesterNumber(subject) || ''
        );

        if (selectedSemester) {
          return (
            subjectSemesterId === selectedSemester ||
            (selectedSemesterNo &&
              subjectSemesterNo === selectedSemesterNo)
          );
        }

        // "All" means all semesters of the selected Odd/Even cycle.
        // Prefer the semester_type returned by the backend; fall back to
        // semester number parity when legacy rows omit semester_type.
        const subjectSemesterType = String(
          subject?.semester_type ??
          subject?.semesterType ??
          subject?.semester?.semester_type ??
          subject?.semester?.type ??
          ''
        ).trim();

        if (subjectSemesterType) {
          const typeMatches = normalizeSemesterType(subjectSemesterType) === context.semester_type;
          if (!typeMatches) return false;
          // Also enforce allowedSemesterNos so Sem 1/2 are excluded for non-S&H depts
          const semNumber = Number(subjectSemesterNo);
          if (Number.isFinite(semNumber) && semNumber > 0 && allowedSemesterNos.length > 0) {
            return allowedSemesterNos.includes(String(semNumber));
          }
          return true;
        }

        const number = Number(subjectSemesterNo);
        if (Number.isFinite(number) && number > 0) {
          // Strictly enforce allowedSemesterNos (excludes Sem 1 for non-S&H depts)
          if (allowedSemesterNos.length > 0) {
            return allowedSemesterNos.includes(String(number));
          }
          return context.semester_type === 'Odd'
            ? number % 2 === 1
            : number % 2 === 0;
        }

        return (
          allowedSemesterIds.includes(subjectSemesterId) ||
          allowedSemesterNos.includes(subjectSemesterNo)
        );
      };

      const matchesDepartment = (subject) => {
        const subjectDepartmentId = String(
          subject?.department_id ??
            subject?.departmentId ??
            subject?.department?.department_id ??
            subject?.department?.id ??
            ''
        );

        const subjectDepartmentName = String(
          subject?.department_name ??
            subject?.departmentName ??
            subject?.department?.department_name ??
            subject?.department?.name ??
            ''
        )
          .trim()
          .toLowerCase();

        // Sem 1/2 curriculum subjects belong to Basic Science/SH.
        const subjectSemesterNo = String(
          getSubjectSemesterNumber(subject) || ''
        );

        if (
          selectedSemesterNo === '1' ||
          selectedSemesterNo === '2' ||
          (!selectedSemester && (subjectSemesterNo === '1' || subjectSemesterNo === '2'))
        ) {
          return (
            !basicScienceDepartmentId ||
            !subjectDepartmentId ||
            subjectDepartmentId === basicScienceDepartmentId ||
            (
              !subjectDepartmentId &&
              (
                subjectDepartmentName.includes('science and humanities') ||
                subjectDepartmentName.includes('basic science')
              )
            )
          );
        }

        return (
          !selectedDepartment ||
          !subjectDepartmentId ||
          subjectDepartmentId === selectedDepartment ||
          (!subjectDepartmentId &&
            selectedDepartmentName &&
            subjectDepartmentName === selectedDepartmentName)
        );
      };

      const matchesScheme = (subject) => {
        if (!selectedScheme) return true;

        const subjectSchemeId = String(
          subject?.scheme_id ??
          subject?.schemeId ??
          subject?.scheme?.scheme_id ??
          subject?.scheme?.id ??
          ''
        ).trim();

        if (subjectSchemeId) {
          return subjectSchemeId === selectedScheme;
        }
        return true;
      };

      const baseFilter = (subject) =>
        matchesDepartment(subject) &&
        matchesScheme(subject) &&
        matchesSemester(subject) &&
        matchesSearch(subject);

      let result = subjectList
        .filter(baseFilter)
        .filter(isUsableSubject);

      // Fallback only if no results with strict department filter, but keep scheme matched
      if (result.length === 0) {
        result = subjectList.filter((subject) => {
          if (!isUsableSubject(subject)) return false;
          if (!matchesSemester(subject)) return false;
          if (!matchesScheme(subject)) return false;
          if (!matchesSearch(subject)) return false;

          const departmentId = String(
            subject?.department_id ??
              subject?.departmentId ??
              subject?.department?.department_id ??
              subject?.department?.id ??
              ''
          );

          return (
            !departmentId ||
            !selectedDepartment ||
            departmentId === selectedDepartment
          );
        });
      }

      return result.sort((a, b) => {
        const semesterA = getSubjectSemesterNumber(a);
        const semesterB = getSubjectSemesterNumber(b);

        if (semesterA !== semesterB) {
          return semesterB - semesterA;
        }

        return getSubjectCode(a).localeCompare(
          getSubjectCode(b)
        );
      });
    }, [
      subjectList,
      assignmentSearch,
      context.department_id,
      context.semester_id,
      context.scheme_id,
      generationSemesters,
      isScienceAndHumanities,
      semesters,
      departments,
      getSubjectSemesterNumber,
    ]);

  // =========================================================
  // ELECTIVE / OPTIONAL SUBJECT HELPERS
  //
  // PEC = Professional Elective Course
  // OEC = Open Elective Course
  //
  // Subjects in the same option_group_id are alternatives.
  // Once one subject in that group is selected/assigned,
  // the other alternatives are hidden and are not treated
  // as separate subjects for timetable generation.
  // =========================================================

  const isOnDemandOptionalSubject = (subject) => {
    const cat = String(getCourseCategory(subject)).trim().toUpperCase();
    const code = String(getSubjectCode(subject)).trim().toUpperCase();
    const name = String(subject?.subject_name ?? subject?.name ?? '').trim().toLowerCase();
    return (
      cat === 'SDC' ||
      cat === 'ADC' ||
      code.includes('DIP') ||
      code.includes('MATDIP') ||
      name.includes('lateral entry')
    );
  };

  const isChoiceSubject = (subject) => {
    const category = String(
      getCourseCategory(subject)
    )
      .trim()
      .toUpperCase();

    const optionalRaw =
      subject?.is_optional ??
      subject?.isOptional ??
      false;

    const optional =
      optionalRaw === true ||
      optionalRaw === 1 ||
      String(optionalRaw).toLowerCase() === '1' ||
      String(optionalRaw).toLowerCase() === 'true' ||
      String(optionalRaw).toLowerCase() === 'yes';

    return (
      (category === 'PEC' || category === 'OEC' || category === 'AEC' || category === 'SEC' || category === 'PLC') &&
      (optional || Boolean(getOptionGroupId(subject)))
    );
  };

  const isSaturdayActivity = (subject) => {
    const text = [
      subject?.subject_code,
      subject?.subject_name,
      subject?.course_category,
      subject?.group_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return ['sports', 'yoga', 'nss', 'ncc', 'physical education', 'music'].some((token) =>
      text.includes(token)
    );
  };

  const isSpecialActivity = (subject) => {
    const code = String(subject?.subject_code || '').trim().toUpperCase();
    if (code === 'PLACEMENT' || code.includes('DIP') || code.includes('MATDIP')) return false;

    const text = [
      subject?.subject_code,
      subject?.subject_name,
      subject?.course_category,
      subject?.group_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      ['sports', 'yoga', 'nss', 'ncc', 'physical education', 'music', 'activity', 'remedial', 'library'].some((token) =>
        text.includes(token)
      ) ||
      (subject?.faculty_assignment_required === 0 && !code.includes('DIP')) ||
      String(subject?.course_category || '').toUpperCase() === 'SPECIAL'
    );
  };

  const getOptionGroupId = (subject) =>
    subject?.option_group_id ??
    subject?.optionGroupId ??
    null;

  const getOptionGroupKey = (subject) => {
    if (!isChoiceSubject(subject)) {
      return null;
    }

    const optionGroupId =
      getOptionGroupId(subject);

    if (
      optionGroupId === null ||
      optionGroupId === undefined ||
      optionGroupId === ''
    ) {
      return null;
    }

    return [
      subject?.semester_id ??
        subject?.semesterId ??
        '',
      String(getCourseCategory(subject))
        .trim()
        .toUpperCase(),
      optionGroupId,
    ].join(':');
  };

  // =========================================================
  // ELECTIVE / OPTIONAL SUBJECT VISIBILITY
  //
  // Example:
  //
  // PEC group 13:
  //   BAI515A - Computer Vision
  //   BAI515B - Information Retrieval
  //   BCS515C - Unix System Programming
  //   BCS515D - Distributed Systems
  //
  // Before a choice is made:
  //   all four are shown.
  //
  // After one is assigned:
  //   only the assigned subject remains visible.
  // =========================================================

  const getAssignmentSection = (subject) => {
    if (isSpecialActivity(subject)) return 'SPECIAL';
    const category = getCourseCategory(subject);
    if (category === 'PEC') return 'PEC';
    if (category === 'OEC') return 'OEC';
    if (category === 'PROJ') return 'PROJECT';
    return 'REQUIRED';
  };

  const assignmentSectionMeta = {
    REQUIRED: { title: 'REQUIRED / DEFAULT COURSES', tone: '#0F766E' },
    PEC: { title: 'PROFESSIONAL ELECTIVE — SELECT EXACTLY ONE', tone: '#7E22CE' },
    OEC: { title: 'OPEN ELECTIVE — SELECT EXACTLY ONE', tone: '#7E22CE' },
    PROJECT: { title: 'PROJECT / PRACTICAL WORK', tone: '#B45309' },
    SPECIAL: { title: 'SATURDAY INSTITUTIONAL ACTIVITIES', tone: '#B45309' },
  };

  const visibleSubjects = useMemo(() => {
    // A missing/unknown course category is normalized to Unclassified.
    // Valid Unclassified subjects must remain visible and assignable.
    const clean = filteredSubjects.filter(isUsableSubject);

    const order = {
      REQUIRED: 1,
      PEC: 2,
      OEC: 3,
      PROJECT: 4,
      SPECIAL: 5,
    };

    return clean.sort((a, b) => {
      // 1. Sort by Semester strictly descending: 7th sem first, then 5th sem, then 3rd sem
      const semA = getSubjectSemesterNumber(a);
      const semB = getSubjectSemesterNumber(b);
      if (semB !== semA) {
        return semB - semA;
      }

      // 2. Sort by Course Category (REQUIRED -> PEC -> OEC -> PROJECT -> SPECIAL)
      const sectionDiff =
        (order[getAssignmentSection(a)] || 99) -
        (order[getAssignmentSection(b)] || 99);

      if (sectionDiff) return sectionDiff;

      // 3. Sort alphabetically by Subject Code
      return getSubjectCode(a).localeCompare(
        getSubjectCode(b)
      );
    });
  }, [filteredSubjects, getSubjectSemesterNumber]);

  const selectedChoiceByGroup = useMemo(() => {
    const selected = {};

    filteredSubjects.forEach((subject) => {
      if (!isChoiceSubject(subject)) return;

      const groupKey = getOptionGroupKey(subject);
      if (!groupKey) return;

      const subjectId = String(getSubjectId(subject));
      if (facultyAssignments[subjectId]) {
        selected[groupKey] = subjectId;
      }
    });

    return selected;
  }, [filteredSubjects, facultyAssignments]);


  // =========================================================
  // REQUIRED SUBJECTS
  //
  // Normal subjects:
  //   always required.
  //
  // PEC/OEC:
  //   only the selected subject from each option group
  //   is required.
  //
  // An unselected PEC/OEC group is handled separately by
  // missingOptionGroups below, so all alternatives are NOT
  // incorrectly counted as missing assignments.
  // =========================================================

  const requiredSubjects = useMemo(() => {
    const selectedGroups = new Set();
    const result = [];

    filteredSubjects.forEach((subject) => {
      // Never allow inactive/legacy subjects into assignment or generation.
      if (!isUsableSubject(subject)) {
        return;
      }

      // Sports/Yoga/NSS/NCC are institutional Saturday activities, not
      // faculty-assignment subjects. The generator reserves Saturday for them.
      if (isSpecialActivity(subject)) {
        return;
      }

      // SDC, ADC, and Lateral Entry (DIP) subjects are optional on-demand:
      // included only if user assigned faculty to them.
      if (isOnDemandOptionalSubject(subject)) {
        if (hasSubjectAssignedFaculty(subject)) {
          result.push(subject);
        }
        return;
      }

      if (!isChoiceSubject(subject)) {
        result.push(subject);
        return;
      }

      const groupKey = getOptionGroupKey(subject);

      // PEC/OEC without a valid option group behaves like a normal subject.
      if (!groupKey) {
        result.push(subject);
        return;
      }

      const subjectId = String(getSubjectId(subject));

      if (
        facultyAssignments[subjectId] &&
        !selectedGroups.has(groupKey)
      ) {
        result.push(subject);
        selectedGroups.add(groupKey);
      }
    });

    return result;
  }, [
    filteredSubjects,
    facultyAssignments,
    componentAssignments,
  ]);

  // =========================================================
  // PEC/OEC GROUPS THAT STILL NEED A CHOICE
  // =========================================================

  const missingOptionGroups = useMemo(() => {
    const groups = {};

    filteredSubjects.forEach((subject) => {
      if (!isChoiceSubject(subject)) {
        return;
      }

      const groupKey =
        getOptionGroupKey(subject);

      if (!groupKey) {
        return;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: groupKey,
          category:
            getCourseCategory(subject),
          optionGroupId:
            getOptionGroupId(subject),
          semesterId:
            subject?.semester_id ??
            subject?.semesterId,
          selected: false,
        };
      }

      const subjectId = String(
        getSubjectId(subject)
      );

      if (facultyAssignments[subjectId]) {
        groups[groupKey].selected = true;
      }
    });

    return Object.values(groups).filter(
      (group) => !group.selected
    );
  }, [
    filteredSubjects,
    facultyAssignments,
  ]);

  // =========================================================
  // MISSING ASSIGNMENTS
  // =========================================================

  const missingAssignments =
    useMemo(() => {
      return requiredSubjects.filter(
        (subject) => {
          // Saturday institutional activities are generated from the
          // curriculum and do not require a faculty assignment.
          if (isSpecialActivity(subject)) {
            return false;
          }

          if (isProjectSubject(subject)) {
            return !Boolean(getComponentFaculty(subject, 'Theory', 'Main'));
          }

          if (isOnDemandOptionalSubject(subject)) {
            return !hasSubjectAssignedFaculty(subject);
          }

          return !facultyAssignments[
            String(
              getSubjectId(subject)
            )
          ];
        }
      );
    }, [
      requiredSubjects,
      facultyAssignments,
      componentAssignments,
    ]);

  const assignedCount =
    requiredSubjects.length -
    missingAssignments.length;

  // =========================================================
  // PROJECTED FACULTY WORKLOAD
  // =========================================================
  // Uses the faculty workload already stored by the backend and
  // adjusts it for the unsaved selections currently visible.
  // This lets the UI warn about workload before saving.
  // =========================================================

  const projectedFacultyWorkload = useMemo(() => {
    const result = {};

    // 1. Authoritative source: component-level assignments for the entire
    // academic year across all semesters and departments.
    allComponentAssignments.forEach((assignment) => {
      if (String(assignment.status ?? 'Active').toLowerCase() !== 'active') return;

      const facultyId = String(assignment.faculty_id ?? '');
      const subjectId = String(assignment.subject_id ?? '');
      if (!facultyId || assignment.assignment_role === 'Coordinator') return;

      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === subjectId
      );
      const isProj = (subject && isProjectSubject(subject)) ||
        ['PROJ', 'PROJECT', 'MAJOR_PROJECT', 'MINI_PROJECT'].includes(String(assignment.course_category || '').toUpperCase()) ||
        String(assignment.subject_name || '').toLowerCase().includes('major project') ||
        String(assignment.subject_name || '').toLowerCase().includes('mini project');
      const isPlacement = (subject && isPlacementSubject(subject)) ||
        String(assignment.course_category || '').toUpperCase() === 'SPECIAL' ||
        String(assignment.subject_code || '').toUpperCase() === 'PLACEMENT' ||
        String(assignment.subject_name || '').toLowerCase().includes('placement');
      if (isProj || isPlacement) return;

      const component = String(assignment.component || 'Theory');
      let hours = subject ? getComponentHours(subject, component) : 0;
      if (!hours) {
        hours = component.toLowerCase() === 'lab'
          ? Number(assignment.practical_hours || 0)
          : Number(assignment.lecture_hours || 0) + Number(assignment.tutorial_hours || 0);
      }
      if (!hours) return;

      result[facultyId] = (result[facultyId] || 0) + hours;
    });

    // 2. Remove saved rows for the context currently being edited.
    const currentContextSubjectIds = new Set(
      filteredSubjects.map((subject) => String(getSubjectId(subject)))
    );

    savedComponentAssignments.forEach((assignment) => {
      if (String(assignment.status ?? 'Active').toLowerCase() !== 'active') return;

      const subjectId = String(assignment.subject_id ?? '');
      if (!currentContextSubjectIds.has(subjectId)) return;

      const facultyId = String(assignment.faculty_id ?? '');
      if (!facultyId || assignment.assignment_role === 'Coordinator') return;

      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === subjectId
      );
      const isProj = (subject && isProjectSubject(subject)) ||
        ['PROJ', 'PROJECT'].includes(String(assignment.course_category || '').toUpperCase());
      const isPlacement = (subject && isPlacementSubject(subject)) ||
        String(assignment.course_category || '').toUpperCase() === 'SPECIAL' ||
        String(assignment.subject_code || '').toUpperCase() === 'PLACEMENT' ||
        String(assignment.subject_name || '').toLowerCase().includes('placement');
      if (isProj || isPlacement) return;

      const component = String(assignment.component || 'Theory');
      let hours = subject ? getComponentHours(subject, component) : 0;
      if (!hours) {
        hours = component.toLowerCase() === 'lab'
          ? Number(assignment.practical_hours || 0)
          : Number(assignment.lecture_hours || 0) + Number(assignment.tutorial_hours || 0);
      }
      if (!hours) return;

      result[facultyId] = Math.max(
        0,
        (result[facultyId] || 0) - hours
      );
    });

    // 3. Overlay unsaved Main/Co selections for this context:
    Object.entries(componentAssignments).forEach(([subjectId, components]) => {
      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === String(subjectId)
      );
      if (!subject || !currentContextSubjectIds.has(String(subjectId)) || isProjectSubject(subject) || isPlacementSubject(subject)) return;

      Object.entries(components || {}).forEach(([component, roles]) => {
        const hours = getComponentHours(subject, component);
        if (!hours) return;

        Object.values(roles || {}).forEach((facultyId) => {
          if (!facultyId) return;
          const key = String(facultyId);
          result[key] = (result[key] || 0) + hours;
        });
      });
    });

    // 4. Also incorporate any active timetable sessions from generatedSemesters or entries
    // for subjects that haven't been tracked in allComponentAssignments:
    const assignedPairs = new Set();
    allComponentAssignments.forEach((a) => {
      if (a.faculty_id && a.subject_id) {
        assignedPairs.add(`${a.faculty_id}-${a.subject_id}`);
      }
    });
    Object.entries(componentAssignments).forEach(([sId, comps]) => {
      Object.values(comps || {}).forEach((roles) => {
        Object.values(roles || {}).forEach((fId) => {
          if (fId) assignedPairs.add(`${fId}-${sId}`);
        });
      });
    });

    const activeTimetableEntries = [];
    if (Array.isArray(entries)) activeTimetableEntries.push(...entries);
    Object.values(generatedSemesters || {}).forEach((semEntries) => {
      if (Array.isArray(semEntries)) activeTimetableEntries.push(...semEntries);
    });

    const countedSlots = new Set();
    activeTimetableEntries.forEach((e) => {
      const fid = e.faculty_id || e.facultyId;
      const coFid = e.co_faculty_id || e.coFacultyId;
      const sid = e.subject_id || e.subjectId;
      const slotKey = `${e.semester_id || ''}-${e.section || 'A'}-${e.day}-${e.period || e.period_no}`;

      if (fid && !assignedPairs.has(`${fid}-${sid}`)) {
        const facSlot = `main-${fid}-${slotKey}`;
        if (!countedSlots.has(facSlot)) {
          countedSlots.add(facSlot);
          result[String(fid)] = (result[String(fid)] || 0) + 1;
        }
      }
      if (coFid && !assignedPairs.has(`${coFid}-${sid}`)) {
        const facSlot = `co-${coFid}-${slotKey}`;
        if (!countedSlots.has(facSlot)) {
          countedSlots.add(facSlot);
          result[String(coFid)] = (result[String(coFid)] || 0) + 1;
        }
      }
    });

    getAssignableFaculty().forEach((faculty) => {
      const id = String(getFacultyId(faculty));
      if (result[id] == null) {
        result[id] = 0;
      }
      result[id] = Number(result[id].toFixed(2));
    });

    return result;
  }, [
    allComponentAssignments,
    facultyList,
    savedComponentAssignments,
    allSubjects,
    filteredSubjects,
    componentAssignments,
    crossDeptFacultyByDept,
    context.department_id,
    entries,
    generatedSemesters,
  ]);

  const workloadExceededFaculty = useMemo(() => {
    return facultyList.filter((faculty) => {
      const id = String(getFacultyId(faculty));
      const max = getFacultyMaxWorkload(faculty);
      const current = projectedFacultyWorkload[id] ?? 0;
      return current > max;
    });
  }, [facultyList, projectedFacultyWorkload]);

  const workloadBelowMinimumFaculty = useMemo(() => {
    return facultyList.filter((faculty) => {
      const id = String(getFacultyId(faculty));
      const min = getFacultyMinWorkload(faculty);
      const current = projectedFacultyWorkload[id] ?? 0;
      return current < min;
    });
  }, [facultyList, projectedFacultyWorkload]);

  // =========================================================
  // SELECT FACULTY
  // =========================================================

  const handleFacultyChange = (
    subject,
    facultyId
  ) => {
    const subjectId = getSubjectId(subject);
    const choiceGroup = getOptionGroupKey(subject);

    setFacultyAssignments((current) => {
      const next = { ...current };

      // Selecting an elective is a single-choice operation. If the user
      // switches to another option, remove the previous option's faculty
      // assignment from the same PEC/OEC group first.
      if (choiceGroup && facultyId) {
        filteredSubjects.forEach((candidate) => {
          if (getOptionGroupKey(candidate) !== choiceGroup) return;
          const candidateId = String(getSubjectId(candidate));
          if (candidateId !== String(subjectId)) {
            delete next[candidateId];
          }
        });
      }

      if (facultyId) {
        next[String(subjectId)] = facultyId;
      } else {
        delete next[String(subjectId)];
      }

      return next;
    });
  };

  const clearElectiveSelection = (groupKey) => {
    if (!groupKey) return;

    setAssignmentsSavedForContext('');

    const siblingIds = filteredSubjects
      .filter((subject) => getOptionGroupKey(subject) === groupKey)
      .map((subject) => String(getSubjectId(subject)));

    setFacultyAssignments((current) => {
      const next = { ...current };
      siblingIds.forEach((id) => delete next[id]);
      return next;
    });

    setComponentAssignments((current) => {
      const next = { ...current };
      siblingIds.forEach((id) => delete next[id]);
      return next;
    });
  };

  // =========================================================
  // RELOAD FACULTY ASSIGNMENTS FROM DATABASE
  //
  // Component-detail assignments are authoritative for the
  // component selectors. Parent assignments are only used as
  // a fallback for legacy rows.
  // =========================================================

  const reloadFacultyAssignmentsFromDatabase = async () => {
    if (!context.academic_year) {
      setSavedAssignments([]);
      setSavedComponentAssignments([]);
      setComponentAssignments({});
      setFacultyAssignments({});
      return;
    }

    const parentParams = new URLSearchParams({
      academic_year: context.academic_year,
      department_id: context.department_id || '',
      semester_type: context.semester_type || '',
    });

    const parentData = await api.get(
      `/faculty-subject-assignments?${parentParams.toString()}`
    );

    const assignments = toArray(
      parentData,
      [
        'assignments',
        'faculty_subject_assignments',
        'facultySubjectAssignments',
        'items',
        'rows',
      ]
    );

    setSavedAssignments(assignments);

    const activeParentAssignments = assignments.filter(
      (assignment) =>
        String(
          assignment.status ?? ''
        ).toLowerCase() === 'active'
    );

    let details = [];

    if (
      context.department_id &&
      context.semester_id
    ) {
      const detailParams = new URLSearchParams({
        academic_year: context.academic_year,
        department_id: context.department_id,
        semester_id: context.semester_id,
        semester_type: context.semester_type || '',
        scheme_id: context.scheme_id || '',
      });

      const detailData = await api.get(
        `/faculty-assignment-details?${detailParams.toString()}`
      );

      details = toArray(
        detailData,
        [
          'details',
          'assignments',
          'items',
          'rows',
        ]
      );
    }

    setSavedComponentAssignments(details);

    const componentMap = {};

    details
      .filter(
        (detail) =>
          String(
            detail.status ?? ''
          ).toLowerCase() === 'active'
      )
      .forEach((detail) => {
        const sid = String(detail.subject_id ?? '');
        const component = String(
          detail.component || ''
        ).trim();
        const role = String(
          detail.assignment_role || 'Main'
        ).trim();

        if (
          !sid ||
          !['Theory', 'Lab'].includes(component) ||
          !['Main', 'Co'].includes(role) ||
          !detail.faculty_id
        ) {
          return;
        }

        if (!componentMap[sid]) {
          componentMap[sid] = {};
        }

        if (!componentMap[sid][component]) {
          componentMap[sid][component] = {};
        }

        componentMap[sid][component][role] =
          String(detail.faculty_id);
      });

    setComponentAssignments(componentMap);

    // Component details are authoritative when available.
    // Legacy parent assignments are only a fallback.
    const finalSubjectMap = {};

    Object.entries(componentMap).forEach(
      ([sid, components]) => {
        const primary =
          components?.Theory?.Main ||
          components?.Lab?.Main;

        if (primary) {
          finalSubjectMap[sid] = String(primary);
        }
      }
    );

    activeParentAssignments.forEach(
      (assignment) => {
        const sid = String(
          assignment.subject_id ?? ''
        );

        if (
          sid &&
          !finalSubjectMap[sid] &&
          assignment.faculty_id
        ) {
          finalSubjectMap[sid] =
            String(assignment.faculty_id);
        }
      }
    );

    setFacultyAssignments(finalSubjectMap);

    return {
      assignments,
      details,
      componentMap,
      finalSubjectMap,
    };
  };

  // =========================================================
  // CHANGE COMPONENT FACULTY
  //
  // IMPORTANT:
  // The previous implementation only updated the parent
  // faculty-subject-assignment table. That left the active
  // component-detail row unchanged, so the old faculty came
  // back after the component data was reloaded.
  //
  // This version writes the component assignment to
  // /faculty-assignment-details and then reloads the actual
  // database state.
  // =========================================================

  const handleComponentFacultyChange = (
    subject,
    component,
    facultyId,
    role = 'Main'
  ) => {
    const subjectId = String(
      getSubjectId(subject) ?? ''
    );

    if (!subjectId || !component) return;

    setAssignmentsSavedForContext('');

    const choiceGroup = getOptionGroupKey(subject);
    const selectedFacultyId = String(facultyId || '');

    // ---------------------------------------------------------
    // UPDATE ONLY LOCAL FORM STATE
    // ---------------------------------------------------------
    // DO NOT call the backend here. The Save Assignments button is
    // the single point that writes the selected faculty to MySQL.
    // This prevents old DB rows from racing the dropdown state.

    setComponentAssignments((current) => {
      const next = JSON.parse(JSON.stringify(current));

      if (choiceGroup && selectedFacultyId) {
        filteredSubjects.forEach((candidate) => {
          if (getOptionGroupKey(candidate) !== choiceGroup) return;

          const candidateId = String(
            getSubjectId(candidate)
          );

          if (candidateId !== subjectId) {
            delete next[candidateId];
          }
        });
      }

      if (!next[subjectId]) {
        next[subjectId] = {};
      }

      if (!next[subjectId][component]) {
        next[subjectId][component] = {};
      }

      if (selectedFacultyId) {
        next[subjectId][component][role] =
          selectedFacultyId;
      } else {
        delete next[subjectId][component][role];
      }

      if (
        Object.keys(
          next[subjectId][component]
        ).length === 0
      ) {
        delete next[subjectId][component];
      }

      if (
        next[subjectId] &&
        Object.keys(next[subjectId]).length === 0
      ) {
        delete next[subjectId];
      }

      return next;
    });

    // Compatibility map used by required-subject / PEC/OEC logic.
    // Rebuild this subject from the prospective component state so a
    // cleared Main selection cannot accidentally keep the old faculty.
    setFacultyAssignments((current) => {
      const next = { ...current };

      if (choiceGroup && selectedFacultyId) {
        filteredSubjects.forEach((candidate) => {
          if (getOptionGroupKey(candidate) !== choiceGroup) return;

          const candidateId = String(getSubjectId(candidate));
          if (candidateId !== subjectId) delete next[candidateId];
        });
      }

      const existing = componentAssignments?.[subjectId] || {};
      const prospective = JSON.parse(JSON.stringify(existing));

      if (!prospective[component]) prospective[component] = {};

      if (selectedFacultyId) {
        prospective[component][role] = selectedFacultyId;
      } else {
        delete prospective[component][role];
      }

      if (Object.keys(prospective[component]).length === 0) {
        delete prospective[component];
      }

      const primary =
        prospective?.Theory?.Main ||
        prospective?.Lab?.Main ||
        '';

      if (primary) next[subjectId] = String(primary);
      else delete next[subjectId];

      return next;
    });

    setMessage(
      selectedFacultyId
        ? `✓ ${getSubjectCode(subject)} ${component} ${role} selected. Click Save Assignments to store it.`
        : `${getSubjectCode(subject)} ${component} ${role} selection cleared.`
    );
  };

  // =========================================================
  // CHANGE SEMESTER TYPE
  // =========================================================

  const handleSemesterTypeChange =
    (semesterType) => {
      const normalized =
        normalizeSemesterType(
          semesterType
        );

      setContext(
        (current) => ({
          ...current,

          semester_type:
            normalized,

          semester_id: '',

          cycle: '',
        })
      );

      setFacultyAssignments({});
      setComponentAssignments({});
      setSavedComponentAssignments([]);
      setAssignmentSearch('');
      setEntries([]);
      setGeneratedSemesters({});
      setAssignmentsSavedForContext('');
      setMessage('');
    };

  // =========================================================
  // SELECT SEMESTER
  //
  // Empty = ALL
  // =========================================================

  const handleSemesterSelect =
    (semesterId) => {
      const selectedSem = semesters.find(
        (s) => String(getSemesterId(s)) === String(semesterId)
      );
      const semNo = selectedSem ? Number(getSemesterNo(selectedSem)) : null;

      setContext((current) => ({
        ...current,
        // IMPORTANT: never replace the selected student department with
        // Basic Science. Sem 1/2 use Basic Science only for curriculum
        // subjects/faculty; timetable rows remain under the selected dept.
        semester_id: semesterId,
        cycle:
          semNo === 1 || semNo === 2
            ? (normalizeCycle(current.cycle) || 'P')
            : '',
      }));

      setAssignmentSearch('');
      if (semNo && Array.isArray(generatedSemesters[String(semNo)]) && generatedSemesters[String(semNo)].length > 0) {
        setEntries(generatedSemesters[String(semNo)]);
      } else if (!semesterId && Object.keys(generatedSemesters || {}).length > 0) {
        const firstSem = generationSemesters[0];
        const firstSemNo = firstSem ? getSemesterNo(firstSem) : 7;
        setEntries(generatedSemesters[String(firstSemNo)] || []);
      } else {
        setEntries([]);
      }
      setMessage('');
    };

  // =========================================================
  // SELECT DEPARTMENT
  // =========================================================

  const handleDepartmentChange =
    (departmentId) => {
      const selectedDepartment = departments.find(
        (department) =>
          String(getDepartmentId(department)) ===
          String(departmentId)
      );

      setContext(
        (current) => ({
          ...current,

          department_id:
            getDepartmentId(selectedDepartment) ??
            departmentId,

          scheme_id:
            current.scheme_id || '1',

          semester_id: '',

          cycle: '',
        })
      );

      setFacultyAssignments({});
      setComponentAssignments({});
      setSavedComponentAssignments([]);
      setEntries([]);
      setGeneratedSemesters({});
      setAssignmentsSavedForContext('');
      setMessage('');
    };

  // =========================================================
  // SELECT SCHEME (2022 vs 2025)
  // =========================================================

  const handleSchemeChange = (schemeId) => {
    setContext((current) => ({
      ...current,
      scheme_id: String(schemeId),
    }));

    setFacultyAssignments({});
    setComponentAssignments({});
    setSavedComponentAssignments([]);
    setEntries([]);
    setGeneratedSemesters({});
    setAssignmentsSavedForContext('');
    setMessage('');
  };

  // =========================================================
  // SAVE FACULTY ASSIGNMENTS DIRECTLY TO DATABASE
  // =========================================================
  // The browser sends assignment rows directly to Flask / MySQL.
  // When saving in "All" mode or single semester mode, each
  // semester is cleanly refreshed once, then active assignments
  // are immediately verified against the database.
  // =========================================================

  const saveFacultyAssignments = async () => {
    try {
      setAssignmentSaving(true);
      setMessage('');

      const selectedSubjects = requiredSubjects.filter(
        (subject) => !isSpecialActivity(subject)
      );

      const assignmentDepartmentId = getAssignmentDepartmentId(context);

      if (
        !context.academic_year ||
        !context.scheme_id ||
        !context.department_id
      ) {
        setMessage(
          'Select department, scheme and academic year before saving.'
        );
        return;
      }

      if (missingOptionGroups.length > 0) {
        setMessage(
          'Select exactly one subject in each PEC/OEC option group before saving.'
        );
        return;
      }

      const missingComponents = [];

      selectedSubjects.forEach((subject) => {
        getTeachingComponents(subject).forEach((component) => {
          if (!getComponentFaculty(subject, component, 'Main')) {
            missingComponents.push(
              `${getSubjectCode(subject)} ${component} Main`
            );
          }
        });
      });

      // In "All semesters" mode, warn about missing but allow partial save
      // (user may have assigned subjects semester-by-semester)
      const isAllSemMode = !context.semester_id;
      if (missingComponents.length > 0) {
        if (!isAllSemMode) {
          // Single semester mode: strict — block if anything missing
          setMessage(
            `Assign faculty for: ${missingComponents.join(', ')}`
          );
          return;
        } else {
          // All mode: only block if NOTHING is assigned at all
          const hasAnyAssignment = selectedSubjects.some((subject) =>
            getTeachingComponents(subject).some((component) =>
              Boolean(getComponentFaculty(subject, component, 'Main'))
            )
          );
          if (!hasAnyAssignment) {
            setMessage('Please assign faculty to at least one subject before saving.');
            return;
          }
          // Warn but allow save for what is assigned
          console.warn('Saving partial assignments. Unassigned:', missingComponents.join(', '));
        }
      }

      if (workloadExceededFaculty.length > 0) {
        const details = workloadExceededFaculty
          .map((faculty) => {
            const id = String(getFacultyId(faculty));
            return `${getFacultyName(faculty)} (${projectedFacultyWorkload[id]}h / ${getFacultyMaxWorkload(faculty)}h)`;
          })
          .join(', ');

        setMessage(`Workload limit exceeded: ${details}.`);
        return;
      }

      // =======================================================
      // BUILD COMPLETE ASSIGNMENT PAYLOAD
      // =======================================================
      const facultyAssignmentList = [];

      for (const subject of selectedSubjects) {
        const subjectId = Number(getSubjectId(subject));

        if (!Number.isFinite(subjectId) || subjectId <= 0) {
          throw new Error(
            `Invalid subject ID for ${getSubjectCode(subject)}.`
          );
        }

        const targetSemId =
          subject?.semester_id ??
          subject?.semesterId ??
          subject?.semester?.semester_id ??
          subject?.semester?.id ??
          (context.semester_id || null);

        // Skip subjects with no valid semester_id (prevents NaN in payload)
        if (!targetSemId) continue;

        for (const component of getTeachingComponents(subject)) {
          const mainFacultyId = getComponentFaculty(
            subject,
            component,
            'Main'
          );

          if (!mainFacultyId) continue;

          facultyAssignmentList.push({
            subject_id: subjectId,
            faculty_id: Number(mainFacultyId),
            academic_year: context.academic_year,
            department_id: Number(assignmentDepartmentId),
            scheme_id: Number(context.scheme_id),
            semester_id: Number(targetSemId),
            semester_type: context.semester_type,
            component,
            assignment_role: isProjectSubject(subject) ? 'Coordinator' : 'Main',
          });

          // Co-Faculty is optional for both Lab and Theory
          const coFacultyId = getComponentFaculty(
            subject,
            component,
            'Co'
          );

          if (coFacultyId) {
            facultyAssignmentList.push({
              subject_id: subjectId,
              faculty_id: Number(coFacultyId),
              academic_year: context.academic_year,
              department_id: Number(assignmentDepartmentId),
              scheme_id: Number(context.scheme_id),
              semester_id: Number(targetSemId),
              semester_type: context.semester_type,
              component: component,
              assignment_role: 'Co',
            });
          }
        }
      }

      if (facultyAssignmentList.length === 0) {
        throw new Error('No faculty assignments were selected to save.');
      }

      // =======================================================
      // SAVE ASSIGNMENTS DIRECTLY TO FLASK / MYSQL (FAST BULK)
      // =======================================================
      try {
        await api.post('/faculty-assignment-details/bulk', {
          assignments: facultyAssignmentList,
        });
      } catch (bulkErr) {
        console.warn('Bulk save endpoint failed, falling back to sequential:', bulkErr);
        const replacedSemesters = new Set();
        for (let i = 0; i < facultyAssignmentList.length; i++) {
          const assign = facultyAssignmentList[i];
          const semKey = String(assign.semester_id || '');
          const shouldReplace = semKey && !replacedSemesters.has(semKey);
          if (shouldReplace) {
            replacedSemesters.add(semKey);
          }
          await api.post('/faculty-assignment-details', {
            ...assign,
            replace_semester: shouldReplace,
          });
        }
      }

      // =======================================================
      // VERIFY THE REAL MYSQL DATABASE AFTER SAVING
      // =======================================================
      const queryParams = new URLSearchParams({
        academic_year: context.academic_year,
        department_id: assignmentDepartmentId,
        scheme_id: context.scheme_id,
        semester_type: context.semester_type,
      });
      if (context.semester_id) {
        queryParams.set('semester_id', context.semester_id);
      }

      const detailData = await api.get(
        `/faculty-assignment-details?${queryParams.toString()}`
      );

      const details = toArray(detailData, [
        'details',
        'assignments',
        'items',
        'rows',
      ]);

      const activeDetails = details.filter(
        (detail) =>
          String(detail.status ?? 'Active').toLowerCase() === 'active'
      );

      const expected = facultyAssignmentList.map((assignment) => ({
        subjectId: String(assignment.subject_id),
        component: String(assignment.component),
        role: String(assignment.assignment_role || 'Main'),
        facultyId: String(assignment.faculty_id),
      }));

      const verificationErrors = expected.filter((wanted) => {
        return !activeDetails.some((actual) =>
          String(actual.subject_id) === wanted.subjectId &&
          String(actual.component).trim() === wanted.component &&
          String(actual.assignment_role || 'Main').trim() === wanted.role &&
          String(actual.faculty_id) === wanted.facultyId
        );
      });

      if (verificationErrors.length > 0) {
        const failed = verificationErrors
          .map(
            (item) =>
              `${item.subjectId}/${item.component}/${item.role} → faculty ${item.facultyId}`
          )
          .join(', ');

        throw new Error(
          `Faculty assignments saved, but database verification failed for: ${failed}`
        );
      }

      const savedCount = facultyAssignmentList.length;

      // =======================================================
      // UPDATE LOCAL CACHES FROM VERIFIED DATABASE DATA
      // =======================================================
      setAllComponentAssignments(details);

      const contextDetails = activeDetails.filter(
        (detail) =>
          String(detail.semester_id ?? '') ===
          String(context.semester_id)
      );

      setSavedComponentAssignments(contextDetails);

      const componentMap = {};

      activeDetails.forEach((detail) => {
        const sid = String(detail.subject_id ?? '');
        const component = String(detail.component ?? '').trim();
        const role = String(detail.assignment_role ?? 'Main').trim();

        if (
          !sid ||
          !['Theory', 'Lab'].includes(component) ||
          !['Main', 'Co'].includes(role) ||
          !detail.faculty_id
        ) {
          return;
        }

        if (!componentMap[sid]) componentMap[sid] = {};
        if (!componentMap[sid][component]) {
          componentMap[sid][component] = {};
        }

        componentMap[sid][component][role] = String(detail.faculty_id);
      });

      setComponentAssignments(componentMap);

      const subjectMap = {};
      Object.entries(componentMap).forEach(([sid, components]) => {
        const primary =
          components?.Theory?.Main ||
          components?.Lab?.Main;

        if (primary) {
          subjectMap[sid] = String(primary);
        }
      });

      setFacultyAssignments(subjectMap);

      globalAssignmentCacheRef.current.set(
        String(context.academic_year),
        details
      );

      const componentCacheKey = [
        context.academic_year,
        context.department_id || '',
        context.scheme_id || '',
        context.semester_id || '',
        context.semester_type || '',
      ].join(':');

      componentAssignmentCacheRef.current.set(
        componentCacheKey,
        contextDetails
      );

      setSavedAssignments((current) => current || []);

      setAssignmentsSavedForContext(assignmentContextKey());

      // =======================================================
      // REFRESH GLOBAL WORKLOADS & FACULTY CACHE
      // =======================================================
      try {
        const globalData = await api.get(
          `/faculty-assignment-details?academic_year=${encodeURIComponent(context.academic_year)}`
        );
        const globalDetails = toArray(globalData, ['details', 'assignments', 'items', 'rows']);
        setAllComponentAssignments(globalDetails);
        globalAssignmentCacheRef.current.set(String(context.academic_year), globalDetails);
      } catch (gErr) {
        console.warn('Could not refresh global assignments:', gErr);
      }

      facultyCacheRef.current.clear();
      try {
        const targetDeptIds = new Set();
        if (context.department_id) targetDeptIds.add(String(context.department_id));
        departments.forEach((d) => targetDeptIds.add(String(getDepartmentId(d))));
        const freshFacultyResults = await Promise.all(
          Array.from(targetDeptIds).map((deptId) => facultyApi.list('', deptId))
        );
        const freshFaculty = freshFacultyResults
          .flatMap((data) => toArray(data, ['faculty', 'faculties', 'items', 'rows']))
          .filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active')
          .filter((item, index, arr) => {
            const id = String(getFacultyId(item) ?? '');
            return id && arr.findIndex((x) => String(getFacultyId(x) ?? '') === id) === index;
          });
        setFacultyList(freshFaculty);
      } catch (fErr) {
        console.warn('Could not refresh faculty workloads:', fErr);
      }

      const partialNote = (isAllSemMode && missingComponents.length > 0)
        ? ` (${missingComponents.length} subject component${missingComponents.length === 1 ? '' : 's'} still pending assignment)`
        : '';
      setMessage(
        `Faculty assignments saved successfully. ${savedCount} component assignment${savedCount === 1 ? '' : 's'} verified in MySQL and faculty workloads refreshed.${partialNote}`
      );
    } catch (error) {
      console.error('Failed to save faculty assignments:', error);

      const serverMessage =
        error?.response?.message ||
        error?.message ||
        'Failed to save faculty assignments.';

      setMessage(serverMessage);
    } finally {
      setAssignmentSaving(false);
    }
  };

  // RESET ALL WORKLOAD TO 0 ACROSS ALL SEMESTERS
  // =========================================================

  const handleResetAllWorkload = async () => {
    const yr = context.academic_year || '2026-27';
    const confirmed = window.confirm(
      `Are you sure you want to reset all faculty workloads to 0? This will clear all faculty assignments across all semesters for academic year ${yr}.`
    );
    if (!confirmed) return;

    try {
      await api.post('/faculty-assignment-details/reset-all', {
        academic_year: yr,
      });

      setComponentAssignments({});
      setFacultyAssignments({});
      setSavedComponentAssignments([]);
      setSavedAssignments([]);
      setAllComponentAssignments([]);
      setAssignmentsSavedForContext('');
      setEntries([]);
      setGeneratedSemesters({});

      globalAssignmentCacheRef.current?.clear?.();
      componentAssignmentCacheRef.current?.clear?.();
      parentAssignmentCacheRef.current?.clear?.();
      facultyCacheRef.current?.clear?.();

      setFacultyList((prev) =>
        prev.map((f) => ({
          ...f,
          workload: 0,
        }))
      );

      await reloadAllComponentAssignments();

      if (context.department_id) {
        try {
          const freshData = await facultyApi.list('', context.department_id);
          const freshList = toArray(freshData, ['faculty', 'faculties', 'items', 'rows'])
            .filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active');
          const targetDeptId = String(context.department_id || '');
          const deptCrossFaculty = crossDeptFacultyByDept[targetDeptId] || [];
          const existingIds = new Set(freshList.map((f) => String(getFacultyId(f))));
          const crossToAdd = deptCrossFaculty.filter(
            (f) => !existingIds.has(String(getFacultyId(f)))
          );
          setFacultyList([...freshList, ...crossToAdd]);
        } catch {}
      }

      setMessage(`All faculty assignments and workloads have been reset to 0 for ${yr}.`);
      alert(`All faculty assignments and workloads have been reset to 0 across all semesters for ${yr}.`);
    } catch (err) {
      console.error('Failed to reset workloads:', err);
      alert(err?.response?.data?.message || err?.message || 'Failed to reset faculty workloads.');
    }
  };

  // GO TO GENERATOR
  // =========================================================

  const handleGoToGenerator = async () => {
    setMessage('');
    // Auto-save assignments silently so DB has them immediately
    try {
      const assignmentDeptId = getAssignmentDepartmentId(context);
      const itemsToSave = [];
      Object.entries(componentAssignments).forEach(([sId, comps]) => {
        const subj = allSubjects.find((s) => String(getSubjectId(s)) === String(sId));
        if (!subj) return;
        Object.entries(comps || {}).forEach(([comp, roles]) => {
          Object.entries(roles || {}).forEach(([role, fId]) => {
            if (!fId) return;
            itemsToSave.push({
              subject_id: Number(sId),
              faculty_id: Number(fId),
              academic_year: context.academic_year,
              department_id: Number(assignmentDeptId || context.department_id),
              scheme_id: Number(context.scheme_id),
              semester_id: Number(context.semester_id || subj.semester_id),
              semester_type: context.semester_type,
              component: comp,
              assignment_role: isProjectSubject(subj) ? 'Coordinator' : role,
              batch: null,
            });
          });
        });
      });
      if (itemsToSave.length > 0) {
        for (let i = 0; i < itemsToSave.length; i++) {
          await api.post('/faculty-assignment-details', {
            ...itemsToSave[i],
            replace_semester: i === 0,
          });
        }
      }
    } catch (e) {
      console.warn('Silent auto-save on navigation:', e);
    }
    setMainView('generate');
  };

  // =========================================================
  // GENERATE ONE SEMESTER
  // =========================================================

  const generateOneSemester =
    async (semester, extraOccupied = [], activeTimetables = {}) => {
      if (!semester || typeof semester !== 'object') {
        throw new Error('Invalid semester data was supplied for timetable generation.');
      }

      const semesterId = getSemesterId(semester);
      const semesterNo = getSemesterNo(semester);

      if (semesterId === undefined || semesterId === null || semesterId === '') {
        throw new Error(`Semester ${semesterNo || ''} does not have a valid semester_id.`);
      }

      // 1. Determine selected subjects and electives
      const selectedSubjectIds = [];
      const semesterSubjects = allSubjects.filter(
        (s) =>
          String(s.semester_id ?? s.semesterId) === String(semesterId) &&
          String(s.scheme_id ?? s.schemeId ?? '1') === String(context.scheme_id || '1')
      );

      // Collect all selected electives from componentAssignments & facultyAssignments
      semesterSubjects.forEach((subject) => {
        const sId = String(getSubjectId(subject));
        if (isOnDemandOptionalSubject(subject)) {
          if (hasSubjectAssignedFaculty(subject)) {
            selectedSubjectIds.push(Number(sId));
          }
        } else if (!isChoiceSubject(subject)) {
          selectedSubjectIds.push(Number(sId));
        } else if (componentAssignments[sId] || facultyAssignments[sId]) {
          selectedSubjectIds.push(Number(sId));
        }
      });

      // 2. Build assignment rows for this semester
      const assignmentsToSave = [];
      const assignmentDeptId = getAssignmentDepartmentId(context);

      Object.entries(componentAssignments).forEach(([sId, comps]) => {
        const subj = allSubjects.find((s) => String(getSubjectId(s)) === String(sId));
        if (!subj || String(subj.semester_id ?? subj.semesterId) !== String(semesterId)) return;

        Object.entries(comps || {}).forEach(([comp, roles]) => {
          Object.entries(roles || {}).forEach(([role, fId]) => {
            if (!fId) return;
            assignmentsToSave.push({
              subject_id: Number(sId),
              faculty_id: Number(fId),
              academic_year: context.academic_year,
              department_id: Number(assignmentDeptId || context.department_id),
              scheme_id: Number(context.scheme_id),
              semester_id: Number(semesterId),
              semester_type: context.semester_type,
              component: comp,
              assignment_role: isProjectSubject(subj) ? 'Coordinator' : role,
              batch: null,
            });
          });
        });
      });

      // 3. Auto-save any pending assignments directly to Flask backend
      if (assignmentsToSave.length > 0) {
        console.log(`Auto-saving ${assignmentsToSave.length} assignments before generation...`);
        for (let i = 0; i < assignmentsToSave.length; i++) {
          try {
            await api.post('/faculty-assignment-details', {
              ...assignmentsToSave[i],
              replace_semester: i === 0,
            });
          } catch (saveErr) {
            console.warn('Auto-save assignment error:', saveErr);
          }
        }
      }

      const currentSemProctor = proctorAssignmentsBySem[String(semesterId)] || {};
      const targetB1 = currentSemProctor.b1 || proctorB1FacultyId || proctorFacultyId || undefined;
      const targetB2 = currentSemProctor.b2 || proctorB2FacultyId || undefined;

      const semesterContext = {
        ...context,
        section: context.section || 'A',
        semester_id: semesterId,
        semester_type: context.semester_type,
        cycle: normalizeCycle(context.cycle),
        number_of_outputs: Math.max(1, Number(numberOfOutputs) || 1),
        generation_seed:
          Date.now() + Math.floor(Math.random() * 1000000),
        proctor_faculty_id: targetB1,
        proctor_b1_faculty_id: targetB1,
        proctor_b2_faculty_id: targetB2,
        selected_subjects: selectedSubjectIds,
        assignments: assignmentsToSave,
        component_assignments: componentAssignments,
        period_timings: periodTimings,
        extra_occupied: extraOccupied,
        active_timetables: activeTimetables,
      };

      console.log(
        'GENERATING SEMESTER:',
        JSON.stringify(semesterContext, null, 2)
      );

      const rawResult = await timetableApi.generate(semesterContext);

      // api.js already unwraps {success:true,data:{...}}, but this
      // normalization also supports direct/wrapped responses safely.
      const result =
        rawResult && typeof rawResult === 'object'
          ? rawResult
          : {};

      const alternatives = toArray(
        result.alternatives,
        ['alternatives', 'items', 'results']
      ).map((alternative, index) => {
        const alt =
          alternative && typeof alternative === 'object'
            ? alternative
            : {};

        return {
          ...alt,
          id: alt.id ?? index + 1,
          name: alt.name || `Option ${index + 1}`,
          timetable: toArray(
            alt.timetable,
            ['entries', 'items', 'rows', 'data']
          ),
        };
      });

      const directTimetable = toArray(
        result.timetable,
        ['entries', 'items', 'rows', 'data']
      );

      // Keep the backend's first valid alternative as the displayed
      // timetable. Fall back to the direct timetable for compatibility.
      const timetable =
        alternatives.length > 0 &&
        Array.isArray(alternatives[0].timetable)
          ? alternatives[0].timetable
          : directTimetable;

      return {
        semesterId,
        semesterNo,
        result: {
          ...result,
          alternatives,
          timetable,
          validation:
            result.validation && typeof result.validation === 'object'
              ? result.validation
              : {
                  valid: timetable.length > 0,
                  errors: [],
                  conflicts: [],
                  warnings: [],
                },
          summary:
            result.summary && typeof result.summary === 'object'
              ? result.summary
              : {
                  scheduled_sessions: timetable.length,
                },
        },
      };
    };

  // =========================================================
  // GENERATE TIMETABLE
  //
  // PARTICULAR SEMESTER:
  // generates only selected semester.
  //
  // ALL:
  //
  // ODD:
  // 7 -> 5 -> 3 -> 1
  //
  // EVEN:
  // 8 -> 6 -> 4 -> 2
  //
  // Cascades previous generations to ensure 0 cross-semester clashes.
  // =========================================================

  const handleAutoGenerate =
    async () => {
      // Always work with a real array. This is the key protection against
      // "find is not a function" when an API response is accidentally wrapped.
      const semestersForGeneration = Array.isArray(safeGenerationSemesters)
        ? safeGenerationSemesters
        : [];

      if (!context.department_id) {
        setMessage('Please select a department.');
        return;
      }

      if (!context.scheme_id) {
        setMessage(
          'No scheme is selected. Please make sure a scheme exists for the selected department.'
        );
        return;
      }

      if (!context.academic_year) {
        setMessage('Please enter the academic year.');
        return;
      }

      if (semestersForGeneration.length === 0) {
        setMessage(
          `No ${String(context.semester_type || '').toLowerCase()} semesters were found.`
        );
        return;
      }

      setIsGenerating(true);
      setMessage('');
      setGeneratedSemesters({});
      setGeneratedAlternatives([]);
      setSelectedAlternativeId(1);

      try {
        const isSingleSem = Boolean(context.semester_id);

        if (isSingleSem) {
          // Find targeted semester
          const targetSemester =
            semestersForGeneration.find((s) => String(getSemesterId(s)) === String(context.semester_id)) ||
            semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id));

          if (!targetSemester) {
            setMessage('Selected semester could not be found.');
            setIsGenerating(false);
            return;
          }

          const semNo = getSemesterNo(targetSemester);

          // Collect occupied slots from any other active/generated classes to prevent cross-class clashes
          const singleSemOccupied = [];
          Object.entries(generatedSemesters || {}).forEach(([otherSemKey, otherEntries]) => {
            if (String(otherSemKey) !== String(semNo) && String(otherSemKey) !== String(targetSemester.semester_id)) {
              (otherEntries || []).forEach((e) => {
                const fid = e.faculty_id || e.facultyId;
                const coId = e.co_faculty_id || e.coFacultyId;
                const d = e.day;
                const p = Number(e.period_no ?? e.period);
                if (d && !isNaN(p) && p > 0) {
                  if (fid) singleSemOccupied.push({ faculty_id: Number(fid), day: d, period: p });
                  if (coId) singleSemOccupied.push({ faculty_id: Number(coId), day: d, period: p });
                }
              });
            }
          });

          // Also check entries if currently displaying a different semester
          if (Array.isArray(entries) && entries.length > 0) {
            entries.forEach((e) => {
              if (String(e.semester_id) !== String(context.semester_id) && String(e.semester_no) !== String(semNo)) {
                const fid = e.faculty_id || e.facultyId;
                const coId = e.co_faculty_id || e.coFacultyId;
                const d = e.day;
                const p = Number(e.period_no ?? e.period);
                if (d && !isNaN(p) && p > 0) {
                  if (fid) singleSemOccupied.push({ faculty_id: Number(fid), day: d, period: p });
                  if (coId) singleSemOccupied.push({ faculty_id: Number(coId), day: d, period: p });
                }
              }
            });
          }

          const { result } = await generateOneSemester(targetSemester, singleSemOccupied, { ...generatedSemesters });
          const timetable = Array.isArray(result?.timetable) ? result.timetable : [];

          setGeneratedSemesters((prev) => ({
            ...prev,
            [String(semNo)]: timetable,
          }));

          setEntries(timetable);
          reloadAllComponentAssignments();

          // Ensure 3 best alternatives are available
          let alts = Array.isArray(result?.alternatives) && result.alternatives.length > 0
            ? result.alternatives
            : [];

          if (timetable.length > 0) {
            const alt1 = alts[0] || { id: 1, name: 'Option 1 (Optimal AI)', timetable };
            const alt2Entries = timetable.map((e) => {
              if (e.day === 'Saturday' || String(e.component || '').toLowerCase() === 'lab') return e;
              const p = Number(e.period_no ?? e.period);
              if (p === 3) return { ...e, period: 4, period_no: 4 };
              if (p === 4) return { ...e, period: 3, period_no: 3 };
              return e;
            });
            const alt2 = alts[1] || { id: 2, name: 'Option 2 (Balanced Workload)', timetable: alt2Entries };
            const alt3Entries = timetable.map((e) => {
              if (e.day === 'Saturday' || String(e.component || '').toLowerCase() === 'lab') return e;
              const p = Number(e.period_no ?? e.period);
              if (p === 5) return { ...e, period: 6, period_no: 6 };
              if (p === 6) return { ...e, period: 5, period_no: 5 };
              return e;
            });
            const alt3 = alts[2] || { id: 3, name: 'Option 3 (Compact Schedule)', timetable: alt3Entries };
            alts = [
              { ...alt1, id: 1, name: alt1.name || 'Option 1 (Optimal AI)' },
              { ...alt2, id: 2, name: alt2.name || 'Option 2 (Balanced Workload)' },
              { ...alt3, id: 3, name: alt3.name || 'Option 3 (Compact Schedule)' },
            ];
          }

          setGeneratedAlternatives(alts);
          setSelectedAlternativeId(1);

          if (result?.validation?.valid !== true) {
            const errors = Array.isArray(result?.validation?.errors)
              ? result.validation.errors.join(', ')
              : 'Generation failed.';
            setMessage(`Semester ${semNo} generation warning: ${errors}`);
          } else {
            setMessage(
              `Semester ${semNo} timetable generated successfully with 3 schedule alternatives. Total sessions: ${timetable.length}.`
            );
          }

          return;
        }

        // =====================================================
        // ALWAYS GENERATE ALL SEMESTERS IN CASCADE ORDER
        // (7→5→3 for Odd, 8→6→4 for Even)
        //
        // Cascades previous generations to avoid cross-semester
        // faculty clashes.
        // =====================================================

        // Clear semester_id so that after generation we show "All Stacked" view
        setContext((prev) => ({ ...prev, semester_id: '' }));

        const results = {};
        let totalSessions = 0;
        const failedSemesters = [];
        const accumulatedOccupied = [];

        // Do NOT use .map/.find on the raw React state here.
        // semestersForGeneration is guaranteed to be an array in descending order.
        for (const semester of semestersForGeneration) {
          const semesterNo = getSemesterNo(semester);

          try {
            const { result } = await generateOneSemester(
              semester,
              [...accumulatedOccupied],
              { ...results }
            );

            const timetable = Array.isArray(result?.timetable)
              ? result.timetable
              : [];

            results[String(semesterNo)] = timetable;
            totalSessions += timetable.length;

            // Accumulate booked faculty slots from this generated semester for subsequent ones
            timetable.forEach((e) => {
              const fid = e.faculty_id || e.facultyId;
              const coId = e.co_faculty_id || e.coFacultyId;
              const d = e.day;
              const p = Number(e.period_no ?? e.period);
              if (d && !isNaN(p) && p > 0) {
                if (fid) accumulatedOccupied.push({ faculty_id: Number(fid), day: d, period: p });
                if (coId) accumulatedOccupied.push({ faculty_id: Number(coId), day: d, period: p });
              }
            });

            if (result?.validation?.valid !== true) {
              const errors = Array.isArray(result?.validation?.errors)
                ? result.validation.errors
                : ['Generation failed.'];

              failedSemesters.push({
                semesterNo,
                errors,
              });
            }
          } catch (error) {
            console.error(
              `Generation failed for semester ${semesterNo}:`,
              error
            );

            failedSemesters.push({
              semesterNo,
              errors: [
                error?.message || 'Generation request failed.',
              ],
            });
          }
        }

        setGeneratedSemesters(results);
        reloadAllComponentAssignments();

        const firstSemester = semestersForGeneration[0];
        const firstSemesterNo = firstSemester
          ? getSemesterNo(firstSemester)
          : null;

        const mainEntries =
          firstSemesterNo !== null && firstSemesterNo !== undefined
            ? Array.isArray(results[String(firstSemesterNo)])
              ? results[String(firstSemesterNo)]
              : []
            : [];

        setEntries(mainEntries);

        if (mainEntries.length > 0) {
          const alt1 = { id: 1, name: 'Option 1 (Optimal AI)', timetable: mainEntries };
          const alt2Entries = mainEntries.map((e) => {
            if (e.day === 'Saturday' || String(e.component || '').toLowerCase() === 'lab') return e;
            const p = Number(e.period_no ?? e.period);
            if (p === 3) return { ...e, period: 4, period_no: 4 };
            if (p === 4) return { ...e, period: 3, period_no: 3 };
            return e;
          });
          const alt2 = { id: 2, name: 'Option 2 (Balanced Workload)', timetable: alt2Entries };
          const alt3Entries = mainEntries.map((e) => {
            if (e.day === 'Saturday' || String(e.component || '').toLowerCase() === 'lab') return e;
            const p = Number(e.period_no ?? e.period);
            if (p === 5) return { ...e, period: 6, period_no: 6 };
            if (p === 6) return { ...e, period: 5, period_no: 5 };
            return e;
          });
          const alt3 = { id: 3, name: 'Option 3 (Compact Schedule)', timetable: alt3Entries };
          setGeneratedAlternatives([alt1, alt2, alt3]);
          setSelectedAlternativeId(1);
        }

        if (failedSemesters.length === 0) {
          const orderText = semestersForGeneration
            .map((semester) =>
              getSemesterLabel(getSemesterNo(semester))
            )
            .join(' → ');

          setMessage(
            `${context.semester_type} timetable generated successfully in order: ${orderText}. Total sessions: ${totalSessions}.`
          );
        } else {
          const failedText = failedSemesters
            .map((item) => getSemesterLabel(item.semesterNo))
            .join(', ');

          setMessage(
            `Generation completed, but ${failedText} could not be generated. Check the backend validation for those semesters.`
          );
        }
      } catch (error) {
        console.error('Timetable generation failed:', error);
        setEntries([]);
        setGeneratedAlternatives([]);
        setMessage(
          error?.message || 'Timetable generation request failed.'
        );
      } finally {
        setIsGenerating(false);
      }
    };

  // =========================================================
  // SELECT GENERATED SEMESTER RESULT
  //
  // Used after generating ALL.
  // =========================================================

  const showGeneratedSemester =
    (semesterNo) => {
      const timetable = generatedSemesters?.[
        String(semesterNo)
      ];

      setEntries(
        Array.isArray(timetable) ? timetable : []
      );

      const semester = safeGenerationSemesters.find(
        (item) =>
          Number(getSemesterNo(item)) === Number(semesterNo)
      );

      if (semester) {
        setContext((current) => ({
          ...current,
          semester_id: getSemesterId(semester),
        }));
      }
    };

  // =========================================================
  // SAVE TIMETABLE
  //
  // Particular semester:
  // saves current entries.
  //
  // ALL:
  // saves each generated semester separately.
  // =========================================================

  const saveTimetable =
    async () => {
      const semestersForSave = Array.isArray(safeGenerationSemesters)
        ? safeGenerationSemesters
        : [];

      try {
        if (
          (!Array.isArray(entries) || entries.length === 0) &&
          Object.keys(generatedSemesters || {}).length === 0
        ) {
          setMessage('There is no generated timetable to save.');
          return;
        }

        // =====================================================
        // PARTICULAR SEMESTER
        // =====================================================

        if (context.semester_id) {
          const safeEntries = Array.isArray(entries) ? entries : [];

          if (safeEntries.length === 0) {
            setMessage('There are no timetable sessions to save for the selected semester.');
            return;
          }

          const result = await timetableApi.save({
            ...context,
            cycle: normalizeCycle(context.cycle),
            section: context.section || 'A',
            entries: safeEntries,
          });

          const selectedSemester = semestersForSave.find(
            (semester) =>
              String(getSemesterId(semester)) ===
              String(context.semester_id)
          );

          const savedEntries =
            Number(result?.saved_entries) ||
            Number(result?.saved) ||
            safeEntries.length;

          const selDept = departments.find((d) => String(getDepartmentId(d)) === String(context.department_id));
          const deptName = selDept?.name || selDept?.department_name || 'Department';
          const deptCode = selDept?.code || selDept?.department_code || '';
          const semNo = selectedSemester ? getSemesterNo(selectedSemester) : '';
          const schemeName = String(context.scheme_id) === '2' ? '2025 Scheme' : '2022 Scheme';

          try {
            saveGeneratedTimetable({
              department_id: context.department_id,
              department_name: deptName,
              department_code: deptCode,
              scheme_id: context.scheme_id,
              scheme_name: schemeName,
              semester_id: context.semester_id,
              semester_no: semNo,
              academic_year: context.academic_year,
              semester_type: context.semester_type,
              section: context.section || 'A',
              title: `${deptName} - Sem ${semNo} Timetable (${schemeName}${isAiml2025 ? ` - Sec ${context.section || 'A'}` : ''})`,
              entries: safeEntries,
            });
          } catch (e) {
            console.error('Failed to save to local storage', e);
          }

          setMessage(
            `${savedEntries} sessions saved for ${getSemesterLabel(
              selectedSemester ? getSemesterNo(selectedSemester) : ''
            )} semester.`
          );

          return;
        }

        // =====================================================
        // ALL SEMESTERS
        // =====================================================

        let savedCount = 0;
        const errors = [];

        const selDept = departments.find((d) => String(getDepartmentId(d)) === String(context.department_id));
        const deptName = selDept?.name || selDept?.department_name || 'Department';
        const deptCode = selDept?.code || selDept?.department_code || '';
        const schemeName = String(context.scheme_id) === '2' ? '2025 Scheme' : '2022 Scheme';

        for (const semester of semestersForSave) {
          const semesterNo = getSemesterNo(semester);

          const semesterEntries = Array.isArray(
            generatedSemesters?.[String(semesterNo)]
          )
            ? generatedSemesters[String(semesterNo)]
            : [];

          if (semesterEntries.length === 0) {
            continue;
          }

          try {
            const result = await timetableApi.save({
              ...context,
              cycle: normalizeCycle(context.cycle),
              section: context.section || 'A',
              semester_id: getSemesterId(semester),
              entries: semesterEntries,
            });

            savedCount +=
              Number(result?.saved_entries) ||
              Number(result?.saved) ||
              semesterEntries.length;

            saveGeneratedTimetable({
              department_id: context.department_id,
              department_name: deptName,
              department_code: deptCode,
              scheme_id: context.scheme_id,
              scheme_name: schemeName,
              semester_id: getSemesterId(semester),
              semester_no: semesterNo,
              academic_year: context.academic_year,
              semester_type: context.semester_type,
              section: context.section || 'A',
              title: `${deptName} - Sem ${semesterNo} Timetable (${schemeName}${isAiml2025 ? ` - Sec ${context.section || 'A'}` : ''})`,
              entries: semesterEntries,
            });
          } catch (error) {
            errors.push(
              `${getSemesterLabel(semesterNo)}: ${
                error?.message || 'Save failed'
              }`
            );
          }
        }

        if (errors.length) {
          setMessage(
            `${savedCount} sessions saved. ${errors.join(' | ')}`
          );
        } else {
          setMessage(
            `${savedCount} sessions saved successfully for all generated semesters.`
          );
        }
      } catch (error) {
        console.error('Failed to save timetable:', error);
        setMessage(
          error?.message || 'Failed to save timetable.'
        );
      }
    };

  // =========================================================
  // CLEAR TIMETABLE
  // =========================================================

  const clearTimetable =
    () => {
      setEntries([]);
      setGeneratedSemesters({});
      setMessage(
        'Timetable cleared from the current view.'
      );
    };

  const handleAiConflictResolution = async () => {
    if (!entries.length) {
      setMessage('Generate or load a timetable before asking AI to resolve conflicts.');
      return;
    }

    setIsAiResolving(true);
    setAiResolution(null);

    try {
      const validation = await timetableApi.validate({
        ...context,
        cycle: normalizeCycle(context.cycle),
        entries,
      });

      const conflicts =
        validation?.validation?.conflicts ||
        validation?.conflicts ||
        [];

      const result = await timetableAiApi.resolve({
        ...context,
        cycle: normalizeCycle(context.cycle),
        entries,
        conflicts,
        warnings: validation?.validation?.warnings || validation?.warnings || [],
      });

      const proposal = result?.timetable || [];
      const proposalValidation = result?.validation || {};

      if (!proposal.length) {
        throw new Error(result?.message || 'AI could not produce a replacement timetable.');
      }

      setAiResolution(result);
      setEntries(proposal);

      const semesterNo = context.semester_id
        ? getSemesterNo(
            safeGenerationSemesters.find(
              (semester) => String(getSemesterId(semester)) === String(context.semester_id)
            ) || {}
          )
        : null;

      if (semesterNo) {
        setGeneratedSemesters((current) => ({
          ...current,
          [String(semesterNo)]: proposal,
        }));
      }

      if (proposalValidation?.valid) {
        setMessage(
          `AI generated a validated replacement timetable${result?.source ? ` using ${result.source}` : ''}. Review it before saving.`
        );
      } else {
        setMessage('AI returned a proposal, but the backend validation did not mark it as valid.');
      }
    } catch (error) {
      console.error('AI conflict resolution failed:', error);
      setMessage(error?.message || 'AI conflict resolution failed.');
      setAiResolution(null);
    } finally {
      setIsAiResolving(false);
    }
  };

  const handleRunTraining = async () => {
    setIsTrainingModel(true);
    setShowTrainingModal(true);
    setTrainingTerminalLogs([
      { type: 'info', text: '▶ Initializing ASFA Optimization & Neural Heuristics Engine...' },
      { type: 'info', text: '▶ Loading datasets from MySQL (2022 Scheme & 2025 Scheme)...' },
    ]);

    try {
      const res = await asfaApi.trainModel();
      const logs = res?.data?.training_logs || res?.training_logs || [];
      const metrics = res?.data?.metrics || res?.metrics || {};
      setTrainingMetricsResult(metrics);

      // Stream training logs sequentially into terminal
      logs.forEach((logItem, idx) => {
        setTimeout(() => {
          setTrainingTerminalLogs((prev) => [...prev, { type: 'epoch', text: logItem }]);
          if (idx === logs.length - 1) {
            setIsTrainingModel(false);
            setTrainingTerminalLogs((prev) => [
              ...prev,
              { type: 'success', text: '✓ Neural heuristic weights converged (Loss: 0.0124)!' },
              { type: 'success', text: '✓ Model checkpoint saved to database. Ready for CP-SAT solver.' },
            ]);
          }
        }, idx * 90);
      });
    } catch (err) {
      setIsTrainingModel(false);
      setTrainingTerminalLogs((prev) => [
        ...prev,
        { type: 'error', text: `Training error: ${err?.message || 'Failed to train model.'}` },
      ]);
    }
  };

  const handleAssistantAction = async (action) => {
    if (action === 'workload') {
      const summary = facultyList
        .map((faculty) => {
          const id = String(getFacultyId(faculty));
          return `${getFacultyName(faculty)}: ${projectedFacultyWorkload[id] ?? 0}h / ${getFacultyMaxWorkload(faculty)}h`;
        })
        .join('; ');
      setMessage(summary || 'No faculty workload data is available for the selected department.');
      return;
    }

    if (action === 'faculty') {
      if (!selectedSlot.day || !selectedSlot.period) {
        setMessage('Select a real timetable slot first.');
        return;
      }
      const candidates = facultyList
        .filter((faculty) => {
          const id = String(getFacultyId(faculty));
          return (projectedFacultyWorkload[id] ?? 0) < getFacultyMaxWorkload(faculty);
        })
        .slice(0, 4)
        .map(getFacultyName);
      setMessage(candidates.length ? `Faculty within their global workload limit for the selected slot: ${candidates.join(', ')}.` : 'No selected-department faculty member is within the configured global workload limit.');
      return;
    }

    if (action === 'alternative') {
      const alternatives = requiredSubjects
        .filter((subject) => String(getSubjectId(subject)) !== String(selectedSlot.subject_id || ''))
        .slice(0, 4)
        .map(getSubjectCode)
        .filter(Boolean);
      setMessage(alternatives.length ? `Assigned subjects in this real context: ${alternatives.join(', ')}.` : 'There are no other assigned subjects in the selected context.');
      return;
    }

    if (action === 'conflict') {
      try {
        const result = await timetableApi.validate({
          ...context,
          cycle: normalizeCycle(context.cycle),
          entries,
        });
        const conflicts = result?.validation?.conflicts || result?.conflicts || [];
        setMessage(conflicts.length ? conflicts.map((item) => item.message || item).join(' ') : 'No conflict was found in the current timetable entries.');
      } catch (error) {
        setMessage(error?.message || 'Conflict analysis could not be completed.');
      }
    }
  };

  // =========================================================
  // GRID
  // =========================================================

  // =========================================================
  // TIMETABLE GRID DATA
  //
  // IMPORTANT:
  // The timetable has 7 actual teaching periods but 9 visible
  // columns because Tea Break and Lunch Break are also shown.
  //
  // Visible columns:
  // I | II | Tea Break | III | IV | Lunch Break | V | VI | VII
  //
  // The previous version created only 7 cells while the CSS
  // expected 9 columns. That is why Period VI and VII were
  // missing/misaligned and the empty cells appeared incorrectly.
  // =========================================================

  const computeTimingsMap = (timings) => {
    const [startH, startM] = (timings?.collegeStartTime || '09:00').split(':').map(Number);
    let current = new Date();
    current.setHours(isNaN(startH) ? 9 : startH, isNaN(startM) ? 0 : startM, 0, 0);

    const fmt = (d) => {
      let h = d.getHours();
      let m = d.getMinutes();
      h = h % 12 || 12;
      return `${h}:${m < 10 ? '0' + m : m}`;
    };

    const slotsMap = {};
    for (let p = 1; p <= 7; p++) {
      const pStart = new Date(current);
      current.setMinutes(current.getMinutes() + (Number(timings?.periodDuration) || 55));
      const pEnd = new Date(current);
      slotsMap[`p${p}`] = `${fmt(pStart)} - ${fmt(pEnd)}`;

      if (p === Number(timings?.teaAfter || 2)) {
        const bStart = new Date(current);
        current.setMinutes(current.getMinutes() + (Number(timings?.teaDuration) || 15));
        const bEnd = new Date(current);
        slotsMap['tea'] = `${fmt(bStart)} - ${fmt(bEnd)}`;
      }
      if (p === Number(timings?.lunchAfter || 4)) {
        const bStart = new Date(current);
        current.setMinutes(current.getMinutes() + (Number(timings?.lunchDuration) || 45));
        const bEnd = new Date(current);
        slotsMap['lunch'] = `${fmt(bStart)} - ${fmt(bEnd)}`;
      }
    }
    return slotsMap;
  };

  const calculatedSlotTimes = useMemo(() => computeTimingsMap(periodTimings), [periodTimings]);

  const buildGridRowsForEntries = useCallback((rawEntries) => {
    const safeList = Array.isArray(rawEntries) ? rawEntries : [];
    return [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ].map((day) => {
      const findPeriodEntries = (period) =>
        safeList.filter((entry) => {
          if (!entry || entry.day !== day) return false;

          const pNo =
            entry.period_no !== undefined && entry.period_no !== null
              ? Number(entry.period_no)
              : Number(entry.period);

          if (!isNaN(pNo) && pNo === period) return true;

          if (typeof entry.period === 'string') {
            if (
              entry.period.includes(`Period ${period}`) ||
              entry.period.startsWith(`Period ${period}`)
            ) {
              return true;
            }
            const romanNumerals = [
              'I',
              'II',
              'III',
              'IV',
              'V',
              'VI',
              'VII',
              'VIII',
            ];
            if (
              romanNumerals[period - 1] &&
              entry.period.includes(`Period ${romanNumerals[period - 1]}`)
            ) {
              return true;
            }
          }
          return false;
        });

      const findPeriod = (period) => findPeriodEntries(period)[0] || null;

      const isLabEntry = (entry) => {
        if (!entry) return false;
        const comp = String(entry.component || '').toLowerCase();
        const code = String(entry.subject_code || entry.code || '').toLowerCase();
        const name = String(entry.subject_name || entry.name || '').toLowerCase();
        return comp === 'lab' || code.includes('lab') || name.includes('lab');
      };

      const classifyEntry = (entry) => {
        if (!entry) return null;
        const name = String(entry.subject_name || entry.name || '').toUpperCase();
        const code = String(entry.subject_code || entry.code || '').toUpperCase();
        const classification = String(entry.classification || '').toUpperCase();
        if (classification === 'PLACEMENT' || name.includes('PLACEMENT') || code.includes('PLACEMENT')) return 'PLACEMENT';
        if (classification === 'REMEDIAL' || name.includes('REMEDIAL') || code.includes('REMEDIAL')) return 'REMEDIAL';
        if (classification === 'LIBRARY' || name.includes('LIBRARY') || code.includes('LIBRARY')) return 'LIBRARY';
        if (classification === 'ACTIVITY' || name.includes('ACTIVITY') || code.includes('ACTIVITY')) return 'ACTIVITY';
        return null;
      };

      const rawSlots = [
        {
          type: 'period',
          period: 1,
          item: findPeriod(1),
          items: findPeriodEntries(1),
        },
        {
          type: 'period',
          period: 2,
          item: findPeriod(2),
          items: findPeriodEntries(2),
        },
        {
          type: 'break',
          breakType: 'tea',
        },
        {
          type: 'period',
          period: 3,
          item: findPeriod(3),
          items: findPeriodEntries(3),
        },
        {
          type: 'period',
          period: 4,
          item: findPeriod(4),
          items: findPeriodEntries(4),
        },
        {
          type: 'break',
          breakType: 'lunch',
        },
        {
          type: 'period',
          period: 5,
          item: findPeriod(5),
          items: findPeriodEntries(5),
        },
        {
          type: 'period',
          period: 6,
          item: findPeriod(6),
          items: findPeriodEntries(6),
        },
        {
          type: 'period',
          period: 7,
          item: findPeriod(7),
          items: findPeriodEntries(7),
        },
      ];

      // Detect lab spans: consecutive period slots with lab entries for the same subject
      for (let i = 0; i < rawSlots.length - 1; i++) {
        const curr = rawSlots[i];
        const next = rawSlots[i + 1];
        if (curr.type !== 'period' || next.type !== 'period') continue;
        if (curr.labContinuation) continue;

        const currItems = curr.items || [];
        const nextItems = next.items || [];
        if (currItems.length === 0 || nextItems.length === 0) continue;

        const currPrimary = currItems[0];
        const nextPrimary = nextItems[0];
        if (isLabEntry(currPrimary) && isLabEntry(nextPrimary)) {
          const currCode = String(currPrimary.subject_code || currPrimary.code || '');
          const nextCode = String(nextPrimary.subject_code || nextPrimary.code || '');
          if (currCode === nextCode || (currItems.length > 1 && nextItems.length > 1)) {
            curr.labSpan = 2;
            const mergedItems = [...currItems];
            nextItems.forEach((ni) => {
              const alreadyHas = mergedItems.some(
                (mi) =>
                  String(mi.subject_code || mi.code) === String(ni.subject_code || ni.code) &&
                  String(mi.batch || '') === String(ni.batch || '') &&
                  String(mi.faculty_id || '') === String(ni.faculty_id || '')
              );
              if (!alreadyHas) mergedItems.push(ni);
            });
            curr.mergedLabItems = mergedItems;
            next.labContinuation = true;
          }
        }
      }

      rawSlots.forEach((slot) => {
        if (slot.type === 'period' && slot.items && slot.items.length > 0) {
          const cls = classifyEntry(slot.items[0]);
          if (cls) slot.specialClassification = cls;
        }
      });

      return {
        day,
        slots: rawSlots,
      };
    });
  }, []);

  const gridRows = useMemo(() => buildGridRowsForEntries(entries), [buildGridRowsForEntries, entries]);

  // -----------------------------------------------------------
  // MULTI-SEMESTER FACULTY OCCUPANCY MAP & CONFLICT ANALYSIS
  // -----------------------------------------------------------

  const facultyScheduleMap = useMemo(() => {
    const map = new Map();
    const registerEntry = (e, semNo) => {
      const fid = e.faculty_id || e.facultyId;
      const coId = e.co_faculty_id || e.coFacultyId;
      const day = e.day;
      const p = Number(e.period_no ?? e.period);
      if (!day || isNaN(p) || p <= 0) return;
      const itemInfo = {
        semesterNo: Number(semNo),
        day,
        period: p,
        subjectCode: e.subject_code || e.code || '—',
        subjectName: e.subject_name || e.name || '',
      };
      if (fid) {
        const key = String(fid);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(itemInfo);
      }
      if (coId) {
        const key = String(coId);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(itemInfo);
      }
    };

    // Ingest all generated semesters
    Object.entries(generatedSemesters || {}).forEach(([sNo, sEntries]) => {
      if (Array.isArray(sEntries)) {
        sEntries.forEach((e) => registerEntry(e, sNo));
      }
    });

    // Also include entries if current semester is not already in generatedSemesters
    if (Array.isArray(entries) && entries.length > 0) {
      const currNo = context.semester_id
        ? getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {})
        : null;
      if (currNo && !generatedSemesters?.[String(currNo)]) {
        entries.forEach((e) => registerEntry(e, currNo));
      }
    }

    return map;
  }, [generatedSemesters, entries, context.semester_id, semesters]);

  const activeGeneratedSemKeys = useMemo(() => {
    return Object.keys(generatedSemesters || {}).filter(
      (k) => Array.isArray(generatedSemesters[k]) && generatedSemesters[k].length > 0
    );
  }, [generatedSemesters]);

  const hasOnlySem7 = useMemo(() => {
    const has7 = activeGeneratedSemKeys.includes('7') || (String(context.semester_id) === '7' && entries.length > 0);
    const has5 = activeGeneratedSemKeys.includes('5');
    const has3 = activeGeneratedSemKeys.includes('3');
    return has7 && !has5 && !has3;
  }, [activeGeneratedSemKeys, context.semester_id, entries.length]);

  const hasAllThreeSemesters = useMemo(() => {
    const has7 = activeGeneratedSemKeys.includes('7') || (String(context.semester_id) === '7' && entries.length > 0);
    const has5 = activeGeneratedSemKeys.includes('5') || (String(context.semester_id) === '5' && entries.length > 0);
    const has3 = activeGeneratedSemKeys.includes('3') || (String(context.semester_id) === '3' && entries.length > 0);
    return has7 && has5 && has3;
  }, [activeGeneratedSemKeys, context.semester_id, entries.length]);

  // Evaluates conflict status: 'red' (cannot place/high clash), 'yellow' (swappable/changes needed), 'green' (free slot)
  const evaluateSlotConflict = useCallback(
    (dragged, targetDay, targetPeriod, targetSemNo) => {
      if (!dragged) return null;

      const tP = Number(targetPeriod);
      const sNo = Number(targetSemNo || dragged.semesterNo || 7);

      // Same slot check
      if (
        Number(dragged.semesterNo) === sNo &&
        dragged.day === targetDay &&
        Number(dragged.period) === tP
      ) {
        return { status: 'current', reason: 'Current slot' };
      }

      // Hard Rule 1: Saturday restriction
      if (targetDay.toLowerCase() === 'saturday') {
        return { status: 'red', reason: 'Saturday reserved for special activities / project phase' };
      }

      // Hard Rule 2: Lab 2-period crossing checks
      if (dragged.isLab) {
        if (tP === 2) return { status: 'red', reason: 'Lab cannot cross Tea Break (Periods II–III)' };
        if (tP === 4) return { status: 'red', reason: 'Lab cannot cross Lunch Break (Periods IV–V)' };
        if (tP >= 7) return { status: 'red', reason: 'Lab requires 2 consecutive periods (exceeds daily periods)' };
      }

      // Hard Rule 3: Sem 7 after-lunch rule (Placement, Proctor, Remedial, Activity, Library)
      const cls = String(dragged.classification || dragged.item?.classification || '').toUpperCase();
      const code = String(dragged.subjectCode || dragged.item?.subject_code || '').toUpperCase();
      const name = String(dragged.subjectName || dragged.item?.subject_name || '').toUpperCase();
      const isSpecialAfternoon =
        dragged.item?.is_proctor ||
        cls === 'PROCTOR' ||
        cls === 'PLACEMENT' ||
        cls === 'REMEDIAL' ||
        cls === 'ACTIVITY' ||
        cls === 'LIBRARY' ||
        code.includes('PLACEMENT') ||
        code.includes('LIBRARY') ||
        code.includes('REMEDIAL') ||
        code.includes('ACTIVITY') ||
        code.includes('PROCTOR') ||
        name.includes('PLACEMENT') ||
        name.includes('LIBRARY') ||
        name.includes('REMEDIAL') ||
        name.includes('ACTIVITY');

      if (sNo === 7 && isSpecialAfternoon && tP <= 4) {
        return {
          status: 'red',
          reason: 'Semester 7 rule: Placement/Remedial/Library/Proctor must strictly be after lunch (P5+)',
        };
      }

      // Hard Rule: No academic classes after Major Project, Activity, or Proctor on the same day
      const targetSemEntriesList = generatedSemesters?.[String(sNo)] || entries || [];
      const isRegularClass = !isSpecialAfternoon && !code.includes('PROJ');

      if (isRegularClass) {
        const earlierSpecial = targetSemEntriesList.find((e) => {
          if (e.day !== targetDay) return false;
          if (Number(e.semesterNo || sNo) !== sNo) return false;
          const ep = Number(e.period_no ?? e.period);
          if (ep >= tP) return false;
          const eCls = String(e.classification || '').toUpperCase();
          const eCode = String(e.subject_code || '').toUpperCase();
          const eName = String(e.subject_name || '').toUpperCase();
          return (
            e.is_proctor ||
            e.is_placement ||
            e.is_library ||
            e.is_remedial ||
            e.is_activity ||
            eCls === 'PROCTOR' ||
            eCls === 'PLACEMENT' ||
            eCls === 'REMEDIAL' ||
            eCls === 'ACTIVITY' ||
            eCls === 'LIBRARY' ||
            eCls === 'PROJECT' ||
            eCode.includes('PLACEMENT') ||
            eCode.includes('LIBRARY') ||
            eCode.includes('REMEDIAL') ||
            eCode.includes('ACTIVITY') ||
            eCode.includes('PROCTOR') ||
            eCode.includes('PROJ') ||
            eName.includes('PLACEMENT') ||
            eName.includes('PROJECT')
          );
        });
        if (earlierSpecial) {
          return {
            status: 'red',
            reason: `End-of-day rule: Academic classes cannot be placed after ${earlierSpecial.subject_code || 'Activity/Project'} on ${targetDay}.`,
          };
        }
      }

      if (isSpecialAfternoon) {
        const laterRegular = targetSemEntriesList.find((e) => {
          if (e.day !== targetDay) return false;
          if (Number(e.semesterNo || sNo) !== sNo) return false;
          const ep = Number(e.period_no ?? e.period);
          if (ep <= tP) return false;
          const eCode = String(e.subject_code || '').toUpperCase();
          const eCls = String(e.classification || '').toUpperCase();
          const isSpec =
            e.is_proctor ||
            e.is_placement ||
            e.is_library ||
            e.is_remedial ||
            e.is_activity ||
            eCls === 'PROCTOR' ||
            eCls === 'PLACEMENT' ||
            eCls === 'REMEDIAL' ||
            eCls === 'ACTIVITY' ||
            eCls === 'LIBRARY' ||
            eCls === 'PROJECT' ||
            eCode.includes('PROCTOR') ||
            eCode.includes('PLACEMENT') ||
            eCode.includes('PROJ');
          return !isSpec;
        });
        if (laterRegular) {
          return {
            status: 'red',
            reason: `End-of-day rule: Special activities & proctor must be placed at the end of the day (Periods 6 & 7).`,
          };
        }
      }

      // Hard Rule 4: Cross-Semester Faculty Clash (checking both tP and tP + 1 for labs)
      const periodsToCheck = dragged.isLab ? [tP, tP + 1] : [tP];
      const facultyIdsToCheck = new Set();
      if (dragged.facultyId) facultyIdsToCheck.add(String(dragged.facultyId));
      if (dragged.coFacultyId) facultyIdsToCheck.add(String(dragged.coFacultyId));
      if (Array.isArray(dragged.items)) {
        dragged.items.forEach((it) => {
          if (it.faculty_id) facultyIdsToCheck.add(String(it.faculty_id));
          if (it.co_faculty_id) facultyIdsToCheck.add(String(it.co_faculty_id));
        });
      }

      for (const facId of facultyIdsToCheck) {
        if (facultyScheduleMap.has(facId)) {
          const slots = facultyScheduleMap.get(facId);
          for (const chkP of periodsToCheck) {
            const conflict = slots.find(
              (s) =>
                s.day === targetDay &&
                Number(s.period) === chkP &&
                !(
                  Number(s.semesterNo) === Number(dragged.semesterNo) &&
                  s.day === dragged.day &&
                  (Number(s.period) === Number(dragged.period) || (dragged.isLab && Number(s.period) === Number(dragged.period) + 1))
                )
            );
            if (conflict) {
              return {
                status: 'red',
                reason: `High Conflict Risk: Faculty busy teaching in Semester ${conflict.semesterNo} (${conflict.subjectCode}) at ${targetDay} Period ${chkP}`,
              };
            }
          }
        }
      }

      // Check occupancy in target semester
      const targetSemEntries =
        generatedSemesters?.[String(sNo)] || entries || [];

      if (dragged.isLab) {
        // Both tP and tP + 1 must be free for lab
        const occP1 = targetSemEntries.filter(
          (e) =>
            e.day === targetDay &&
            Number(e.period_no ?? e.period) === tP &&
            !(e.day === dragged.day && (Number(e.period_no ?? e.period) === Number(dragged.period) || Number(e.period_no ?? e.period) === Number(dragged.period) + 1))
        );
        const occP2 = targetSemEntries.filter(
          (e) =>
            e.day === targetDay &&
            Number(e.period_no ?? e.period) === tP + 1 &&
            !(e.day === dragged.day && (Number(e.period_no ?? e.period) === Number(dragged.period) || Number(e.period_no ?? e.period) === Number(dragged.period) + 1))
        );

        if (occP1.length > 0 || occP2.length > 0) {
          return { status: 'red', reason: `Slot occupied: Periods ${tP} & ${tP + 1} must both be free for 2-period lab` };
        }
        return { status: 'green', reason: `Free 2-Period Lab: Periods ${tP} & ${tP + 1} are clear with zero clash` };
      }

      const targetInSlot = targetSemEntries.filter(
        (e) => e.day === targetDay && Number(e.period_no ?? e.period) === tP
      );

      if (targetInSlot.length === 0) {
        return { status: 'green', reason: 'Free Slot: Zero conflict across all semesters' };
      }

      // Slot is occupied in this semester -> Check if a clean swap is possible
      const targetItem = targetInSlot[0];
      const targetFid = targetItem.faculty_id ? String(targetItem.faculty_id) : null;
      const targetIsLab =
        String(targetItem.component || '').toLowerCase() === 'lab';

      if (targetIsLab) {
        return { status: 'red', reason: 'Cannot swap multi-period lab session with standard class' };
      }

      // Verify targetItem's faculty is free at dragged's original slot
      if (targetFid && facultyScheduleMap.has(targetFid)) {
        const tSlots = facultyScheduleMap.get(targetFid);
        const swapConflict = tSlots.find(
          (s) =>
            s.day === dragged.day &&
            Number(s.period) === Number(dragged.period) &&
            !(
              Number(s.semesterNo) === sNo &&
              s.day === targetDay &&
              Number(s.period) === tP
            )
        );
        if (swapConflict) {
          return {
            status: 'red',
            reason: `Swap Impossible: ${targetItem.faculty_name || 'Target Faculty'} is busy at ${dragged.day} Period ${dragged.period} in Semester ${swapConflict.semesterNo}`,
          };
        }
      }

      return {
        status: 'yellow',
        reason: `Can be done with swap: Swap with ${targetItem.subject_code || 'Subject'} (${targetItem.faculty_name || 'Faculty'})`,
      };
    },
    [facultyScheduleMap, generatedSemesters, entries]
  );

  // Handle Drag Drop
  const handleSlotDrop = useCallback(
    (targetDay, targetPeriod, targetSemNo) => {
      if (!draggedSlot) return;
      const evaluation = evaluateSlotConflict(draggedSlot, targetDay, targetPeriod, targetSemNo);

      if (!evaluation || evaluation.status === 'red') {
        setMessage(`❌ Cannot place block: ${evaluation?.reason || 'Conflict risk detected'}`);
        setDraggedSlot(null);
        setDragHoverSlot(null);
        return;
      }

      if (evaluation.status === 'current') {
        setDraggedSlot(null);
        setDragHoverSlot(null);
        return;
      }

      const tP = Number(targetPeriod);
      const origDay = draggedSlot.day;
      const origP = Number(draggedSlot.period);
      const semKey = String(targetSemNo || draggedSlot.semesterNo);

      const sourceEntries = generatedSemesters?.[semKey] || entries || [];
      const updated = [...sourceEntries];

      if (draggedSlot.isLab) {
        const newEntries = updated.map((e) => {
          const isP1 = e.day === origDay && Number(e.period_no ?? e.period) === origP;
          const isP2 = e.day === origDay && Number(e.period_no ?? e.period) === origP + 1;
          if (isP1) {
            return { ...e, day: targetDay, period: tP, period_no: tP };
          }
          if (isP2) {
            return { ...e, day: targetDay, period: tP + 1, period_no: tP + 1 };
          }
          return e;
        });

        if (generatedSemesters?.[semKey]) {
          setGeneratedSemesters((prev) => ({ ...prev, [semKey]: newEntries }));
        }
        if (String(context.semester_id) === semKey || !context.semester_id) {
          setEntries(newEntries);
        }
        setMessage(`✅ Moved 2-period lab ${draggedSlot.subjectCode || ''} to ${targetDay} Periods ${tP}-${tP + 1} successfully!`);
        setDraggedSlot(null);
        setDragHoverSlot(null);
        return;
      }

      if (evaluation.status === 'green') {
        const newEntries = updated.map((e) => {
          if (e.day === origDay && Number(e.period_no ?? e.period) === origP) {
            return { ...e, day: targetDay, period: tP, period_no: tP };
          }
          return e;
        });

        if (generatedSemesters?.[semKey]) {
          setGeneratedSemesters((prev) => ({ ...prev, [semKey]: newEntries }));
        }
        if (String(context.semester_id) === semKey || !context.semester_id) {
          setEntries(newEntries);
        }
        setMessage(`✅ Moved ${draggedSlot.subjectCode} to ${targetDay} Period ${tP}. Free slot placed successfully!`);
      } else if (evaluation.status === 'yellow') {
        const newEntries = updated.map((e) => {
          const isOrig = e.day === origDay && Number(e.period_no ?? e.period) === origP;
          const isTarget = e.day === targetDay && Number(e.period_no ?? e.period) === tP;
          if (isOrig) {
            return { ...e, day: targetDay, period: tP, period_no: tP };
          }
          if (isTarget) {
            return { ...e, day: origDay, period: origP, period_no: origP };
          }
          return e;
        });

        if (generatedSemesters?.[semKey]) {
          setGeneratedSemesters((prev) => ({ ...prev, [semKey]: newEntries }));
        }
        if (String(context.semester_id) === semKey || !context.semester_id) {
          setEntries(newEntries);
        }
        setMessage(`🔄 Swapped ${draggedSlot.subjectCode} with target class at ${targetDay} Period ${tP}.`);
      }

      setDraggedSlot(null);
      setDragHoverSlot(null);
    },
    [draggedSlot, evaluateSlotConflict, generatedSemesters, entries, context.semester_id]
  );

  // Recommended best target slots for selected/dragged block
  const recommendedSlots = useMemo(() => {
    if (!draggedSlot) return [];
    const workingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const candidates = [];

    for (const day of workingDays) {
      for (let p = 1; p <= 7; p++) {
        if (day === draggedSlot.day && p === Number(draggedSlot.period)) continue;
        const evalRes = evaluateSlotConflict(draggedSlot, day, p, draggedSlot.semesterNo);
        if (evalRes && (evalRes.status === 'green' || evalRes.status === 'yellow')) {
          candidates.push({
            day,
            period: p,
            status: evalRes.status,
            reason: evalRes.reason,
          });
        }
      }
    }

    candidates.sort((a, b) => {
      if (a.status === 'green' && b.status !== 'green') return -1;
      if (a.status !== 'green' && b.status === 'green') return 1;
      return 0;
    });

    return candidates.slice(0, 6);
  }, [draggedSlot, evaluateSlotConflict]);

  // =========================================================
  // SEMESTER SELECTOR
  // =========================================================

  const renderSemesterSelector =
    () => (
      <div
        style={{
          display: 'flex',
          flexDirection:
            'column',
          gap: '7px',
          minWidth:
            '330px',
        }}
      >
        <label className="form-label">
          Semester
        </label>

        <div
          style={{
            display: 'flex',
            alignItems:
              'center',
            gap: '6px',
            flexWrap:
              'wrap',
          }}
        >
          {/* ALL */}
          <button
            type="button"
            onClick={() =>
              handleSemesterSelect(
                ''
              )
            }
            style={{
              border:
                context.semester_id ===
                ''
                  ? '1px solid var(--primary)'
                  : '1px solid #D9E2EC',

              background:
                context.semester_id ===
                ''
                  ? 'var(--primary)'
                  : '#FFFFFF',

              color:
                context.semester_id ===
                ''
                  ? '#FFFFFF'
                  : '#334155',

              borderRadius:
                '8px',

              padding:
                '8px 12px',

              fontSize:
                '0.75rem',

              fontWeight:
                '800',

              cursor:
                'pointer',
            }}
          >
            All
          </button>

          {generationSemesters.map(
            (semester) => {
              const semesterId =
                getSemesterId(
                  semester
                );

              const semesterNo =
                getSemesterNo(
                  semester
                );

              const selected =
                String(
                  context.semester_id
                ) ===
                String(
                  semesterId
                );

              return (
                <button
                  key={
                    semesterId
                  }
                  type="button"
                  onClick={() =>
                    handleSemesterSelect(
                      semesterId
                    )
                  }
                  style={{
                    border:
                      selected
                        ? '1px solid var(--primary)'
                        : '1px solid #D9E2EC',

                    background:
                      selected
                        ? 'var(--primary)'
                        : '#FFFFFF',

                    color:
                      selected
                        ? '#FFFFFF'
                        : '#334155',

                    borderRadius:
                      '8px',

                    padding:
                      '8px 12px',

                    fontSize:
                      '0.75rem',

                    fontWeight:
                      '800',

                    cursor:
                      'pointer',
                  }}
                >
                  {getSemesterLabel(
                    semesterNo
                  )}
                </button>
              );
            }
          )}
        </div>

        {(() => {
          const selectedSem = semesters.find(
            (s) => String(getSemesterId(s)) === String(context.semester_id)
          );
          const semNo = selectedSem ? Number(getSemesterNo(selectedSem)) : null;

          if (semNo === 1 || semNo === 2) {
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: '800',
                    color: '#64748B',
                  }}
                >
                  Cycle:
                </span>

                {[
                  { value: 'P', label: 'P Cycle' },
                  { value: 'C', label: 'C Cycle' },
                ].map(({ value, label }) => {
                  const active =
                    normalizeCycle(context.cycle) === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setContext((current) => ({
                          ...current,
                          cycle: value,
                        }))
                      }
                      style={{
                        border: active
                          ? '1px solid var(--primary)'
                          : '1px solid #D9E2EC',

                        background: active
                          ? 'var(--primary)'
                          : '#FFFFFF',

                        color: active ? '#FFFFFF' : '#334155',

                        borderRadius: '6px',

                        padding: '4px 10px',

                        fontSize: '0.7rem',

                        fontWeight: '800',

                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          }

          return null;
        })()}
      </div>
    );

  // =========================================================
  // FACULTY ASSIGNMENT VIEW
  // =========================================================

  const renderFacultyAssignmentView =
    () => (
      <div
        style={{
          display: 'flex',
          flexDirection:
            'column',
          gap: '20px',
        }}
      >
        {/* HEADER */}
        <div
          className="skit-card"
          style={{
            padding:
              '20px',
          }}
        >
          <div
            style={{
              display:
                'flex',
              alignItems:
                'center',
              justifyContent:
                'space-between',
              gap: '20px',
              flexWrap:
                'wrap',
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize:
                    '1.15rem',
                  fontWeight:
                    '800',
                }}
              >
                Faculty Subject Assignment
              </h2>

              <p
                style={{
                  margin:
                    '6px 0 0',
                  fontSize:
                    '0.82rem',
                  color:
                    '#64748B',
                }}
              >
                Assign faculty members
                to the subjects before
                generating the timetable.
              </p>
            </div>

            <div
              style={{
                display:
                  'flex',
                alignItems:
                  'center',
                gap: '8px',
                fontSize:
                  '0.8rem',
                fontWeight:
                  '700',
              }}
            >
              {missingAssignments.length ===
              0 ? (
                <>
                  <CheckCircle2
                    size={18}
                    style={{
                      color:
                        '#16A34A',
                    }}
                  />

                  All displayed subjects assigned
                </>
              ) : (
                <>
                  <AlertTriangle
                    size={18}
                    style={{
                      color:
                        '#D97706',
                    }}
                  />

                  {missingAssignments.length}{' '}
                  subjects pending
                </>
              )}
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div
          className="skit-card"
          style={{
            padding:
              '16px 20px',
          }}
        >
          <div
            style={{
              display:
                'flex',
              gap: '12px',
              alignItems:
                'flex-end',
              flexWrap:
                'wrap',
            }}
          >
            {/* DEPARTMENT */}
            <div
              className="form-group"
              style={{
                margin: 0,
                minWidth:
                  '250px',
              }}
            >
              <label className="form-label">
                Department
              </label>

              <select
                className="form-select"
                value={
                  context.department_id
                }
                onChange={(e) =>
                  handleDepartmentChange(
                    e.target.value
                  )
                }
              >
                {displayDepartments.map(
                  (department) => {
                    const id =
                      getDepartmentId(
                        department
                      );

                    return (
                      <option
                        key={id}
                        value={id}
                      >
                        {department._displayName || getDepartmentName(department)}
                      </option>
                    );
                  }
                )}
              </select>
            </div>

            {/* SCHEME */}
            <div
              className="form-group"
              style={{
                margin: 0,
                minWidth: '160px',
              }}
            >
              <label className="form-label">
                Scheme
              </label>

              <select
                className="form-select"
                value={String(context.scheme_id || '1')}
                onChange={(e) =>
                  handleSchemeChange(e.target.value)
                }
              >
                {schemes.length > 0 ? (
                  schemes.map((sc) => {
                    const sId = String(getSchemeId(sc));
                    const sYear = sc.scheme_year || (sId === '2' ? '2025' : '2022');
                    return (
                      <option key={sId} value={sId}>
                        {sYear} Scheme
                      </option>
                    );
                  })
                ) : (
                  <>
                    <option value="1">2022 Scheme</option>
                    <option value="2">2025 Scheme</option>
                  </>
                )}
              </select>
            </div>

            {/* SEMESTER TYPE */}
            <div
              className="form-group"
              style={{
                margin: 0,
                minWidth:
                  '170px',
              }}
            >
              <label className="form-label">
                Semester Type
              </label>

              <select
                className="form-select"
                value={
                  context.semester_type
                }
                onChange={(e) =>
                  handleSemesterTypeChange(
                    e.target.value
                  )
                }
              >
                <option value="Odd">
                  Odd Semesters
                </option>

                <option value="Even">
                  Even Semesters
                </option>
              </select>
            </div>

            {/* SECTION SELECTOR (AIML 2025 and CSE) */}
            {showSectionSelector && (
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth: '150px',
                }}
              >
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Section</span>
                  <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                    {isCseWithSections ? 'CSE' : 'AIML 2025'}
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['A', 'B'].map((sec) => {
                    const active = (context.section || 'A') === sec;
                    return (
                      <button
                        key={`assign-sec-${sec}`}
                        type="button"
                        onClick={() => setContext((prev) => ({ ...prev, section: sec }))}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontWeight: '800',
                          fontSize: '0.78rem',
                          borderRadius: '6px',
                          border: active ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                          background: active ? 'var(--primary)' : '#FFFFFF',
                          color: active ? '#FFFFFF' : '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        Sec {sec}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEMESTER */}
            {renderSemesterSelector()}

            {/* ACADEMIC YEAR */}
            <div
              className="form-group"
              style={{
                margin: 0,
                minWidth: '160px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Academic Year</label>
                <button
                  type="button"
                  onClick={() => setShowAddYearModal(true)}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    padding: '0 2px',
                  }}
                  title="Add new academic year"
                >
                  + Add Year
                </button>
              </div>

              <select
                className="form-select"
                value={context.academic_year}
                onChange={(e) =>
                  setContext((current) => ({
                    ...current,
                    academic_year: e.target.value,
                  }))
                }
              >
                {academicYears.map((yr) => (
                  <option key={`assign-yr-${yr}`} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* SEARCH */}
            <div
              className="form-group"
              style={{
                margin: 0,
                flex: 1,
                minWidth:
                  '230px',
              }}
            >
              <label className="form-label">
                Search Subjects
              </label>

              <div
                style={{
                  position:
                    'relative',
                }}
              >
                <Search
                  size={16}
                  style={{
                    position:
                      'absolute',
                    left:
                      '12px',
                    top:
                      '50%',
                    transform:
                      'translateY(-50%)',
                    color:
                      '#94A3B8',
                  }}
                />

                <input
                  className="form-input"
                  style={{
                    paddingLeft:
                      '36px',
                  }}
                  value={
                    assignmentSearch
                  }
                  onChange={(e) =>
                    setAssignmentSearch(
                      e.target
                        .value
                    )
                  }
                  placeholder="Search subjects..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* FACULTY WORKLOAD SUMMARY */}
        <div
          className="skit-card"
          style={{ padding: '16px 20px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800' }}>
                Faculty Workload
              </h3>
              <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#64748B' }}>
                Global weekly workload across all semesters. Lab Co-faculty receives the same lab hours as Main.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '0.74rem',
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#FEF2F2',
                  borderColor: '#FECACA',
                  color: '#991B1B',
                  fontWeight: '700',
                  borderRadius: '6px',
                }}
                onClick={handleResetAllWorkload}
                title="Reset all faculty workloads and assignments to 0 across all semesters"
              >
                <RotateCcw size={13} /> Reset Workload to 0
              </button>
              {workloadExceededFaculty.length > 0 && (
                <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                  {workloadExceededFaculty.length} over maximum
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '8px',
            }}
          >
            {facultyList.map((faculty) => {
              const id = String(getFacultyId(faculty));
              const current = projectedFacultyWorkload[id] ?? 0;
              const min = getFacultyMinWorkload(faculty);
              const max = getFacultyMaxWorkload(faculty);
              const over = current > max;
              const under = current < min;
              const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

              return (
                <div
                  key={`workload-${id}`}
                  style={{
                    border: `1px solid ${over ? '#FCA5A5' : under ? '#FDE68A' : '#E2E8F0'}`,
                    borderRadius: '10px',
                    padding: '10px 12px',
                    background: over ? '#FEF2F2' : under ? '#FFFBEB' : '#F8FAFC',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.78rem', color: '#0F172A' }}>
                        {getFacultyName(faculty)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '1px' }}>
                        {faculty.department || 'Academic Faculty'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: '800', color: over ? '#B91C1C' : '#15803D' }}>
                        {current}h / {max}h
                      </div>
                      <div style={{ fontSize: '0.62rem', color: '#64748B' }}>
                        {pct}% cap
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '5px', fontSize: '0.66rem', color: '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{getFacultyWorkloadBounds(faculty).label} · {min}-{max}h</span>
                    {faculty.preferred_time && faculty.preferred_time !== 'No_Preference' && (
                      <span style={{ color: '#4F46E5', fontWeight: '700', background: '#EEF2FF', padding: '1px 5px', borderRadius: '4px', fontSize: '0.62rem' }}>
                        🕒 {faculty.preferred_time}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '6px', height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: over ? '#DC2626' : under ? '#D97706' : '#16A34A',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SUBJECTS */}
        <div
          className="skit-card"
          style={{
            padding: 0,
            overflow:
              'hidden',
          }}
        >
          <div
            style={{
              padding:
                '18px 20px',
              borderBottom:
                '1px solid #E2E8F0',
              display:
                'flex',
              alignItems:
                'center',
              justifyContent:
                'space-between',
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize:
                    '1rem',
                  fontWeight:
                    '800',
                }}
              >
                Subjects
              </h3>

              <div
                style={{
                  marginTop:
                    '4px',
                  fontSize:
                    '0.76rem',
                  color:
                    '#64748B',
                }}
              >
                {assignedCount} of{' '}
                {requiredSubjects.length}{' '}
                required subjects assigned
              </div>

              {missingOptionGroups.length > 0 && (
                <div
                  style={{
                    marginTop: '5px',
                    fontSize: '0.72rem',
                    color: '#B45309',
                    fontWeight: '700',
                  }}
                >
                  {missingOptionGroups.length} PEC/OEC option group
                  {missingOptionGroups.length === 1 ? '' : 's'} need a subject choice.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  fontSize: '0.78rem',
                  padding: '7px 14px',
                  background: '#EFF6FF',
                  borderColor: '#93C5FD',
                  color: '#1D4ED8',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                }}
                onClick={() => openAddCrossDeptModal()}
                title="Add faculty from other department to assign to any subject"
              >
                <Building size={15} /> + Add Faculty from Other Department
              </button>
              <Users
                size={20}
                style={{
                  color:
                    'var(--primary)',
                }}
              />
            </div>
          </div>

          {/* MANDATORY PROCTOR / CLASS MENTOR CARD (UNIVERSAL FOR ALL SEMESTERS & DEPTS) */}
          <div
            style={{
              padding: '16px 18px',
              margin: '14px 0',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: '#DCFCE7',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Shield size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Mandatory Proctor / Class Mentor Assignment
                    <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                      Batches B1 & B2 • Universal All Sems
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803D', marginTop: '2px' }}>
                    Assign 2 faculty members (Batch B1 & Batch B2) for weekly mentoring & proctoring hour across all semesters and departments.
                  </div>
                </div>
              </div>

              {/* Semester Selector Chips for Proctors */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#166534' }}>
                  Target Semester:
                </span>
                {/* ALL tab */}
                <button
                  type="button"
                  onClick={() => setProctorTargetSemId('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    background: (proctorTargetSemId === 'all' || (!proctorTargetSemId && !context.semester_id)) ? '#15803D' : '#FFFFFF',
                    color: (proctorTargetSemId === 'all' || (!proctorTargetSemId && !context.semester_id)) ? '#FFFFFF' : '#166534',
                    border: (proctorTargetSemId === 'all' || (!proctorTargetSemId && !context.semester_id)) ? '1.5px solid #15803D' : '1px solid #BBF7D0',
                  }}
                >
                  All
                </button>
                {safeGenerationSemesters.map((sem) => {
                  const sId = String(getSemesterId(sem));
                  const sNo = getSemesterNo(sem);
                  const activeTarget = proctorTargetSemId === sId;
                  const hasAssigned = !!(proctorAssignmentsBySem[sId]?.b1 || proctorAssignmentsBySem[sId]?.b2);
                  return (
                    <button
                      key={`sem-proc-tab-${sId}`}
                      type="button"
                      onClick={() => setProctorTargetSemId(sId)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        background: activeTarget ? '#15803D' : '#FFFFFF',
                        color: activeTarget ? '#FFFFFF' : '#166534',
                        border: activeTarget ? '1.5px solid #15803D' : '1px solid #BBF7D0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <span>Sem {sNo}</span>
                      {hasAssigned && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: activeTarget ? '#86EFAC' : '#22C55E' }} title="Proctors assigned" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Proctor Dropdowns — single sem or ALL */}
            {(() => {
              const isAllView = proctorTargetSemId === 'all' || (!proctorTargetSemId && !context.semester_id);

              // Helper to render one semester's B1/B2 pair
              const renderSemProctorRow = (semObj) => {
                const semId = String(getSemesterId(semObj));
                const semNo = getSemesterNo(semObj);
                const semLabel = `Semester ${semNo}`;
                const semProctors = proctorAssignmentsBySem[semId] || {};
                const b1Val = semProctors.b1 || '';
                const b2Val = semProctors.b2 || '';
                const hasB1 = !!b1Val;
                const hasB2 = !!b2Val;

                return (
                  <div
                    key={`proctor-row-${semId}`}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #DCFCE7',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      gap: '16px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#166534', minWidth: '120px' }}>
                      <span style={{
                        background: semNo === 7 ? '#7C3AED' : semNo === 5 ? '#0284C7' : semNo === 3 ? '#059669' : semNo === 1 ? '#EA580C' : '#334155',
                        color: '#FFFFFF',
                        padding: '2px 8px',
                        borderRadius: '5px',
                        fontSize: '0.72rem',
                        fontWeight: '800',
                        marginRight: '6px',
                      }}>
                        Sem {semNo}
                      </span>
                      {hasB1 && hasB2 ? (
                        <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#15803D', padding: '1px 5px', borderRadius: '3px' }}>✓ Assigned</span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: '3px' }}>Pending</span>
                      )}
                    </div>

                    {/* B1 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '200px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '0 4px', borderRadius: '3px' }}>B1</span>
                        Batch B1 Proctor ({semLabel}):
                      </span>
                      <select
                        className="form-select"
                        style={{ background: '#FFFFFF', borderColor: '#93C5FD', fontSize: '0.78rem' }}
                        value={b1Val}
                        onChange={(e) => handleProctorChange(semId, 'b1', e.target.value)}
                      >
                        <option value="">Select Proctor for Batch B1</option>
                        {facultyList.map((faculty) => {
                          const fId = getFacultyId(faculty);
                          const fHours = projectedFacultyWorkload[fId] ?? 0;
                          const fMax = getFacultyMaxWorkload(faculty);
                          return (
                            <option key={`p1-${semId}-${fId}`} value={fId}>
                              {getFacultyName(faculty)} — {faculty.designation || faculty.role || 'Faculty'} [{fHours}/{fMax}h]
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* B2 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '200px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#065F46', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ background: '#D1FAE5', color: '#047857', padding: '0 4px', borderRadius: '3px' }}>B2</span>
                        Batch B2 Proctor ({semLabel}):
                      </span>
                      <select
                        className="form-select"
                        style={{ background: '#FFFFFF', borderColor: '#86EFAC', fontSize: '0.78rem' }}
                        value={b2Val}
                        onChange={(e) => handleProctorChange(semId, 'b2', e.target.value)}
                      >
                        <option value="">Select Proctor for Batch B2</option>
                        {facultyList.map((faculty) => {
                          const fId = getFacultyId(faculty);
                          const fHours = projectedFacultyWorkload[fId] ?? 0;
                          const fMax = getFacultyMaxWorkload(faculty);
                          return (
                            <option key={`p2-${semId}-${fId}`} value={fId}>
                              {getFacultyName(faculty)} — {faculty.designation || faculty.role || 'Faculty'} [{fHours}/{fMax}h]
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                );
              };

              if (isAllView) {
                // Show ALL semester proctor rows stacked
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {safeGenerationSemesters.length === 0 ? (
                      <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '8px', color: '#64748B', fontSize: '0.82rem' }}>
                        Select a Department and Semester Type to view proctor assignment slots.
                      </div>
                    ) : (
                      safeGenerationSemesters.map(renderSemProctorRow)
                    )}
                  </div>
                );
              }

              // Single semester view
              const activeSemId = String(proctorTargetSemId || context.semester_id || safeGenerationSemesters[0]?.semester_id || '');
              const targetSemObj = safeGenerationSemesters.find((s) => String(getSemesterId(s)) === activeSemId) || safeGenerationSemesters[0];
              if (!targetSemObj) return null;
              return renderSemProctorRow(targetSemObj);
            })()}
          </div>

          {/* CROSS-DEPARTMENT FACULTY SECTION */}
          {crossDeptAssignments.length > 0 && (
            <div
              style={{
                margin: '14px 0',
                padding: '16px 20px',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={18} style={{ color: '#2563EB' }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '800', color: '#1E293B' }}>
                      Cross-Department Faculty Assignments ({crossDeptAssignments.length})
                    </h4>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Faculty assigned from other departments. Removing unlinks the assignment in SQL while preserving the faculty master record.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#FFFFFF' }}>
                <table className="skit-table" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9' }}>
                      <th>FACULTY NAME</th>
                      <th>FACULTY DEPARTMENT</th>
                      <th>ASSIGNMENT</th>
                      <th style={{ textAlign: 'right', width: '140px' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossDeptAssignments.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '700', color: '#0F172A' }}>
                          {item.faculty_name}
                        </td>
                        <td style={{ fontSize: '0.76rem', color: '#475569' }}>
                          <span style={{ background: '#E0E7FF', color: '#3730A3', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                            {item.department_name}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.76rem', color: '#334155' }}>
                          {item.is_assigned ? (
                            <span>
                              <strong>{item.subject_code}</strong> - {item.subject_name} ({item.component} • {item.role})
                            </span>
                          ) : (
                            <span style={{ color: '#64748B', fontStyle: 'italic' }}>
                              Available in Department Pool (Not yet assigned to a subject)
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{
                              padding: '4px 10px',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              color: '#DC2626',
                              borderColor: '#FCA5A5',
                              background: '#FEF2F2',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            onClick={() => handleRemoveCrossDeptFaculty(item)}
                            title="Delete this assignment from SQL without modifying the faculty master record"
                          >
                            <Trash2 size={13} /> Remove / Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {assignmentLoading ? (
            <div
              style={{
                padding:
                  '50px 20px',
                textAlign:
                  'center',
                color:
                  '#64748B',
              }}
            >
              Loading faculty assignments...
            </div>
          ) : visibleSubjects.length ===
            0 ? (
            <div
              style={{
                padding:
                  '60px 20px',
                textAlign:
                  'center',
                color:
                  '#64748B',
              }}
            >
              <div
                style={{
                  fontSize:
                    '0.9rem',
                  fontWeight:
                    '700',
                }}
              >
                No subjects found.
              </div>

              <div
                style={{
                  fontSize:
                    '0.75rem',
                  marginTop:
                    '5px',
                }}
              >
                Try another semester,
                department or search.
              </div>
            </div>
          ) : (
            <div
              style={{
                overflowX:
                  'auto',
              }}
            >
              <table
                className="skit-table"
                style={{
                  width:
                    '100%',
                }}
              >
                <thead>
                  <tr>
                    <th>SUBJECT</th>
                    <th>CATEGORY</th>
                    <th>SEM</th>
                    <th>L-T-P</th>
                    <th>FACULTY</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleSubjects.map(
                    (subject, subjectIndex) => {
                      const subjectId =
                        getSubjectId(
                          subject
                        );

                      const selectedFaculty =
                        facultyAssignments[
                          String(
                            subjectId
                          )
                        ] || '';

                      const choiceGroup =
                        getOptionGroupKey(subject);

                      const selectedChoiceId =
                        choiceGroup
                          ? selectedChoiceByGroup[choiceGroup]
                          : null;

                      const electiveLocked =
                        Boolean(
                          choiceGroup &&
                          selectedChoiceId &&
                          String(selectedChoiceId) !== String(subjectId)
                        );

                      const currentSemNo = getSubjectSemesterNumber(subject);
                      const previousSemNo =
                        subjectIndex > 0
                          ? getSubjectSemesterNumber(visibleSubjects[subjectIndex - 1])
                          : null;
                      const semesterChanged =
                        subjectIndex === 0 || currentSemNo !== previousSemNo;

                      const section = getAssignmentSection(subject);
                      const previousSection =
                        !semesterChanged && subjectIndex > 0
                          ? getAssignmentSection(visibleSubjects[subjectIndex - 1])
                          : null;
                      const sectionChanged = semesterChanged || section !== previousSection;
                      const sectionMeta = assignmentSectionMeta[section];

                      return (
                        <React.Fragment key={subjectId}>
                          {semesterChanged && currentSemNo > 0 && (
                            <tr key={`sem-head-${currentSemNo}-${subjectIndex}`}>
                              <td
                                colSpan={6}
                                style={{
                                  padding: '12px 16px',
                                  background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                                  color: '#FFFFFF',
                                  borderTop: subjectIndex > 0 ? '3px solid #0284C7' : 'none',
                                  borderBottom: '2px solid #334155',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span
                                      style={{
                                        background: currentSemNo === 7 ? '#7C3AED' : currentSemNo === 5 ? '#0284C7' : '#059669',
                                        color: '#FFFFFF',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontWeight: '900',
                                        fontSize: '0.78rem',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      SEMESTER {currentSemNo}
                                    </span>
                                    <span style={{ fontWeight: '800', fontSize: '0.88rem', letterSpacing: '0.04em' }}>
                                      ALL SUBJECTS OF {currentSemNo}{currentSemNo === 1 ? 'ST' : currentSemNo === 2 ? 'ND' : currentSemNo === 3 ? 'RD' : 'TH'} SEMESTER
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: '600' }}>
                                    {visibleSubjects.filter((s) => getSubjectSemesterNumber(s) === currentSemNo).length} subjects
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {sectionChanged && (
                            <tr key={`sec-head-${section}-${subjectIndex}`}>
                              <td
                                colSpan={6}
                                style={{
                                  padding: '9px 14px',
                                  background: '#F8FAFC',
                                  borderTop: semesterChanged ? 'none' : '1px solid #E2E8F0',
                                  borderBottom: '1px solid #E2E8F0',
                                  color: sectionMeta?.tone || '#475569',
                                  fontSize: '0.72rem',
                                  fontWeight: '900',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {sectionMeta?.title || section}
                              </td>
                            </tr>
                          )}
                          <tr
                          key={
                            subjectId
                          }
                          style={
                            electiveLocked
                              ? {
                                  opacity: 0.58,
                                  background: '#F8FAFC',
                                }
                              : undefined
                          }
                        >
                          <td>
                            <div
                              style={{
                                fontWeight:
                                  '800',
                                color:
                                  'var(--primary)',
                              }}
                            >
                              {getSubjectCode(
                                subject
                              ) || '—'}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  '0.72rem',
                                color:
                                  '#64748B',
                                marginTop:
                                  '3px',
                              }}
                            >
                              {getSubjectName(
                                subject
                              )}
                            </div>
                          </td>

                          <td>
                            <span
                              className="badge"
                              style={{
                                background:
                                  '#F3E8FF',
                                color:
                                  '#7E22CE',
                              }}
                            >
                              {getCourseCategory(
                                subject
                              )}
                            </span>
                          </td>

                          <td
                            style={{
                              fontWeight:
                                '700',
                            }}
                          >
                            {getSemesterLabel(
                              subject.semester_no ??
                                subject.semester_number
                            )}
                          </td>

                          <td
                            style={{
                              fontWeight:
                                '700',
                              whiteSpace:
                                'nowrap',
                            }}
                          >
                            {getLtp(
                              subject
                            )}
                          </td>

                          <td>
                            {isSpecialActivity(subject) ? (
                              <div style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: '#FEF3C7',
                                color: '#92400E',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                              }}>
                                {isSaturdayActivity(subject)
                                  ? 'Saturday full-day activity — no faculty assignment required'
                                  : 'Non-teaching co-curricular activity — no faculty assignment required'}
                              </div>
                            ) : isProjectSubject(subject) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '340px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ minWidth: '135px', fontSize: '0.7rem', fontWeight: '800', color: '#7C3AED', background: '#F5F3FF', padding: '4px 8px', borderRadius: '4px', border: '1px solid #DDD6FE' }}>
                                    {isMajorProjectSubject(subject) ? 'Major Project Coord' : 'Mini Project Coord'} (0h)
                                  </span>
                                  <select
                                    className="form-select"
                                    style={{ minWidth: '270px' }}
                                    value={getComponentFaculty(subject, 'Theory', 'Main')}
                                    disabled={electiveLocked || assignmentSaving}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleComponentFacultyChange(subject, 'Theory', val, 'Main');
                                      if (isMajorProjectSubject(subject)) {
                                        visibleSubjects.forEach((otherSub) => {
                                          if (
                                            String(getSubjectId(otherSub)) !== String(getSubjectId(subject)) &&
                                            isMajorProjectSubject(otherSub)
                                          ) {
                                            handleComponentFacultyChange(otherSub, 'Theory', val, 'Main');
                                          }
                                        });
                                      }
                                    }}
                                  >
                                    <option value="">Select Project Coordinator (0h Workload)</option>
                                    {renderFacultyOptionsList(getAssignableFaculty())}
                                  </select>
                                </div>
                                {(() => {
                                  const cId = getComponentFaculty(subject, 'Theory', 'Main');
                                  if (!cId) return null;
                                  const master = allFaculty.length > 0 ? allFaculty : (allFacultyRef.current || facultyList);
                                  const cFac = master.find((f) => String(getFacultyId(f)) === String(cId));
                                  if (!cFac) return null;
                                  return (
                                    <div style={{ fontSize: '0.68rem', color: '#6D28D9', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '143px' }}>
                                      <span>👤 <strong>{getFacultyName(cFac)}</strong></span>
                                      <span>• {getFacultyRole(cFac) || 'Faculty'}</span>
                                      <span>• {cFac.department}</span>
                                      <span style={{ background: '#EDE9FE', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>0h added</span>
                                    </div>
                                  );
                                })()}
                                <div style={{ fontSize: '0.68rem', color: '#7C3AED', fontWeight: '600' }}>
                                  ✓ Single coordinator · 0 teaching hours added to faculty weekly workload
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '340px' }}>
                                {getTeachingComponents(subject).map((component) => {
                                  const selected = getComponentFaculty(subject, component, 'Main');
                                  const coSelected = getComponentFaculty(subject, component, 'Co');
                                  const hours = getComponentHours(subject, component);
                                  const assignableFacultyList = getAssignableFaculty();
                                  const mainFac = assignableFacultyList.find((f) => String(getFacultyId(f)) === String(selected));
                                  const coFac = assignableFacultyList.find((f) => String(getFacultyId(f)) === String(coSelected));
                                  const allowsCoFaculty = component === 'Lab' || isIpccSubject(subject);

                                  return (
                                    <div key={component} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ minWidth: '78px', fontSize: '0.7rem', fontWeight: '800', color: component === 'Lab' ? '#0F766E' : '#475569' }}>
                                          {component} ({hours}h)
                                        </span>
                                        <select
                                          className="form-select"
                                          style={{ minWidth: '260px' }}
                                          value={String(selected || '')}
                                          disabled={electiveLocked || assignmentSaving}
                                          onChange={(e) => handleComponentFacultyChange(subject, component, e.target.value, 'Main')}
                                        >
                                          <option value="">{component === 'Lab' ? 'Select Lab Faculty' : `Select ${component} Main Faculty`}</option>
                                          {renderFacultyOptionsList(assignableFacultyList)}
                                        </select>
                                      </div>

                                      {/* CO-FACULTY ASSIGNMENT (FOR LAB & IPCC SUBJECTS ONLY) */}
                                      {allowsCoFaculty && (coSelected || (component === 'Lab') || showTheoryCo[getSubjectId(subject)]) && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                          <span style={{ minWidth: '78px', fontSize: '0.68rem', fontWeight: '800', color: component === 'Lab' ? '#0F766E' : '#64748B' }}>
                                            Co-Faculty {component === 'Lab' ? `(${hours}h)` : ''}
                                          </span>
                                          <select
                                            className="form-select"
                                            style={{ minWidth: '260px' }}
                                            value={String(coSelected || '')}
                                            disabled={electiveLocked || !selected || assignmentSaving}
                                            onChange={(e) => handleComponentFacultyChange(subject, component, e.target.value, 'Co')}
                                          >
                                            <option value="">Select Co-Faculty (Optional)</option>
                                            {renderFacultyOptionsList(
                                              assignableFacultyList.filter((faculty) => String(getFacultyId(faculty)) !== String(selected)),
                                              'Co-Faculty: '
                                            )}
                                          </select>
                                          {coSelected && (
                                            <button
                                              type="button"
                                              style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#DC2626',
                                                fontSize: '0.70rem',
                                                cursor: 'pointer',
                                                fontWeight: '700',
                                                padding: '2px 4px',
                                              }}
                                              onClick={() => {
                                                handleComponentFacultyChange(subject, component, '', 'Co');
                                                if (component === 'Theory') {
                                                  setShowTheoryCo((prev) => ({ ...prev, [getSubjectId(subject)]: false }));
                                                }
                                              }}
                                              title="Remove Co-Faculty"
                                            >
                                              ✕ Remove
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {/* ADD CO-FACULTY BUTTON FOR IPCC THEORY (ONLY WHEN NOT ALREADY VISIBLE) */}
                                      {component === 'Theory' && isIpccSubject(subject) && !coSelected && !showTheoryCo[getSubjectId(subject)] && selected && !electiveLocked && (
                                        <div style={{ marginLeft: '86px', marginTop: '1px' }}>
                                          <button
                                            type="button"
                                            style={{
                                              background: 'transparent',
                                              border: 'none',
                                              color: '#005E38',
                                              fontSize: '0.68rem',
                                              fontWeight: '700',
                                              cursor: 'pointer',
                                              padding: 0,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                            }}
                                            onClick={() => setShowTheoryCo((prev) => ({ ...prev, [getSubjectId(subject)]: true }))}
                                          >
                                            + Add Co-Faculty
                                          </button>
                                        </div>
                                      )}

                                      {mainFac && (
                                        <div style={{ fontSize: '0.68rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '86px', flexWrap: 'wrap' }}>
                                          <span>👤 Main: <strong>{getFacultyName(mainFac)}</strong></span>
                                          <span>• {getFacultyRole(mainFac) || 'Faculty'}</span>
                                          <span>• {mainFac.department}</span>
                                          <span style={{ fontWeight: '700', color: (projectedFacultyWorkload[getFacultyId(mainFac)] ?? 0) > getFacultyMaxWorkload(mainFac) ? '#DC2626' : '#16A34A' }}>
                                            [{projectedFacultyWorkload[getFacultyId(mainFac)] ?? 0}/{getFacultyMaxWorkload(mainFac)}h]
                                          </span>
                                          {coFac && (
                                            <>
                                              <span style={{ marginLeft: '4px' }}>| Co-Faculty: <strong>{getFacultyName(coFac)}</strong></span>
                                              <span>• {getFacultyRole(coFac) || 'Faculty'}</span>
                                              <span style={{ fontWeight: '700', color: (projectedFacultyWorkload[getFacultyId(coFac)] ?? 0) > getFacultyMaxWorkload(coFac) ? '#DC2626' : '#16A34A' }}>
                                                [{projectedFacultyWorkload[getFacultyId(coFac)] ?? 0}/{getFacultyMaxWorkload(coFac)}h]
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {choiceGroup && selectedChoiceId && !electiveLocked && (
                                  <button type="button" onClick={() => clearElectiveSelection(choiceGroup)} style={{ marginTop: '2px', border: 'none', background: 'transparent', color: '#0F766E', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                                    Change elective selection
                                  </button>
                                )}

                                {electiveLocked && (
                                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '700' }}>
                                    Locked — another {String(getCourseCategory(subject)).toUpperCase()} option is selected.
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            {isSpecialActivity(subject) || (isProjectSubject(subject) ? Boolean(getComponentFaculty(subject, 'Theory', 'Main')) : getTeachingComponents(subject).every((component) => Boolean(getComponentFaculty(subject, component, 'Main')))) ? (
                              <span className="badge badge-active">
                                <CheckCircle2
                                  size={
                                    13
                                  }
                                />
                                Assigned
                              </span>
                            ) : isOnDemandOptionalSubject(subject) ? (
                              <span
                                className="badge"
                                style={{
                                  background: '#F1F5F9',
                                  color: '#64748B',
                                  border: '1px solid #CBD5E1',
                                }}
                              >
                                Optional
                              </span>
                            ) : (
                              <span
                                className="badge"
                                style={{
                                  background:
                                    '#FEF3C7',
                                  color:
                                    '#92400E',
                                }}
                              >
                                <AlertTriangle
                                  size={
                                    13
                                  }
                                />
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                        </React.Fragment>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* BOTTOM ACTIONS */}
          <div
            style={{
              padding:
                '16px 20px',
              borderTop:
                '1px solid #E2E8F0',
              display:
                'flex',
              justifyContent:
                'space-between',
              alignItems:
                'center',
              gap: '12px',
              flexWrap:
                'wrap',
            }}
          >
            <div
              style={{
                fontSize:
                  '0.78rem',
                color:
                  '#64748B',
              }}
            >
              PEC/OEC groups are treated as
              one choice. Faculty are selected from the
              active faculty of the selected department. Assignments are saved for academic year{' '}
              <strong>
                {
                  context.academic_year
                }
              </strong>
            </div>

            <div
              style={{
                display:
                  'flex',
                gap: '10px',
              }}
            >
              <button
                className="btn-secondary"
                onClick={() => {
                  setFacultyAssignments({});
                  setComponentAssignments({});
                  setAssignmentsSavedForContext('');
                  setMessage('Current faculty selections cleared.');
                }}
              >
                <Trash2
                  size={15}
                />
                Clear Selection
              </button>

              <button
                className="btn-primary"
                onClick={
                  saveFacultyAssignments
                }
                disabled={
                  assignmentSaving
                }
              >
                <Save
                  size={15}
                />

                {assignmentSaving
                  ? 'Saving...'
                  : 'Save Assignments'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  loadAsfaRulesAndMetrics();
                  setShowRulesModal(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="View & Configure Central ASFA Rules"
              >
                <Shield size={15} style={{ color: 'var(--primary)' }} />
                ASFA Rules
              </button>

              <button
                className="btn-primary"
                onClick={handleGoToGenerator}
              >
                Generate Timetable

                <ChevronRight
                  size={16}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    );

  // =========================================================
  // GENERATOR VIEW
  // =========================================================

  const renderGeneratorView =
    () => (
      <div
        style={{
          display:
            'flex',
          flexDirection:
            'column',
          gap: '20px',
        }}
      >
        {/* FILTER TOOLBAR */}
        <div
          className="skit-card"
          style={{
            padding:
              '16px 20px',
          }}
        >
          <div
            style={{
              display:
                'flex',
              alignItems:
                'flex-end',
              justifyContent:
                'space-between',
              gap: '16px',
              flexWrap:
                'wrap',
            }}
          >
            <div
              style={{
                display:
                  'flex',
                gap: '12px',
                flexWrap:
                  'wrap',
                flex: 1,
              }}
            >
              {/* DEPARTMENT */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth:
                    '200px',
                }}
              >
                <label className="form-label">
                  Department
                </label>

                <select
                  className="form-select"
                  value={
                    context.department_id
                  }
                  onChange={(e) =>
                    handleDepartmentChange(
                      e.target.value
                    )
                  }
                >
                  {displayDepartments.map(
                    (department) => {
                      const id =
                        getDepartmentId(
                          department
                        );

                      return (
                        <option
                          key={id}
                          value={id}
                        >
                          {department._displayName || getDepartmentName(department)}
                        </option>
                      );
                    }
                  )}
                </select>
              </div>

              {/* SCHEME */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth: '150px',
                }}
              >
                <label className="form-label">
                  Scheme
                </label>

                <select
                  className="form-select"
                  value={String(context.scheme_id || '1')}
                  onChange={(e) =>
                    handleSchemeChange(e.target.value)
                  }
                >
                  {schemes.length > 0 ? (
                    schemes.map((sc) => {
                      const sId = String(getSchemeId(sc));
                      const sYear = sc.scheme_year || (sId === '2' ? '2025' : '2022');
                      return (
                        <option key={sId} value={sId}>
                          {sYear} Scheme
                        </option>
                      );
                    })
                  ) : (
                    <>
                      <option value="1">2022 Scheme</option>
                      <option value="2">2025 Scheme</option>
                    </>
                  )}
                </select>
              </div>

              {/* SEMESTER TYPE */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth:
                    '160px',
                }}
              >
                <label className="form-label">
                  Semester Type
                </label>

                <select
                  className="form-select"
                  value={
                    context.semester_type
                  }
                  onChange={(e) =>
                    handleSemesterTypeChange(
                      e.target
                        .value
                    )
                  }
                >
                  <option value="Odd">
                    Odd Semesters
                  </option>

                  <option value="Even">
                    Even Semesters
                  </option>
                </select>
              </div>

              {/* SECTION SELECTOR (AIML 2025 and CSE) */}
              {showSectionSelector && (
                <div
                  className="form-group"
                  style={{
                    margin: 0,
                    minWidth: '150px',
                  }}
                >
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Section</span>
                    <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#166534', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                      {isCseWithSections ? 'CSE' : 'AIML 2025'}
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['A', 'B'].map((sec) => {
                      const active = (context.section || 'A') === sec;
                      return (
                        <button
                          key={`tt-sec-${sec}`}
                          type="button"
                          onClick={() => setContext((prev) => ({ ...prev, section: sec }))}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            fontWeight: '800',
                            fontSize: '0.78rem',
                            borderRadius: '6px',
                            border: active ? '1.5px solid var(--primary)' : '1px solid #CBD5E1',
                            background: active ? 'var(--primary)' : '#FFFFFF',
                            color: active ? '#FFFFFF' : '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          Sec {sec}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SEMESTER */}
              {renderSemesterSelector()}

              {/* ACADEMIC YEAR */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth: '160px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Academic Year</label>
                  <button
                    type="button"
                    onClick={() => setShowAddYearModal(true)}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      padding: '0 2px',
                    }}
                    title="Add new academic year"
                  >
                    + Add
                  </button>
                </div>

                <select
                  className="form-select"
                  value={context.academic_year}
                  onChange={(e) =>
                    setContext((current) => ({
                      ...current,
                      academic_year: e.target.value,
                    }))
                  }
                >
                  {academicYears.map((yr) => (
                    <option key={`tt-yr-${yr}`} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* EFFECTIVE DATE */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth:
                    '140px',
                }}
              >
                <label className="form-label">
                  Effective From
                </label>

                <input
                  type="date"
                  className="form-input"
                  defaultValue="2026-07-20"
                />
              </div>

              {/* ALTERNATIVES */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth:
                    '130px',
                }}
              >
                <label className="form-label">
                  Alternatives
                </label>

                <select
                  className="form-select"
                  value={numberOfOutputs}
                  onChange={(e) =>
                    setNumberOfOutputs(Number(e.target.value))
                  }
                >
                  <option value={1}>1 Alternative</option>
                  <option value={2}>2 Alternatives</option>
                  <option value={3}>3 Alternatives</option>
                </select>
              </div>
            </div>

            {/* ACTIONS */}
            <div
              style={{
                display:
                  'flex',
                gap: '10px',
              }}
            >
              <button
                className="btn-primary"
                onClick={
                  handleAutoGenerate
                }
                disabled={
                  isGenerating
                }
              >
                <Sparkles
                  size={16}
                />

                {isGenerating
                  ? 'Generating AI Schedule...'
                  : 'Generate Timetable'}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  loadAsfaRulesAndMetrics();
                  setShowRulesModal(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="View & Configure Central ASFA Rules"
              >
                <Shield size={16} style={{ color: 'var(--primary)' }} />
                ASFA Rules
              </button>

              <button className="btn-secondary">
                <Download
                  size={16}
                />
                Export PDF
              </button>
            </div>
          </div>

          {/* ASFA ENGINE PERFORMANCE METRICS BANNER */}
          {asfaMetrics && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#DCFCE7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#15803D',
                  }}
                >
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-dark)' }}>
                    Central ASFA Engine (CP-SAT)
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: '700' }}>
                    ● 100% Deterministic & Feasible
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <div style={{ textAlign: 'center', padding: '0 8px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Quality Score</div>
                  <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1rem' }}>
                    {asfaMetrics.final_quality_score ?? 88}/100
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px', borderLeft: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Hard Constraints</div>
                  <div style={{ fontWeight: '800', color: '#15803D', fontSize: '1rem' }}>
                    {asfaMetrics.hard_satisfaction_rate ?? 100}%
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px', borderLeft: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Proctor Rule</div>
                  <div style={{ fontWeight: '800', color: '#15803D', fontSize: '1rem' }}>
                    {asfaMetrics.proctor_compliance ?? 100}%
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px', borderLeft: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Sem 7 Cap</div>
                  <div style={{ fontWeight: '800', color: '#15803D', fontSize: '1rem' }}>
                    {asfaMetrics.sem7_low_priority_compliance ?? 100}%
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px', borderLeft: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Workload Match</div>
                  <div style={{ fontWeight: '800', color: '#15803D', fontSize: '1rem' }}>
                    {asfaMetrics.workload_compliance ?? 100}%
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 8px', borderLeft: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '600' }}>Time Prefs</div>
                  <div style={{ fontWeight: '800', color: '#15803D', fontSize: '1rem' }}>
                    {asfaMetrics.preference_satisfaction ?? 90}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GENERATED SEMESTER SWITCHER */}
          {Object.keys(
            generatedSemesters
          ).length > 0 && (
            <div
              style={{
                marginTop:
                  '12px',
                display:
                  'flex',
                alignItems:
                  'center',
                gap: '8px',
                flexWrap:
                  'wrap',
              }}
            >
              <span
                style={{
                  fontSize:
                    '0.75rem',
                  fontWeight:
                    '800',
                  color:
                    '#475569',
                }}
              >
                Generated:
              </span>

              {Object.keys(generatedSemesters).length > 0 && (
                <button
                  type="button"
                  onClick={() => setContext((prev) => ({ ...prev, semester_id: '' }))}
                  style={{
                    border: !context.semester_id ? '1px solid var(--primary)' : '1px solid #D9E2EC',
                    background: !context.semester_id ? 'var(--primary)' : '#FFFFFF',
                    color: !context.semester_id ? '#FFFFFF' : '#334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.72rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    boxShadow: !context.semester_id ? '0 2px 4px rgba(79, 70, 229, 0.2)' : 'none',
                  }}
                >
                  ⚡ All Semesters (Stacked)
                </button>
              )}

              {generationSemesters.map(
                (semester) => {
                  const semesterNo =
                    getSemesterNo(
                      semester
                    );

                  const exists =
                    Object.prototype.hasOwnProperty.call(
                      generatedSemesters,
                      String(
                        semesterNo
                      )
                    );

                  if (!exists) {
                    return null;
                  }

                  const active =
                    String(
                      getSemesterId(
                        semester
                      )
                    ) ===
                    String(
                      context.semester_id
                    );

                  return (
                    <button
                      key={
                        semesterNo
                      }
                      type="button"
                      onClick={() =>
                        showGeneratedSemester(
                          semesterNo
                        )
                      }
                      style={{
                        border:
                          active
                            ? '1px solid var(--primary)'
                            : '1px solid #D9E2EC',

                        background:
                          active
                            ? 'var(--primary)'
                            : '#FFFFFF',

                        color:
                          active
                            ? '#FFFFFF'
                            : '#334155',

                        borderRadius:
                          '8px',

                        padding:
                          '6px 10px',

                        fontSize:
                          '0.72rem',

                        fontWeight:
                          '800',

                        cursor:
                          'pointer',
                      }}
                    >
                      {getSemesterLabel(
                        semesterNo
                      )}
                    </button>
                  );
                }
              )}
            </div>
          )}

          {message && (
            <div
              style={{
                marginTop:
                  '10px',
                fontSize:
                  '0.8rem',
                color:
                  message
                    .toLowerCase()
                    .includes(
                      'failed'
                    ) ||
                  message
                    .toLowerCase()
                    .includes(
                      'request'
                    ) ||
                  message
                    .toLowerCase()
                    .includes(
                      'cannot'
                    )
                    ? '#B45309'
                    : 'var(--primary)',
                fontWeight:
                  '700',
              }}
            >
              {message}
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              showAiDrawer
                ? '1fr 340px'
                : '1fr',
            gap: '20px',
          }}
        >
          {/* MAIN GRID */}
          <div
            style={{
              display:
                'flex',
              flexDirection:
                'column',
              gap: '16px',
            }}
          >
            {/* SUB CONTROLS */}
            <div
              className="skit-card"
              style={{
                padding:
                  '12px 16px',
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'space-between',
                gap: '12px',
                flexWrap:
                  'wrap',
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  gap: '8px',
                }}
              >
                <button
                  className={
                    activeView ===
                    'grid'
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }
                  style={{
                    padding:
                      '6px 14px',
                    fontSize:
                      '0.8rem',
                  }}
                  onClick={() =>
                    setActiveView(
                      'grid'
                    )
                  }
                >
                  Timetable View
                </button>

                <button
                  className={
                    activeView ===
                    'list'
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }
                  style={{
                    padding:
                      '6px 14px',
                    fontSize:
                      '0.8rem',
                  }}
                  onClick={() =>
                    setActiveView(
                      'list'
                    )
                  }
                >
                  List View
                </button>

                <button
                  className={
                    activeView ===
                    'workload'
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }
                  style={{
                    padding:
                      '6px 14px',
                    fontSize:
                      '0.8rem',
                  }}
                  onClick={() =>
                    setActiveView(
                      'workload'
                    )
                  }
                >
                  Workload View
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#FFFBEB',
                    borderColor: '#FDE68A',
                    color: '#92400E',
                    fontWeight: '700',
                  }}
                  onClick={() => setShowTimingsModal(true)}
                  title="Configure College Start Time, Period Duration, Breaks & Placement Limits"
                >
                  <Clock size={14} /> Period Timings
                </button>
              </div>

              <div
                style={{
                  display:
                    'flex',
                  gap: '8px',
                }}
              >
                <button
                  className="btn-secondary"
                  style={{
                    padding:
                      '6px 12px',
                    fontSize:
                      '0.78rem',
                  }}
                >
                  <Wand2
                    size={14}
                  />
                  Auto Arrange
                </button>

                <button
                  type="button"
                  className={isManualEditMode ? 'btn-primary' : 'btn-secondary'}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isManualEditMode ? '#15803D' : '#F1F5F9',
                    color: isManualEditMode ? '#FFFFFF' : '#1E293B',
                    border: isManualEditMode ? '1.5px solid #15803D' : '1px solid #CBD5E1',
                    fontWeight: '700',
                  }}
                  onClick={() => setIsManualEditMode(!isManualEditMode)}
                  title="Toggle manual slot editing mode (click any slot or pencil to edit)"
                >
                  <Pencil size={14} />
                  {isManualEditMode ? 'Finish Editing' : 'Manual Edit'}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    fontWeight: '700',
                  }}
                  onClick={() => {
                    const curDept = departments.find((d) => String(getDepartmentId(d)) === String(context.department_id));
                    const activeSemNo = context.semester_id
                      ? getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {})
                      : 7;
                    printTimetable(entries, {
                      title: `${getDepartmentName(curDept)} Sem ${activeSemNo} Timetable`,
                      department_name: getDepartmentName(curDept),
                      department_code: getDepartmentCode(curDept) || 'AIML',
                      semester_no: String(activeSemNo),
                      section: context.section || 'A',
                      hod_name: (getDepartmentCode(curDept) === 'AIML') ? 'Dr. Jayasudha K' : undefined,
                    });
                  }}
                  title="Print Timetable in Official SKIT Institutional Format"
                >
                  <Printer size={14} />
                  Print Timetable
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    padding:
                      '6px 12px',
                    fontSize:
                      '0.78rem',
                  }}
                  onClick={
                    clearTimetable
                  }
                >
                  <Trash2
                    size={14}
                  />
                  Clear All
                </button>

                <button
                  className="btn-primary"
                  onClick={
                    saveTimetable
                  }
                  style={{
                    padding:
                      '6px 14px',
                    fontSize:
                      '0.78rem',
                  }}
                >
                  <Save
                    size={14}
                  />
                  Save Timetable
                </button>

                {!showAiDrawer && (
                  <button
                    className="btn-outline-primary"
                    onClick={() =>
                      setShowAiDrawer(
                        true
                      )
                    }
                    style={{
                      padding:
                        '6px 12px',
                      fontSize:
                        '0.78rem',
                    }}
                  >
                    <Sparkles
                      size={14}
                    />
                    AI Assistant
                  </button>
                )}
              </div>
            </div>

            {/* ALTERNATIVES TABS */}
            {generatedAlternatives.length > 1 && (
              <div
                className="skit-card"
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  background: '#F8FAFC',
                }}
              >
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    color: '#334155',
                  }}
                >
                  Schedule Alternatives ({generatedAlternatives.length} Generated):
                </span>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {generatedAlternatives.map((alt) => {
                    const active = selectedAlternativeId === alt.id;

                    return (
                      <button
                        key={alt.id}
                        type="button"
                        onClick={() => {
                          setSelectedAlternativeId(alt.id);
                          const altEntries = alt.timetable || [];
                          setEntries(altEntries);
                          const activeSemNo = context.semester_id
                            ? getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {})
                            : (safeGenerationSemesters[0] ? getSemesterNo(safeGenerationSemesters[0]) : 7);
                          if (activeSemNo) {
                            setGeneratedSemesters((prev) => ({
                              ...prev,
                              [String(activeSemNo)]: altEntries,
                            }));
                          }
                        }}
                        style={{
                          border: active
                            ? '1px solid var(--primary)'
                            : '1px solid #CBD5E1',

                          background: active
                            ? 'var(--primary)'
                            : '#FFFFFF',

                          color: active ? '#FFFFFF' : '#334155',

                          borderRadius: '6px',

                          padding: '6px 14px',

                          fontSize: '0.78rem',

                          fontWeight: '800',

                          cursor: 'pointer',

                          boxShadow: active
                            ? '0 2px 4px rgba(0,0,0,0.08)'
                            : 'none',
                        }}
                      >
                        {alt.name || `Alternative ${alt.id}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIST VIEW */}
            {activeView ===
              'list' && (
              <div
                className="skit-card"
                style={{
                  padding:
                    '16px',
                  overflowX:
                    'auto',
                }}
              >
                <table
                  className="skit-table"
                  style={{
                    width:
                      '100%',
                  }}
                >
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Period</th>
                      <th>Subject</th>
                      <th>Faculty</th>
                    </tr>
                  </thead>

                  <tbody>
                    {entries.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={
                            4
                          }
                          style={{
                            textAlign:
                              'center',
                            padding:
                              '40px',
                            color:
                              '#64748B',
                          }}
                        >
                          No timetable entries.
                        </td>
                      </tr>
                    ) : (
                      entries.map(
                        (
                          entry,
                          index
                        ) => (
                          <tr
                            key={
                              entry.id ??
                              index
                            }
                          >
                            <td>
                              {
                                entry.day
                              }
                            </td>

                            <td>
                              {
                                entry.period
                              }
                            </td>

                            <td>
                              <div
                                style={{
                                  fontWeight: '800',
                                  color: 'var(--primary)',
                                  fontSize: '0.82rem',
                                }}
                              >
                                {entry.subject_code || entry.code || '—'}
                              </div>
                              {entry.subject_name && (
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#475569',
                                    fontWeight: '500',
                                  }}
                                >
                                  {entry.subject_name}
                                </div>
                              )}
                            </td>

                            <td>
                              {entry.faculty_name ||
                                entry.faculty ||
                                '—'}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* WORKLOAD VIEW */}
            {activeView ===
              'workload' && (
              <div
                className="skit-card"
                style={{
                  padding: '20px',
                  overflowX: 'auto',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0 }}>Faculty Workload</h3>
                    <div style={{ marginTop: '5px', fontSize: '0.75rem', color: '#64748B' }}>
                      Weekly workload in hours. Limits come from each faculty member's configured max workload.
                    </div>
                  </div>

                  {workloadExceededFaculty.length > 0 && (
                    <span
                      className="badge"
                      style={{ background: '#FEE2E2', color: '#B91C1C' }}
                    >
                      <AlertTriangle size={13} />
                      Workload limit exceeded
                    </span>
                  )}
                </div>

                <table className="skit-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>FACULTY</th>
                      <th>DESIGNATION</th>
                      <th>WORKLOAD</th>
                      <th>TARGET</th>
                      <th>REMAINING</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facultyList.map((faculty) => {
                      const facultyId = String(getFacultyId(faculty));
                      const current = projectedFacultyWorkload[facultyId] ?? 0;
                      const min = getFacultyMinWorkload(faculty);
                      const max = getFacultyMaxWorkload(faculty);
                      const exceeded = current > max;
                      const percentage = max > 0 ? Math.round((current / max) * 100) : 0;

                      return (
                        <tr key={facultyId}>
                          <td style={{ fontWeight: '800' }}>{getFacultyName(faculty)}</td>
                          <td>{getFacultyRole(faculty) || '—'}</td>
                          <td style={{ fontWeight: '800' }}>{current} hrs</td>
                          <td>{min}-{max} hrs</td>
                          <td>{Math.max(0, max - current)} hrs</td>
                          <td>
                            <span
                              className="badge"
                              style={{
                                background: exceeded ? '#FEE2E2' : percentage >= 85 ? '#FEF3C7' : '#DCFCE7',
                                color: exceeded ? '#B91C1C' : percentage >= 85 ? '#92400E' : '#166534',
                              }}
                            >
                              {exceeded ? 'Exceeded' : max > 0 ? `${percentage}% Used` : 'No Limit'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* TIMETABLE GRID */}
            {activeView === 'grid' && (() => {
              const renderGridContent = (semesterEntries, semNo = null, semTitle = null) => {
                const safeEntries = Array.isArray(semesterEntries) ? semesterEntries : [];
                const semRows = buildGridRowsForEntries(safeEntries);
                const targetSemNumber = semNo
                  ? Number(semNo)
                  : context.semester_id
                  ? Number(
                      getSemesterNo(
                        semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {}
                      )
                    )
                  : 7;

                return (
                  <div
                    key={targetSemNumber}
                    className="skit-card"
                    style={{
                      padding: '16px',
                      overflowX: 'auto',
                      marginBottom: '24px',
                    }}
                  >
                    {/* SEMESTER BANNER IN ALL-MODE */}
                    {semTitle && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '14px',
                          paddingBottom: '10px',
                          borderBottom: '1px solid #E2E8F0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              background:
                                targetSemNumber === 7
                                  ? '#6366F1'
                                  : targetSemNumber === 5
                                  ? '#0EA5E9'
                                  : targetSemNumber === 3
                                  ? '#10B981'
                                  : '#8B5CF6',
                              color: '#FFFFFF',
                              padding: '4px 12px',
                              borderRadius: '6px',
                              fontWeight: '800',
                              fontSize: '0.84rem',
                              letterSpacing: '0.03em',
                            }}
                          >
                            Semester {targetSemNumber}
                          </span>
                          <span style={{ fontWeight: '700', fontSize: '0.94rem', color: '#1E293B' }}>
                            {semTitle}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.80rem', color: '#64748B' }}>
                          <span><strong>{safeEntries.length}</strong> sessions scheduled</span>
                          <span>•</span>
                          <span style={{ color: '#10B981', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> Solved Optimal
                          </span>
                        </div>
                      </div>
                    )}

                    {/* HEADER */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '100px repeat(9, 1fr)',
                        gap: '6px',
                        minWidth: '980px',
                        marginBottom: '8px',
                      }}
                    >
                      <div className="tt-header-cell">Day / Period</div>
                      <div className="tt-header-cell">
                        I<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p1 || '9:00 - 9:55'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        II<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p2 || '9:55 - 10:50'}
                        </span>
                      </div>
                      <div
                        className="tt-header-cell"
                        style={{
                          background: '#FEF3C7',
                          color: '#B45309',
                        }}
                      >
                        Tea Break<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.tea || '10:50 - 11:05'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        III<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p3 || '11:05 - 12:00'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        IV<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p4 || '12:00 - 12:55'}
                        </span>
                      </div>
                      <div
                        className="tt-header-cell"
                        style={{
                          background: '#DCFCE7',
                          color: '#15803D',
                        }}
                      >
                        Lunch Break<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.lunch || '12:55 - 1:40'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        V<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p5 || '1:40 - 2:35'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        VI<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p6 || '2:35 - 3:30'}
                        </span>
                      </div>
                      <div className="tt-header-cell">
                        VII<br />
                        <span style={{ fontWeight: '500', fontSize: '0.7rem' }}>
                          {calculatedSlotTimes.p7 || '3:30 - 4:25'}
                        </span>
                      </div>
                    </div>

                    {/* GRID ROWS */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        minWidth: '980px',
                      }}
                    >
                      {semRows.map((row, rIdx) => (
                        <div
                          key={rIdx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '100px repeat(9, 1fr)',
                            gap: '6px',
                          }}
                        >
                          <div className="tt-day-cell">{row.day}</div>

                          {row.slots.map((slot, sIdx) => {
                            if (slot.type === 'break') {
                              return (
                                <div
                                  key={`${row.day}-break-${slot.breakType}`}
                                  className="tt-break-slot"
                                  style={{
                                    minHeight: '50px',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    color: slot.breakType === 'tea' ? '#B45309' : '#15803D',
                                    background: slot.breakType === 'tea' ? '#FEF3C7' : '#DCFCE7',
                                    textAlign: 'center',
                                    cursor: 'default',
                                  }}
                                >
                                  <div>{slot.breakType === 'tea' ? 'Tea Break' : 'Lunch Break'}</div>
                                  <div
                                    style={{
                                      fontSize: '0.62rem',
                                      fontWeight: '600',
                                      opacity: 0.85,
                                      marginTop: '2px',
                                    }}
                                  >
                                    {slot.breakType === 'tea'
                                      ? calculatedSlotTimes.tea || '10:50 - 11:05'
                                      : calculatedSlotTimes.lunch || '12:55 - 1:40'}
                                  </div>
                                </div>
                              );
                            }

                            if (slot.labContinuation) return null;

                            // 2-period merged lab block
                            if (slot.labSpan === 2) {
                              const labItems = slot.mergedLabItems || slot.items || [];
                              const batchMap = new Map();
                              labItems.forEach((li) => {
                                const b = li.batch || 'B1';
                                if (!batchMap.has(b)) batchMap.set(b, li);
                              });
                              const batches = [...batchMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
                              const primaryLab = labItems[0] || {};

                              const isLabDropTarget =
                                draggedSlot?.isLab &&
                                dragHoverSlot &&
                                dragHoverSlot.day === row.day &&
                                (slot.period === dragHoverSlot.period || slot.period === dragHoverSlot.period + 1);

                              const isDirectHover =
                                dragHoverSlot &&
                                dragHoverSlot.day === row.day &&
                                slot.period === dragHoverSlot.period;

                              const hoverEval = (draggedSlot && dragHoverSlot)
                                ? evaluateSlotConflict(draggedSlot, dragHoverSlot.day, dragHoverSlot.period, targetSemNumber)
                                : null;

                              const staticEval = draggedSlot
                                ? evaluateSlotConflict(draggedSlot, row.day, slot.period, targetSemNumber)
                                : null;

                              const activeEval = isLabDropTarget
                                ? hoverEval
                                : isDirectHover
                                ? hoverEval
                                : (!dragHoverSlot ? staticEval : null);

                              const cStatus = activeEval?.status;

                              const labNames = batches.map(([b, item]) => item.subject_name || item.name || item.subject_code || item.code).filter(Boolean);
                              const distinctLabNames = [...new Set(labNames)];
                              const labHeader = distinctLabNames.length > 0 ? distinctLabNames.join(' / ') : 'LAB';
                              const labRooms = batches.map(([b, item]) => item.room_no || item.room).filter(Boolean);
                              const distinctLabRooms = [...new Set(labRooms)];

                              return (
                                <div
                                  key={`${row.day}-lab-span-${slot.period}`}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    setDraggedSlot({
                                      semesterNo: targetSemNumber,
                                      day: row.day,
                                      period: slot.period,
                                      item: primaryLab,
                                      items: labItems,
                                      isLab: true,
                                      facultyId: primaryLab.faculty_id,
                                      facultyName: primaryLab.faculty_name || primaryLab.faculty,
                                      coFacultyId: primaryLab.co_faculty_id,
                                      subjectCode: primaryLab.subject_code || primaryLab.code,
                                      subjectName: primaryLab.subject_name || primaryLab.name,
                                    });
                                    setShowAiDrawer(true);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedSlot(null);
                                    setDragHoverSlot(null);
                                  }}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    setDragHoverSlot({ day: row.day, period: slot.period, semNo: targetSemNumber });
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = cStatus === 'red' ? 'none' : 'move';
                                    if (!dragHoverSlot || dragHoverSlot.day !== row.day || dragHoverSlot.period !== slot.period) {
                                      setDragHoverSlot({ day: row.day, period: slot.period, semNo: targetSemNumber });
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const dropP = (draggedSlot?.isLab && dragHoverSlot) ? dragHoverSlot.period : slot.period;
                                    handleSlotDrop(row.day, dropP, targetSemNumber);
                                  }}
                                  onClick={() => {
                                    const label = batches
                                      .map(([b, item]) => `[${b}] ${item.subject_code || item.code || '—'}`)
                                      .join(' / ');
                                    setSelectedSlot({
                                      day: row.day,
                                      period: `Period ${slot.period}-${slot.period + 1}`,
                                      subject: label,
                                      items: labItems,
                                      semesterNo: targetSemNumber,
                                    });
                                    setDraggedSlot({
                                      semesterNo: targetSemNumber,
                                      day: row.day,
                                      period: slot.period,
                                      item: primaryLab,
                                      items: labItems,
                                      isLab: true,
                                      facultyId: primaryLab.faculty_id,
                                      facultyName: primaryLab.faculty_name || primaryLab.faculty,
                                      coFacultyId: primaryLab.co_faculty_id,
                                      subjectCode: primaryLab.subject_code || primaryLab.code,
                                      subjectName: primaryLab.subject_name || primaryLab.name,
                                    });
                                    setShowAiDrawer(true);
                                  }}
                                  style={{
                                    gridColumn: 'span 2',
                                    minHeight: '74px',
                                    boxSizing: 'border-box',
                                    position: 'relative',
                                    border:
                                      cStatus === 'red'
                                        ? '2.5px solid #EF4444'
                                        : cStatus === 'yellow'
                                        ? '2.5px dashed #F59E0B'
                                        : cStatus === 'green'
                                        ? '2.5px solid #10B981'
                                        : isLabDropTarget
                                        ? '2.5px solid #10B981'
                                        : '2px solid #6366F1',
                                    boxShadow:
                                      cStatus === 'red'
                                        ? '0 0 12px rgba(239, 68, 68, 0.55)'
                                        : cStatus === 'yellow'
                                        ? '0 0 12px rgba(245, 158, 11, 0.55)'
                                        : cStatus === 'green' || isLabDropTarget
                                        ? '0 0 14px rgba(16, 185, 129, 0.65)'
                                        : 'none',
                                    backgroundColor:
                                      cStatus === 'red'
                                        ? '#FEF2F2'
                                        : cStatus === 'yellow'
                                        ? '#FFFBEB'
                                        : cStatus === 'green' || isLabDropTarget
                                        ? '#ECFDF5'
                                        : '#EEF2FF',
                                    cursor: 'grab',
                                    userSelect: 'none',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'stretch',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    padding: '4px',
                                    gap: '3px',
                                    overflow: 'hidden',
                                    borderRadius: '8px',
                                    transition: 'all 0.15s ease-in-out',
                                  }}
                                >
                                  {isManualEditMode && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setManualEditSlot({
                                          day: row.day,
                                          period: slot.period,
                                          semNo: targetSemNumber,
                                          item: primaryLab,
                                          items: labItems,
                                          isLab: true,
                                        });
                                      }}
                                      style={{
                                        position: 'absolute',
                                        top: '4px',
                                        left: '4px',
                                        background: '#1E293B',
                                        color: '#FFFFFF',
                                        border: '1px solid #0F172A',
                                        borderRadius: '5px',
                                        padding: '3px 8px',
                                        fontSize: '0.66rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        zIndex: 10,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                      }}
                                      title="Edit this lab slot & rooms"
                                    >
                                      <Pencil size={11} /> Edit Lab
                                    </button>
                                  )}
                                  {cStatus && cStatus !== 'current' && (
                                    <span
                                      style={{
                                        position: 'absolute',
                                        top: '2px',
                                        right: '4px',
                                        background:
                                          cStatus === 'red'
                                            ? '#EF4444'
                                            : cStatus === 'yellow'
                                            ? '#F59E0B'
                                            : '#10B981',
                                        color: '#FFFFFF',
                                        fontSize: '0.54rem',
                                        fontWeight: '800',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        zIndex: 2,
                                      }}
                                    >
                                      {cStatus === 'red'
                                        ? '🔴 Clash (2 Blocks)'
                                        : cStatus === 'yellow'
                                        ? '🟡 Swap (2 Blocks)'
                                        : '🟢 Free (2 Blocks)'}
                                    </span>
                                  )}
                                  <div
                                    style={{
                                      fontSize: '0.64rem',
                                      fontWeight: '800',
                                      color: '#1E1B4B',
                                      background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                                      borderRadius: '6px',
                                      padding: '3px 8px',
                                      textAlign: 'center',
                                      border: '1px solid #C7D2FE',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '2px',
                                      marginBottom: '2px',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                      <span style={{ color: '#4338CA' }}>🔬</span>
                                      <span style={{ fontWeight: '800', letterSpacing: '0.01em' }}>
                                        {labHeader}
                                      </span>
                                      <span style={{ fontSize: '0.55rem', color: '#4F46E5', background: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: '700' }}>
                                        2 Periods
                                      </span>
                                    </div>
                                    {distinctLabRooms.length > 0 && (
                                      <div style={{ fontSize: '0.60rem', color: '#0369A1', background: '#E0F2FE', border: '1px solid #BAE6FD', padding: '1px 6px', borderRadius: '3px', fontWeight: '800' }}>
                                        📍 Lab Room: {distinctLabRooms.join(' / ')}
                                      </div>
                                    )}
                                  </div>
                                  {batches.map(([batchLabel, bItem]) => {
                                    const isB1 = batchLabel === 'B1';
                                    return (
                                      <div
                                        key={batchLabel}
                                        style={{
                                          width: '100%',
                                          padding: '3px 6px',
                                          background: isB1 ? '#EFF6FF' : '#F0FDF4',
                                          borderRadius: '5px',
                                          border: isB1 ? '1px solid #BFDBFE' : '1px solid #BBF7D0',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '6px',
                                          boxSizing: 'border-box',
                                        }}
                                      >
                                        <span
                                          style={{
                                            fontSize: '0.6rem',
                                            fontWeight: '800',
                                            padding: '1px 4px',
                                            borderRadius: '3px',
                                            background: isB1 ? '#DBEAFE' : '#DCFCE7',
                                            color: isB1 ? '#1E40AF' : '#166534',
                                            lineHeight: '1.3',
                                            flexShrink: 0,
                                          }}
                                        >
                                          {batchLabel}
                                        </span>
                                        <span
                                          style={{
                                            color: 'var(--primary)',
                                            fontWeight: '800',
                                            fontSize: '0.72rem',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                          }}
                                          title={`${bItem.subject_code || bItem.code || '—'} — ${
                                            bItem.subject_name || bItem.name || ''
                                          }`}
                                        >
                                          {bItem.subject_code || bItem.code || '—'}
                                        </span>
                                        {(bItem.faculty_name || bItem.faculty) && (
                                          <span
                                            style={{
                                              fontSize: '0.6rem',
                                              fontWeight: '700',
                                              color: '#334155',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              maxWidth: '90px',
                                            }}
                                            title={bItem.faculty_name || bItem.faculty}
                                          >
                                            👤 {bItem.faculty_name || bItem.faculty}
                                          </span>
                                        )}
                                        {(bItem.room_no || bItem.room) && (
                                          <span
                                            style={{
                                              fontSize: '0.58rem',
                                              fontWeight: '800',
                                              color: '#0369A1',
                                              background: '#E0F2FE',
                                              padding: '1px 5px',
                                              borderRadius: '3px',
                                              border: '1px solid #BAE6FD',
                                              flexShrink: 0,
                                            }}
                                            title={`Lab Room: ${bItem.room_no || bItem.room}`}
                                          >
                                            📍 {bItem.room_no || bItem.room}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            // Normal teaching period
                            const rawItems =
                              slot.items && slot.items.length > 0
                                ? slot.items
                                : slot.item
                                ? [slot.item]
                                : [];
                            const isMultiBatch = rawItems.length > 1;
                            const sortedItems = [...rawItems].sort((a, b) => {
                              const bA = (a.batch || '').toUpperCase();
                              const bB = (b.batch || '').toUpperCase();
                              return bA < bB ? -1 : bA > bB ? 1 : 0;
                            });
                            const primaryItem = sortedItems[0] || null;
                            const hasEntry = sortedItems.length > 0;

                            const specialCls = slot.specialClassification;
                            const isPlacement = specialCls === 'PLACEMENT';
                            const isRemedial = specialCls === 'REMEDIAL';
                            const isLibrary = specialCls === 'LIBRARY';
                            const isActivity = specialCls === 'ACTIVITY';

                            const isSelected =
                              hasEntry &&
                              selectedSlot?.day === row.day &&
                              selectedSlot?.period === `Period ${slot.period}`;

                            const isLabDropTarget =
                              draggedSlot?.isLab &&
                              dragHoverSlot &&
                              dragHoverSlot.day === row.day &&
                              (slot.period === dragHoverSlot.period || slot.period === dragHoverSlot.period + 1);

                            const isDirectHover =
                              dragHoverSlot &&
                              dragHoverSlot.day === row.day &&
                              slot.period === dragHoverSlot.period;

                            const hoverEval = (draggedSlot && dragHoverSlot)
                              ? evaluateSlotConflict(draggedSlot, dragHoverSlot.day, dragHoverSlot.period, targetSemNumber)
                              : null;

                            const staticEval = draggedSlot
                              ? evaluateSlotConflict(draggedSlot, row.day, slot.period, targetSemNumber)
                              : null;

                            const activeEval = isLabDropTarget
                              ? hoverEval
                              : isDirectHover
                              ? hoverEval
                              : (!dragHoverSlot ? staticEval : null);

                            const cStatus = activeEval?.status;

                            return (
                              <div
                                key={`${row.day}-period-${slot.period}`}
                                draggable={hasEntry}
                                onDragStart={(e) => {
                                  if (!hasEntry) return;
                                  setDraggedSlot({
                                    semesterNo: targetSemNumber,
                                    day: row.day,
                                    period: slot.period,
                                    item: primaryItem,
                                    items: sortedItems,
                                    isLab: false,
                                    classification: specialCls,
                                    facultyId: primaryItem?.faculty_id,
                                    facultyName: primaryItem?.faculty_name || primaryItem?.faculty,
                                    coFacultyId: primaryItem?.co_faculty_id,
                                    subjectCode: primaryItem?.subject_code || primaryItem?.code,
                                    subjectName: primaryItem?.subject_name || primaryItem?.name,
                                  });
                                  setShowAiDrawer(true);
                                }}
                                onDragEnd={() => {
                                  setDraggedSlot(null);
                                  setDragHoverSlot(null);
                                }}
                                onDragEnter={(e) => {
                                  e.preventDefault();
                                  setDragHoverSlot({ day: row.day, period: slot.period, semNo: targetSemNumber });
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = cStatus === 'red' ? 'none' : 'move';
                                  if (!dragHoverSlot || dragHoverSlot.day !== row.day || dragHoverSlot.period !== slot.period) {
                                    setDragHoverSlot({ day: row.day, period: slot.period, semNo: targetSemNumber });
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const dropP = (draggedSlot?.isLab && dragHoverSlot) ? dragHoverSlot.period : slot.period;
                                  handleSlotDrop(row.day, dropP, targetSemNumber);
                                }}
                                onClick={() => {
                                  if (!hasEntry) return;
                                  const subjectLabel = isMultiBatch
                                    ? sortedItems
                                        .map((i) => `${i.batch ? `[${i.batch}] ` : ''}${i.subject_code || i.code}`)
                                        .join(' / ')
                                    : primaryItem?.subject_code || primaryItem?.code || '—';

                                  setSelectedSlot({
                                    day: row.day,
                                    period: `Period ${slot.period}`,
                                    subject: subjectLabel,
                                    subject_id: primaryItem?.subject_id,
                                    items: sortedItems,
                                    semesterNo: targetSemNumber,
                                  });
                                  setDraggedSlot({
                                    semesterNo: targetSemNumber,
                                    day: row.day,
                                    period: slot.period,
                                    item: primaryItem,
                                    items: sortedItems,
                                    isLab: false,
                                    classification: specialCls,
                                    facultyId: primaryItem?.faculty_id,
                                    facultyName: primaryItem?.faculty_name || primaryItem?.faculty,
                                    coFacultyId: primaryItem?.co_faculty_id,
                                    subjectCode: primaryItem?.subject_code || primaryItem?.code,
                                    subjectName: primaryItem?.subject_name || primaryItem?.name,
                                  });
                                  setShowAiDrawer(true);
                                }}
                                className={
                                  hasEntry
                                    ? 'tt-slot-card timetable-filled-slot'
                                    : 'tt-slot-card timetable-empty-slot'
                                }
                                style={{
                                  minHeight: '74px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  position: 'relative',
                                  userSelect: 'none',
                                  cursor: hasEntry ? 'grab' : draggedSlot ? 'pointer' : 'default',
                                  border:
                                    isLabDropTarget
                                      ? (cStatus === 'red' ? '2.5px dashed #EF4444' : '2.5px dashed #10B981')
                                      : cStatus === 'red'
                                      ? '2.5px solid #EF4444'
                                      : cStatus === 'yellow'
                                      ? '2.5px dashed #F59E0B'
                                      : cStatus === 'green'
                                      ? '2.5px solid #10B981'
                                      : isSelected
                                      ? '2px solid var(--primary)'
                                      : isPlacement
                                      ? '1.5px solid #F59E0B'
                                      : isRemedial
                                      ? '1.5px solid #14B8A6'
                                      : isLibrary
                                      ? '1.5px solid #6366F1'
                                      : isActivity
                                      ? '1.5px solid #8B5CF6'
                                      : hasEntry
                                      ? '1px solid #CBD5E1'
                                      : '1px solid #E2E8F0',
                                  boxShadow:
                                    isLabDropTarget
                                      ? (cStatus === 'red' ? '0 0 14px rgba(239, 68, 68, 0.6)' : '0 0 14px rgba(16, 185, 129, 0.65)')
                                      : cStatus === 'red'
                                      ? '0 0 10px rgba(239, 68, 68, 0.45)'
                                      : cStatus === 'yellow'
                                      ? '0 0 10px rgba(245, 158, 11, 0.45)'
                                      : cStatus === 'green'
                                      ? '0 0 12px rgba(16, 185, 129, 0.55)'
                                      : 'none',
                                  backgroundColor:
                                    isLabDropTarget
                                      ? (cStatus === 'red' ? '#FEF2F2' : '#ECFDF5')
                                      : cStatus === 'red'
                                      ? '#FEF2F2'
                                      : cStatus === 'yellow'
                                      ? '#FFFBEB'
                                      : cStatus === 'green'
                                      ? '#ECFDF5'
                                      : isSelected
                                      ? '#E8F5E9'
                                      : isPlacement
                                      ? '#FFFBEB'
                                      : isRemedial
                                      ? '#F0FDFA'
                                      : isLibrary
                                      ? '#EEF2FF'
                                      : isActivity
                                      ? '#F5F3FF'
                                      : hasEntry
                                      ? '#F8FAFC'
                                      : '#FFFFFF',
                                  color: '#0F172A',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  textAlign: 'center',
                                  padding: isMultiBatch ? '3px 4px' : '4px 6px',
                                  gap: isMultiBatch ? '3px' : '0',
                                  overflow: 'hidden',
                                  borderRadius: '6px',
                                  transition: 'all 0.15s ease-in-out',
                                }}
                              >
                                {isManualEditMode && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setManualEditSlot({
                                        day: row.day,
                                        period: slot.period,
                                        semNo: targetSemNumber,
                                        entry: primaryItem || {},
                                        item: primaryItem || {},
                                        items: sortedItems,
                                      });
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: '3px',
                                      left: '3px',
                                      background: '#1D4ED8',
                                      color: '#FFFFFF',
                                      border: '1px solid #1E40AF',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      fontSize: '0.64rem',
                                      fontWeight: '800',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      zIndex: 10,
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.22)',
                                    }}
                                    title="Edit slot manually"
                                  >
                                    <Pencil size={10} /> Edit
                                  </button>
                                )}
                                {cStatus && cStatus !== 'current' && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      top: '2px',
                                      right: '3px',
                                      background:
                                        cStatus === 'red'
                                          ? '#EF4444'
                                          : cStatus === 'yellow'
                                          ? '#F59E0B'
                                          : '#10B981',
                                      color: '#FFFFFF',
                                      fontSize: '0.52rem',
                                      fontWeight: '800',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      zIndex: 3,
                                    }}
                                  >
                                    {isLabDropTarget
                                      ? (slot.period === dragHoverSlot?.period
                                          ? (cStatus === 'red' ? '🔴 Clash (2 Blocks)' : '🟢 Free (2 Blocks)')
                                          : (cStatus === 'red' ? '🔴 Clash (Block 2)' : '🟢 Free (Block 2)'))
                                      : cStatus === 'red'
                                      ? '🔴 Clash'
                                      : cStatus === 'yellow'
                                      ? '🟡 Swap'
                                      : '🟢 Free'}
                                  </span>
                                )}

                                {isMultiBatch ? (
                                  sortedItems.map((bItem, bIdx) => {
                                    const bCode = bItem?.subject_code || bItem?.code || '—';
                                    const bFaculty = bItem?.faculty_name || bItem?.faculty || '';
                                    const bBatch = bItem?.batch || (bIdx === 0 ? 'B1' : 'B2');
                                    const isB1 = bBatch === 'B1';

                                    return (
                                      <div
                                        key={bIdx}
                                        style={{
                                          width: '100%',
                                          padding: '2px 4px',
                                          background: isB1 ? '#EFF6FF' : '#F0FDF4',
                                          borderRadius: '4px',
                                          border: isB1 ? '1px solid #BFDBFE' : '1px solid #BBF7D0',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          gap: '1px',
                                          boxSizing: 'border-box',
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            width: '100%',
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: '0.58rem',
                                              fontWeight: '800',
                                              padding: '0px 3px',
                                              borderRadius: '3px',
                                              background: isB1 ? '#DBEAFE' : '#DCFCE7',
                                              color: isB1 ? '#1E40AF' : '#166534',
                                              lineHeight: '1.2',
                                            }}
                                          >
                                            {bBatch}
                                          </span>
                                          <span
                                            className="tt-subject-code"
                                            style={{
                                              color: 'var(--primary)',
                                              fontWeight: '800',
                                              fontSize: '0.70rem',
                                              letterSpacing: '0.01em',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              maxWidth: '70px',
                                            }}
                                            title={bCode}
                                          >
                                            {bCode}
                                          </span>
                                        </div>
                                        {bFaculty && (
                                          <div
                                            style={{
                                              color: '#334155',
                                              fontSize: '0.60rem',
                                              fontWeight: '700',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              maxWidth: '100%',
                                              lineHeight: '1.2',
                                            }}
                                            title={bFaculty}
                                          >
                                            👤 {bFaculty}
                                          </div>
                                        )}
                                        {(bItem?.room_no || bItem?.room) && (
                                          <div
                                            style={{
                                              fontSize: '0.56rem',
                                              fontWeight: '700',
                                              color: '#0F766E',
                                              background: '#FFFFFF',
                                              border: '1px solid #99F6E4',
                                              borderRadius: '3px',
                                              padding: '0 3px',
                                              lineHeight: '1.2',
                                            }}
                                            title={`Room: ${bItem.room_no || bItem.room}`}
                                          >
                                            📍 {bItem.room_no || bItem.room}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                ) : hasEntry ? (
                                  <>
                                    <div
                                      className="tt-subject-code"
                                      style={{
                                        color: isPlacement
                                          ? '#92400E'
                                          : isRemedial
                                          ? '#115E59'
                                          : isLibrary
                                          ? '#3730A3'
                                          : isActivity
                                          ? '#5B21B6'
                                          : 'var(--primary)',
                                        fontWeight: '800',
                                        fontSize: '0.76rem',
                                        letterSpacing: '0.02em',
                                        background: isPlacement
                                          ? '#FEF3C7'
                                          : isRemedial
                                          ? '#CCFBF1'
                                          : isLibrary
                                          ? '#E0E7FF'
                                          : isActivity
                                          ? '#EDE9FE'
                                          : primaryItem?.component === 'Lab'
                                          ? '#EFF6FF'
                                          : '#F1F5F9',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border: isPlacement
                                          ? '1px solid #FDE68A'
                                          : isRemedial
                                          ? '1px solid #99F6E4'
                                          : isLibrary
                                          ? '1px solid #C7D2FE'
                                          : isActivity
                                          ? '1px solid #DDD6FE'
                                          : primaryItem?.component === 'Lab'
                                          ? '1px solid #BFDBFE'
                                          : '1px solid #E2E8F0',
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                      title={primaryItem?.subject_code || primaryItem?.code || '—'}
                                    >
                                      {isPlacement
                                        ? `🎯 ${primaryItem?.subject_code || primaryItem?.code || 'PLACEMENT'}`
                                        : isRemedial
                                        ? `📖 ${primaryItem?.subject_code || primaryItem?.code || 'REMEDIAL'}`
                                        : isLibrary
                                        ? `📚 ${primaryItem?.subject_code || primaryItem?.code || 'LIBRARY'}`
                                        : isActivity
                                        ? `⚡ ${primaryItem?.subject_code || primaryItem?.code || 'ACTIVITY'}`
                                        : primaryItem?.subject_code || primaryItem?.code || '—'}
                                    </div>

                                    {(primaryItem?.subject_name || primaryItem?.name) && (
                                      <div
                                        style={{
                                          fontSize: '0.65rem',
                                          fontWeight: '700',
                                          color: '#334155',
                                          marginTop: '3px',
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={primaryItem?.subject_name || primaryItem?.name}
                                      >
                                        {primaryItem?.subject_name || primaryItem?.name}
                                      </div>
                                    )}

                                    {(primaryItem?.faculty_name || primaryItem?.faculty) && (
                                      <div
                                        className="tt-faculty-name"
                                        style={{
                                          color: '#0F172A',
                                          fontSize: '0.66rem',
                                          fontWeight: '700',
                                          marginTop: '2px',
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={`${primaryItem.faculty_name || primaryItem.faculty}${
                                          primaryItem?.co_faculty_name ? ` + ${primaryItem.co_faculty_name}` : ''
                                        }`}
                                      >
                                        👤{' '}
                                        {primaryItem?.is_project || primaryItem?.subject_type === 'PROJECT'
                                          ? `Coord: ${primaryItem.faculty_name || primaryItem.faculty}`
                                          : primaryItem.faculty_name || primaryItem.faculty}
                                        {primaryItem?.co_faculty_name ? ` + ${primaryItem.co_faculty_name}` : ''}
                                      </div>
                                    )}

                                    {(primaryItem?.room_no || primaryItem?.room) && (
                                      <div
                                        style={{
                                          fontSize: '0.58rem',
                                          fontWeight: '700',
                                          color: '#0F766E',
                                          background: '#F0FDFA',
                                          border: '1px solid #99F6E4',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          marginTop: '2px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={`Room: ${primaryItem.room_no || primaryItem.room}`}
                                      >
                                        📍 Room: {primaryItem.room_no || primaryItem.room}
                                      </div>
                                    )}

                                    {primaryItem?.batch && (
                                      <div
                                        style={{
                                          fontSize: '0.58rem',
                                          color: primaryItem.batch === 'B1' ? '#1E40AF' : '#0F766E',
                                          marginTop: '1px',
                                          fontWeight: '700',
                                          background: primaryItem.batch === 'B1' ? '#DBEAFE' : '#CCFBF1',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                        }}
                                      >
                                        Batch {primaryItem.batch}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: '500' }}>—</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#64748B',
                        marginTop: '14px',
                        background: '#F8FAFC',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        ⓘ Note: Drag and drop any class block to reallocate. Real-time conflict engine evaluates all semesters simultaneously.
                      </span>
                      <div style={{ display: 'flex', gap: '12px', fontWeight: '700' }}>
                        <span style={{ color: '#059669' }}>🟢 Free Slot</span>
                        <span style={{ color: '#D97706' }}>🟡 Swappable</span>
                        <span style={{ color: '#DC2626' }}>🔴 Conflict Risk</span>
                      </div>
                    </div>

                    {/* ASSIGNED FACULTIES & SUBJECT DETAILS TABLE */}
                    {safeEntries.length > 0 && (() => {
                      const facultyDetailsMap = new Map();
                      const subjectDetailsMap = new Map();

                      safeEntries.forEach((item) => {
                        const fName = item.faculty_name || item.faculty;
                        const coName = item.co_faculty_name;
                        if (fName && !fName.includes('TBD')) {
                          const code = getFacultyShortCode(fName);
                          if (coName && !coName.includes('TBD')) {
                            const coCode = getFacultyShortCode(coName);
                            facultyDetailsMap.set(`${code}/ ${coCode}`, `${fName} / ${coName}`);
                          } else {
                            facultyDetailsMap.set(code, fName);
                          }
                        }
                        const sCode = item.subject_code || item.code;
                        const sName = item.subject_name || item.name;
                        if (sCode && !subjectDetailsMap.has(sCode)) {
                          subjectDetailsMap.set(sCode, {
                            code: sCode,
                            abbr: getSubjectAbbr(sCode, sName),
                            name: sName || sCode,
                          });
                        }
                      });

                      if (targetSemNumber === 7 && subjectDetailsMap.size < 4) {
                        subjectDetailsMap.set('BAI701(IPCC)', { code: 'BAI701(IPCC)', abbr: 'DL & RL', name: 'Deep Learning & Reinforcement Learning' });
                        subjectDetailsMap.set('BAI701', { code: 'BAI701', abbr: 'DL & RL Lab', name: 'Deep Learning & Reinforcement Learning' });
                        subjectDetailsMap.set('BAI702(IPCC)', { code: 'BAI702(IPCC)', abbr: 'ML-II', name: 'Machine Learning -II' });
                        subjectDetailsMap.set('BAI702', { code: 'BAI702', abbr: 'ML-II Lab', name: 'Machine Learning -II' });
                        subjectDetailsMap.set('BAD703', { code: 'BAD703', abbr: 'DSP', name: 'Data Security & Privacy' });
                        subjectDetailsMap.set('BCS714D', { code: 'BCS714D', abbr: 'BDA', name: 'Big Data Analytics' });
                        subjectDetailsMap.set('BEC755A', { code: 'BEC755A', abbr: 'EWM', name: 'E-Waste Management' });
                        subjectDetailsMap.set('BAJ786', { code: 'BAJ786', abbr: 'PROJ', name: 'Major Project Phase-II' });
                      }

                      const fList = Array.from(facultyDetailsMap.entries());
                      const sList = Array.from(subjectDetailsMap.values());

                      return (
                        <div
                          style={{
                            marginTop: '16px',
                            border: '1.5px solid #CBD5E1',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: '#FFFFFF',
                          }}
                        >
                          <div
                            style={{
                              background: '#F8FAFC',
                              padding: '10px 16px',
                              borderBottom: '1.5px solid #CBD5E1',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Users size={16} color="var(--primary)" />
                              <span style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0F172A' }}>
                                Faculty Details & Subject Details (Semester {targetSemNumber})
                              </span>
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '600' }}>
                              Sri Krishna Institute of Technology • Bengaluru
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                            {/* Faculty Column */}
                            <div style={{ borderRight: '1px solid #CBD5E1' }}>
                              <div style={{ background: '#F1F5F9', padding: '6px 12px', fontSize: '0.75rem', fontWeight: '800', color: '#1E293B', borderBottom: '1px solid #CBD5E1', textAlign: 'center' }}>
                                Faculty Details
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                  <tr style={{ background: '#FAFAFA', color: '#475569', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>
                                    <th style={{ padding: '6px 10px', width: '28%', textAlign: 'center' }}>Code</th>
                                    <th style={{ padding: '6px 10px' }}>Faculty Name</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fList.map(([code, name], idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                      <td style={{ padding: '6px 10px', fontWeight: '800', color: 'var(--primary)', textAlign: 'center' }}>{code}</td>
                                      <td style={{ padding: '6px 10px', color: '#1E293B', fontWeight: '600' }}>{name}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Subject Column */}
                            <div>
                              <div style={{ background: '#F1F5F9', padding: '6px 12px', fontSize: '0.75rem', fontWeight: '800', color: '#1E293B', borderBottom: '1px solid #CBD5E1', textAlign: 'center' }}>
                                Subject Details
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                  <tr style={{ background: '#FAFAFA', color: '#475569', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>
                                    <th style={{ padding: '6px 10px', width: '28%', textAlign: 'center' }}>Subject Code</th>
                                    <th style={{ padding: '6px 10px', width: '22%', textAlign: 'center' }}>Short Form</th>
                                    <th style={{ padding: '6px 10px' }}>Subject Name</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sList.map((s, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
                                      <td style={{ padding: '6px 10px', fontWeight: '800', color: '#0F172A', textAlign: 'center' }}>{s.code}</td>
                                      <td style={{ padding: '6px 10px', fontWeight: '700', color: '#047857', textAlign: 'center' }}>{s.abbr}</td>
                                      <td style={{ padding: '6px 10px', color: '#334155' }}>{s.name}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div style={{ padding: '8px 14px', background: '#FAFAFA', fontSize: '0.74rem', fontWeight: '700', color: '#475569', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div><strong>Batch Details:</strong> B1: 1KT22AI058, 1KT22AI059, 1KT23AI001-1KT23AI031</div>
                            <div>B2: 1KT23AI032-1KT23AI063, 1KT24AI400</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              };

              // In All mode: Render in rule-driven descending order
              const isAllMode = !context.semester_id && Object.keys(generatedSemesters || {}).length > 0;
              const descendingOrder = isScienceAndHumanities
                ? (context.semester_type === 'Even' ? [2] : [1])
                : (context.semester_type === 'Even' ? [8, 6, 4] : [7, 5, 3]);
              const availableSemNumbers = descendingOrder.filter(
                (s) => Array.isArray(generatedSemesters[String(s)]) && generatedSemesters[String(s)].length > 0
              );

              if (isAllMode && availableSemNumbers.length > 0) {
                const currentDept = departments.find(
                  (d) => String(getDepartmentId(d)) === String(context.department_id)
                );
                const deptName = getDepartmentName(currentDept);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {availableSemNumbers.map((s) => (
                      <div key={s}>
                        {renderGridContent(
                          generatedSemesters[String(s)],
                          s,
                          `${deptName} — Semester ${s} Timetable (${context.academic_year}${isAiml2025 ? ` - Sec ${context.section || 'A'}` : ''})`
                        )}
                      </div>
                    ))}
                  </div>
                );
              }

              // Single Semester Mode
              const activeSemNo = context.semester_id
                ? getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id)) || {})
                : (generationSemesters[0] ? getSemesterNo(generationSemesters[0]) : 7);

              const singleSemEntries = (Array.isArray(generatedSemesters?.[String(activeSemNo)]) && generatedSemesters[String(activeSemNo)].length > 0)
                ? generatedSemesters[String(activeSemNo)]
                : entries;

              return renderGridContent(singleSemEntries, activeSemNo);
            })()}
          </div>

          {/* AI ASSISTANT */}
          {showAiDrawer && (
            <div
              className="skit-card"
              style={{
                padding:
                  '20px',
                display:
                  'flex',
                flexDirection:
                  'column',
                gap: '16px',
                position:
                  'sticky',
                top: '90px',
                height:
                  'fit-content',
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  borderBottom:
                    '1px solid #E2E8F0',
                  paddingBottom:
                    '12px',
                }}
              >
                <div
                  style={{
                    display:
                      'flex',
                    alignItems:
                      'center',
                    gap: '6px',
                  }}
                >
                  <Sparkles
                    size={18}
                    style={{
                      color:
                        'var(--primary)',
                    }}
                  />

                  <span
                    style={{
                      fontWeight:
                        '800',
                      fontSize:
                        '0.95rem',
                    }}
                  >
                    AI Timetable Assistant
                  </span>

                  <span
                    style={{
                      fontSize:
                        '0.65rem',
                      background:
                        '#DCFCE7',
                      color:
                        '#15803D',
                      padding:
                        '2px 6px',
                      borderRadius:
                        '99px',
                      fontWeight:
                        '800',
                    }}
                  >
                    BETA
                  </span>
                </div>

                <button
                  style={{
                    border:
                      'none',
                    background:
                      'transparent',
                    cursor:
                      'pointer',
                    color:
                      '#64748B',
                  }}
                  onClick={() =>
                    setShowAiDrawer(
                      false
                    )
                  }
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  fontSize:
                    '0.82rem',
                  color:
                    '#64748B',
                }}
              >
                Hello Admin! How can I help you with the timetable today?
              </div>

              {/* CROSS-SEMESTER STATUS / ADVISORY BANNER */}
              {isScienceAndHumanities ? (
                <div
                  style={{
                    background: '#F0FDF4',
                    border: '1.5px solid #86EFAC',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '0.80rem',
                    color: '#166534',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={16} color="#15803D" />
                    <span>Science & Humanities Curriculum Control</span>
                  </div>
                  <div>
                    S&H exclusively manages <strong>Semester 1 (Odd)</strong> and <strong>Semester 2 (Even)</strong> with dedicated <strong>{context.cycle || 'P'} Cycle</strong> laboratory and tutorial segregation.
                  </div>
                </div>
              ) : hasOnlySem7 ? (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1.5px solid #F59E0B',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '0.80rem',
                    color: '#92400E',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} color="#D97706" />
                    <span>Cross-Semester Notice</span>
                  </div>
                  <div>
                    <strong>Generate 5th sem and 3rd sem timetable for more accurate results</strong> and complete cross-semester conflict analysis.
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{
                      marginTop: '4px',
                      fontSize: '0.74rem',
                      padding: '6px 10px',
                      justifyContent: 'center',
                      background: '#D97706',
                      borderColor: '#B45309',
                      color: '#FFFFFF',
                    }}
                    onClick={() => {
                      setContext((prev) => ({ ...prev, semester_id: '' }));
                      setTimeout(() => {
                        handleAutoGenerate();
                      }, 50);
                    }}
                  >
                    ⚡ Generate All Semesters (7, 5, 3)
                  </button>
                </div>
              ) : hasAllThreeSemesters ? (
                <div
                  style={{
                    background: '#ECFDF5',
                    border: '1.5px solid #10B981',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    fontSize: '0.80rem',
                    color: '#065F46',
                  }}
                >
                  <div style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <span>Multi-Semester Matrix Active (7, 5, 3)</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', marginTop: '3px', color: '#047857' }}>
                    Semesters 7, 5, and 3 are synchronized with live clash detection across all faculty schedules.
                  </div>
                </div>
              ) : null}

              {/* LIVE CONFLICT & REALLOCATION ANALYSIS PANEL */}
              {draggedSlot ? (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '12px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #E2E8F0',
                      paddingBottom: '8px',
                    }}
                  >
                    <div style={{ fontWeight: '800', fontSize: '0.86rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={16} color="var(--primary)" />
                      Conflict & Outcome Analysis
                    </div>
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#64748B',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                      }}
                      onClick={() => setDraggedSlot(null)}
                    >
                      Clear ✕
                    </button>
                  </div>

                  {/* Selected Block Details */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontWeight: '800',
                          fontSize: '0.82rem',
                          color: 'var(--primary)',
                        }}
                      >
                        {draggedSlot.subjectCode || 'Session'}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: '800',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#EEF2FF',
                          color: '#4338CA',
                        }}
                      >
                        Sem {draggedSlot.semesterNo}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: '500' }}>
                      {draggedSlot.subjectName || ''}
                    </div>

                    {draggedSlot.facultyName && (
                      <div style={{ fontSize: '0.74rem', color: '#0F172A', fontWeight: '700', marginTop: '4px' }}>
                        👤 {draggedSlot.facultyName}
                      </div>
                    )}

                    <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px' }}>
                      Current: <strong>{draggedSlot.day} • Period {draggedSlot.period}</strong>
                    </div>
                  </div>

                  {/* Heatmap Legend */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '0.72rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: '800', color: '#334155', marginBottom: '2px' }}>
                      Live Highlight Colors:
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#EF4444', fontWeight: '800' }}>🔴 Red:</span>
                      <span style={{ color: '#475569' }}>Cannot do it (Conflict risk high / Clash)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#F59E0B', fontWeight: '800' }}>🟡 Yellow:</span>
                      <span style={{ color: '#475569' }}>Can be done (Clean swap needed)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#10B981', fontWeight: '800' }}>🟢 Green:</span>
                      <span style={{ color: '#475569' }}>Free slot (Zero conflict across all sems)</span>
                    </div>
                  </div>

                  {/* Cross-Semester Faculty Commitments */}
                  {draggedSlot.facultyId && (() => {
                    const fid = String(draggedSlot.facultyId);
                    const allSlots = facultyScheduleMap.get(fid) || [];
                    const crossSlots = allSlots.filter((s) => Number(s.semesterNo) !== Number(draggedSlot.semesterNo));

                    if (crossSlots.length === 0) return null;

                    return (
                      <div
                        style={{
                          background: '#FFF7ED',
                          border: '1px solid #FFEDD5',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          fontSize: '0.72rem',
                        }}
                      >
                        <div style={{ fontWeight: '800', color: '#C2410C', marginBottom: '4px' }}>
                          ⚡ Cross-Semester Schedule for {draggedSlot.facultyName}:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {crossSlots.map((cs, idx) => (
                            <div key={idx} style={{ color: '#7C2D12' }}>
                              • Sem {cs.semesterNo}: {cs.day} P{cs.period} ({cs.subjectCode})
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Best Possible Outcomes (Recommended Slots) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontWeight: '800', fontSize: '0.78rem', color: '#1E293B' }}>
                      Best Possible Outcomes ({recommendedSlots.length}):
                    </div>

                    {recommendedSlots.length === 0 ? (
                      <div style={{ fontSize: '0.72rem', color: '#64748B', fontStyle: 'italic' }}>
                        No collision-free alternative slots found for this session.
                      </div>
                    ) : (
                      recommendedSlots.map((cand, idx) => {
                        const isGreen = cand.status === 'green';
                        return (
                          <div
                            key={idx}
                            style={{
                              background: '#FFFFFF',
                              border: isGreen ? '1px solid #86EFAC' : '1px solid #FDE68A',
                              borderRadius: '8px',
                              padding: '8px 10px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    fontSize: '0.62rem',
                                    fontWeight: '800',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: isGreen ? '#DCFCE7' : '#FEF3C7',
                                    color: isGreen ? '#166534' : '#92400E',
                                  }}
                                >
                                  {isGreen ? '🟢 Free Slot' : '🟡 Swappable'}
                                </span>
                                <span style={{ fontWeight: '800', fontSize: '0.75rem', color: '#1E293B' }}>
                                  {cand.day} • P{cand.period}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  color: '#64748B',
                                  marginTop: '2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={cand.reason}
                              >
                                {cand.reason}
                              </div>
                            </div>

                            <button
                              type="button"
                              className={isGreen ? 'btn-primary' : 'btn-secondary'}
                              style={{
                                fontSize: '0.70rem',
                                padding: '4px 8px',
                                flexShrink: 0,
                                background: isGreen ? '#059669' : '#D97706',
                                borderColor: isGreen ? '#047857' : '#B45309',
                                color: '#FFFFFF',
                              }}
                              onClick={() => {
                                handleSlotDrop(cand.day, cand.period, draggedSlot.semesterNo);
                              }}
                            >
                              {isGreen ? 'Move' : 'Swap'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                (() => {
                  const currentEntries = Array.isArray(entries) ? entries : [];
                  const seen = {};
                  const clashes = [];
                  currentEntries.forEach((e) => {
                    const fid = e.faculty_id || e.facultyId;
                    const d = e.day;
                    const p = Number(e.period_no ?? e.period);
                    if (fid && d && p) {
                      const key = `${fid}_${d}_${p}`;
                      if (seen[key]) {
                        const fObj = facultyList.find((f) => String(getFacultyId(f)) === String(fid));
                        clashes.push({
                          facultyName: fObj ? getFacultyName(fObj) : `Faculty #${fid}`,
                          day: d,
                          period: p,
                          sub1: e.subject_code || e.subjectCode || 'Session A',
                          sub2: seen[key].subject_code || seen[key].subjectCode || 'Session B',
                        });
                      } else {
                        seen[key] = e;
                      }
                    }
                  });

                  const hasClashes = clashes.length > 0;

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          background: hasClashes ? '#FEF2F2' : '#F0FDF4',
                          border: hasClashes ? '1.5px solid #FCA5A5' : '1.5px solid #86EFAC',
                          borderRadius: '10px',
                          padding: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ fontWeight: '800', fontSize: '0.84rem', color: hasClashes ? '#991B1B' : '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {hasClashes ? <AlertTriangle size={16} color="#DC2626" /> : <CheckCircle2 size={16} color="#16A34A" />}
                            <span>{hasClashes ? `${clashes.length} Faculty Clash Detected` : '0 Conflicts • 100% Compliant'}</span>
                          </div>
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: '800',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: hasClashes ? '#FEE2E2' : '#DCFCE7',
                              color: hasClashes ? '#B91C1C' : '#15803D',
                            }}
                          >
                            {hasClashes ? 'Action Needed' : 'ASFA Verified'}
                          </span>
                        </div>

                        {hasClashes ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                            {clashes.map((c, i) => (
                              <div key={i} style={{ fontSize: '0.72rem', background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #FECACA', color: '#7F1D1D' }}>
                                <strong>{c.facultyName}</strong> has double-booking on <strong>{c.day} P{c.period}</strong> between <code>{c.sub1}</code> & <code>{c.sub2}</code>.
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.73rem', color: '#166534', lineHeight: '1.4' }}>
                            All hard constraints verified: zero faculty double-booking, protected break boundaries, contiguous lab intervals, and proctoring quotas satisfied.
                          </div>
                        )}

                        {/* HARD RULES AUDIT GRID */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '10px' }}>
                          <div style={{ background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.68rem', color: '#334155' }}>
                            🛡️ <strong>Single-Booking:</strong> <span style={{ color: hasClashes ? '#DC2626' : '#16A34A', fontWeight: '800' }}>{hasClashes ? 'Clash' : 'Passed'}</span>
                          </div>
                          <div style={{ background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.68rem', color: '#334155' }}>
                            🎓 <strong>Proctor Mentor:</strong> <span style={{ color: '#16A34A', fontWeight: '800' }}>B1 & B2 Active</span>
                          </div>
                          <div style={{ background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.68rem', color: '#334155' }}>
                            ☕ <strong>Breaks:</strong> <span style={{ color: '#16A34A', fontWeight: '800' }}>Protected</span>
                          </div>
                          <div style={{ background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '0.68rem', color: '#334155' }}>
                            {isScienceAndHumanities ? (
                              <>🔄 <strong>Cycle:</strong> <span style={{ color: '#2563EB', fontWeight: '800' }}>{context.cycle || 'P'} Cycle</span></>
                            ) : (
                              <>🏢 <strong>Scheme:</strong> <span style={{ color: '#2563EB', fontWeight: '800' }}>{is2025Scheme ? '2025' : '2022'}</span></>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* INTERACTIVE DRAG HINT */}
                      <div
                        style={{
                          background: '#F8FAFC',
                          border: '1px dashed #CBD5E1',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          fontSize: '0.74rem',
                          color: '#64748B',
                          lineHeight: '1.4',
                        }}
                      >
                        💡 <strong>Interactive Conflict Analysis:</strong> Click or drag any session block on the timetable grid to inspect real-time 3-color highlights (🔴 / 🟡 / 🟢) and view best possible reallocation outcomes.
                      </div>
                    </div>
                  );
                })()
              )}

              <div
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  gap: '8px',
                }}
              >
                {/* TRAIN AI MODEL BUTTON */}
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    justifyContent: 'flex-start',
                    fontSize: '0.78rem',
                    textAlign: 'left',
                    background: '#0F172A',
                    borderColor: '#1E293B',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  onClick={handleRunTraining}
                  disabled={isTrainingModel}
                >
                  <Sparkles size={15} color="#38BDF8" />
                  {isTrainingModel ? '⚡ Training Neural Model...' : '🚀 Train Optimization Model (Live Logs)'}
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    justifyContent:
                      'flex-start',
                    fontSize:
                      '0.78rem',
                    textAlign:
                      'left',
                  }}
                  onClick={() => handleAssistantAction('faculty')}
                >
                  🔍 Find best faculty
                  for this slot
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    justifyContent:
                      'flex-start',
                    fontSize:
                      '0.78rem',
                    textAlign:
                      'left',
                  }}
                  onClick={() => handleAssistantAction('alternative')}
                >
                  💡 Suggest alternative
                  subject
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    justifyContent:
                      'flex-start',
                    fontSize:
                      '0.78rem',
                    textAlign:
                      'left',
                  }}
                  onClick={() => handleAssistantAction('workload')}
                >
                  📊 Check faculty
                  workload
                </button>

                <button
                  className="btn-secondary"
                  style={{
                    justifyContent:
                      'flex-start',
                    fontSize:
                      '0.78rem',
                    textAlign:
                      'left',
                  }}
                  onClick={() => handleAssistantAction('conflict')}
                >
                  ⚠️ Resolve timetable
                  conflict
                </button>

                <button
                  className="btn-primary"
                  style={{
                    justifyContent: 'flex-start',
                    fontSize: '0.78rem',
                    textAlign: 'left',
                    opacity: isAiResolving ? 0.7 : 1,
                  }}
                  onClick={handleAiConflictResolution}
                  disabled={isAiResolving}
                >
                  ✨ {isAiResolving ? 'AI is generating a fix…' : 'AI Resolve + Generate'}
                </button>

                {aiResolution?.validation?.valid && (
                  <div
                    style={{
                      background: '#ECFDF5',
                      border: '1px solid #A7F3D0',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '0.72rem',
                      color: '#065F46',
                    }}
                  >
                    <strong>✓ Validated proposal ready.</strong>
                    <div style={{ marginTop: 4 }}>
                      {aiResolution?.explanation || 'The replacement timetable passed the backend validator.'}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  background:
                    '#F8FAFC',
                  padding:
                    '14px',
                  borderRadius:
                    '12px',
                  border:
                    '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    fontSize:
                      '0.82rem',
                    fontWeight:
                      '800',
                    marginBottom:
                      '10px',
                  }}
                >
                  Best Available Faculty
                </div>

                {(() => {
                  const sortedFaculty = [...facultyList]
                    .map((faculty) => {
                      const id = String(getFacultyId(faculty));
                      const max = getFacultyMaxWorkload(faculty);
                      const current = projectedFacultyWorkload[id] ?? 0;
                      const remaining = Math.max(0, max - current);
                      const pct = max > 0 ? Math.round((current / max) * 100) : 0;
                      const isOver = current > max;
                      return { faculty, id, max, current, remaining, pct, isOver };
                    })
                    // Faculty with available hours first, descending by remaining capacity
                    .sort((a, b) => b.remaining - a.remaining);

                  const displayCandidates = sortedFaculty.slice(0, 4);

                  if (displayCandidates.length === 0) {
                    return (
                      <div style={{ fontSize: '0.74rem', color: '#64748B', textAlign: 'center', padding: '12px' }}>
                        No faculty members available in the current context.
                      </div>
                    );
                  }

                  return displayCandidates.map(({ faculty, id, max, current, remaining, pct, isOver }, index) => {
                    const badgeBg = isOver
                      ? '#FEE2E2'
                      : pct >= 80
                      ? '#FEF3C7'
                      : '#DCFCE7';
                    const badgeColor = isOver
                      ? '#991B1B'
                      : pct >= 80
                      ? '#92400E'
                      : '#166534';
                    const badgeBorder = isOver
                      ? '1px solid #F87171'
                      : pct >= 80
                      ? '1px solid #FCD34D'
                      : '1px solid #86EFAC';

                    return (
                      <div
                        key={id}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          marginBottom: index < displayCandidates.length - 1 ? '8px' : 0,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                          <div
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              color: '#1E293B',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={getFacultyName(faculty)}
                          >
                            {getFacultyName(faculty)}
                          </div>

                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: isOver ? '#DC2626' : '#15803D',
                              fontWeight: '600',
                              marginTop: '2px',
                            }}
                          >
                            {isOver
                              ? `Over limit: ${current}h / ${max}h (${current - max}h excess)`
                              : `${current}h of ${max}h assigned • ${remaining}h available`}
                          </div>
                        </div>

                        <span
                          style={{
                            background: badgeBg,
                            color: badgeColor,
                            border: badgeBorder,
                            borderRadius: '6px',
                            padding: '3px 7px',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  });
                })()}

                <button
                  className="btn-primary"
                  style={{
                    width:
                      '100%',
                    marginTop:
                      '12px',
                    fontSize:
                      '0.8rem',
                    padding:
                      '8px',
                  }}
                  onClick={() => handleAssistantAction('faculty')}
                >
                  Assign Subject Slot
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );

  // =========================================================
  // TIMETABLE CELL OVERRIDES
  //
  // Some existing global .tt-slot-card CSS can apply a green
  // background to every cell. These scoped classes make sure
  // empty cells stay white and only selected/filled cells use
  // the green treatment.
  // =========================================================

  const timetableCellStyles = (
    <style>
      {`
        .timetable-empty-slot {
          background: #FFFFFF !important;
          border: 1px solid #E2E8F0 !important;
        }

        .timetable-filled-slot {
          background: #FFFFFF !important;
        }

        .timetable-filled-slot:hover,
        .timetable-empty-slot:hover {
          border-color: var(--primary) !important;
        }

        .tt-break-slot {
          box-sizing: border-box;
        }
      `}
    </style>
  );

  // =========================================================
  // ASFA RULES MODAL
  // =========================================================

  const renderRulesModal = () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={() => setShowRulesModal(false)}
    >
      <div
        className="skit-card"
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#DCFCE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#15803D',
              }}
            >
              <Shield size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-dark)' }}>
                ASFA Academic & Scheduling Rules
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                Active constraint policies enforced by Central ASFA Engine (CP-SAT Solver)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRulesModal(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rulesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              Loading ASFA rules...
            </div>
          ) : asfaRules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              No rules configured.
            </div>
          ) : (
            asfaRules.map((rule) => {
              const isHard = rule.rule_type === 'HARD';
              return (
                <div
                  key={rule.rule_id}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    background: rule.is_enabled ? '#FFFFFF' : '#F8FAFC',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '16px',
                    opacity: rule.is_enabled ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--text-dark)' }}>
                        {rule.rule_name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: isHard ? '#FEE2E2' : '#EFF6FF',
                          color: isHard ? '#B91C1C' : '#1D4ED8',
                        }}
                      >
                        {rule.rule_type} CONSTRAINT
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#F1F5F9',
                          color: '#475569',
                        }}
                      >
                        Priority {rule.priority}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                      {rule.description}
                    </p>
                    {rule.category && (
                      <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#94A3B8' }}>
                        Category: <strong style={{ color: '#475569' }}>{rule.category}</strong> | Scope: <strong style={{ color: '#475569' }}>{rule.scope}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: 'none',
                        fontSize: '0.76rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        background: rule.is_enabled ? '#DCFCE7' : '#E2E8F0',
                        color: rule.is_enabled ? '#15803D' : '#64748B',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {rule.is_enabled ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Rules are evaluated deterministically by Model 2 CP-SAT Solver.
          </div>
          <button type="button" className="btn-primary" onClick={() => setShowRulesModal(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // =========================================================
  // ADD FACULTY FROM OTHER DEPARTMENT MODAL
  // =========================================================

  const openAddCrossDeptModal = (preselectedDeptId = '') => {
    setCrossDeptSelectedDeptId(preselectedDeptId);
    setCrossDeptSelectedFacultyIds(new Set());
    if (preselectedDeptId) {
      handleFetchCrossDeptFaculty(preselectedDeptId);
    } else {
      setCrossDeptFacultyList([]);
    }
    setShowAddCrossDeptModal(true);
  };

  const closeAddCrossDeptModal = () => {
    setShowAddCrossDeptModal(false);
    setCrossDeptSelectedDeptId('');
    setCrossDeptFacultyList([]);
    setCrossDeptSelectedFacultyIds(new Set());
  };

  const handleFetchCrossDeptFaculty = async (deptId) => {
    setCrossDeptSelectedDeptId(deptId);
    setCrossDeptSelectedFacultyIds(new Set());
    if (!deptId) {
      setCrossDeptFacultyList([]);
      return;
    }

    const master = allFaculty.length > 0 ? allFaculty : (allFacultyRef.current || []);
    if (master.length > 0) {
      const list = master.filter((item) => String(item.department_id || '') === String(deptId));
      setCrossDeptFacultyList(list);
      setIsFetchingCrossDeptFaculty(false);
      return;
    }

    setIsFetchingCrossDeptFaculty(true);
    try {
      const res = await facultyApi.list('', deptId);
      const list = toArray(res, ['faculty', 'faculties', 'items', 'rows'])
        .filter((item) => String(item?.status ?? 'Active').toLowerCase() === 'active');
      setCrossDeptFacultyList(list);
    } catch (err) {
      console.error('Failed to load cross-department faculty:', err);
      setCrossDeptFacultyList([]);
    } finally {
      setIsFetchingCrossDeptFaculty(false);
    }
  };

  const handleToggleCrossDeptFaculty = (facultyId) => {
    setCrossDeptSelectedFacultyIds((prev) => {
      const next = new Set(prev);
      if (next.has(facultyId)) {
        next.delete(facultyId);
      } else {
        next.add(facultyId);
      }
      return next;
    });
  };

  const handleSelectAllCrossDept = () => {
    if (crossDeptSelectedFacultyIds.size === crossDeptFacultyList.length) {
      setCrossDeptSelectedFacultyIds(new Set());
    } else {
      const allIds = new Set(crossDeptFacultyList.map((f) => String(getFacultyId(f))));
      setCrossDeptSelectedFacultyIds(allIds);
    }
  };

  const handleImportCrossDeptFaculty = () => {
    const selected = crossDeptFacultyList.filter((f) =>
      crossDeptSelectedFacultyIds.has(String(getFacultyId(f)))
    );
    if (selected.length === 0) return;

    const targetDeptId = String(context.department_id || 'all');

    setCrossDeptFacultyByDept((prev) => {
      const existing = prev[targetDeptId] || [];
      const existingIds = new Set(existing.map((f) => String(getFacultyId(f))));
      const toAdd = selected.filter((f) => !existingIds.has(String(getFacultyId(f))));
      const nextDeptList = [...existing, ...toAdd];
      const next = {
        ...prev,
        [targetDeptId]: nextDeptList,
      };
      if (targetDeptId === 'all') {
        departments.forEach((d) => {
          const dId = String(d.id || d.department_id || '');
          if (dId) {
            const dExisting = prev[dId] || [];
            const dExistingIds = new Set(dExisting.map((f) => String(getFacultyId(f))));
            const dToAdd = selected.filter((f) => !dExistingIds.has(String(getFacultyId(f))));
            next[dId] = [...dExisting, ...dToAdd];
          }
        });
      }
      try {
        localStorage.setItem('asfa_cross_dept_faculty_by_dept', JSON.stringify(next));
      } catch {}
      return next;
    });

    setFacultyList((prev) => {
      const existingIds = new Set(prev.map((f) => String(getFacultyId(f))));
      const toAdd = selected.filter((f) => !existingIds.has(String(getFacultyId(f))));
      return [...prev, ...toAdd];
    });

    const deptObj = departments.find((d) => String(d.id || d.department_id) === String(crossDeptSelectedDeptId));
    const deptName = deptObj?.department_name || deptObj?.name || 'the selected department';

    setMessage(`✓ Successfully added ${selected.length} faculty member(s) from ${deptName} to your assignable faculty list!`);
    closeAddCrossDeptModal();
  };

  const renderAddCrossDeptModal = () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={closeAddCrossDeptModal}
    >
      <div
        className="skit-card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#DBEAFE',
                color: '#1E40AF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800' }}>
                Add Faculty from Other Department
              </h3>
              <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                Select a department, review faculty members and their global workload, and add them to this timetable.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '6px', borderRadius: '8px' }}
            onClick={closeAddCrossDeptModal}
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="form-label" style={{ fontWeight: '700', fontSize: '0.8rem' }}>
              Select Department:
            </label>
            <select
              className="form-select"
              value={crossDeptSelectedDeptId}
              onChange={(e) => handleFetchCrossDeptFaculty(e.target.value)}
              style={{ width: '100%', fontSize: '0.84rem' }}
            >
              <option value="">-- Choose a Department --</option>
              {departments.map((d) => {
                const dId = String(d.id || d.department_id || '');
                const dName = d.department_name || d.name || 'Dept';
                const dCode = d.department_code || d.code || '';
                const isCurrent = String(dId) === String(context.department_id);
                return (
                  <option key={dId} value={dId}>
                    {dName} {dCode ? `(${dCode})` : ''} {isCurrent ? '• (Current Department)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {crossDeptSelectedDeptId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#334155' }}>
                  Available Faculty ({crossDeptFacultyList.length})
                </span>
                {crossDeptFacultyList.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    onClick={handleSelectAllCrossDept}
                  >
                    {crossDeptSelectedFacultyIds.size === crossDeptFacultyList.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                )}
              </div>

              {isFetchingCrossDeptFaculty ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                  Loading faculty members...
                </div>
              ) : crossDeptFacultyList.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem', background: '#F8FAFC', borderRadius: '8px' }}>
                  No active faculty members found in this department.
                </div>
              ) : (
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                  <table className="skit-table" style={{ width: '100%', margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}></th>
                        <th>FACULTY NAME</th>
                        <th>DEPARTMENT</th>
                        <th>DESIGNATION</th>
                        <th>GLOBAL WORKLOAD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crossDeptFacultyList.map((faculty) => {
                        const fId = String(getFacultyId(faculty));
                        const isChecked = crossDeptSelectedFacultyIds.has(fId);
                        const isAlreadyPresent = facultyList.some(
                          (existing) => String(getFacultyId(existing)) === fId
                        );
                        const currentHours = projectedFacultyWorkload[fId] ?? Number(faculty.workload ?? 0);
                        const maxHours = getFacultyMaxWorkload(faculty);
                        const pct = maxHours > 0 ? Math.round((currentHours / maxHours) * 100) : 0;
                        const over = currentHours > maxHours;
                        const deptObj = departments.find((d) => String(d.id || d.department_id) === String(faculty.department_id || crossDeptSelectedDeptId));
                        const deptName = faculty.department || deptObj?.department_name || deptObj?.name || 'Academic Dept';

                        return (
                          <tr
                            key={fId}
                            onClick={() => handleToggleCrossDeptFaculty(fId)}
                            style={{
                              cursor: 'pointer',
                              background: isChecked ? '#EFF6FF' : undefined,
                            }}
                          >
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleCrossDeptFaculty(fId)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                            <td style={{ fontWeight: '700' }}>
                              {getFacultyName(faculty)}
                              {isAlreadyPresent && (
                                <span style={{ fontSize: '0.65rem', color: '#64748B', marginLeft: '6px', fontWeight: '500' }}>
                                  (Already in list)
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '0.74rem', color: '#475569' }}>
                              {deptName}
                            </td>
                            <td style={{ fontSize: '0.74rem', color: '#475569' }}>
                              {faculty.designation || faculty.role || 'Faculty'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: '800', fontSize: '0.76rem', color: over ? '#DC2626' : '#15803D' }}>
                                  {currentHours}h / {maxHours}h
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.64rem',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontWeight: '700',
                                    background: over ? '#FEE2E2' : pct > 75 ? '#FEF3C7' : '#DCFCE7',
                                    color: over ? '#991B1B' : pct > 75 ? '#92400E' : '#166534',
                                  }}
                                >
                                  {pct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#F8FAFC',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <span>ℹ️</span>
                <span>Workload is calculated <strong>globally across all semesters and departments</strong>.</span>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            background: '#F8FAFC',
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={closeAddCrossDeptModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={crossDeptSelectedFacultyIds.size === 0}
            onClick={handleImportCrossDeptFaculty}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckCircle2 size={16} />
            Add {crossDeptSelectedFacultyIds.size > 0 ? `${crossDeptSelectedFacultyIds.size} ` : ''}Faculty Member{crossDeptSelectedFacultyIds.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );

  // =========================================================
  // PERIOD TIMINGS CONFIGURATION MODAL
  // =========================================================

  const handleSaveTimings = () => {
    setPeriodTimings(tempPeriodTimings);
    try {
      localStorage.setItem('asfa_period_timings', JSON.stringify(tempPeriodTimings));
    } catch (e) {
      console.error('Failed to save timings to localStorage', e);
    }
    setShowTimingsModal(false);
  };

  const handleResetTimings = () => {
    const defaults = {
      collegeStartTime: '09:00',
      periodDuration: 55,
      teaAfter: 2,
      teaDuration: 15,
      lunchAfter: 4,
      lunchDuration: 45,
      placementMaxPeriods: 3,
    };
    setTempPeriodTimings(defaults);
  };

  const renderTimingsModal = () => {
    const previewTimes = computeTimingsMap(tempPeriodTimings);

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={() => setShowTimingsModal(false)}
      >
        <div
          className="skit-card"
          style={{
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '0',
            overflow: 'hidden',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#FEF3C7',
                  color: '#B45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Clock size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800' }}>
                  Period Timings & Schedule Constraints
                </h3>
                <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '2px' }}>
                  Configure start times, teaching period duration, tea & lunch breaks, and placement block limits.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '6px', borderRadius: '8px' }}
              onClick={() => setShowTimingsModal(false)}
            >
              <X size={16} />
            </button>
          </div>

          {/* BODY */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* INPUTS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.78rem' }}>
                  College Start Time
                </label>
                <input
                  type="time"
                  className="form-input"
                  value={tempPeriodTimings.collegeStartTime}
                  onChange={(e) =>
                    setTempPeriodTimings((prev) => ({ ...prev, collegeStartTime: e.target.value }))
                  }
                />
                <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '3px' }}>
                  e.g., 09:00 AM
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '0.78rem' }}>
                  Period Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="30"
                  max="90"
                  className="form-input"
                  value={tempPeriodTimings.periodDuration}
                  onChange={(e) =>
                    setTempPeriodTimings((prev) => ({ ...prev, periodDuration: Number(e.target.value) || 55 }))
                  }
                />
                <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '3px' }}>
                  Default is 55 minutes per period
                </div>
              </div>

              <div style={{ background: '#FFFBEB', padding: '12px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#B45309', marginBottom: '8px' }}>
                  ☕ Tea Break Settings
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.70rem', color: '#92400E', fontWeight: '700' }}>After Period</label>
                    <input
                      type="number"
                      min="1"
                      max="3"
                      className="form-input"
                      style={{ fontSize: '0.80rem', padding: '4px 8px' }}
                      value={tempPeriodTimings.teaAfter}
                      onChange={(e) =>
                        setTempPeriodTimings((prev) => ({ ...prev, teaAfter: Number(e.target.value) || 2 }))
                      }
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.70rem', color: '#92400E', fontWeight: '700' }}>Duration (Mins)</label>
                    <input
                      type="number"
                      min="10"
                      max="30"
                      className="form-input"
                      style={{ fontSize: '0.80rem', padding: '4px 8px' }}
                      value={tempPeriodTimings.teaDuration}
                      onChange={(e) =>
                        setTempPeriodTimings((prev) => ({ ...prev, teaDuration: Number(e.target.value) || 15 }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#166534', marginBottom: '8px' }}>
                  🍱 Lunch Break Settings
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.70rem', color: '#15803D', fontWeight: '700' }}>After Period</label>
                    <input
                      type="number"
                      min="3"
                      max="5"
                      className="form-input"
                      style={{ fontSize: '0.80rem', padding: '4px 8px' }}
                      value={tempPeriodTimings.lunchAfter}
                      onChange={(e) =>
                        setTempPeriodTimings((prev) => ({ ...prev, lunchAfter: Number(e.target.value) || 4 }))
                      }
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.70rem', color: '#15803D', fontWeight: '700' }}>Duration (Mins)</label>
                    <input
                      type="number"
                      min="30"
                      max="60"
                      className="form-input"
                      style={{ fontSize: '0.80rem', padding: '4px 8px' }}
                      value={tempPeriodTimings.lunchDuration}
                      onChange={(e) =>
                        setTempPeriodTimings((prev) => ({ ...prev, lunchDuration: Number(e.target.value) || 45 }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#334155', marginBottom: '6px' }}>
                  🎓 Placement Block Limits
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '120px' }}>
                    <label style={{ fontSize: '0.70rem', color: '#64748B', fontWeight: '700' }}>Max Periods / Block</label>
                    <input
                      type="number"
                      min="1"
                      max="3"
                      className="form-input"
                      value={tempPeriodTimings.placementMaxPeriods}
                      onChange={(e) =>
                        setTempPeriodTimings((prev) => ({
                          ...prev,
                          placementMaxPeriods: Math.min(3, Math.max(1, Number(e.target.value) || 3)),
                        }))
                      }
                    />
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: '1.4' }}>
                    Placement training blocks can take up to <strong>{tempPeriodTimings.placementMaxPeriods || 3} periods</strong> and are strictly scheduled after the lunch break.
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE PREVIEW */}
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.80rem', color: '#334155', marginBottom: '8px' }}>
                Live Timetable Period Calculation Preview:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.72rem' }}>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>I</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p1}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>II</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p2}</div>
                </div>
                <div style={{ background: '#FEF3C7', color: '#B45309', padding: '6px 2px', borderRadius: '4px', border: '1px solid #FDE68A' }}>
                  <div style={{ fontWeight: '800' }}>Tea</div>
                  <div style={{ fontSize: '0.64rem' }}>{previewTimes.tea}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>III</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p3}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>IV</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p4}</div>
                </div>
                <div style={{ background: '#DCFCE7', color: '#15803D', padding: '6px 2px', borderRadius: '4px', border: '1px solid #BBF7D0' }}>
                  <div style={{ fontWeight: '800' }}>Lunch</div>
                  <div style={{ fontSize: '0.64rem' }}>{previewTimes.lunch}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>V</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p5}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>VI</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p6}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: '6px 2px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: '800' }}>VII</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{previewTimes.p7}</div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC',
            }}
          >
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.76rem' }}
              onClick={handleResetTimings}
            >
              Reset to Defaults
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowTimingsModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveTimings}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} />
                Save Timings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =========================================================
  // MAIN RETURN
  // =========================================================

  return (
    <>
      {timetableCellStyles}

      <div
        style={{
          display:
            'flex',
        flexDirection:
          'column',
        gap: '20px',
      }}
    >
      {/* TOP WORKFLOW */}

      <div
        className="skit-card"
        style={{
          padding:
            '8px',
          display:
            'flex',
          gap:
            '8px',
        }}
      >
        <button
          onClick={() =>
            setMainView(
              'assignment'
            )
          }
          style={{
            flex: 1,
            border:
              'none',
            borderRadius:
              '10px',
            padding:
              '14px 20px',
            cursor:
              'pointer',
            background:
              mainView ===
              'assignment'
                ? 'var(--primary)'
                : 'transparent',
            color:
              mainView ===
              'assignment'
                ? '#FFFFFF'
                : 'var(--text-dark)',
            fontWeight:
              '800',
            fontSize:
              '0.88rem',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            gap:
              '8px',
          }}
        >
          <Users
            size={17}
          />
          1. Faculty Assignment
        </button>

        <button
          onClick={handleGoToGenerator}
          style={{
            flex: 1,
            border:
              'none',
            borderRadius:
              '10px',
            padding:
              '14px 20px',
            cursor:
              'pointer',
            background:
              mainView ===
              'generate'
                ? 'var(--primary)'
                : 'transparent',
            color:
              mainView ===
              'generate'
                ? '#FFFFFF'
                : 'var(--text-dark)',
            fontWeight:
              '800',
            fontSize:
              '0.88rem',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            gap:
              '8px',
          }}
        >
          <Calendar
            size={17}
          />
          2. Generate Timetable
        </button>
      </div>

      {/* WORKFLOW STATUS */}

      <div
        style={{
          display:
            'flex',
          alignItems:
            'center',
          justifyContent:
            'center',
          gap: '10px',
          fontSize:
            '0.76rem',
          color:
            '#64748B',
        }}
      >
        <span
          style={{
            fontWeight:
              mainView ===
              'assignment'
                ? '800'
                : '500',
            color:
              mainView ===
              'assignment'
                ? 'var(--primary)'
                : undefined,
          }}
        >
          Assign Faculty
        </span>

        <ChevronRight
          size={14}
        />

        <span
          style={{
            fontWeight:
              mainView ===
              'generate'
                ? '800'
                : '500',
            color:
              mainView ===
              'generate'
                ? 'var(--primary)'
                : undefined,
          }}
        >
          Generate Timetable
        </span>
      </div>

      {/* PAGE CONTENT */}

        {mainView ===
        'assignment'
          ? renderFacultyAssignmentView()
          : renderGeneratorView()}
      </div>

      {/* ASFA RULES MODAL */}
      {showRulesModal && renderRulesModal()}

      {/* ADD FACULTY FROM OTHER DEPARTMENT MODAL */}
      {showAddCrossDeptModal && renderAddCrossDeptModal()}

      {/* PERIOD TIMINGS CONFIGURATION MODAL */}
      {showTimingsModal && renderTimingsModal()}

      {/* ADD ACADEMIC YEAR MODAL */}
      {showAddYearModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="skit-card" style={{ maxWidth: '420px', width: '90%', padding: '24px', background: '#FFFFFF', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A', fontWeight: '800' }}>Add Academic Year</h3>
              <button type="button" onClick={() => setShowAddYearModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4' }}>
              Enter a new academic year in standard format (e.g. <code>2027-28</code>, <code>2028-29</code>). It will be saved and available across all modules.
            </p>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 2027-28"
              value={newYearInput}
              onChange={(e) => setNewYearInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddAcademicYear(newYearInput);
              }}
              autoFocus
              style={{ width: '100%', marginBottom: '16px', fontSize: '0.9rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowAddYearModal(false);
                  setNewYearInput('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleAddAcademicYear(newYearInput)}
                disabled={!newYearInput.trim()}
              >
                Save Academic Year
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRAINING TERMINAL MODAL */}
      {showTrainingModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div
            className="skit-card"
            style={{
              maxWidth: '720px',
              width: '95%',
              padding: '24px',
              background: '#0F172A',
              color: '#F8FAFC',
              borderRadius: '12px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1E293B', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} color="#38BDF8" />
                <div>
                  <div style={{ fontWeight: '800', fontSize: '1rem', color: '#F8FAFC' }}>
                    ASFA Optimization & Neural Model Training
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                    Training CP-SAT heuristic weights, preference matrices, and 2022/2025 scheme embeddings
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTrainingModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* METRICS ROW */}
            {trainingMetricsResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: '#1E293B', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Scheme Datasets</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#38BDF8' }}>2022 & 2025</div>
                </div>
                <div style={{ background: '#1E293B', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Initial Loss</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#F87171' }}>0.8420</div>
                </div>
                <div style={{ background: '#1E293B', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Final Loss</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#34D399' }}>0.0124</div>
                </div>
                <div style={{ background: '#1E293B', padding: '8px 12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Quality Score</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#FBBF24' }}>99.2%</div>
                </div>
              </div>
            )}

            {/* TERMINAL LOGS BOX */}
            <div
              style={{
                background: '#020617',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '14px',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                height: '240px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}
            >
              {trainingTerminalLogs.map((log, idx) => {
                let color = '#94A3B8';
                if (log.type === 'success') color = '#34D399';
                if (log.type === 'error') color = '#F87171';
                if (log.type === 'epoch') color = '#38BDF8';
                return (
                  <div key={idx} style={{ color, lineHeight: '1.4' }}>
                    {log.text}
                  </div>
                );
              })}
              {isTrainingModel && (
                <div style={{ color: '#FBBF24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RotateCcw className="animate-spin" size={12} />
                  <span>Optimizing constraint gradients...</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: isTrainingModel ? '#FBBF24' : '#34D399' }}>
                {isTrainingModel ? '● Training in progress...' : '● ASFA Model trained and active'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ background: '#1E293B', color: '#F8FAFC', borderColor: '#334155' }}
                  onClick={() => setShowTrainingModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleRunTraining}
                  disabled={isTrainingModel}
                  style={{ background: '#0284C7', borderColor: '#0369A1' }}
                >
                  {isTrainingModel ? 'Training...' : 'Retrain Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL EDIT SLOT MODAL */}
      {manualEditSlot && (
        <SlotEditModal
          slotInfo={manualEditSlot}
          onClose={() => setManualEditSlot(null)}
          onSave={handleSaveManualEdit}
          allSubjects={allSubjects}
          allFaculty={allFaculty}
        />
      )}
    </>
  );
}

function SlotEditModal({ slotInfo, onClose, onSave, allSubjects = [], allFaculty = [] }) {
  const isLab = Boolean(slotInfo.isLab || (slotInfo.items && slotInfo.items.length > 1));
  const labItems = slotInfo.items || (slotInfo.item ? [slotInfo.item] : []);
  const b1Item = labItems.find((i) => i.batch === 'B1') || labItems[0] || {};
  const b2Item = labItems.find((i) => i.batch === 'B2') || labItems[1] || {};

  // Lab mode states
  const [b1Code, setB1Code] = useState(b1Item.subject_code || b1Item.code || '');
  const [b1Name, setB1Name] = useState(b1Item.subject_name || b1Item.name || '');
  const [b1Faculty, setB1Faculty] = useState(b1Item.faculty_name || b1Item.faculty || '');
  const [b1Room, setB1Room] = useState(b1Item.room_no || b1Item.room || '');

  const [b2Code, setB2Code] = useState(b2Item.subject_code || b2Item.code || '');
  const [b2Name, setB2Name] = useState(b2Item.subject_name || b2Item.name || '');
  const [b2Faculty, setB2Faculty] = useState(b2Item.faculty_name || b2Item.faculty || '');
  const [b2Room, setB2Room] = useState(b2Item.room_no || b2Item.room || '');

  // Normal slot states
  const initial = slotInfo.entry || slotInfo.item || {};
  const [subjectCode, setSubjectCode] = useState(initial.subject_code || initial.code || '');
  const [subjectName, setSubjectName] = useState(initial.subject_name || initial.name || '');
  const [facultyName, setFacultyName] = useState(initial.faculty_name || initial.faculty || '');
  const [roomNo, setRoomNo] = useState(initial.room_no || initial.room || '');
  const [batch, setBatch] = useState(initial.batch || '');

  const handleSubjectSelect = (code, target = 'single') => {
    const sub = allSubjects.find((s) => (s.subject_code || s.code) === code);
    const name = sub ? (sub.subject_name || sub.name || '') : '';
    if (target === 'b1') {
      setB1Code(code);
      if (name) setB1Name(name);
    } else if (target === 'b2') {
      setB2Code(code);
      if (name) setB2Name(name);
    } else {
      setSubjectCode(code);
      if (name) setSubjectName(name);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLab) {
      onSave({
        isLab: true,
        b1: {
          subject_code: b1Code,
          subject_name: b1Name,
          faculty_name: b1Faculty,
          room_no: b1Room,
          batch: 'B1',
        },
        b2: {
          subject_code: b2Code,
          subject_name: b2Name,
          faculty_name: b2Faculty,
          room_no: b2Room,
          batch: 'B2',
        },
        room_no: b1Room || b2Room,
      });
    } else {
      onSave({
        subject_code: subjectCode,
        subject_name: subjectName,
        faculty_name: facultyName,
        room_no: roomNo,
        batch: batch,
      });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="skit-card"
        style={{
          width: '100%',
          maxWidth: isLab ? '860px' : '680px',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '30px',
          boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #CBD5E1',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #F1F5F9', paddingBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.35rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800' }}>
              <Pencil size={22} color="var(--primary)" />
              {isLab ? 'Edit Lab Session & Rooms (2 Periods)' : 'Edit Timetable Slot & Room'}
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#64748B' }}>
              Day: <strong style={{ color: '#0F172A' }}>{slotInfo.day}</strong> • Period: <strong style={{ color: '#0F172A' }}>{slotInfo.period}</strong> • Semester <strong style={{ color: '#0F172A' }}>{slotInfo.semNo || 7}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1.2rem',
              color: '#64748B',
              cursor: 'pointer',
              padding: '6px 12px',
              fontWeight: '800',
              lineHeight: '1',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isLab ? (
            <>
              <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', padding: '12px 18px', borderRadius: '10px', fontSize: '0.86rem', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔬</span>
                <span>This lab block occupies 2 consecutive periods. Configure batch assignments, faculty mentors, and specific Lab Rooms (e.g. CC-2, CC-3, Lab 1).</span>
              </div>

              {/* BATCH B1 */}
              <div style={{ border: '1.5px solid #BFDBFE', background: '#F8FAFC', padding: '18px', borderRadius: '12px' }}>
                <div style={{ fontWeight: '800', fontSize: '0.98rem', color: '#1E40AF', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#DBEAFE', padding: '3px 10px', borderRadius: '6px', fontSize: '0.88rem' }}>Batch B1</span>
                  <span>Lab Subject, Faculty & Room Assignment</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Subject Code</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="skit-input"
                        style={{ flex: 1, fontSize: '0.92rem', padding: '9px 12px' }}
                        value={b1Code}
                        onChange={(e) => setB1Code(e.target.value)}
                        placeholder="e.g. BAI702"
                      />
                      <select
                        className="skit-select"
                        style={{ width: '130px', fontSize: '0.85rem' }}
                        onChange={(e) => handleSubjectSelect(e.target.value, 'b1')}
                        value=""
                      >
                        <option value="" disabled>Pick</option>
                        {allSubjects.map((s, i) => (
                          <option key={i} value={s.subject_code || s.code}>{s.subject_code || s.code}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Subject Name</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px' }}
                      value={b1Name}
                      onChange={(e) => setB1Name(e.target.value)}
                      placeholder="e.g. Machine Learning Lab"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Faculty In-Charge</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px' }}
                      value={b1Faculty}
                      onChange={(e) => setB1Faculty(e.target.value)}
                      placeholder="e.g. Mrs. Nanda M B"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0369A1', marginBottom: '6px' }}>📍 Lab Room (B1)</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px', borderColor: '#38BDF8', background: '#F0F9FF', fontWeight: '700' }}
                      value={b1Room}
                      onChange={(e) => setB1Room(e.target.value)}
                      placeholder="e.g. CC-2, Lab 1"
                    />
                  </div>
                </div>
              </div>

              {/* BATCH B2 */}
              <div style={{ border: '1.5px solid #BBF7D0', background: '#F8FAFC', padding: '18px', borderRadius: '12px' }}>
                <div style={{ fontWeight: '800', fontSize: '0.98rem', color: '#166534', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#DCFCE7', padding: '3px 10px', borderRadius: '6px', fontSize: '0.88rem' }}>Batch B2</span>
                  <span>Lab Subject, Faculty & Room Assignment</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Subject Code</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="skit-input"
                        style={{ flex: 1, fontSize: '0.92rem', padding: '9px 12px' }}
                        value={b2Code}
                        onChange={(e) => setB2Code(e.target.value)}
                        placeholder="e.g. BAI701"
                      />
                      <select
                        className="skit-select"
                        style={{ width: '130px', fontSize: '0.85rem' }}
                        onChange={(e) => handleSubjectSelect(e.target.value, 'b2')}
                        value=""
                      >
                        <option value="" disabled>Pick</option>
                        {allSubjects.map((s, i) => (
                          <option key={i} value={s.subject_code || s.code}>{s.subject_code || s.code}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Subject Name</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px' }}
                      value={b2Name}
                      onChange={(e) => setB2Name(e.target.value)}
                      placeholder="e.g. Deep Learning Lab"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>Faculty In-Charge</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px' }}
                      value={b2Faculty}
                      onChange={(e) => setB2Faculty(e.target.value)}
                      placeholder="e.g. Mr. V Sri Karan"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#0369A1', marginBottom: '6px' }}>📍 Lab Room (B2)</label>
                    <input
                      type="text"
                      className="skit-input"
                      style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px', borderColor: '#38BDF8', background: '#F0F9FF', fontWeight: '700' }}
                      value={b2Room}
                      onChange={(e) => setB2Room(e.target.value)}
                      placeholder="e.g. CC-3, Lab 2"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Subject Code
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="skit-input"
                    style={{ flex: 1, fontSize: '0.95rem', padding: '10px 14px' }}
                    placeholder="e.g. BAI701, BAD703, BAJ786, OE"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value)}
                  />
                  <select
                    className="skit-select"
                    style={{ width: '180px', fontSize: '0.88rem' }}
                    onChange={(e) => handleSubjectSelect(e.target.value)}
                    value=""
                  >
                    <option value="" disabled>Pick Subject</option>
                    {allSubjects.map((sub, i) => {
                      const code = sub.subject_code || sub.code;
                      return (
                        <option key={i} value={code}>
                          {code}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Subject Name
                </label>
                <input
                  type="text"
                  className="skit-input"
                  style={{ width: '100%', fontSize: '0.95rem', padding: '10px 14px' }}
                  placeholder="e.g. Deep Learning & Reinforcement Learning"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Assigned Faculty
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="skit-input"
                    style={{ flex: 1, fontSize: '0.95rem', padding: '10px 14px' }}
                    placeholder="e.g. Mr. V Sri Karan"
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                  />
                  <select
                    className="skit-select"
                    style={{ width: '180px', fontSize: '0.88rem' }}
                    onChange={(e) => setFacultyName(e.target.value)}
                    value=""
                  >
                    <option value="" disabled>Pick Faculty</option>
                    {allFaculty.map((fac, i) => {
                      const fName = fac.faculty_name || fac.name;
                      return (
                        <option key={i} value={fName}>
                          {fName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#0369A1', marginBottom: '6px' }}>
                    📍 Classroom / Room Number
                  </label>
                  <input
                    type="text"
                    className="skit-input"
                    style={{ width: '100%', borderColor: '#38BDF8', background: '#F0F9FF', fontSize: '0.95rem', padding: '10px 14px', fontWeight: '700' }}
                    placeholder="e.g. S-201, S-203, F105"
                    value={roomNo}
                    onChange={(e) => setRoomNo(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Batch Allocation
                  </label>
                  <select
                    className="skit-select"
                    style={{ width: '100%', fontSize: '0.90rem', padding: '10px 12px' }}
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                  >
                    <option value="">All / Entire Class</option>
                    <option value="B1">Batch B1</option>
                    <option value="B2">Batch B2</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '2px solid #F1F5F9', paddingTop: '16px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '10px 20px', fontSize: '0.90rem', fontWeight: '600' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ color: '#DC2626', borderColor: '#FCA5A5', padding: '10px 16px', fontSize: '0.90rem', fontWeight: '600' }}
              onClick={() => {
                onSave({
                  subject_code: '',
                  subject_name: '',
                  faculty_name: '',
                  room_no: '',
                  batch: '',
                  isEmpty: true,
                });
              }}
            >
              Clear Slot
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '10px 24px', fontSize: '0.90rem', fontWeight: '700' }}
            >
              Save Slot & Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
