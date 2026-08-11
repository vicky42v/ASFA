import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  Trash2,
  Sparkles,
  User,
  FileText,
  AlertTriangle
} from 'lucide-react';

export default function AddFacultyAiScreen({
  onSaveFaculty,
  onCancel,
  departments = []
}) {
  const fileInputRef = useRef(null);

  // Start with NO demo files
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Start with EMPTY faculty information
  const [form, setForm] = useState({
    name: '',
    empId: '',
    email: '',
    phone: '',
    qualification: '',
    experience: '',
    designation: '',
    specialization: '',
    department: '',
    role: 'Faculty',
    employmentType: 'Regular',
    status: 'Active',
    isHod: false
  });

  const [isUploading, setIsUploading] = useState(false);

  // Handle real file selection
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);

    if (!files.length) return;

    const validFiles = files.filter((file) => {
      const maxSize = 10 * 1024 * 1024;

      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
      ];

      if (file.size > maxSize) {
        alert(`${file.name} is larger than 10MB.`);
        return false;
      }

      if (!allowedTypes.includes(file.type)) {
        alert(
          `${file.name} is not a supported file type. Please upload PDF, DOCX, JPG or PNG.`
        );
        return false;
      }

      return true;
    });

    const newFiles = validFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      name: file.name,
      file,
      size: `${getFileType(file)} • ${formatFileSize(file.size)}`
    }));

    setUploadedFiles((prev) => [...prev, ...newFiles]);

    // Reset input so the same file can be selected again later
    event.target.value = '';

    /*
      AI extraction can be connected here later.

      Example future flow:

      upload file
          ↓
      backend / AI extraction API
          ↓
      extracted faculty information
          ↓
      setForm(...)
    */
  };

  const getFileType = (file) => {
    if (file.type === 'application/pdf') return 'PDF';
    if (
      file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'DOCX';
    }
    if (file.type === 'image/jpeg') return 'JPG';
    if (file.type === 'image/png') return 'PNG';

    return 'FILE';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const removeFile = (fileId) => {
    setUploadedFiles((prev) =>
      prev.filter((file) => file.id !== fileId)
    );
  };

  const updateForm = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      alert('Please enter the faculty name.');
      return;
    }

    if (!form.department) {
      alert('Please select a department.');
      return;
    }

    if (!form.designation) {
      alert('Please select a designation.');
      return;
    }

    if (!form.role) {
      alert('Please select a role.');
      return;
    }

    onSaveFaculty(form);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}
    >
      {/* =========================================================
          1. UPLOAD DOCUMENTS
      ========================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 300px',
          gap: '20px'
        }}
      >
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
            minHeight: '220px'
          }}
        >
          <UploadCloud
            size={40}
            style={{
              color: 'var(--primary)',
              marginBottom: '8px'
            }}
          />

          <div
            style={{
              fontWeight: '700',
              fontSize: '0.95rem',
              color: 'var(--text-dark)'
            }}
          >
            Drag & drop files here
          </div>

          <div
            style={{
              fontSize: '0.78rem',
              color: '#64748B',
              margin: '2px 0 10px 0'
            }}
          >
            or
          </div>

          {/* Hidden real file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <button
            type="button"
            className="btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              borderColor: 'var(--primary)',
              color: 'var(--primary)'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            Browse Files
          </button>

          <div
            style={{
              fontSize: '0.68rem',
              color: '#94A3B8',
              marginTop: '10px'
            }}
          >
            Supports PDF, DOCX, JPG, PNG (Max 10MB per file)
          </div>
        </div>

        {/* Uploaded Files List */}
        <div
          className="skit-card"
          style={{
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            minHeight: '220px'
          }}
        >
          <div
            style={{
              fontWeight: '700',
              fontSize: '0.85rem',
              color: 'var(--text-dark)',
              marginBottom: '2px'
            }}
          >
            Uploaded Files
          </div>

          {uploadedFiles.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: '#94A3B8',
                fontSize: '0.82rem',
                padding: '20px'
              }}
            >
              No files uploaded yet.
              <br />
              Upload a faculty document to begin.
            </div>
          ) : (
            uploadedFiles.map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: 0
                  }}
                >
                  <FileText
                    size={20}
                    style={{
                      color: 'var(--primary)',
                      flexShrink: 0
                    }}
                  />

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: '700',
                        fontSize: '0.82rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {file.name}
                    </div>

                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: '#64748B'
                      }}
                    >
                      {file.size}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle2
                    size={18}
                    style={{ color: '#15803D' }}
                  />

                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#EF4444',
                      cursor: 'pointer'
                    }}
                    onClick={() => removeFile(file.id)}
                    title="Remove file"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* How it Works */}
        <div
          style={{
            background: '#F4FBF7',
            border: '1px solid #BBF7D0',
            borderRadius: '14px',
            padding: '16px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--primary)',
              fontWeight: '800',
              fontSize: '0.85rem',
              marginBottom: '10px'
            }}
          >
            <Sparkles size={18} />
            How it works
          </div>

          <ol
            style={{
              fontSize: '0.78rem',
              color: '#334155',
              paddingLeft: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <li>Upload resume or related documents</li>
            <li>AI will extract information automatically</li>
            <li>Review and fill any missing details</li>
            <li>Assign department, role and save</li>
          </ol>
        </div>
      </div>

      {/* =========================================================
          2 & 3. MAIN SECTION
      ========================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 280px',
          gap: '20px'
        }}
      >
        {/* =====================================================
            AI EXTRACTED INFORMATION
        ====================================================== */}
        <div
          className="skit-card"
          style={{ padding: '20px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}
          >
            <span className="card-title">
              <Sparkles size={18} /> 2. AI Extracted Information
            </span>

            <span
              style={{
                fontSize: '0.75rem',
                color: '#64748B',
                fontWeight: '600'
              }}
            >
              Extraction Confidence ⓘ
            </span>
          </div>

          <table
            className="skit-table"
            style={{ fontSize: '0.82rem' }}
          >
            <tbody>
              <tr>
                <td style={{ color: '#64748B', width: '130px' }}>
                  Full Name
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.name || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Employee ID
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.empId || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Email
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.email || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Phone Number
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.phone || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Qualification
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.qualification || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Experience
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.experience || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>

              <tr>
                <td style={{ color: '#64748B' }}>
                  Specialization
                </td>
                <td style={{ fontWeight: '700' }}>
                  {form.specialization || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>—</td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              marginTop: '14px',
              background: '#FEF3C7',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #FDE68A',
              fontSize: '0.78rem',
              color: '#B45309',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={16} />

            {uploadedFiles.length === 0
              ? 'Upload a faculty document to extract information.'
              : 'AI extraction will populate the information after document processing.'}
          </div>
        </div>

        {/* =====================================================
            REVIEW / ASSIGN
        ====================================================== */}
        <div
          className="skit-card"
          style={{ padding: '20px' }}
        >
          <span
            className="card-title"
            style={{ marginBottom: '16px' }}
          >
            3. Review, Assign & Save
          </span>

          {/* Department */}
          <div className="form-group">
            <label className="form-label">
              Department *
            </label>

            <select
              className="form-select"
              value={form.department}
              onChange={(e) =>
                updateForm('department', e.target.value)
              }
            >
              <option value="">
                Select Department
              </option>

              {departments.map((department) => (
                <option
                  key={department.id}
                  value={department.name}
                >
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          {/* Designation */}
          <div className="form-group">
            <label className="form-label">
              Designation *
            </label>

            <select
              className="form-select"
              value={form.designation}
              onChange={(e) =>
                updateForm('designation', e.target.value)
              }
            >
              <option value="">
                Select Designation
              </option>

              <option value="Assistant Professor">
                Assistant Professor
              </option>

              <option value="Associate Professor">
                Associate Professor
              </option>

              <option value="Professor">
                Professor
              </option>
            </select>
          </div>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">
              Assign Role *
            </label>

            <select
              className="form-select"
              value={form.role}
              onChange={(e) =>
                updateForm('role', e.target.value)
              }
            >
              <option value="Faculty">
                Faculty
              </option>

              <option value="Subject Coordinator">
                Subject Coordinator
              </option>

              <option value="Class Coordinator">
                Class Coordinator
              </option>

              <option value="HOD">
                HOD
              </option>
            </select>
          </div>

          {/* HOD */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderTop: '1px solid #E2E8F0',
              borderBottom: '1px solid #E2E8F0',
              margin: '12px 0'
            }}
          >
            <span
              style={{
                fontWeight: '700',
                fontSize: '0.85rem'
              }}
            >
              Make as HOD?
            </span>

            <input
              type="checkbox"
              checked={form.isHod}
              onChange={(e) =>
                updateForm('isHod', e.target.checked)
              }
              style={{
                width: '18px',
                height: '18px',
                accentColor: 'var(--primary)'
              }}
            />
          </div>

          {/* Status */}
          <div className="form-group">
            <label className="form-label">
              Status
            </label>

            <div
              style={{
                display: 'flex',
                gap: '14px',
                fontSize: '0.82rem'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <input
                  type="radio"
                  name="faculty-status"
                  checked={form.status === 'Active'}
                  onChange={() =>
                    updateForm('status', 'Active')
                  }
                />
                Active
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <input
                  type="radio"
                  name="faculty-status"
                  checked={form.status === 'Inactive'}
                  onChange={() =>
                    updateForm('status', 'Inactive')
                  }
                />
                Inactive
              </label>
            </div>
          </div>
        </div>

        {/* =====================================================
            LIVE PROFILE PREVIEW
        ====================================================== */}
        <div
          className="skit-card"
          style={{
            padding: '20px',
            textAlign: 'center',
            height: 'fit-content'
          }}
        >
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: '700',
              color: '#64748B',
              marginBottom: '16px'
            }}
          >
            Faculty Profile Preview
          </div>

          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: '#DCFCE7',
              margin: '0 auto 12px auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--primary)'
            }}
          >
            <User
              size={40}
              style={{ color: 'var(--primary)' }}
            />
          </div>

          <div
            style={{
              fontWeight: '800',
              fontSize: '1.1rem',
              color: 'var(--text-dark)'
            }}
          >
            {form.name || 'Faculty Name'}
          </div>

          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--primary)',
              fontWeight: '700',
              marginTop: '2px'
            }}
          >
            {form.designation || 'Designation'}
          </div>

          <div
            style={{
              fontSize: '0.75rem',
              color: '#64748B',
              marginTop: '4px'
            }}
          >
            {form.department || 'Department'}
          </div>

          <div
            style={{
              borderTop: '1px solid #E2E8F0',
              marginTop: '16px',
              paddingTop: '14px',
              textAlign: 'left',
              fontSize: '0.78rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div>
              <strong style={{ color: '#64748B' }}>
                Qualification:
              </strong>{' '}
              {form.qualification || '—'}
            </div>

            <div>
              <strong style={{ color: '#64748B' }}>
                Experience:
              </strong>{' '}
              {form.experience || '—'}
            </div>

            <div>
              <strong style={{ color: '#64748B' }}>
                Email:
              </strong>{' '}
              {form.email || '—'}
            </div>

            <div>
              <strong style={{ color: '#64748B' }}>
                Phone:
              </strong>{' '}
              {form.phone || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          BOTTOM ACTIONS
      ========================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #E2E8F0',
          paddingTop: '16px'
        }}
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={isUploading}
        >
          Save Faculty
        </button>
      </div>
    </div>
  );
}