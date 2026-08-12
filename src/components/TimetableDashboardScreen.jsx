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
} from 'lucide-react';

import {
  api,
  timetableApi,
  facultyApi,
  subjectApi,
} from '../services/api';

export default function TimetableDashboardScreen() {
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
  });

  // =========================================================
  // ASSIGNMENT STATE
  // =========================================================

  const [facultyAssignments, setFacultyAssignments] =
    useState({});

  const [savedAssignments, setSavedAssignments] =
    useState([]);

  const [assignmentSearch, setAssignmentSearch] =
    useState('');

  const [assignmentLoading, setAssignmentLoading] =
    useState(false);

  const [assignmentSaving, setAssignmentSaving] =
    useState(false);

  // =========================================================
  // TIMETABLE STATE
  // =========================================================

  const [selectedSlot, setSelectedSlot] = useState({
    day: 'Tuesday',
    period: 'Period V (1:45 - 2:40)',
    subject: 'Project (Team Based)',
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
    return (
      subject?.course_category ||
      subject?.vtu_category ||
      subject?.category ||
      subject?.current_category ||
      subject?.group_name ||
      subject?.group ||
      'Unclassified'
    );
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

  // Weekly workload contribution of a subject. This matches the
  // backend faculty workload calculation: lecture + tutorial + practical hours.
  const getSubjectWorkloadHours = (subject) =>
    Number(subject?.lecture_hours || 0) +
    Number(subject?.tutorial_hours || 0) +
    Number(subject?.practical_hours || 0);

  const getFacultyMaxWorkload = (faculty) => {
    const value = Number(faculty?.max_workload);
    return Number.isFinite(value) ? value : 0;
  };

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
          semesters.find(
            (semester) =>
              Number(
                getSemesterNo(
                  semester
                )
              ) === semesterNo &&
              normalizeSemesterType(
                semester?.semester_type ??
                  semester?.type
              ) ===
                context.semester_type
          )
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

        const firstDepartment =
          departmentsArray[0];

        const firstScheme =
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
          }) || schemesArray[0];

        // Highest Odd semester first.
        //
        // 7 -> 5 -> 3 -> 1
        const firstOddSemester =
          semestersArray
            .filter(
              (semester) =>
                normalizeSemesterType(
                  semester?.semester_type ??
                    semester?.type
                ) === 'Odd'
            )
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
  }, []);

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
          const allFaculty = Array.isArray(allFacultyData)
            ? allFacultyData
            : [];

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

          // If department metadata is incomplete, keep all active
          // faculty so the admin can still assign them manually.
          if (faculty.length === 0) {
            faculty = allFaculty;
          }

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
              'items',
              'rows',
            ]
          );

          setSavedAssignments(
            assignments
          );

          const assignmentMap = {};

          assignments.forEach(
            (assignment) => {
              if (
                assignment.subject_id &&
                assignment.faculty_id
              ) {
                assignmentMap[
                  String(
                    assignment.subject_id
                  )
                ] = String(
                  assignment.faculty_id
                );
              }
            }
          );

          setFacultyAssignments(
            assignmentMap
          );
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

      let result = subjectList.filter(baseFilter);

      // IMPORTANT FALLBACK:
      // Some database/API versions expose semester information only
      // through semester_no, or omit department/scheme metadata.
      // Never show a blank assignment page merely because one of those
      // optional fields is missing.
      if (result.length === 0) {
        result = subjectList.filter((subject) => {
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

      // Last safe fallback: if the API returned subjects but their
      // semester metadata is inconsistent, show the subjects rather
      // than blocking faculty assignment completely. The selected
      // semester is still passed to the assignment/generation APIs.
      if (result.length === 0 && subjectList.length > 0) {
        result = subjectList.filter(matchesSearch);
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
      optional &&
      (category === 'PEC' || category === 'OEC')
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

  const visibleSubjects = useMemo(() => {
    const selectedByGroup = {};

    filteredSubjects.forEach((subject) => {
      if (!isChoiceSubject(subject)) {
        return;
      }

      const groupKey =
        getOptionGroupKey(subject);

      if (!groupKey) {
        return;
      }

      const subjectId = String(
        getSubjectId(subject)
      );

      if (facultyAssignments[subjectId]) {
        selectedByGroup[groupKey] =
          subjectId;
      }
    });

    return filteredSubjects.filter(
      (subject) => {
        if (!isChoiceSubject(subject)) {
          return true;
        }

        const groupKey =
          getOptionGroupKey(subject);

        // No option group -> normal subject.
        if (!groupKey) {
          return true;
        }

        const selectedSubjectId =
          selectedByGroup[groupKey];

        // No option selected yet:
        // show every alternative.
        if (!selectedSubjectId) {
          return true;
        }

        // An option is selected:
        // show ONLY that option.
        return (
          String(
            getSubjectId(subject)
          ) === selectedSubjectId
        );
      }
    );
  }, [
    filteredSubjects,
    facultyAssignments,
  ]);

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
      if (!isChoiceSubject(subject)) {
        result.push(subject);
        return;
      }

      const groupKey =
        getOptionGroupKey(subject);

      // PEC/OEC without a valid option group behaves
      // like a normal subject.
      if (!groupKey) {
        result.push(subject);
        return;
      }

      const subjectId = String(
        getSubjectId(subject)
      );

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
        (subject) =>
          !facultyAssignments[
            String(
              getSubjectId(subject)
            )
          ]
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

    facultyList.forEach((faculty) => {
      const id = String(getFacultyId(faculty));
      result[id] = getFacultyDatabaseWorkload(faculty);
    });

    const visibleSubjectIds = new Set(
      filteredSubjects.map((subject) => String(getSubjectId(subject)))
    );

    // Remove the DB contribution of visible subjects from the base
    // workload, then add the currently selected faculty back in.
    // This prevents double-counting when the user changes faculty.
    savedAssignments.forEach((assignment) => {
      if (String(assignment.status ?? 'Active').toLowerCase() !== 'active') return;

      const subjectId = String(assignment.subject_id ?? '');
      if (!visibleSubjectIds.has(subjectId)) return;

      const subject = subjectList.find(
        (item) => String(getSubjectId(item)) === subjectId
      );
      if (!subject) return;

      const facultyId = String(assignment.faculty_id ?? '');
      if (result[facultyId] !== undefined) {
        result[facultyId] -= getSubjectWorkloadHours(subject);
      }
    });

    filteredSubjects.forEach((subject) => {
      const subjectId = String(getSubjectId(subject));
      const facultyId = facultyAssignments[subjectId];
      if (!facultyId) return;

      const key = String(facultyId);
      if (result[key] === undefined) result[key] = 0;
      result[key] += getSubjectWorkloadHours(subject);
    });

    Object.keys(result).forEach((key) => {
      result[key] = Math.max(0, Number(result[key].toFixed(2)));
    });

    return result;
  }, [
    facultyList,
    savedAssignments,
    subjectList,
    filteredSubjects,
    facultyAssignments,
  ]);

  const workloadExceededFaculty = useMemo(() => {
    return facultyList.filter((faculty) => {
      const id = String(getFacultyId(faculty));
      const max = getFacultyMaxWorkload(faculty);
      const current = projectedFacultyWorkload[id] ?? 0;
      return max > 0 && current > max;
    });
  }, [facultyList, projectedFacultyWorkload]);

  // =========================================================
  // SELECT FACULTY
  // =========================================================

  const handleFacultyChange = (
    subject,
    facultyId
  ) => {
    const subjectId =
      getSubjectId(subject);

    setFacultyAssignments(
      (current) => ({
        ...current,

        [String(subjectId)]:
          facultyId,
      })
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
        })
      );

      setFacultyAssignments({});
      setAssignmentSearch('');
      setEntries([]);
      setGeneratedSemesters({});
      setMessage('');
    };

  // =========================================================
  // SELECT SEMESTER
  //
  // Empty = ALL
  // =========================================================

  const handleSemesterSelect =
    (semesterId) => {
      setContext(
        (current) => ({
          ...current,

          semester_id:
            semesterId,
        })
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
      setContext(
        (current) => ({
          ...current,

          department_id:
            departmentId,

          semester_id: '',
        })
      );

      setFacultyAssignments({});
      setEntries([]);
      setGeneratedSemesters({});
      setMessage('');
    };

  // =========================================================
  // SAVE FACULTY ASSIGNMENTS
  // =========================================================

  const saveFacultyAssignments =
    async () => {
      try {
        setAssignmentSaving(true);
        setMessage('');

        const selectedSubjects = requiredSubjects.filter(
          (subject) => {
            const id = String(getSubjectId(subject));
            return Boolean(facultyAssignments[id]);
          }
        );

        if (selectedSubjects.length === 0) {
          setMessage(
            'Please assign faculty to at least one subject before saving.'
          );
          return;
        }

        const activeAssignments = savedAssignments.filter(
          (assignment) =>
            String(assignment.status ?? 'Active').toLowerCase() ===
            'active'
        );

        const exceeded = workloadExceededFaculty;
        if (exceeded.length > 0) {
          const details = exceeded
            .map((faculty) => {
              const id = String(getFacultyId(faculty));
              return `${getFacultyName(faculty)} (${projectedFacultyWorkload[id]}h / ${getFacultyMaxWorkload(faculty)}h)`;
            })
            .join(', ');

          setMessage(`Workload limit exceeded: ${details}. Reduce the assignments before saving.`);
          return;
        }

        let changed = 0;

        for (const subject of selectedSubjects) {
          const subjectId = String(getSubjectId(subject));
          const desiredFacultyId = String(
            facultyAssignments[subjectId]
          );


          const existing = activeAssignments.filter(
            (assignment) =>
              String(assignment.subject_id) === subjectId
          );

          // -------------------------------------------------------
          // PEC/OEC OPTION GROUP
          //
          // If one option is selected, deactivate any other
          // active faculty assignment belonging to the same
          // option group. This keeps the database consistent
          // with the frontend: only the chosen elective remains
          // active for timetable generation.
          // -------------------------------------------------------

          if (isChoiceSubject(subject)) {
            const optionGroupId =
              getOptionGroupId(subject);

            if (
              optionGroupId !== null &&
              optionGroupId !== undefined &&
              optionGroupId !== ''
            ) {
              const currentSemesterId = String(
                subject?.semester_id ??
                  subject?.semesterId ??
                  ''
              );

              const currentCategory = String(
                getCourseCategory(subject)
              )
                .trim()
                .toUpperCase();

              const siblingSubjects =
                subjectList.filter(
                  (candidate) =>
                    isChoiceSubject(candidate) &&
                    String(
                      getOptionGroupId(candidate)
                    ) === String(optionGroupId) &&
                    String(
                      candidate?.semester_id ??
                        candidate?.semesterId ??
                        ''
                    ) === currentSemesterId &&
                    String(
                      getCourseCategory(candidate)
                    )
                      .trim()
                      .toUpperCase() === currentCategory
                );

              const siblingSubjectIds =
                siblingSubjects.map(
                  (candidate) =>
                    String(
                      getSubjectId(candidate)
                    )
                );

              const oldSiblingAssignments =
                activeAssignments.filter(
                  (assignment) =>
                    siblingSubjectIds.includes(
                      String(
                        assignment.subject_id
                      )
                    ) &&
                    String(
                      assignment.subject_id
                    ) !== subjectId
                );

              for (
                const siblingAssignment of oldSiblingAssignments
              ) {
                await api.patch(
                  `/faculty-subject-assignments/${getAssignmentId(siblingAssignment)}`,
                  {
                    status: 'Inactive',
                  }
                );
              }
            }
          }

          const alreadyCorrect = existing.some(
            (assignment) =>
              String(assignment.faculty_id) === desiredFacultyId
          );

          if (alreadyCorrect && existing.length === 1) {
            continue;
          }

          // Deactivate old active assignment(s) first. The backend
          // exposes PATCH for changing assignment status.
          for (const assignment of existing) {
            if (
              String(assignment.faculty_id) !==
                desiredFacultyId ||
              existing.length > 1
            ) {
              await api.patch(
                `/faculty-subject-assignments/${getAssignmentId(assignment)}`,
                { status: 'Inactive' }
              );
            }
          }

          if (!alreadyCorrect || existing.length > 1) {
            await api.post(
              '/faculty-subject-assignments',
              {
                faculty_id: Number(desiredFacultyId),
                subject_id: Number(subjectId),
                academic_year: context.academic_year,
                status: 'Active',
              }
            );
            changed += 1;
          }
        }

        const params = new URLSearchParams({
          academic_year: context.academic_year,
          department_id: context.department_id || '',
          semester_type: context.semester_type || '',
        });

        const refreshed = await api.get(
          `/faculty-subject-assignments?${params.toString()}`
        );

        const refreshedAssignments = Array.isArray(refreshed)
          ? refreshed
          : [];

        setSavedAssignments(refreshedAssignments);

        // Rebuild local assignment state only from active rows.
        const assignmentMap = {};
        refreshedAssignments.forEach((assignment) => {
          if (
            String(assignment.status ?? 'Active').toLowerCase() === 'active' &&
            assignment.subject_id &&
            assignment.faculty_id
          ) {
            assignmentMap[String(assignment.subject_id)] =
              String(assignment.faculty_id);
          }
        });

        setFacultyAssignments(assignmentMap);

        setMessage(
          changed === 0
            ? 'Assignments are already saved. No changes were required.'
            : `${changed} faculty assignment${changed === 1 ? '' : 's'} saved successfully.`
        );
      } catch (error) {
        console.error(
          'Failed to save assignments:',
          error
        );

        setMessage(
          error?.message ||
            'Failed to save faculty assignments.'
        );
      } finally {
        setAssignmentSaving(false);
      }
    };

  // =========================================================
  // GO TO GENERATOR
  // =========================================================

  const handleGoToGenerator =
    () => {
      if (
        missingOptionGroups.length >
        0
      ) {
        setMessage(
          `${missingOptionGroups.length} PEC/OEC option group${
            missingOptionGroups.length === 1
              ? ''
              : 's'
          } still need a subject to be selected.`
        );

        return;
      }

      if (
        missingAssignments.length >
        0
      ) {
        setMessage(
          `${missingAssignments.length} subject(s) still need faculty assignment.`
        );

        return;
      }

      setMessage('');
      setMainView('generate');
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

          const timetable =
            result?.timetable || [];

          setEntries(timetable);

          setGeneratedSemesters({
            [String(
              semesterNo
            )]: timetable,
          });

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
              entries,
            });

          setMessage(
            `${result.saved_entries} sessions saved for ${getSemesterLabel(
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
              )
                ? getSemesterNo(
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
                    )
                  )
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
      entries.find(
        (entry) =>
          entry.day === day &&
          Number(entry.period) === period
      );

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
          ) : filteredSubjects.length ===
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
                    (subject) => {
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

                      return (
                        <tr
                          key={
                            subjectId
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
                            <select
                              className="form-select"
                              style={{
                                minWidth:
                                  '280px',
                              }}
                              value={
                                selectedFaculty
                              }
                              onChange={(
                                e
                              ) =>
                                handleFacultyChange(
                                  subject,
                                  e
                                    .target
                                    .value
                                )
                              }
                            >
                              <option value="">
                                Select Faculty
                              </option>

                              {getAssignableFaculty().map(
                                (
                                  faculty
                                ) => (
                                  <option
                                    key={getFacultyId(
                                      faculty
                                    )}
                                    value={getFacultyId(
                                      faculty
                                    )}
                                  >
                                    {getFacultyName(
                                      faculty
                                    )}

                                    {getFacultyRole(
                                      faculty
                                    )
                                      ? ` — ${getFacultyRole(
                                          faculty
                                        )}`
                                      : ''}
                                  </option>
                                )
                              )}
                            </select>

                            {selectedFaculty && (() => {
                              const selected = facultyList.find(
                                (item) => String(getFacultyId(item)) === String(selectedFaculty)
                              );
                              if (!selected) return null;

                              const id = String(getFacultyId(selected));
                              const current = projectedFacultyWorkload[id] ?? 0;
                              const max = getFacultyMaxWorkload(selected);
                              const exceeded = max > 0 && current > max;

                              return (
                                <div
                                  style={{
                                    marginTop: '5px',
                                    fontSize: '0.68rem',
                                    color: exceeded ? '#B91C1C' : '#64748B',
                                    fontWeight: '700',
                                  }}
                                >
                                  Workload: {current}h{max > 0 ? ` / ${max}h` : ''}
                                  {exceeded ? ' — limit exceeded' : ''}
                                </div>
                              );
                            })()}
                          </td>

                          <td>
                            {selectedFaculty ? (
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
                onClick={() =>
                  setFacultyAssignments(
                    {}
                  )
                }
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
                onClick={
                  handleGoToGenerator
                }
                disabled={
                  missingOptionGroups.length > 0 ||
                  missingAssignments.length > 0
                }
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

              <button className="btn-secondary">
                <Download
                  size={16}
                />
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
                              {entry.subject_code ||
                                entry.code ||
                                '—'}
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
                      <th>MAX</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facultyList.map((faculty) => {
                      const facultyId = String(getFacultyId(faculty));
                      const current = projectedFacultyWorkload[facultyId] ?? 0;
                      const max = getFacultyMaxWorkload(faculty);
                      const exceeded = max > 0 && current > max;
                      const percentage = max > 0 ? Math.round((current / max) * 100) : 0;

                      return (
                        <tr key={facultyId}>
                          <td style={{ fontWeight: '800' }}>{getFacultyName(faculty)}</td>
                          <td>{getFacultyRole(faculty) || '—'}</td>
                          <td style={{ fontWeight: '800' }}>{current} hrs</td>
                          <td>{max > 0 ? `${max} hrs` : 'Not set'}</td>
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
                            const item =
                              slot.item;

                            const code =
                              item?.subject_code ||
                              item?.code ||
                              '—';

                            const faculty =
                              item?.faculty_name ||
                              item?.faculty ||
                              '';

                            const isSelected =
                              Boolean(item) &&
                              selectedSlot.day ===
                                row.day &&
                              selectedSlot.period ===
                                `Period ${slot.period}`;

                            const hasEntry =
                              Boolean(item);

                            return (
                              <div
                                key={
                                  `${row.day}-period-${slot.period}`
                                }
                                className={
                                  hasEntry
                                    ? 'tt-slot-card timetable-filled-slot'
                                    : 'tt-slot-card timetable-empty-slot'
                                }
                                style={{
                                  minHeight:
                                    '50px',

                                  width:
                                    '100%',

                                  boxSizing:
                                    'border-box',

                                  border:
                                    isSelected
                                      ? '2px solid var(--primary)'
                                      : '1px solid #E2E8F0',

                                  backgroundColor:
                                    isSelected
                                      ? '#E8F5E9'
                                      : '#FFFFFF',

                                  color:
                                    '#0F172A',

                                  cursor:
                                    'pointer',

                                  display:
                                    'flex',

                                  flexDirection:
                                    'column',

                                  alignItems:
                                    'center',

                                  justifyContent:
                                    'center',

                                  textAlign:
                                    'center',

                                  overflow:
                                    'hidden',
                                }}
                                onClick={() =>
                                  setSelectedSlot(
                                    {
                                      day:
                                        row.day,

                                      period:
                                        `Period ${slot.period}`,

                                      subject:
                                        code,
                                    }
                                  )
                                }
                              >
                                <div
                                  className="tt-subject-code"
                                  style={{
                                    color:
                                      hasEntry
                                        ? 'var(--primary)'
                                        : '#64748B',

                                    fontWeight:
                                      '800',
                                  }}
                                >
                                  {code}
                                </div>

                                {faculty && (
                                  <div
                                    className="tt-faculty-name"
                                    style={{
                                      color:
                                        '#64748B',

                                      fontSize:
                                        '0.65rem',

                                      marginTop:
                                        '3px',

                                      maxWidth:
                                        '95%',

                                      overflow:
                                        'hidden',

                                      textOverflow:
                                        'ellipsis',

                                      whiteSpace:
                                        'nowrap',
                                    }}
                                  >
                                    {faculty}
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
                  ⓘ Note: Saturdays are
                  reserved for Project work /
                  Team based activities as per
                  department guidelines.
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
                            Available
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
          onClick={() =>
            setMainView(
              'generate'
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