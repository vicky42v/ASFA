import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, Trash2, Sparkles, User, FileText, ArrowRight, AlertTriangle } from 'lucide-react';

export default function AddFacultyAiScreen({ onSaveFaculty, onCancel, departments = [] }) {
  const [uploadedFiles, setUploadedFiles] = useState([
    { name: 'Dr.Kavitha_Resume.pdf', size: 'PDF • 1.2 MB' },
    { name: 'Appointment_Order.pdf', size: 'PDF • 0.8 MB' },
    { name: 'ID_Card.jpg', size: 'JPG • 0.6 MB' }
  ]);

  const [form, setForm] = useState({
    name: 'Dr. Kavitha R',
    empId: 'SKIT1023',
    email: 'kavitha@skit.edu.in',
    phone: '9876543210',
    qualification: 'Ph.D.',
    experience: '12 Years',
    designation: 'Associate Professor',
    specialization: 'Artificial Intelligence',
    department: departments[0]?.name || '',
    role: 'Faculty',
    employmentType: 'Regular',
    status: 'Active',
    isHod: false
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Upload Documents Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: '20px' }}>
        
        {/* Dropzone */}
        <div 
          style={{
            border: '2px dashed var(--primary-border)',
            borderRadius: '14px',
            background: 'var(--primary-light)',
            padding: '24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          onClick={() => {
            setUploadedFiles(prev => [...prev, { name: 'Degree_Certificate.pdf', size: 'PDF • 1.5 MB' }]);
          }}
        >
          <UploadCloud size={40} style={{ color: 'var(--primary)', marginBottom: '8px' }} />
          <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-dark)' }}>Drag & drop files here</div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 10px 0' }}>or</div>
          <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.78rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
            Browse Files
          </button>
          <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '10px' }}>
            Supports PDF, DOCX (Max 10MB per file)
          </div>
        </div>

        {/* Uploaded Files List */}
        <div className="skit-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-dark)', marginBottom: '2px' }}>Uploaded Files</div>
          {uploadedFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={20} style={{ color: 'var(--primary)' }} />
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.82rem' }}>{f.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{f.size}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ color: '#15803D' }} />
                <button 
                  style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}
                  onClick={() => setUploadedFiles(uploadedFiles.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* How it Works Banner */}
        <div style={{ background: '#F4FBF7', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: '800', fontSize: '0.85rem', marginBottom: '10px' }}>
            <Sparkles size={18} /> How it works
          </div>
          <ol style={{ fontSize: '0.78rem', color: '#334155', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>Upload resume or related documents</li>
            <li>AI will extract information automatically</li>
            <li>Review and fill any missing details</li>
            <li>Assign department, role and save</li>
          </ol>
        </div>
      </div>

      {/* 2 & 3. Main Split Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 280px', gap: '20px' }}>
        
        {/* Left: AI Extracted Info Table */}
        <div className="skit-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="card-title"><Sparkles size={18} /> 2. AI Extracted Information</span>
            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Extraction Confidence ⓘ</span>
          </div>

          <table className="skit-table" style={{ fontSize: '0.82rem' }}>
            <tbody>
              <tr>
                <td style={{ color: '#64748B', width: '130px' }}>Full Name</td>
                <td style={{ fontWeight: '700' }}>{form.name}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">99%</span></td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Employee ID</td>
                <td style={{ fontWeight: '700' }}>{form.empId}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">98%</span></td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Email</td>
                <td style={{ fontWeight: '700' }}>{form.email}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">99%</span></td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Phone Number</td>
                <td style={{ fontWeight: '700' }}>{form.phone}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} /> 61%
                  </span>
                </td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Qualification</td>
                <td style={{ fontWeight: '700' }}>{form.qualification}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">97%</span></td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Experience</td>
                <td style={{ fontWeight: '700' }}>{form.experience}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">94%</span></td>
              </tr>
              <tr>
                <td style={{ color: '#64748B' }}>Specialization</td>
                <td style={{ fontWeight: '700' }}>{form.specialization}</td>
                <td style={{ textAlign: 'right' }}><span className="badge badge-active">98%</span></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '14px', background: '#FEF3C7', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A', fontSize: '0.78rem', color: '#B45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> Some information has low confidence or is missing. Please review and edit.
          </div>
        </div>

        {/* Middle: Review & Assign Controls */}
        <div className="skit-card" style={{ padding: '20px' }}>
          <span className="card-title" style={{ marginBottom: '16px' }}>3. Review, Assign & Save</span>

          <div className="form-group">
            <label className="form-label">Department *</label>
            <select 
              className="form-select" 
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {departments.map((department) => <option key={department.id}>{department.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Designation *</label>
            <select 
              className="form-select"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            >
              <option>Associate Professor</option>
              <option>Professor</option>
              <option>Assistant Professor</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Assign Role *</label>
            <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>Faculty</option>
              <option>Subject Coordinator</option>
              <option>Class Coordinator</option>
              <option>HOD</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', margin: '12px 0' }}>
            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>Make as HOD?</span>
            <input 
              type="checkbox" 
              checked={form.isHod}
              onChange={(e) => setForm({ ...form, isHod: e.target.checked })}
              style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <div style={{ display: 'flex', gap: '14px', fontSize: '0.82rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="radio" name="status" defaultChecked /> Active
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="radio" name="status" /> Inactive
              </label>
            </div>
          </div>
        </div>

        {/* Right: Live Profile Preview Card */}
        <div className="skit-card" style={{ padding: '20px', textAlign: 'center', height: 'fit-content' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#64748B', marginBottom: '16px' }}>Faculty Profile Preview</div>
          
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#DCFCE7', margin: '0 auto 12px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--primary)' }}>
            <User size={40} style={{ color: 'var(--primary)', margin: 'auto' }} />
          </div>

          <div style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-dark)' }}>{form.name}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: '700', marginTop: '2px' }}>{form.designation}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>{form.department}</div>

          <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '16px', paddingTop: '14px', textAlign: 'left', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><strong style={{ color: '#64748B' }}>Qualification:</strong> {form.qualification}</div>
            <div><strong style={{ color: '#64748B' }}>Experience:</strong> {form.experience}</div>
            <div><strong style={{ color: '#64748B' }}>Email:</strong> {form.email}</div>
            <div><strong style={{ color: '#64748B' }}>Phone:</strong> {form.phone}</div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={() => onSaveFaculty(form)}>
          Save Faculty
        </button>
      </div>
    </div>
  );
}
