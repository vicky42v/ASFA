import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, Save, Sparkles } from 'lucide-react';

export default function UploadSchemeModal({ isOpen, onClose, onSaveScheme }) {
  const [file, setFile] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  if (!isOpen) return null;

  const handleSimulatedUpload = (uploadedFile) => {
    setFile(uploadedFile || { name: 'VTU_2025_CSE_Scheme_5thSem.pdf', size: '2.4 MB' });
    setIsExtracting(true);

    setTimeout(() => {
      setIsExtracting(false);
      setExtractedData({
        department: 'Computer Science and Engineering',
        scheme: 'VTU 2025 Scheme',
        semester: '5th Semester',
        academicYear: '2025 - 2026',
        subjects: [
          { code: '22CS51', name: 'Software Engineering & Project Management', credit: 4, theoryHours: 4, labHours: 0, elective: 'Core Theory' },
          { code: '22CS52', name: 'Computer Networks & Security', credit: 4, theoryHours: 3, labHours: 2, elective: 'Core Theory' },
          { code: '22CS53', name: 'Theory of Computation', credit: 3, theoryHours: 3, labHours: 0, elective: 'Core Theory' },
          { code: '22CS54', name: 'Web Technology & Applications Lab', credit: 2, theoryHours: 0, labHours: 4, elective: 'Core Lab' },
          { code: '22CS551', name: 'Artificial Neural Networks', credit: 3, theoryHours: 3, labHours: 0, elective: 'Professional Elective I' },
          { code: '22CS552', name: 'Unix System Programming', credit: 3, theoryHours: 3, labHours: 0, elective: 'Professional Elective I' }
        ]
      });
    }, 1200);
  };

  const handleSave = () => {
    if (!extractedData) return;
    onSaveScheme(extractedData);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '920px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h2 className="modal-title">Upload Scheme PDF (AI Extracted)</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {!file && (
            <div 
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: '16px',
                padding: '40px 20px',
                textAlign: 'center',
                background: '#F8FAFC',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onClick={() => handleSimulatedUpload()}
            >
              <UploadCloud size={48} style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-dark)' }}>
                Drag & drop your Scheme PDF file here
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
                or <span style={{ color: 'var(--primary)', fontWeight: '700', textDecoration: 'underline' }}>browse files from computer</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '12px' }}>
                Supports official VTU / Institutional Scheme PDFs up to 15MB
              </div>
            </div>
          )}

          {file && isExtracting && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Sparkles size={40} className="spin" style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>Extracting Scheme Syllabus & Subject Details...</div>
              <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '6px' }}>
                Parsing Department, Semester, Credits, Theory & Lab Hours...
              </div>
            </div>
          )}

          {extractedData && !isExtracting && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#DCFCE7', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #BBF7D0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={20} style={{ color: '#15803D' }} />
                  <div>
                    <span style={{ fontWeight: '800', color: '#15803D', fontSize: '0.9rem' }}>AI Extraction Complete! </span>
                    <span style={{ fontSize: '0.82rem', color: '#166534' }}>Extracted 6 subjects for {extractedData.department} ({extractedData.semester}).</span>
                  </div>
                </div>
                <button 
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={() => { setFile(null); setExtractedData(null); }}
                >
                  Re-upload
                </button>
              </div>

              {/* Review Metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #E2E8F0' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>DEPARTMENT</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-dark)' }}>{extractedData.department}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>SCHEME</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-dark)' }}>{extractedData.scheme}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>SEMESTER</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-dark)' }}>{extractedData.semester}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>ACADEMIC YEAR</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-dark)' }}>{extractedData.academicYear}</div>
                </div>
              </div>

              {/* Extracted Subjects Table */}
              <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '10px', color: 'var(--text-dark)' }}>Extracted Subjects Review Table</h4>
              <div className="table-container">
                <table className="skit-table">
                  <thead>
                    <tr>
                      <th>Subject Code</th>
                      <th>Subject Name</th>
                      <th>Credits</th>
                      <th>Theory Hrs</th>
                      <th>Lab Hrs</th>
                      <th>Elective Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.subjects.map((sub, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '800', color: 'var(--primary)' }}>{sub.code}</td>
                        <td style={{ fontWeight: '700' }}>{sub.name}</td>
                        <td>{sub.credit}</td>
                        <td>{sub.theoryHours} hrs</td>
                        <td>{sub.labHours} hrs</td>
                        <td>
                          <span className={sub.labHours > 0 ? "badge badge-purple" : "badge badge-active"}>
                            {sub.elective}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          {extractedData && (
            <button className="btn-primary" onClick={handleSave}>
              <Save size={16} /> Save Extracted Scheme
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
