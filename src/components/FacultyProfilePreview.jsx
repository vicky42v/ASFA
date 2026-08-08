import React from 'react';
import { ArrowLeft, Download, Edit3, CheckCircle2, User, Mail, Phone, Hash, FileText, Eye, Trash2, Calendar, BookOpen, Layers } from 'lucide-react';

export default function FacultyProfilePreview({ faculty, onBack, onEdit }) {
  const fac = faculty || {
    name: 'Dr. Kavitha R',
    designation: 'Associate Professor',
    dept: 'Department of Artificial Intelligence & Machine Learning',
    email: 'kavitha@skit.edu.in',
    phone: '9876543210',
    empId: 'SKIT1023',
    gender: 'Female',
    dob: '12/06/1987',
    nationality: 'Indian',
    maritalStatus: 'Married',
    address: 'Bangalore, Karnataka, India',
    qualification: 'Ph.D.',
    experience: '12 Years',
    doj: '12 July 2018',
    type: 'Regular'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button 
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          <ArrowLeft size={18} /> Back to Faculty List
        </button>

        <button className="btn-secondary">
          <Download size={16} /> Download Profile (PDF)
        </button>
      </div>

      {/* Main Profile Header Card */}
      <div className="skit-card" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#E8F5E9', border: '4px solid #FFFFFF', boxShadow: '0 4px 12px rgba(0,94,56,0.15)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={54} style={{ color: 'var(--primary)' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-dark)' }}>{fac.name}</h2>
              <span className="badge badge-active">AI Extracted</span>
            </div>
            <div style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '0.95rem' }}>{fac.designation}</div>
            <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>{fac.dept}</div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} /> {fac.email}
              </span>
              <span style={{ fontSize: '0.78rem', background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Phone size={14} /> {fac.phone}
              </span>
              <span style={{ fontSize: '0.78rem', background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Hash size={14} /> {fac.empId}
              </span>
            </div>
          </div>
        </div>

        {/* AI Summary Box matching Screenshot 5 */}
        <div style={{ background: '#F4FBF7', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: '800', fontSize: '0.85rem', marginBottom: '8px' }}>
              <CheckCircle2 size={16} /> AI Summary
            </div>
            <div style={{ fontSize: '0.75rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>✓ 12 years of teaching experience</div>
              <div>✓ Expert in Artificial Intelligence & ML</div>
              <div>✓ Can teach 6 AI-related subjects</div>
              <div>✓ Eligible for HOD role</div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', border: '4px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontWeight: '800', fontSize: '1rem', color: 'var(--primary)', padding: '10px' }}>
              96%
            </div>
            <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B', marginTop: '4px' }}>AI Confidence High</div>
          </div>
        </div>
      </div>

      {/* 2-Column Info Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Left Column Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Personal Information */}
          <div className="skit-card">
            <div className="card-header-row">
              <span className="card-title"><User size={18} /> Personal Information</span>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }} onClick={onEdit}>
                <Edit3 size={14} /> Edit
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.85rem' }}>
              <div><span style={{ color: '#64748B' }}>Full Name:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.name}</strong></div>
              <div><span style={{ color: '#64748B' }}>Gender:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.gender}</strong></div>
              <div><span style={{ color: '#64748B' }}>Employee ID:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.empId}</strong></div>
              <div><span style={{ color: '#64748B' }}>Nationality:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.nationality}</strong></div>
              <div><span style={{ color: '#64748B' }}>Email:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.email}</strong></div>
              <div><span style={{ color: '#64748B' }}>Marital Status:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.maritalStatus}</strong></div>
              <div><span style={{ color: '#64748B' }}>Phone Number:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.phone}</strong></div>
              <div><span style={{ color: '#64748B' }}>Address:</span> <strong style={{ marginLeft: '6px', color: 'var(--text-dark)' }}>{fac.address}</strong></div>
            </div>
          </div>

          {/* Current Workload & Timetable Preview */}
          <div className="skit-card">
            <div className="card-header-row">
              <span className="card-title"><Layers size={18} /> Current Workload</span>
              <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>20 / 24 hrs (83% Capacity)</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary)' }}>4</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Subjects Assigned</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary)' }}>3</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Theory Classes</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary)' }}>1</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Lab Classes</div>
              </div>
              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary)' }}>4</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Total Batches</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* AI Extracted Skills */}
          <div className="skit-card">
            <span className="card-title" style={{ marginBottom: '14px' }}><BookOpen size={18} /> AI Extracted Skills</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['Machine Learning', 'Deep Learning', 'Python', 'Data Mining', 'Computer Vision', 'Natural Language Processing'].map((skill, idx) => (
                <span key={idx} className="badge badge-active" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Uploaded Documents */}
          <div className="skit-card">
            <span className="card-title" style={{ marginBottom: '14px' }}><FileText size={18} /> Uploaded Documents</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { name: 'Resume.pdf', size: '1.2 MB' },
                { name: 'AppointmentOrder.pdf', size: '0.8 MB' },
                { name: 'IDCard.jpg', size: '0.6 MB' },
                { name: 'Certificates.zip', size: '2.4 MB' }
              ].map((doc, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem' }}>{doc.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{doc.size}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="action-icon-btn"><Eye size={16} /></button>
                    <button className="action-icon-btn"><Download size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
