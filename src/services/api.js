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
        if (value !== undefined && value !== null && value !== '') {
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

  generate: (data) =>
    api.post(
      '/timetable/generate',
      data
    ),

  validate: (data) =>
    api.post(
      '/timetable/validate',
      data
    ),

  save: (data) =>
    api.post(
      '/timetable/save',
      data
    ),
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
