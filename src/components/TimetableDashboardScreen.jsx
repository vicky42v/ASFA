import React, {
  useEffect,
  useMemo,
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
  RefreshCw,
  FileText,
} from 'lucide-react';

import {
  api,
  timetableApi,
  facultyApi,
  subjectApi,
  departmentApi,
  schemeApi,
  semesterApi,
} from '../services/api';

import { saveGeneratedTimetable } from '../services/timetableStorage';
import { exportTimetableCsv, printTimetable } from '../services/timetableExport';

export default function TimetableDashboardScreen({ initialDepartmentId = '' }) {
  // =========================================================
  // MAIN VIEW
  // =========================================================

  const [mainView, setMainView] = useState('assignment');
  const [activeView, setActiveView] = useState('grid');
  const [showAiDrawer, setShowAiDrawer] = useState(true);

  // =========================================================
  // DATA
  // =========================================================

  const [departments, setDepartments] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [subjectList, setSubjectList] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);


  const [entries, setEntries] = useState([]);

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

  // =========================================================
  // CONTEXT
  // =========================================================

  const [context, setContext] = useState({
    department_id: '',
    scheme_id: '',
    semester_id: '',
    academic_year: '2026-27',
    semester_type: 'Odd',
    cycle: '',
  });

  const [numberOfOutputs, setNumberOfOutputs] = useState(3);
  const [generatedAlternatives, setGeneratedAlternatives] = useState([]);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState(1);
  const [regenerateCount, setRegenerateCount] = useState(0);

  // =========================================================
  // ASSIGNMENT STATE
  // =========================================================

  const [facultyAssignments, setFacultyAssignments] =
    useState({});

  // Component-level assignments: {subjectId: {Theory:{Main,Co}, Lab:{Main,Co}}}
  // IPCC subjects can therefore use different faculty for Theory and Lab.
  const [componentAssignments, setComponentAssignments] = useState({});
  const [savedComponentAssignments, setSavedComponentAssignments] = useState([]);
  const [allComponentAssignments, setAllComponentAssignments] = useState([]);

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

    if (explicit) return String(explicit).trim().toUpperCase();

    const type = String(subject?.type || subject?.course_type || '').trim().toUpperCase();
    if (['IPCC', 'PCC', 'PEC', 'OEC', 'BSC', 'ESC', 'HSM', 'PROJ'].includes(type)) {
      return type;
    }

    return 'Unclassified';
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

  const getTeachingComponents = (subject) => {
    const theoryHours =
      Number(subject?.lecture_hours || 0) +
      Number(subject?.tutorial_hours || 0);
    const practicalHours = Number(subject?.practical_hours || 0);
    const components = [];
    if (theoryHours > 0) components.push('Theory');
    if (practicalHours > 0) components.push('Lab');
    return components;
  };

  const getComponentHours = (subject, component) =>
    component === 'Lab'
      ? Number(subject?.practical_hours || 0)
      : Number(subject?.lecture_hours || 0) + Number(subject?.tutorial_hours || 0);

  const getComponentFaculty = (subject, component, role = 'Main') => {
    const subjectId = String(getSubjectId(subject));
    return componentAssignments?.[subjectId]?.[component]?.[role] || '';
  };

  // Weekly workload contribution of a subject. This matches the
  // backend faculty workload calculation: lecture + tutorial + practical hours.
  const getSubjectWorkloadHours = (subject) =>
    Number(subject?.lecture_hours || 0) +
    Number(subject?.tutorial_hours || 0) +
    Number(subject?.practical_hours || 0);

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
  // AVAILABLE SEMESTERS
  //
  // ODD:
  // 7 -> 5 -> 3 -> 1
  //
  // EVEN:
  // 8 -> 6 -> 4 -> 2
  // =========================================================

  const generationSemesters =
    useMemo(() => {
      const desiredOrder =
        context.semester_type === 'Even'
          ? [8, 6, 4, 2]
          : [7, 5, 3, 1];

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
    ]);

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
        ] = await Promise.all([
          api.get('/departments'),
          api.get('/schemes'),
          api.get('/semesters'),
          subjectApi.list(),
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

        console.log('AI-ASFA timetable data loaded:', {
          departments: departmentsArray.length,
          schemes: schemesArray.length,
          semesters: semestersArray.length,
          subjects: subjectsArray.length,
          sampleSubject: subjectsArray[0],
        });

        setDepartments(Array.isArray(departmentsArray) ? departmentsArray : []);
        setSchemes(Array.isArray(schemesArray) ? schemesArray : []);
        setSemesters(Array.isArray(semestersArray) ? semestersArray : []);
        setSubjectList(Array.isArray(subjectsArray) ? subjectsArray : []);
        setAllSubjects(Array.isArray(subjectsArray) ? subjectsArray : []);

        // =======================================================
// DEFAULT DEPARTMENT + SCHEME
// =======================================================
const firstDepartment =
  departmentsArray.find(
    (department) => String(getDepartmentId(department)) === String(initialDepartmentId)
  ) || departmentsArray[0];

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
  // RELOAD SUBJECTS FOR THE CURRENT DEPARTMENT / SEMESTER
  // =========================================================
  // The assignment screen must always use the Subjects table as
  // its source of truth. Do not depend on faculty_subject eligibility.
  // If the filtered endpoint returns no rows, retain the complete
  // subject list and let the robust frontend matcher below decide.
  // =========================================================

  useEffect(() => {
    const loadContextSubjects = async () => {
      if (!context.department_id) return;

      try {
        const params = new URLSearchParams();
        params.set('department_id', String(context.department_id));

        if (context.semester_id) {
          params.set('semester_id', String(context.semester_id));
        }

        const data = await api.get(
          `/subjects?${params.toString()}`
        );

        const contextSubjects = toArray(data, [
          'subjects',
          'items',
          'rows',
        ]);

        if (contextSubjects.length > 0) {
          setSubjectList(contextSubjects);
        }
      } catch (error) {
        console.warn(
          'Context subject reload failed; keeping existing subject list:',
          error
        );
      }
    };

    loadContextSubjects();
  }, [context.department_id, context.semester_id]);

  // =========================================================
  // LOAD FACULTY FOR SELECTED DEPARTMENT
  // =========================================================

  useEffect(() => {
    const loadDepartmentFaculty =
      async () => {
        if (!context.department_id) {
          setFacultyList([]);
          return;
        }

        try {
          // Faculty assignment is independent of faculty_subject
          // eligibility. First ask the backend for faculty in the
          // selected department. If an older backend does not
          // support department_id filtering correctly, fall back
          // to the complete faculty list and filter it here.
          const allFacultyData = await facultyApi.list('');
          const allFaculty = toArray(allFacultyData, [
            'faculty',
            'faculties',
            'items',
            'rows',
          ]);

          let faculty = allFaculty.filter((item) => {
            const itemDepartmentId =
              item?.department_id ??
              item?.departmentId;

            return (
              itemDepartmentId == null ||
              String(itemDepartmentId) ===
                String(context.department_id)
            );
          });

          // Only active faculty should be assignable.
          faculty = faculty.filter(
            (item) =>
              String(item?.status ?? 'Active').toLowerCase() ===
              'active'
          );

          // De-duplicate faculty IDs.
          const seen = new Set();
          faculty = faculty.filter((item) => {
            const id = String(getFacultyId(item) ?? '');
            if (!id || id === 'undefined' || seen.has(id)) {
              return false;
            }
            seen.add(id);
            return true;
          });

          setFacultyList(faculty);
        } catch (error) {
          console.error(
            'Failed to load department faculty:',
            error
          );

          setFacultyList([]);
        }
      };

    loadDepartmentFaculty();
  }, [
    context.department_id,
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

    facultyList.forEach((faculty) => {
      const id = String(getFacultyId(faculty) ?? '');
      if (!id || id === 'undefined' || seen.has(id)) return;
      seen.add(id);
      unique.push(faculty);
    });

    return unique;
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
  ]);

  // =========================================================
  // LOAD FACULTY ASSIGNMENTS
  // =========================================================

  useEffect(() => {
    const loadAssignments =
      async () => {
        if (!context.academic_year) {
          return;
        }

        try {
          setAssignmentLoading(true);

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
  //
  // These rows are retained for reference/workload, but are NOT used
  // to pre-select faculty in the assignment form. Existing MySQL rows
  // are replaced when the administrator presses Save Assignments.
  // =========================================================

  useEffect(() => {
    const loadComponentAssignments = async () => {
      if (!context.academic_year || !context.department_id || !context.semester_id) {
        setSavedComponentAssignments([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          academic_year: context.academic_year,
          department_id: context.department_id,
          semester_id: context.semester_id,
          semester_type: context.semester_type || '',
        });

        const data = await api.get(
          `/faculty-assignment-details?${params.toString()}`
        );

        setSavedComponentAssignments(
          toArray(data, ['details', 'assignments', 'items', 'rows'])
        );
      } catch (error) {
        console.error(
          'Failed to load component faculty assignments:',
          error
        );
        setSavedComponentAssignments([]);
      }
    };

    loadComponentAssignments();
  }, [
    context.academic_year,
    context.department_id,
    context.semester_id,
    context.semester_type,
  ]);

  // =========================================================
  // LOAD ALL COMPONENT ASSIGNMENTS FOR GLOBAL WORKLOAD
  // =========================================================
  useEffect(() => {
    const loadAllComponentAssignments = async () => {
      if (!context.academic_year) {
        setAllComponentAssignments([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          academic_year: context.academic_year,
        });
        const data = await api.get(`/faculty-assignment-details?${params.toString()}`);
        setAllComponentAssignments(
          toArray(data, ['details', 'assignments', 'items', 'rows'])
        );
      } catch (error) {
        console.error('Failed to load global faculty workload:', error);
        setAllComponentAssignments([]);
      }
    };

    loadAllComponentAssignments();
  }, [context.academic_year]);

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
          subject?.semester_no ??
            subject?.semester_number ??
            subject?.semesterNumber ??
            subject?.semester?.semester_no ??
            subject?.semester?.semester_number ??
            subject?.semester?.number ??
            ''
        );

        if (selectedSemester) {
          return (
            subjectSemesterId === selectedSemester ||
            (selectedSemesterNo &&
              subjectSemesterNo === selectedSemesterNo)
          );
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

        // Missing department metadata is allowed because the
        // backend /subjects query may already have applied it.
        return (
          !selectedDepartment ||
          !subjectDepartmentId ||
          subjectDepartmentId === selectedDepartment ||
          (!subjectDepartmentId &&
            selectedDepartmentName &&
            subjectDepartmentName === selectedDepartmentName)
        );
      };

      const baseFilter = (subject) =>
        matchesDepartment(subject) &&
        matchesSemester(subject) &&
        matchesSearch(subject);

      let result = subjectList
        .filter(baseFilter)
        .filter(isUsableSubject);

      // IMPORTANT FALLBACK:
      // Some database/API versions expose semester information only
      // through semester_no, or omit department/scheme metadata.
      // Never show a blank assignment page merely because one of those
      // optional fields is missing.
      if (result.length === 0) {
        result = subjectList.filter((subject) => {
          if (!isUsableSubject(subject)) return false;
          if (!matchesSemester(subject)) return false;
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
        const semesterA = Number(
          a?.semester_no ??
            a?.semester_number ??
            a?.semesterNumber ??
            a?.semester?.semester_no ??
            a?.semester?.semester_number ??
            0
        );

        const semesterB = Number(
          b?.semester_no ??
            b?.semester_number ??
            b?.semesterNumber ??
            b?.semester?.semester_no ??
            b?.semester?.semester_number ??
            0
        );

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
      semesters,
      departments,
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
      (category === 'PEC' || category === 'OEC') &&
      (optional || Boolean(getOptionGroupId(subject)))
    );
  };

  const isSpecialActivity = (subject) => {
    const text = [
      subject?.subject_code,
      subject?.subject_name,
      subject?.course_category,
      subject?.group_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return ['sports', 'yoga', 'nss', 'ncc'].some((token) =>
      text.includes(token)
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
    const clean = filteredSubjects.filter((subject) => {
      if (!isUsableSubject(subject)) return false;

      const category = getCourseCategory(subject);
      return category !== 'Unclassified' || isSpecialActivity(subject);
    });

    const order = { REQUIRED: 1, PEC: 2, OEC: 3, PROJECT: 4, SPECIAL: 5 };
    return clean.sort((a, b) => {
      const sectionDiff =
        order[getAssignmentSection(a)] - order[getAssignmentSection(b)];
      if (sectionDiff) return sectionDiff;
      return getSubjectCode(a).localeCompare(getSubjectCode(b));
    });
  }, [filteredSubjects]);

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

    // Authoritative source: component-level assignments for the entire
    // academic year. Main + Co both count for Lab.
    allComponentAssignments.forEach((assignment) => {
      if (String(assignment.status ?? 'Active').toLowerCase() !== 'active') return;

      const facultyId = String(assignment.faculty_id ?? '');
      const subjectId = String(assignment.subject_id ?? '');
      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === subjectId
      );
      if (!facultyId || !subject) return;

      const component = String(assignment.component || 'Theory');
      const hours = getComponentHours(subject, component);
      if (!hours) return;

      result[facultyId] = (result[facultyId] || 0) + hours;
    });

    // Remove saved rows for the context currently being edited.
    const currentContextSubjectIds = new Set(
      filteredSubjects.map((subject) => String(getSubjectId(subject)))
    );

    savedComponentAssignments.forEach((assignment) => {
      if (String(assignment.status ?? 'Active').toLowerCase() !== 'active') return;

      const subjectId = String(assignment.subject_id ?? '');
      if (!currentContextSubjectIds.has(subjectId)) return;

      const facultyId = String(assignment.faculty_id ?? '');
      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === subjectId
      );
      const component = String(assignment.component || 'Theory');
      if (!facultyId || !subject) return;

      result[facultyId] = Math.max(
        0,
        (result[facultyId] || 0) - getComponentHours(subject, component)
      );
    });

    // Overlay unsaved Main/Co selections.
    Object.entries(componentAssignments).forEach(([subjectId, components]) => {
      const subject = allSubjects.find(
        (item) => String(getSubjectId(item)) === String(subjectId)
      );
      if (!subject || !currentContextSubjectIds.has(String(subjectId))) return;

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

    facultyList.forEach((faculty) => {
      const id = String(getFacultyId(faculty));
      if (result[id] == null) result[id] = 0;
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

      setContext(
        (current) => {
          const isSem1Or2 = semNo === 1 || semNo === 2;

          // Semester 1/2 are Basic Science / Science & Humanities
          // semesters in the real timetable_db. Resolve that department
          // dynamically from MySQL instead of hard-coding department ID 9.
          const bshDept = getBasicScienceDepartment(departments);
          const bshDeptId = bshDept
            ? getDepartmentId(bshDept)
            : current.department_id;

          return {
            ...current,
            semester_id: semesterId,
            department_id: isSem1Or2
              ? bshDeptId
              : current.department_id,

            // Flask expects `P` or `C`, not the display labels.
            cycle: isSem1Or2
              ? (normalizeCycle(current.cycle) || 'P')
              : '',
          };
        }
      );

      setAssignmentSearch('');
      setEntries([]);
      setMessage('');

      // Do NOT clear faculty assignments here.
      //
      // This is important because assignments
      // are academic-year based.
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

      // Pick the scheme belonging to the newly selected department.
      // This prevents the local MySQL backend from receiving a scheme
      // belonging to the previous department.
      const matchingScheme =
        schemes.find((scheme) => {
          const schemeDepartmentId =
            scheme?.department_id ??
            scheme?.departmentId ??
            '';

          return (
            !schemeDepartmentId ||
            String(schemeDepartmentId) ===
              String(departmentId)
          );
        }) || schemes[0];

      setContext(
        (current) => ({
          ...current,

          department_id:
            getDepartmentId(selectedDepartment) ??
            departmentId,

          scheme_id:
            getSchemeId(matchingScheme) ??
            current.scheme_id,

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
  // SAVE FACULTY ASSIGNMENTS
  // =========================================================

  const saveFacultyAssignments = async () => {
    try {
      setAssignmentSaving(true);
      setMessage('');

      const selectedSubjects = requiredSubjects.filter(
        (subject) => !isSpecialActivity(subject)
      );

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

      if (missingComponents.length > 0) {
        setMessage(
          `Assign faculty for: ${missingComponents.join(', ')}`
        );
        return;
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

      // ---------------------------------------------------------
      // COMPONENT DETAILS ARE THE SOURCE OF TRUTH.
      // The backend expects ONE faculty_id + ONE assignment_role.
      // Do not send main_faculty_id / co_faculty_id.
      // ---------------------------------------------------------
      for (const subject of selectedSubjects) {
        const subjectId = Number(getSubjectId(subject));

        for (const component of getTeachingComponents(subject)) {
          const mainFacultyId = getComponentFaculty(
            subject,
            component,
            'Main'
          );

          if (!mainFacultyId) continue;

          await api.post('/faculty-assignment-details', {
            subject_id: subjectId,
            faculty_id: Number(mainFacultyId),
            academic_year: context.academic_year,
            component,
            assignment_role: 'Main',
          });

          // Lab Co-faculty is optional. Theory Co is never sent.
          if (component === 'Lab') {
            const coFacultyId = getComponentFaculty(
              subject,
              'Lab',
              'Co'
            );

            if (coFacultyId) {
              await api.post('/faculty-assignment-details', {
                subject_id: subjectId,
                faculty_id: Number(coFacultyId),
                academic_year: context.academic_year,
                component: 'Lab',
                assignment_role: 'Co',
              });
            } else {
              // If a previously saved Lab Co was removed in the UI,
              // explicitly deactivate it. A missing row is harmless.
              try {
                await api.delete(
                  `/faculty-assignment-details/${subjectId}/Lab?academic_year=${encodeURIComponent(context.academic_year)}&assignment_role=Co`
                );
              } catch (clearError) {
                console.debug('No existing Lab Co assignment to clear:', clearError);
              }
            }
          }
        }
      }

      // ---------------------------------------------------------
      // KEEP LEGACY PARENT ASSIGNMENT TABLE SYNCHRONIZED.
      // Theory Main is preferred; otherwise Lab Main is used.
      // Component detail rows remain authoritative for generation.
      // ---------------------------------------------------------
      const parentData = await api.get(
        `/faculty-subject-assignments?academic_year=${encodeURIComponent(
          context.academic_year
        )}&department_id=${encodeURIComponent(
          context.department_id || ''
        )}&semester_type=${encodeURIComponent(
          context.semester_type || ''
        )}`
      );

      const parentAssignments = toArray(parentData, [
        'assignments',
        'faculty_subject_assignments',
        'facultySubjectAssignments',
        'items',
        'rows',
      ]);

      for (const subject of selectedSubjects) {
        const subjectId = String(getSubjectId(subject));
        const primary =
          getComponentFaculty(subject, 'Theory', 'Main') ||
          getComponentFaculty(subject, 'Lab', 'Main');

        if (!primary) continue;

        const existing = parentAssignments.filter(
          (assignment) =>
            String(assignment.subject_id) === subjectId &&
            String(assignment.status ?? 'Active').toLowerCase() === 'active'
        );

        const same = existing.find(
          (assignment) =>
            String(assignment.faculty_id) === String(primary)
        );

        if (same && existing.length === 1) continue;

        for (const old of existing) {
          const oldId = getAssignmentId(old);
          if (!oldId) continue;

          if (
            String(old.faculty_id) !== String(primary) ||
            existing.length > 1
          ) {
            await api.patch(
              `/faculty-subject-assignments/${oldId}`,
              { status: 'Inactive' }
            );
          }
        }

        if (!same || existing.length > 1) {
          await api.post('/faculty-subject-assignments', {
            faculty_id: Number(primary),
            subject_id: Number(subjectId),
            academic_year: context.academic_year,
            status: 'Active',
          });
        }
      }

      // ---------------------------------------------------------
      // RELOAD EVERYTHING FROM MYSQL.
      // This makes the selectors reflect the actual saved state.
      // ---------------------------------------------------------
      const detailData = await api.get(
        `/faculty-assignment-details?academic_year=${encodeURIComponent(
          context.academic_year
        )}`
      );

      const details = toArray(detailData, [
        'details',
        'assignments',
        'items',
        'rows',
      ]);

      setAllComponentAssignments(details);

      const contextDetails = context.semester_id
        ? details.filter(
            (detail) =>
              String(detail.semester_id ?? '') ===
              String(context.semester_id)
          )
        : details;

      setSavedComponentAssignments(contextDetails);

      const componentMap = {};

      details
        .filter(
          (detail) =>
            String(detail.status ?? 'Active').toLowerCase() === 'active'
        )
        .forEach((detail) => {
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

        if (primary) subjectMap[sid] = String(primary);
      });

      setFacultyAssignments(subjectMap);

      const refreshedParentData = await api.get(
        `/faculty-subject-assignments?academic_year=${encodeURIComponent(
          context.academic_year
        )}&department_id=${encodeURIComponent(
          context.department_id || ''
        )}&semester_type=${encodeURIComponent(
          context.semester_type || ''
        )}`
      );

      setSavedAssignments(
        toArray(refreshedParentData, [
          'assignments',
          'faculty_subject_assignments',
          'facultySubjectAssignments',
          'items',
          'rows',
        ])
      );

      setAssignmentsSavedForContext(assignmentContextKey());
      setMessage(
        'Faculty assignments saved successfully. Opening Generate Timetable...'
      );
      setMainView('generate');
    } catch (error) {
      console.error('Failed to save faculty assignments:', error);
      setMessage(
        error?.message || 'Failed to save faculty assignments.'
      );
    } finally {
      setAssignmentSaving(false);
    }
  };

  // =========================================================
  // GO TO GENERATOR
  // =========================================================

  const handleGoToGenerator = () => {
    // Validate the CURRENT assignment state when the user clicks.
    // Do not block the button using a stale "saved" flag.
    if (missingOptionGroups.length > 0) {
      setMessage(
        `${missingOptionGroups.length} PEC/OEC option group${
          missingOptionGroups.length === 1 ? '' : 's'
        } still need a subject to be selected.`
      );
      return;
    }

    if (missingAssignments.length > 0) {
      setMessage(
        `${missingAssignments.length} subject(s) still need faculty assignment.`
      );
      return;
    }

    // Every teaching component must have a Main faculty.
    const missingComponents = [];

    requiredSubjects.forEach((subject) => {
      getTeachingComponents(subject).forEach((component) => {
        if (!getComponentFaculty(subject, component, 'Main')) {
          missingComponents.push(
            `${getSubjectCode(subject)} ${component} Main`
          );
        }
      });
    });

    if (missingComponents.length > 0) {
      setMessage(
        `Assign faculty for: ${missingComponents.join(', ')}`
      );
      return;
    }

    // Do not allow generation while a faculty member is above max workload.
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

    setMessage('');
    setMainView('generate');
  };

  // =========================================================
  // GENERATED TIMETABLE LIBRARY / REGENERATE
  // =========================================================

  const storeGeneratedAlternatives = (alternatives, semesterNo, departmentName) => {
    (alternatives || []).forEach((alternative) => {
      saveGeneratedTimetable({
        title: `${departmentName || 'Department'} - Semester ${semesterNo} - ${alternative.name || `Option ${alternative.id}`}`,
        department_id: context.department_id,
        department_name: departmentName || '',
        scheme_id: context.scheme_id,
        semester_id: context.semester_id,
        semester_no: semesterNo,
        semester_type: context.semester_type,
        academic_year: context.academic_year,
        alternative_id: alternative.id,
        entries: alternative.timetable || [],
        validation: alternative.validation,
        summary: alternative.summary,
        generation_round: regenerateCount + 1,
      });
    });
  };

  const regenerateCurrentTimetable = async () => {
    if (!context.semester_id) {
      setMessage('Select a particular semester before using Regenerate.');
      return;
    }

    setIsGenerating(true);
    setMessage('Generating a fresh set of timetable alternatives...');

    try {
      const selectedSemester = generationSemesters.find((semester) =>
        String(getSemesterId(semester)) === String(context.semester_id)
      );
      if (!selectedSemester) throw new Error('Selected semester was not found.');

      const semesterNo = getSemesterNo(selectedSemester);
      const department = departments.find((d) => String(getDepartmentId(d)) === String(context.department_id));
      const generationContext = {
        ...context,
        semester_id: getSemesterId(selectedSemester),
        cycle: normalizeCycle(context.cycle),
        number_of_outputs: Math.max(3, numberOfOutputs),
        generation_seed: Date.now() + Math.floor(Math.random() * 100000000),
        regeneration_round: regenerateCount + 1,
      };

      const result = await timetableApi.generate(generationContext);
      const alternatives = result?.alternatives || result?.data?.alternatives || [];
      const first = alternatives[0]?.timetable || result?.timetable || [];

      setGeneratedAlternatives(alternatives);
      setSelectedAlternativeId(alternatives[0]?.id || 1);
      setEntries(first);
      setRegenerateCount((value) => value + 1);
      storeGeneratedAlternatives(alternatives, semesterNo, getDepartmentName(department));

      setMessage(`Fresh alternatives generated and stored. ${alternatives.length || 1} timetable file(s) added to Generated Timetables.`);
    } catch (error) {
      console.error('Regeneration failed:', error);
      setMessage(error?.message || 'Regeneration failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  // =========================================================
  // GENERATE ONE SEMESTER
  // =========================================================

  const generateOneSemester =
    async (semester) => {
      const semesterId =
        getSemesterId(
          semester
        );

      const semesterNo =
        getSemesterNo(
          semester
        );

      const semesterContext = {
        ...context,

        semester_id:
          semesterId,

        semester_type:
          context.semester_type,

        cycle: normalizeCycle(context.cycle),

        number_of_outputs: numberOfOutputs,
        generation_seed: Date.now() + Math.floor(Math.random() * 1000000),
      };

      console.log(
        'GENERATING SEMESTER:',
        JSON.stringify(
          semesterContext,
          null,
          2
        )
      );

      const result =
        await timetableApi.generate(
          semesterContext
        );

      return {
        semesterId,
        semesterNo,
        result,
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
  // Each generation is done separately because
  // the current backend /save endpoint stores
  // one semester context at a time.
  // =========================================================

  const handleAutoGenerate =
    async () => {
      if (
        !context.department_id
      ) {
        setMessage(
          'Please select a department.'
        );

        return;
      }

      if (!context.scheme_id) {
        setMessage(
          'No scheme is selected. Please make sure a scheme exists for the selected department.'
        );

        return;
      }

      if (!context.academic_year) {
        setMessage(
          'Please enter the academic year.'
        );

        return;
      }

      if (
        generationSemesters.length ===
        0
      ) {
        setMessage(
          `No ${context.semester_type.toLowerCase()} semesters were found.`
        );

        return;
      }

      setIsGenerating(true);
      setMessage('');
      setGeneratedSemesters({});

      try {
        // =====================================================
        // PARTICULAR SEMESTER
        // =====================================================

        if (context.semester_id) {
          const selectedSemester =
            generationSemesters.find(
              (semester) =>
                String(
                  getSemesterId(
                    semester
                  )
                ) ===
                String(
                  context.semester_id
                )
            );

          if (!selectedSemester) {
            throw new Error(
              'Selected semester was not found.'
            );
          }

          const {
            semesterId,
            semesterNo,
            result,
          } =
            await generateOneSemester(
              selectedSemester
            );

          const alts = result?.alternatives || result?.data?.alternatives || [];
          setGeneratedAlternatives(alts);
          setSelectedAlternativeId(1);

          const selectedDepartment = departments.find((department) =>
            String(getDepartmentId(department)) === String(context.department_id)
          );
          storeGeneratedAlternatives(
            alts,
            semesterNo,
            getDepartmentName(selectedDepartment)
          );

          const timetable =
            (alts.length > 0 ? alts[0].timetable : null) || result?.timetable || [];

          setEntries(timetable);

          setGeneratedSemesters((current) => ({
            ...current,
            [String(semesterNo)]: timetable,
          }));

          if (
            result?.validation?.valid
          ) {
            setMessage(
              `${getSemesterLabel(
                semesterNo
              )} semester generated successfully with ${
                result?.summary
                  ?.scheduled_sessions ??
                timetable.length
              } sessions. Click Save Timetable to persist it.`
            );
          } else {
            const errors =
              result?.validation
                ?.errors || [];

            setMessage(
              errors.length
                ? errors.join(' ')
                : 'Timetable generation failed.'
            );
          }

          return;
        }

        // =====================================================
        // ALL SEMESTERS
        // =====================================================

        const results = {};
        let totalSessions = 0;
        const failedSemesters = [];

        // generationSemesters is already:
        //
        // Odd  = 7,5,3,1
        // Even = 8,6,4,2
        //
        for (
          const semester of generationSemesters
        ) {
          const semesterNo =
            getSemesterNo(
              semester
            );

          try {
            const {
              result,
            } =
              await generateOneSemester(
                semester
              );

            const timetable =
              result?.timetable || [];

            const selectedDepartment = departments.find((department) =>
              String(getDepartmentId(department)) === String(context.department_id)
            );
            storeGeneratedAlternatives(
              result?.alternatives || [],
              semesterNo,
              getDepartmentName(selectedDepartment)
            );

            results[
              String(
                semesterNo
              )
            ] = timetable;

            totalSessions +=
              timetable.length;

            if (
              !result?.validation?.valid
            ) {
              failedSemesters.push(
                {
                  semesterNo,
                  errors:
                    result?.validation
                      ?.errors ||
                    [
                      'Generation failed.',
                    ],
                }
              );
            }
          } catch (error) {
            console.error(
              `Generation failed for semester ${semesterNo}:`,
              error
            );

            failedSemesters.push({
              semesterNo,
              errors: [
                error?.message ||
                  'Generation request failed.',
              ],
            });
          }
        }

        setGeneratedSemesters(
          results
        );

        // Display the highest semester
        // first in the timetable grid.
        const firstSemester =
          generationSemesters[0];

        const firstSemesterNo =
          getSemesterNo(
            firstSemester
          );

        setEntries(
          results[
            String(
              firstSemesterNo
            )
          ] || []
        );

        if (
          failedSemesters.length ===
          0
        ) {
          setMessage(
            `${context.semester_type} timetable generated successfully in order: ${generationSemesters
              .map(
                (semester) =>
                  getSemesterLabel(
                    getSemesterNo(
                      semester
                    )
                  )
              )
              .join(
                ' → '
              )}. Total sessions: ${totalSessions}.`
          );
        } else {
          const failedText =
            failedSemesters
              .map(
                (item) =>
                  `${getSemesterLabel(
                    item.semesterNo
                  )}`
              )
              .join(', ');

          setMessage(
            `Generation completed, but ${failedText} could not be generated. Check the backend validation for those semesters.`
          );
        }
      } catch (error) {
        console.error(
          'Timetable generation failed:',
          error
        );

        setMessage(
          error?.message ||
            'Timetable generation request failed.'
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
      const timetable =
        generatedSemesters[
          String(semesterNo)
        ];

      setEntries(
        Array.isArray(timetable)
          ? timetable
          : []
      );

      const semester =
        generationSemesters.find(
          (item) =>
            Number(
              getSemesterNo(item)
            ) ===
            Number(semesterNo)
        );

      if (semester) {
        setContext(
          (current) => ({
            ...current,

            semester_id:
              getSemesterId(
                semester
              ),
          })
        );
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
      try {
        if (!entries.length &&
            Object.keys(
              generatedSemesters
            ).length === 0) {
          setMessage(
            'There is no generated timetable to save.'
          );

          return;
        }

        // =====================================================
        // PARTICULAR SEMESTER
        // =====================================================

        if (context.semester_id) {
          const result =
            await timetableApi.save({
              ...context,
              cycle: normalizeCycle(context.cycle),
              entries,
            });

          const selectedSemester =
            generationSemesters.find(
              (semester) =>
                String(getSemesterId(semester)) ===
                String(context.semester_id)
            );

          const savedEntries =
            Number(result?.saved_entries) ||
            Number(result?.saved) ||
            entries.length;

          setMessage(
            `${savedEntries} sessions saved for ${getSemesterLabel(
              selectedSemester
                ? getSemesterNo(selectedSemester)
                : ''
            )} semester.`
          );

          return;
        }

        // =====================================================
        // ALL SEMESTERS
        // =====================================================

        let savedCount = 0;
        const errors = [];

        for (
          const semester of generationSemesters
        ) {
          const semesterNo =
            getSemesterNo(
              semester
            );

          const semesterEntries =
            generatedSemesters[
              String(
                semesterNo
              )
            ] || [];

          if (
            semesterEntries.length ===
            0
          ) {
            continue;
          }

          try {
            const result =
              await timetableApi.save({
                ...context,

                cycle: normalizeCycle(context.cycle),

                semester_id:
                  getSemesterId(
                    semester
                  ),

                entries:
                  semesterEntries,
              });

            savedCount +=
              result.saved_entries ||
              semesterEntries.length;
          } catch (error) {
            errors.push(
              `${getSemesterLabel(
                semesterNo
              )}: ${
                error?.message ||
                'Save failed'
              }`
            );
          }
        }

        if (errors.length) {
          setMessage(
            `${savedCount} sessions saved. ${errors.join(
              ' | '
            )}`
          );
        } else {
          setMessage(
            `${savedCount} sessions saved successfully for all generated semesters.`
          );
        }
      } catch (error) {
        console.error(
          'Failed to save timetable:',
          error
        );

        setMessage(
          error?.message ||
            'Failed to save timetable.'
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

  const gridRows = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ].map((day) => {
    const findPeriod = (period) =>
      entries.find((entry) => {
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

    return {
      day,

      slots: [
        {
          type: 'period',
          period: 1,
          item: findPeriod(1),
        },
        {
          type: 'period',
          period: 2,
          item: findPeriod(2),
        },
        {
          type: 'break',
          breakType: 'tea',
        },
        {
          type: 'period',
          period: 3,
          item: findPeriod(3),
        },
        {
          type: 'period',
          period: 4,
          item: findPeriod(4),
        },
        {
          type: 'break',
          breakType: 'lunch',
        },
        {
          type: 'period',
          period: 5,
          item: findPeriod(5),
        },
        {
          type: 'period',
          period: 6,
          item: findPeriod(6),
        },
        {
          type: 'period',
          period: 7,
          item: findPeriod(7),
        },
      ],
    };
  });

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
                {departments.map(
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
                        {getDepartmentName(
                          department
                        )}
                      </option>
                    );
                  }
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

            {/* SEMESTER */}
            {renderSemesterSelector()}

            {/* ACADEMIC YEAR */}
            <div
              className="form-group"
              style={{
                margin: 0,
                minWidth:
                  '150px',
              }}
            >
              <label className="form-label">
                Academic Year
              </label>

              <input
                className="form-input"
                value={
                  context.academic_year
                }
                onChange={(e) =>
                  setContext(
                    (current) => ({
                      ...current,
                      academic_year:
                        e.target
                          .value,
                    })
                  )
                }
              />
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
                Global weekly workload. Lab Co-faculty receives the same lab hours as Main.
              </div>
            </div>
            {workloadExceededFaculty.length > 0 && (
              <span className="badge" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                {workloadExceededFaculty.length} over maximum
              </span>
            )}
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
                    <div style={{ fontWeight: '800', fontSize: '0.75rem' }}>
                      {getFacultyName(faculty)}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontWeight: '800', color: over ? '#B91C1C' : '#475569' }}>
                      {current}h / {max}h
                    </div>
                  </div>
                  <div style={{ marginTop: '3px', fontSize: '0.66rem', color: '#64748B' }}>
                    {getFacultyWorkloadBounds(faculty).label} · target {min}-{max}h · remaining {Math.max(0, max - current)}h
                  </div>
                  <div style={{ marginTop: '7px', height: '5px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
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

            <Users
              size={20}
              style={{
                color:
                  'var(--primary)',
              }}
            />
          </div>

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

                      const section = getAssignmentSection(subject);
                      const previousSection =
                        subjectIndex > 0
                          ? getAssignmentSection(visibleSubjects[subjectIndex - 1])
                          : null;
                      const sectionChanged = section !== previousSection;
                      const sectionMeta = assignmentSectionMeta[section];

                      return (
                        <React.Fragment key={subjectId}>
                          {sectionChanged && (
                            <tr>
                              <td
                                colSpan={6}
                                style={{
                                  padding: '10px 14px',
                                  background: '#F8FAFC',
                                  borderTop: '1px solid #E2E8F0',
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
                                Saturday full-day activity — no faculty assignment required
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '320px' }}>
                                {getTeachingComponents(subject).map((component) => {
                                  const selected = getComponentFaculty(subject, component, 'Main');
                                  const hours = getComponentHours(subject, component);
                                  return (
                                    <div key={component} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ minWidth: '78px', fontSize: '0.7rem', fontWeight: '800', color: component === 'Lab' ? '#0F766E' : '#475569' }}>
                                        {component} ({hours}h)
                                      </span>
                                      <select
                                        className="form-select"
                                        style={{ minWidth: '250px' }}
                                        value={selected}
                                        disabled={electiveLocked || assignmentSaving}
                                        onChange={(e) => handleComponentFacultyChange(subject, component, e.target.value, 'Main')}
                                      >
                                        <option value="">Select {component} Main Faculty</option>
                                        {getAssignableFaculty().map((faculty) => (
                                          <option key={getFacultyId(faculty)} value={getFacultyId(faculty)}>
                                            {getFacultyName(faculty)}
                                            {getFacultyRole(faculty) ? ` — ${getFacultyRole(faculty)}` : ''}
                                          </option>
                                        ))}
                                      </select>

                                      {component === 'Lab' && (
                                        <select
                                          className="form-select"
                                          style={{ minWidth: '230px' }}
                                          value={getComponentFaculty(subject, 'Lab', 'Co')}
                                          disabled={electiveLocked || !selected || assignmentSaving}
                                          onChange={(e) => handleComponentFacultyChange(subject, 'Lab', e.target.value, 'Co')}
                                        >
                                          <option value="">No Co-Faculty</option>
                                          {getAssignableFaculty()
                                            .filter((faculty) => String(getFacultyId(faculty)) !== String(selected))
                                            .map((faculty) => (
                                              <option
                                                key={`co-${getFacultyId(faculty)}`}
                                                value={getFacultyId(faculty)}
                                              >
                                                Co: {getFacultyName(faculty)}
                                                {getFacultyRole(faculty) ? ` — ${getFacultyRole(faculty)}` : ''}
                                              </option>
                                            ))}
                                        </select>
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
                            {isSpecialActivity(subject) || getTeachingComponents(subject).every((component) => Boolean(getComponentFaculty(subject, component, 'Main'))) ? (
                              <span className="badge badge-active">
                                <CheckCircle2
                                  size={
                                    13
                                  }
                                />
                                Assigned
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
                  {departments.map(
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
                          {getDepartmentName(
                            department
                          )}
                        </option>
                      );
                    }
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

              {/* SEMESTER */}
              {renderSemesterSelector()}

              {/* ACADEMIC YEAR */}
              <div
                className="form-group"
                style={{
                  margin: 0,
                  minWidth:
                    '140px',
                }}
              >
                <label className="form-label">
                  Academic Year
                </label>

                <input
                  className="form-input"
                  value={
                    context.academic_year
                  }
                  onChange={(e) =>
                    setContext(
                      (current) => ({
                        ...current,
                        academic_year:
                          e.target
                            .value,
                      })
                    )
                  }
                />
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
                className="btn-secondary"
                onClick={regenerateCurrentTimetable}
                disabled={isGenerating || !context.semester_id}
                title="Generate another fresh set without deleting the previous files"
              >
                <RefreshCw size={16} />
                Regenerate
              </button>

              <button
                className="btn-secondary"
                onClick={() => exportTimetableCsv(entries, `timetable-sem-${getSemesterNo(semesters.find((s) => String(getSemesterId(s)) === String(context.semester_id))) || 'x'}.csv`)}
                disabled={!entries.length}
              >
                <Download size={16} />
                Export CSV
              </button>

              <button
                className="btn-secondary"
                onClick={() => printTimetable(entries, 'AI-ASFA Timetable')}
                disabled={!entries.length}
              >
                <FileText size={16} />
                Export PDF
              </button>
            </div>
          </div>

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
                          setEntries(alt.timetable || []);
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
            {activeView ===
              'grid' && (
              <div
                className="skit-card"
                style={{
                  padding:
                    '16px',
                  overflowX:
                    'auto',
                }}
              >
                {/* HEADER */}
                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      '100px repeat(9, 1fr)',
                    gap: '6px',
                    minWidth:
                      '980px',
                    marginBottom:
                      '8px',
                  }}
                >
                  <div className="tt-header-cell">
                    Day / Period
                  </div>

                  <div className="tt-header-cell">
                    I
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      9:10 - 10:05
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    II
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      10:05 - 11:00
                    </span>
                  </div>

                  <div
                    className="tt-header-cell"
                    style={{
                      background:
                        '#FEF3C7',
                      color:
                        '#B45309',
                    }}
                  >
                    Tea Break
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      11:00 - 11:15
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    III
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      11:15 - 12:10
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    IV
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      12:10 - 1:05
                    </span>
                  </div>

                  <div
                    className="tt-header-cell"
                    style={{
                      background:
                        '#DCFCE7',
                      color:
                        '#15803D',
                    }}
                  >
                    Lunch Break
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      1:05 - 1:45
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    V
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      1:45 - 2:40
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    VI
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      2:40 - 3:35
                    </span>
                  </div>

                  <div className="tt-header-cell">
                    VII
                    <br />
                    <span
                      style={{
                        fontWeight:
                          '500',
                        fontSize:
                          '0.7rem',
                      }}
                    >
                      3:35 - 4:30
                    </span>
                  </div>
                </div>

                {/* GRID ROWS */}
                <div
                  style={{
                    display:
                      'flex',
                    flexDirection:
                      'column',
                    gap: '6px',
                    minWidth:
                      '980px',
                  }}
                >
                  {gridRows.map(
                    (
                      row,
                      rIdx
                    ) => (
                      <div
                        key={
                          rIdx
                        }
                        style={{
                          display:
                            'grid',
                          gridTemplateColumns:
                            '100px repeat(9, 1fr)',
                          gap: '6px',
                        }}
                      >
                        <div className="tt-day-cell">
                          {
                            row.day
                          }
                        </div>

                        {row.slots.map(
                          (
                            slot,
                            sIdx
                          ) => {
                            // -------------------------------------------------
                            // BREAK COLUMNS
                            // -------------------------------------------------
                            if (
                              slot.type ===
                              'break'
                            ) {
                              return (
                                <div
                                  key={
                                    `${row.day}-break-${slot.breakType}`
                                  }
                                  className="tt-break-slot"
                                  style={{
                                    minHeight:
                                      '50px',

                                    border:
                                      '1px solid #E2E8F0',

                                    borderRadius:
                                      '8px',

                                    display:
                                      'flex',

                                    alignItems:
                                      'center',

                                    justifyContent:
                                      'center',

                                    fontSize:
                                      '0.68rem',

                                    fontWeight:
                                      '800',

                                    color:
                                      slot.breakType ===
                                      'tea'
                                        ? '#B45309'
                                        : '#15803D',

                                    background:
                                      slot.breakType ===
                                      'tea'
                                        ? '#FEF3C7'
                                        : '#DCFCE7',

                                    textAlign:
                                      'center',

                                    cursor:
                                      'default',
                                  }}
                                >
                                  {slot.breakType ===
                                  'tea'
                                    ? 'Tea Break'
                                    : 'Lunch Break'}
                                </div>
                              );
                            }

                            // -------------------------------------------------
                            // NORMAL TEACHING PERIOD
                            // -------------------------------------------------
                            const item = slot.item;

                            const code =
                              item?.subject_code || item?.code || '—';

                            const subjectName =
                              item?.subject_name || item?.name || '';

                            const faculty =
                              item?.faculty_name || item?.faculty || '';

                            const component = item?.component || '';
                            const room = item?.room || '';
                            const batch = item?.batch || '';

                            const isSelected =
                              Boolean(item) &&
                              selectedSlot.day === row.day &&
                              selectedSlot.period === `Period ${slot.period}`;

                            const hasEntry = Boolean(item);

                            return (
                              <div
                                key={`${row.day}-period-${slot.period}`}
                                className={
                                  hasEntry
                                    ? 'tt-slot-card timetable-filled-slot'
                                    : 'tt-slot-card timetable-empty-slot'
                                }
                                style={{
                                  minHeight: '60px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  border: isSelected
                                    ? '2px solid var(--primary)'
                                    : hasEntry
                                    ? '1px solid #CBD5E1'
                                    : '1px solid #E2E8F0',
                                  backgroundColor: isSelected
                                    ? '#E8F5E9'
                                    : hasEntry
                                    ? '#F8FAFC'
                                    : '#FFFFFF',
                                  color: '#0F172A',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  textAlign: 'center',
                                  padding: '4px 6px',
                                  overflow: 'hidden',
                                  borderRadius: '6px',
                                  transition: 'all 0.15s ease-in-out',
                                }}
                                onClick={() =>
                                  setSelectedSlot({
                                    day: row.day,
                                    period: `Period ${slot.period}`,
                                    subject: code,
                                    subject_id: item?.subject_id,
                                  })
                                }
                              >
                                {hasEntry ? (
                                  <>
                                    <div
                                      className="tt-subject-code"
                                      style={{
                                        color: 'var(--primary)',
                                        fontWeight: '800',
                                        fontSize: '0.78rem',
                                        letterSpacing: '0.02em',
                                        background:
                                          component === 'Lab'
                                            ? '#EFF6FF'
                                            : '#F1F5F9',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border:
                                          component === 'Lab'
                                            ? '1px solid #BFDBFE'
                                            : '1px solid #E2E8F0',
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                      title={code}
                                    >
                                      {code}
                                    </div>

                                    {subjectName && (
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
                                        title={subjectName}
                                      >
                                        {subjectName}
                                      </div>
                                    )}

                                    {faculty && (
                                      <div
                                        className="tt-faculty-name"
                                        style={{
                                          color: '#64748B',
                                          fontSize: '0.62rem',
                                          fontWeight: '600',
                                          marginTop: '2px',
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={faculty}
                                      >
                                        {faculty}
                                      </div>
                                    )}

                                    {(room || (component === 'Lab' && batch)) && (
                                      <div
                                        style={{
                                          fontSize: '0.58rem',
                                          color: '#94A3B8',
                                          marginTop: '1px',
                                          fontWeight: '500',
                                        }}
                                      >
                                        {component === 'Lab' && batch
                                          ? `${batch}`
                                          : ''}
                                        {component === 'Lab' && batch && room
                                          ? ` • ${room}`
                                          : room
                                          ? room
                                          : ''}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div
                                    style={{
                                      fontSize: '0.75rem',
                                      color: '#94A3B8',
                                      fontWeight: '500',
                                    }}
                                  >
                                    —
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )
                  )}
                </div>

                <div
                  style={{
                    fontSize:
                      '0.78rem',
                    color:
                      '#64748B',
                    marginTop:
                      '14px',
                    background:
                      '#F8FAFC',
                    padding:
                      '8px 14px',
                    borderRadius:
                      '8px',
                  }}
                >
                  ⓘ Note: All weekly slots (Monday to Saturday, Periods I–VII) are fully scheduled with core academic lectures, IPCC labs, Sports/Yoga/NCC, Remedial sessions, and Project work as per SKIT department guidelines.
                </div>
              </div>
            )}
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
                Hello Admin! How can I
                help you with the timetable
                today?
              </div>

              <div
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  gap: '8px',
                }}
              >
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

                {facultyList
                  .filter((faculty) => {
                    const id = String(getFacultyId(faculty));
                    return (projectedFacultyWorkload[id] ?? 0) < getFacultyMaxWorkload(faculty);
                  })
                  .slice(0, 4)
                  .map(
                    (
                      faculty,
                      index
                    ) => (
                      <div
                        key={
                          getFacultyId(
                            faculty
                          )
                        }
                        style={{
                          background:
                            '#FFFFFF',
                          border:
                            '1px solid #E2E8F0',
                          borderRadius:
                            '8px',
                          padding:
                            '10px',
                          marginBottom:
                            index <
                            3
                              ? '8px'
                              : 0,
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          alignItems:
                            'center',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize:
                                '0.78rem',
                              fontWeight:
                                '700',
                            }}
                          >
                            {getFacultyName(
                              faculty
                            )}
                          </div>

                          <div
                            style={{
                              fontSize:
                                '0.68rem',
                              color:
                                '#15803D',
                            }}
                          >
                            Within workload limit
                          </div>
                        </div>

                        <span className="badge badge-active">
                          {(() => {
                            const id = String(getFacultyId(faculty));
                            const max = getFacultyMaxWorkload(faculty);
                            const current = projectedFacultyWorkload[id] ?? 0;
                            return max > 0 ? Math.max(0, Math.min(100, Math.round((current / max) * 100))) : 0;
                          })()}%
                        </span>
                      </div>
                    )
                  )}

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
    </>
  );
}
