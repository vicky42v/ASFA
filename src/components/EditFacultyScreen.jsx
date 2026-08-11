import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const API_BASE_URL = "http://127.0.0.1:5000";

const EditFacultyScreen = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    faculty_id: "",
    name: "",
    email: "",
    department: "",
    designation: "",
    subjects: "",
    availability: "",
  });

  // --------------------------------------------------
  // FETCH FACULTY DETAILS
  // --------------------------------------------------
  useEffect(() => {
    const fetchFaculty = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/faculty/${id}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch faculty details");
        }

        const data = await response.json();

        const faculty = data.faculty || data;

        setFormData({
          faculty_id: faculty.faculty_id || faculty.id || "",
          name: faculty.name || faculty.faculty_name || "",
          email: faculty.email || "",
          department: faculty.department || "",
          designation: faculty.designation || "",
          subjects: Array.isArray(faculty.subjects)
            ? faculty.subjects.join(", ")
            : faculty.subjects || "",
          availability: faculty.availability || "",
        });
      } catch (err) {
        console.error("Error fetching faculty:", err);
        setError(
          "Unable to load faculty details. Please check whether the backend is running."
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchFaculty();
    } else {
      setLoading(false);
      setError("Faculty ID is missing.");
    }
  }, [id]);

  // --------------------------------------------------
  // HANDLE INPUT CHANGE
  // --------------------------------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // --------------------------------------------------
  // UPDATE FACULTY
  // --------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Faculty name is required.");
      return;
    }

    if (!formData.email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!formData.department.trim()) {
      setError("Department is required.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        faculty_id: formData.faculty_id,
        name: formData.name.trim(),
        email: formData.email.trim(),
        department: formData.department.trim(),
        designation: formData.designation.trim(),
        subjects: formData.subjects
          .split(",")
          .map((subject) => subject.trim())
          .filter((subject) => subject !== ""),
        availability: formData.availability.trim(),
      };

      const response = await fetch(
        `${API_BASE_URL}/api/faculty/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to update faculty"
        );
      }

      setSuccess("Faculty details updated successfully.");

      // Go back to faculty page after a short delay
      setTimeout(() => {
        navigate(-1);
      }, 1000);
    } catch (err) {
      console.error("Error updating faculty:", err);
      setError(
        err.message ||
          "Failed to update faculty. Please check the backend."
      );
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Loading faculty details...</p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // MAIN SCREEN
  // --------------------------------------------------
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={styles.backButton}
            >
              ← Back
            </button>

            <h1 style={styles.title}>Edit Faculty</h1>

            <p style={styles.subtitle}>
              Update the faculty information below
            </p>
          </div>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.messageIcon}>⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS MESSAGE */}
        {success && (
          <div style={styles.successBox}>
            <span style={styles.messageIcon}>✓</span>
            <span>{success}</span>
          </div>
        )}

        {/* FORM CARD */}
        <form onSubmit={handleSubmit} style={styles.formCard}>

          {/* FACULTY ID */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Faculty ID
            </label>

            <input
              type="text"
              name="faculty_id"
              value={formData.faculty_id}
              onChange={handleChange}
              placeholder="Enter faculty ID"
              style={{
                ...styles.input,
                backgroundColor: "#f5f5f5",
              }}
              readOnly
            />
          </div>

          {/* NAME */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Faculty Name <span style={styles.required}>*</span>
            </label>

            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter faculty name"
              style={styles.input}
              required
            />
          </div>

          {/* EMAIL */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Email <span style={styles.required}>*</span>
            </label>

            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter faculty email"
              style={styles.input}
              required
            />
          </div>

          {/* DEPARTMENT */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Department <span style={styles.required}>*</span>
            </label>

            <select
              name="department"
              value={formData.department}
              onChange={handleChange}
              style={styles.input}
              required
            >
              <option value="">Select Department</option>
              <option value="AIML">
                Artificial Intelligence & Machine Learning
              </option>
              <option value="CSE">
                Computer Science & Engineering
              </option>
              <option value="ISE">
                Information Science & Engineering
              </option>
              <option value="ECE">
                Electronics & Communication Engineering
              </option>
              <option value="EEE">
                Electrical & Electronics Engineering
              </option>
              <option value="ME">
                Mechanical Engineering
              </option>
              <option value="CIVIL">
                Civil Engineering
              </option>
            </select>
          </div>

          {/* DESIGNATION */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Designation
            </label>

            <select
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              style={styles.input}
            >
              <option value="">Select Designation</option>
              <option value="Professor">Professor</option>
              <option value="Associate Professor">
                Associate Professor
              </option>
              <option value="Assistant Professor">
                Assistant Professor
              </option>
              <option value="HOD">HOD</option>
              <option value="Lecturer">Lecturer</option>
            </select>
          </div>

          {/* SUBJECTS */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Subjects
            </label>

            <input
              type="text"
              name="subjects"
              value={formData.subjects}
              onChange={handleChange}
              placeholder="Example: DBMS, AI, Python"
              style={styles.input}
            />

            <small style={styles.helpText}>
              Enter multiple subjects separated by commas.
            </small>
          </div>

          {/* AVAILABILITY */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Availability
            </label>

            <textarea
              name="availability"
              value={formData.availability}
              onChange={handleChange}
              placeholder="Example: Monday-Friday, 9:00 AM - 4:00 PM"
              style={{
                ...styles.input,
                minHeight: "100px",
                resize: "vertical",
              }}
            />
          </div>

          {/* BUTTONS */}
          <div style={styles.buttonContainer}>

            <button
              type="button"
              onClick={() => navigate(-1)}
              style={styles.cancelButton}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              style={{
                ...styles.saveButton,
                opacity: saving ? 0.7 : 1,
                cursor: saving ? "not-allowed" : "pointer",
              }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

          </div>
        </form>
      </div>
    </div>
  );
};

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    backgroundColor: "#f8fafc",
    padding: "30px",
    boxSizing: "border-box",
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  container: {
    maxWidth: "900px",
    margin: "0 auto",
  },

  header: {
    marginBottom: "25px",
  },

  backButton: {
    border: "none",
    background: "transparent",
    color: "#475569",
    fontSize: "15px",
    cursor: "pointer",
    padding: "0",
    marginBottom: "15px",
  },

  title: {
    margin: "0",
    fontSize: "30px",
    fontWeight: "700",
    color: "#0f172a",
  },

  subtitle: {
    marginTop: "7px",
    marginBottom: "0",
    color: "#64748b",
    fontSize: "15px",
  },

  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: "14px",
    padding: "30px",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.06)",
    border: "1px solid #e2e8f0",
  },

  fieldGroup: {
    marginBottom: "22px",
  },

  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#334155",
  },

  required: {
    color: "#ef4444",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#0f172a",
    backgroundColor: "#ffffff",
    outline: "none",
  },

  helpText: {
    display: "block",
    marginTop: "6px",
    fontSize: "12px",
    color: "#64748b",
  },

  buttonContainer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "30px",
    paddingTop: "20px",
    borderTop: "1px solid #e2e8f0",
  },

  cancelButton: {
    padding: "11px 22px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    backgroundColor: "#ffffff",
    color: "#334155",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
  },

  saveButton: {
    padding: "11px 24px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
  },

  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "12px 15px",
    marginBottom: "20px",
    fontSize: "14px",
  },

  successBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#f0fdf4",
    color: "#15803d",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    padding: "12px 15px",
    marginBottom: "20px",
    fontSize: "14px",
  },

  messageIcon: {
    fontWeight: "700",
    fontSize: "16px",
  },

  loadingContainer: {
    minHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  spinner: {
    width: "35px",
    height: "35px",
    border: "4px solid #e2e8f0",
    borderTop: "4px solid #2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },

  loadingText: {
    marginTop: "15px",
    color: "#64748b",
    fontSize: "14px",
  },
};

export default EditFacultyScreen;