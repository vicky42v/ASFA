import React, { useMemo, useState } from 'react';
import { CalendarDays, Download, Eye, Trash2, RefreshCw } from 'lucide-react';
import { listGeneratedTimetables, removeGeneratedTimetable } from '../services/timetableStorage';
import { exportTimetableCsv, printTimetable } from '../services/timetableExport';

export default function GeneratedTimetablesScreen({ onOpen, onRegenerate }) {
  const [items, setItems] = useState(() => listGeneratedTimetables());
  const [department, setDepartment] = useState('ALL');
  const [page, setPage] = useState(0);

  const departments = useMemo(() => {
    const seen = new Map();
    items.forEach((item) => {
      const key = String(item.department_id ?? item.department_name ?? 'unknown');
      if (!seen.has(key)) seen.set(key, item.department_name || `Department ${key}`);
    });
    return [['ALL', 'All Departments'], ...seen.entries()];
  }, [items]);

  const filtered = useMemo(() => {
    if (department === 'ALL') return items;
    return items.filter((item) => String(item.department_id ?? item.department_name) === department);
  }, [items, department]);

  const visible = filtered.slice(page * 3, page * 3 + 3);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 3));

  const refresh = () => {
    setItems(listGeneratedTimetables());
    setPage(0);
  };

  const remove = (id) => {
    removeGeneratedTimetable(id);
    refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="skit-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Generated Timetables</h2>
            <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: 13 }}>
              Saved generation history grouped by department. Three timetable files are shown at a time.
            </p>
          </div>
          <button className="btn-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {departments.map(([id, name]) => (
            <button key={id} className={department === id ? 'btn-primary' : 'btn-secondary'} onClick={() => { setDepartment(id); setPage(0); }}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="skit-card" style={{ padding: 50, textAlign: 'center', color: '#64748B' }}>
          <CalendarDays size={30} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 800 }}>No generated timetable files yet.</div>
          <div style={{ fontSize: 12, marginTop: 5 }}>Generate a timetable and use Save/Store Generation.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {visible.map((item) => (
            <div key={item.id} className="skit-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{item.department_name || 'Department'}</div>
                  <div style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>
                    Semester {item.semester_no ?? '—'} · {item.semester_type || '—'}
                  </div>
                </div>
                <span className="badge badge-active">Option {item.alternative_id || 1}</span>
              </div>

              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{item.title || 'Generated Timetable'}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 5 }}>
                  {item.entries?.length || 0} scheduled slots · {new Date(item.created_at).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <button className="btn-primary" onClick={() => onOpen?.(item)}><Eye size={14} /> Open</button>
                <button className="btn-secondary" onClick={() => onRegenerate?.(item)}><RefreshCw size={14} /> Regenerate</button>
                <button className="btn-secondary" onClick={() => exportTimetableCsv(item.entries, `${item.department_name || 'department'}-sem-${item.semester_no || 'x'}-option-${item.alternative_id || 1}.csv`)}><Download size={14} /> CSV</button>
                <button className="btn-secondary" onClick={() => printTimetable(item.entries, item.title || 'AI-ASFA Timetable')}>Print / PDF</button>
                <button className="btn-secondary" style={{ gridColumn: '1 / -1' }} onClick={() => remove(item.id)}><Trash2 size={14} /> Delete File</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
        <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span style={{ fontSize: 12, fontWeight: 800 }}>Page {page + 1} / {pageCount}</span>
        <button className="btn-secondary" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
