import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Printer, ArrowUpRight, ArrowDownRight, Sparkles, CheckCircle2, Eye, Edit3 } from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { dashboardApi } from '../services/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

export default function ReportsScreen() {
  const [report, setReport] = useState({ subject_types: [], faculty_workload: [], departments: [], assignment_status: [] });
  useEffect(() => { dashboardApi.reports().then(setReport).catch(() => {}); }, []);
  const donutData = {
    labels: report.subject_types.map((item) => item.type),
    datasets: [
      {
        data: report.subject_types.map((item) => item.count),
        backgroundColor: ['#005E38', '#3B82F6', '#F59E0B', '#EF4444'],
        borderWidth: 0,
      },
    ],
  };

  const barData = {
    labels: report.faculty_workload.map((item) => item.faculty_name),
    datasets: [
      {
        label: 'Hours / Week',
        data: report.faculty_workload.map((item) => item.hours),
        backgroundColor: '#005E38',
        borderRadius: 6,
      },
    ],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 4 Stat Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <div className="stat-icon-wrapper"><CheckCircle2 size={24} /></div>
          <div>
            <div className="stat-label">Timetables Generated</div>
            <div className="stat-value">{report.departments.reduce((sum, item) => sum + Number(item.timetables || 0), 0)}</div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: '700', marginTop: '2px' }}>↑ 12% from last month</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><CheckCircle2 size={24} /></div>
          <div>
            <div className="stat-label">Total Faculty</div>
            <div className="stat-value">{report.departments.reduce((sum, item) => sum + Number(item.faculty || 0), 0)}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>98% utilization</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper"><CheckCircle2 size={24} /></div>
          <div>
            <div className="stat-label">Total Classes / Week</div>
            <div className="stat-value">{report.faculty_workload.reduce((sum, item) => sum + Number(item.hours || 0), 0)}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>Across all departments</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: '#FEF3C7', color: '#D97706' }}><CheckCircle2 size={24} /></div>
          <div>
            <div className="stat-label">Clashes Detected</div>
            <div className="stat-value">{report.assignment_status.length}</div>
            <div style={{ fontSize: '0.75rem', color: '#15803D', fontWeight: '700', marginTop: '2px' }}>↓ 80% from last generation</div>
          </div>
        </div>
      </div>

      {/* Main Content + Side Panel Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        
        {/* Left Column: Charts & Department Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 0.9fr', gap: '16px' }}>
            <div className="skit-card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '12px' }}>Subject Type Distribution</div>
              <div style={{ width: '160px', height: '160px', margin: '0 auto' }}>
                <Doughnut data={donutData} options={{ plugins: { legend: { display: false } } }} />
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '12px' }}>{report.subject_types.reduce((sum, item) => sum + Number(item.count || 0), 0)} Total Subjects</div>
            </div>

            <div className="skit-card" style={{ padding: '16px' }}>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '12px' }}>Faculty Workload (Hours / Week)</div>
              <div style={{ height: '160px' }}>
                <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              </div>
            </div>

            <div className="skit-card" style={{ padding: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontWeight: '800', fontSize: '0.9rem', marginBottom: '12px' }}>Room Utilization</div>
              <div style={{ width: '100px', height: '100px', borderRadius: '50%', border: '8px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '1.25rem', fontWeight: '800', color: 'var(--primary)' }}>
                N/A
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '12px' }}>No room data configured</div>
            </div>
          </div>

          {/* Department Timetable Summary Table */}
          <div className="skit-card">
            <div className="card-header-row">
              <span className="card-title">Department Timetable Summary</span>
              <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Showing 1 to 6 of 6 departments</span>
            </div>

            <div className="table-container">
              <table className="skit-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Semesters</th>
                    <th>Subjects</th>
                    <th>Faculty</th>
                    <th>Classes / Wk</th>
                    <th>Avg. Utilization</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.departments.map((row) => (
                    <tr key={row.department_id}>
                      <td style={{ fontWeight: '700' }}>{row.department_name}</td>
                      <td>—</td>
                      <td>{row.subjects}</td>
                      <td>{row.faculty}</td>
                      <td>{row.timetables}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}>
                            <div style={{ width: '0%', height: '100%', background: 'var(--primary)' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>—</span>
                        </div>
                      </td>
                      <td><span className="badge badge-active">Healthy</span></td>
                      <td>
                        <div className="table-actions">
                          <button className="action-icon-btn"><Eye size={16} /></button>
                          <button className="action-icon-btn"><Download size={16} /></button>
                          <button className="action-icon-btn"><Edit3 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Export & Quick Reports Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div className="skit-card">
            <span className="card-title" style={{ marginBottom: '14px' }}>Export Reports</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Download size={16} /> Export PDF
              </button>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <FileSpreadsheet size={16} /> Export Excel
              </button>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
                <Printer size={16} /> Print Report
              </button>
            </div>
          </div>

          <div className="skit-card">
            <span className="card-title" style={{ marginBottom: '14px' }}>Quick Reports</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['Conflict Report', 'Faculty Workload Report', 'Room Utilization Report', 'Subject Coverage Report', 'Department-wise Report'].map((rep, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-dark)' }}>
                  <span>{rep}</span>
                  <ArrowUpRight size={16} style={{ color: 'var(--primary)' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
