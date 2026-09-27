const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:5000/api';

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    throw new Error(
      `Cannot connect to the backend at ${API_BASE}. ` +
      'Make sure the Flask server is running.'
    );
  }

  const body = await response
    .json()
    .catch(() => ({
      success: false,
      message: `Server returned HTTP ${response.status} with an invalid JSON response.`,
    }));

  if (!response.ok || body?.success === false) {
    const validationErrors =
      body?.validation?.errors ||
      body?.data?.validation?.errors ||
      [];

    const conflictErrors =
      body?.conflicts ||
      body?.data?.conflicts ||
      [];

    const message =
      body?.message ||
      body?.error ||
      (validationErrors.length
        ? validationErrors.join(' ')
        : '') ||
      (conflictErrors.length
        ? conflictErrors
            .map((item) =>
              typeof item === 'string'
                ? item
                : item?.message
            )
            .filter(Boolean)
            .join(' ')
        : '') ||
      `Request failed (HTTP ${response.status}).`;

    const error = new Error(message);

    error.status = response.status;
    error.response = body;
    error.validation = body?.validation;
    error.conflicts = conflictErrors;

    throw error;
  }

  // Backend responses created by ok() normally return:
  // { success: true, data: ... }
  //
  // Keep this fallback so the frontend also works if a route
  // returns { success: true, ... } directly.
  return Object.prototype.hasOwnProperty.call(body, 'data')
    ? body.data
    : body;
}

// ============================================================
// NATIVE ASFA BACKEND API
// ============================================================
// BASIC API OBJECT
// ============================================================

export const api = {
  get: (path) =>
    request(path),

  post: (path, data) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  patch: (path, data) =>
    request(path, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  put: (path, data) =>
    request(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (path) =>
    request(path, {
      method: 'DELETE',
    }),
};

// ============================================================
// AUTHENTICATION
// ============================================================

export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', {
      email,
      password,
    }),

  logout: () =>
    api.post('/auth/logout'),

  me: () =>
    api.get('/auth/me'),
};

// ============================================================
// DEPARTMENTS
// ============================================================

export const departmentApi = {
  list: (search = '') =>
    api.get(
      `/departments?search=${encodeURIComponent(search)}`
    ),

  create: (data) =>
    api.post('/departments', data),

  update: (id, data) =>
    api.patch(`/departments/${id}`, data),

  deactivate: (id) =>
    api.delete(`/departments/${id}`),
};

// ============================================================
// FACULTY
// ============================================================

export const facultyApi = {
  list: (search = '', departmentId = '') =>
    api.get(
      `/faculty?search=${encodeURIComponent(search)}${
        departmentId
          ? `&department_id=${encodeURIComponent(departmentId)}`
          : ''
      }`
    ),

  detail: (id) =>
    api.get(`/faculty/${id}`),

  create: (data) =>
    api.post('/faculty', data),

  update: (id, data) =>
    api.patch(`/faculty/${id}`, data),

  deactivate: (id) =>
    api.delete(`/faculty/${id}`),
};

// ============================================================
// FACULTY ↔ SUBJECT ELIGIBILITY
// ============================================================

export const facultySubjectApi = {
  list: () =>
    api.get('/faculty-subjects'),

  create: (data) =>
    api.post('/faculty-subjects', data),

  delete: (id) =>
    api.delete(`/faculty-subjects/${id}`),
};

// ============================================================
// FACULTY ↔ SUBJECT ASSIGNMENTS
// ============================================================

export const facultyAssignmentApi = {
  list: (academicYear = '', extra = {}) => {
    const params = new URLSearchParams();

    if (academicYear) {
      params.set(
        'academic_year',
        academicYear
      );
    }

    Object.entries(extra || {}).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          params.set(key, value);
        }
      }
    );

    const query = params.toString();

    return api.get(
      `/faculty-subject-assignments${
        query ? `?${query}` : ''
      }`
    );
  },

  create: (data) =>
    api.post(
      '/faculty-subject-assignments',
      data
    ),

  update: (id, data) =>
    api.patch(
      `/faculty-subject-assignments/${id}`,
      data
    ),
};

// ============================================================
// COMPONENT-LEVEL FACULTY ASSIGNMENTS
// ============================================================
//
// The Flask/MySQL database remains the source of truth.
//
// The frontend saves the real assignment rows through Flask.
// After the complete assignment set has been verified, the
// frontend calls notifySaveAssignments() ONCE so n8n receives
// the complete real assignment payload.
// ============================================================

export const facultyAssignmentDetailApi = {
  list: (data = {}) =>
    api.get(
      `/faculty-assignment-details?${new URLSearchParams(data)}`
    ),

  // Save one real assignment to Flask/MySQL.
  save: (data) =>
    api.post(
      '/faculty-assignment-details',
      data
    ),

  notifySaveAssignments: async () => ({ success: true }),

  clear: (
    subjectId,
    component,
    academicYear,
    assignmentRole = 'Main'
  ) =>
    api.delete(
      `/faculty-assignment-details/${subjectId}/${component}?academic_year=${encodeURIComponent(
        academicYear
      )}&assignment_role=${encodeURIComponent(
        assignmentRole
      )}`
    ),
};

// ============================================================
// SUBJECTS
// ============================================================

export const subjectApi = {
  list: (search = '') =>
    api.get(
      `/subjects?search=${encodeURIComponent(search)}`
    ),

  create: (data) =>
    api.post('/subjects', data),

  update: (id, data) =>
    api.patch(`/subjects/${id}`, data),

  deactivate: (id) =>
    api.delete(`/subjects/${id}`),
};

// ============================================================
// SCHEMES
// ============================================================

export const schemeApi = {
  list: () =>
    api.get('/schemes'),

  create: (data) =>
    api.post('/schemes', data),
};

// ============================================================
// SEMESTERS
// ============================================================

export const semesterApi = {
  list: () =>
    api.get('/semesters'),
};

// ============================================================
// TIMETABLE CONSTRAINTS
// ============================================================

export const constraintApi = {
  list: (data = {}) =>
    api.get(
      `/timetable-constraints?${new URLSearchParams(data)}`
    ),
};

// ============================================================
// TIMETABLE
// ============================================================

export const timetableApi = {
  list: (data = {}) =>
    api.get(
      `/timetable?${new URLSearchParams(data)}`
    ),

  // ==========================================================
  // GENERATE TIMETABLE THROUGH N8N
  // ==========================================================
  //
  // Frontend
  //    ↓
  // n8n
  //    ↓
  // MySQL assignments
  //    ↓
  // AI model
  //    ↓
  // validation
  //    ↓
  // n8n response
  //    ↓
  // Frontend
  //
  // No PowerShell is required.
  // ==========================================================

  generate: async (data) => {
    return await api.post('/timetable/generate', data);
  },

  // Keep the normal Flask validation endpoint.
  validate: (data) =>
    api.post(
      '/timetable/validate',
      data
    ),

  // Keep the normal Flask save endpoint.
  save: (data) =>
    api.post(
      '/timetable/save',
      data
    ),
};

// ============================================================
// AI TIMETABLE CONFLICT RESOLUTION (NATIVE ASFA MODEL 3)
// ============================================================

export const timetableAiApi = {
  resolve: (data) =>
    api.post('/timetable/generate', {
      ...data,
      number_of_outputs: 1,
    }),

  status: () =>
    api.get('/timetable/ai-status'),
};

// ============================================================
// DASHBOARD
// ============================================================

export const dashboardApi = {
  summary: () =>
    api.get('/dashboard'),

  reports: () =>
    api.get('/reports/summary'),
};

// ============================================================
// NOTIFICATIONS
// ============================================================

export const notificationApi = {
  list: () =>
    api.get('/notifications'),

  create: (data) =>
    api.post('/notifications', data),
};

// ============================================================
// AI CHATBOT
// ============================================================

export const chatbotApi = {
  send: (message) =>
    api.post('/chat', {
      message,
    }),
};

// ============================================================
// USERS / ROLE MANAGEMENT
// ============================================================

export const userApi = {
  list: () =>
    api.get('/users'),

  create: (data) =>
    api.post('/users', data),

  update: (id, data) =>
    api.patch(`/users/${id}`, data),
};

// ============================================================
// AUDIT LOGS
// ============================================================

export const auditApi = {
  list: () =>
    api.get('/audit-logs'),
};

// ============================================================
// BACKUP & RESTORE
// ============================================================

export const backupApi = {
  list: () =>
    api.get('/backups'),

  create: () =>
    api.post('/backups'),

  restore: (id, confirmation) =>
    api.post(
      `/backups/${id}/restore`,
      {
        confirmation,
      }
    ),
};

// ============================================================
// SETTINGS
// ============================================================

export const settingsApi = {
  list: () =>
    api.get('/settings'),

  save: (values) =>
    api.put(
      '/settings',
      values
    ),
};

// ============================================================
// ASFA ENGINE & RULES API
// ============================================================

export const asfaApi = {
  getRules: (params = '') =>
    api.get(`/rules${params ? (params.startsWith('?') ? params : `?${params}`) : ''}`),

  createRule: (data) =>
    api.post('/rules', data),

  updateRule: (id, data) =>
    api.put(`/rules/${id}`, data),

  deleteRule: (id) =>
    api.delete(`/rules/${id}`),

  getFacultyPreference: (facultyId, academicYear = '2026-27') =>
    api.get(`/faculty/${facultyId}/preference?academic_year=${academicYear}`),

  saveFacultyPreference: (facultyId, data) =>
    api.post(`/faculty/${facultyId}/preference`, data),

  getMetrics: () =>
    api.get('/asfa/metrics'),

  getHistory: () =>
    api.get('/asfa/history'),

  trainModel: () =>
    api.post('/asfa/train'),
};