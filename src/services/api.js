const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({ success: false, message: 'Invalid server response.' }));
  if (!response.ok || !body.success) throw new Error(body.message || 'Request failed.');
  return body.data;
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

export const authApi = { login: (email, password) => api.post('/auth/login', { email, password }), logout: () => api.post('/auth/logout'), me: () => api.get('/auth/me') };
export const departmentApi = { list: (search = '') => api.get(`/departments?search=${encodeURIComponent(search)}`), create: (data) => api.post('/departments', data), update: (id, data) => api.patch(`/departments/${id}`, data), deactivate: (id) => api.delete(`/departments/${id}`) };
export const facultyApi = { list: (search = '') => api.get(`/faculty?search=${encodeURIComponent(search)}`), detail: (id) => api.get(`/faculty/${id}`), create: (data) => api.post('/faculty', data), update: (id, data) => api.patch(`/faculty/${id}`, data), deactivate: (id) => api.delete(`/faculty/${id}`) };
export const subjectApi = { list: (search = '') => api.get(`/subjects?search=${encodeURIComponent(search)}`), create: (data) => api.post('/subjects', data), update: (id, data) => api.patch(`/subjects/${id}`, data), deactivate: (id) => api.delete(`/subjects/${id}`) };
export const schemeApi = { list: () => api.get('/schemes'), create: (data) => api.post('/schemes', data) };
export const semesterApi = { list: () => api.get('/semesters') };
export const constraintApi = { list: (data) => api.get(`/timetable-constraints?${new URLSearchParams(data)}`) };
export const timetableApi = { list: (data) => api.get(`/timetable?${new URLSearchParams(data)}`), generate: (data) => api.post('/timetable/generate', data), validate: (data) => api.post('/timetable/validate', data), save: (data) => api.post('/timetable/save', data) };
export const dashboardApi = { summary: () => api.get('/dashboard'), reports: () => api.get('/reports/summary') };
export const notificationApi = { list: () => api.get('/notifications'), create: (data) => api.post('/notifications', data) };
export const chatbotApi = { send: (message) => api.post('/chat', { message }) };
export const userApi = { list: () => api.get('/users'), create: (data) => api.post('/users', data), update: (id, data) => api.patch(`/users/${id}`, data) };
export const auditApi = { list: () => api.get('/audit-logs') };
export const backupApi = { list: () => api.get('/backups'), create: () => api.post('/backups'), restore: (id, confirmation) => api.post(`/backups/${id}/restore`, { confirmation }) };
export const settingsApi = { list: () => api.get('/settings'), save: (values) => api.put('/settings', values) };
