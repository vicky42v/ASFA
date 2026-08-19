const STORAGE_KEY = 'ai_asfa_generated_timetables_v2';

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listGeneratedTimetables() {
  return readAll().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function saveGeneratedTimetable(record) {
  const item = {
    id: record.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: record.created_at || new Date().toISOString(),
    ...record,
  };
  const items = readAll();
  items.unshift(item);
  writeAll(items.slice(0, 300));
  return item;
}

export function removeGeneratedTimetable(id) {
  writeAll(readAll().filter((item) => String(item.id) !== String(id)));
}

export function clearGeneratedTimetables() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getGeneratedDepartments() {
  const map = new Map();
  listGeneratedTimetables().forEach((item) => {
    const key = String(item.department_id ?? item.department_name ?? 'unknown');
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        name: item.department_name || `Department ${key}`,
        count: 0,
      });
    }
    map.get(key).count += 1;
  });
  return [...map.values()];
}
