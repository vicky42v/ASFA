import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, Users } from 'lucide-react';
import { api, facultyApi } from '../services/api';

export default function FacultyManagementScreen({ departments = [], onCreate, onUpdate, onDelete }) {
  const [faculty, setFaculty] = useState([]);
  const [departmentId, setDepartmentId] = useState('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const result = await facultyApi.list('');
    const list = Array.isArray(result) ? result : (result?.faculty || result?.faculties || result?.items || result?.rows || result?.data || []);
    setFaculty(list);
  };

  useEffect(() => { load().catch(console.error); }, []);

  const filtered = useMemo(() => faculty.filter((item) => {
    const dept = item.department_id ?? item.departmentId;
    const name = String(item.faculty_name ?? item.name ?? '').toLowerCase();
    const email = String(item.email ?? '').toLowerCase();
    const matchesDept = departmentId === 'ALL' || String(dept) === String(departmentId);
    const matchesSearch = !search.trim() || name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
    return matchesDept && matchesSearch;
  }), [faculty, departmentId, search]);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: form.get('name')?.toString().trim(),
      email: form.get('email')?.toString().trim() || null,
      department_id: Number(form.get('department_id')),
      designation: form.get('designation')?.toString(),
      max_workload: Number(form.get('max_workload') || 0),
      status: form.get('status')?.toString() || 'Active',
    };

    if (editing) {
      if (onUpdate) await onUpdate(editing.id ?? editing.faculty_id, payload);
      else await api.patch(`/faculty/${editing.id ?? editing.faculty_id}`, payload);
    } else {
      if (onCreate) await onCreate(payload);
      else await api.post('/faculty', payload);
    }
    setEditing(null);
    await load();
  };

  const remove = async (item) => {
    const id = item.id ?? item.faculty_id;
    if (!window.confirm(`Remove ${item.faculty_name ?? item.name}?`)) return;
    if (onDelete) await onDelete(id);
    else await api.delete(`/faculty/${id}`);
    await load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="skit-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Users size={22} /><div><h2 style={{ margin: 0 }}>Faculty Management</h2><p style={{ margin: '5px 0 0', color: '#64748B', fontSize: 12 }}>Manage faculty, department, designation, status and workload limits.</p></div></div>
          <button className="btn-primary" onClick={() => setEditing({})}><Plus size={15} /> Add Faculty</button>
        </div>
      </div>

      <div className="skit-card" style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ maxWidth: 260 }} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="ALL">All Departments</option>
          {departments.map((d) => <option key={d.id ?? d.department_id} value={d.id ?? d.department_id}>{d.name ?? d.department_name}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: '#94A3B8' }} />
          <input className="form-input" style={{ paddingLeft: 34 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search faculty..." />
        </div>
      </div>

      <div className="skit-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="skit-table" style={{ width: '100%' }}>
          <thead><tr><th>FACULTY</th><th>DEPARTMENT</th><th>DESIGNATION</th><th>MAX WORKLOAD</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {filtered.map((item) => {
              const id = item.id ?? item.faculty_id;
              const dept = departments.find((d) => String(d.id ?? d.department_id) === String(item.department_id ?? item.departmentId));
              return <tr key={id}>
                <td><strong>{item.faculty_name ?? item.name}</strong><div style={{ color: '#64748B', fontSize: 11 }}>{item.email || '—'}</div></td>
                <td>{dept?.name ?? dept?.department_name ?? item.department ?? '—'}</td>
                <td>{item.designation ?? item.role ?? '—'}</td>
                <td>{item.max_workload ?? item.maxWorkload ?? '—'} h</td>
                <td><span className="badge badge-active">{item.status || 'Active'}</span></td>
                <td><div style={{ display: 'flex', gap: 6 }}><button className="btn-secondary" onClick={() => setEditing(item)}><Edit3 size={14} /> Edit</button><button className="btn-secondary" onClick={() => remove(item)}><Trash2 size={14} /></button></div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {editing && <div className="skit-card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>{editing.id || editing.faculty_id ? 'Edit Faculty' : 'Add Faculty'}</h3>
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <input className="form-input" name="name" defaultValue={editing.faculty_name ?? editing.name ?? ''} placeholder="Faculty name" required />
          <input className="form-input" name="email" defaultValue={editing.email ?? ''} placeholder="Email" type="email" />
          <select className="form-select" name="department_id" defaultValue={editing.department_id ?? editing.departmentId ?? ''} required><option value="">Select Department</option>{departments.map((d) => <option key={d.id ?? d.department_id} value={d.id ?? d.department_id}>{d.name ?? d.department_name}</option>)}</select>
          <select className="form-select" name="designation" defaultValue={editing.designation ?? ''} required><option value="">Designation</option><option>Assistant Professor</option><option>Associate Professor</option><option>Professor</option><option>HOD</option></select>
          <input className="form-input" name="max_workload" type="number" min="0" defaultValue={editing.max_workload ?? editing.maxWorkload ?? ''} placeholder="Maximum workload" />
          <select className="form-select" name="status" defaultValue={editing.status ?? 'Active'}><option>Active</option><option>Inactive</option></select>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" type="submit">Save Faculty</button></div>
        </form>
      </div>}
    </div>
  );
}
