import React, { useState } from 'react';
import { Calendar, Download, Sparkles, Wand2, Trash2, Save, X, CheckCircle2, FileSpreadsheet, RefreshCw, ChevronRight } from 'lucide-react';
import { timetableMatrixData } from '../data/mockData';

export default function TimetableDashboardScreen() {
  const [activeView, setActiveView] = useState('grid');
  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState({ day: 'Tuesday', period: 'Period V (1:45 - 2:40)', subject: 'Project (Team Based)' });
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAutoGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      alert("AI Timetable Generation Complete! 0 conflicts detected. All constraints satisfied.");
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Filter Toolbar */}
      <div className="skit-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
            <div className="form-group" style={{ margin: 0, minWidth: '180px' }}>
              <label className="form-label">Department</label>
              <select className="form-select">
                <option>Computer Science & Engineering</option>
                <option>AI & Machine Learning</option>
                <option>Electronics & Communication</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Semester</label>
              <select className="form-select">
                <option>VII Semester</option>
                <option>V Semester</option>
                <option>III Semester</option>
                <option>I Semester</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Division</label>
              <select className="form-select">
                <option>A</option>
                <option>B</option>
                <option>C</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Academic Year</label>
              <select className="form-select">
                <option>2024 - 2025</option>
                <option>2025 - 2026</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Effective From</label>
              <input type="date" className="form-input" defaultValue="2026-07-20" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={handleAutoGenerate} disabled={isGenerating}>
              <Sparkles size={16} /> {isGenerating ? "Generating AI Schedule..." : "Generate Timetable"}
            </button>
            <button className="btn-secondary">
              <Download size={16} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* Grid Sub-bar & Main Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: showAiDrawer ? '1fr 340px' : '1fr', gap: '20px' }}>
        
        {/* Main Grid View Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Sub Controls Header */}
          <div className="skit-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={activeView === 'grid' ? "btn-primary" : "btn-secondary"} 
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => setActiveView('grid')}
              >
                Timetable View
              </button>
              <button 
                className={activeView === 'list' ? "btn-primary" : "btn-secondary"} 
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => setActiveView('list')}
              >
                List View
              </button>
              <button 
                className={activeView === 'workload' ? "btn-primary" : "btn-secondary"} 
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => setActiveView('workload')}
              >
                Workload View
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                <Wand2 size={14} /> Auto Arrange
              </button>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                <Trash2 size={14} /> Clear All
              </button>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                <Save size={14} /> Save Timetable
              </button>
              {!showAiDrawer && (
                <button className="btn-outline-primary" onClick={() => setShowAiDrawer(true)} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                  <Sparkles size={14} /> AI Assistant
                </button>
              )}
            </div>
          </div>

          {/* Timetable Grid Table */}
          <div className="skit-card" style={{ padding: '16px', overflowX: 'auto' }}>
            
            {/* Table Column Headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px repeat(9, 1fr)', gap: '6px', minWidth: '980px', marginBottom: '8px' }}>
              <div className="tt-header-cell">Day / Period</div>
              <div className="tt-header-cell">I<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>9:10 - 10:05</span></div>
              <div className="tt-header-cell">II<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>10:05 - 11:00</span></div>
              <div className="tt-header-cell" style={{ background: '#FEF3C7', color: '#B45309' }}>Tea Break<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>11:00 - 11:15</span></div>
              <div className="tt-header-cell">III<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>11:15 - 12:10</span></div>
              <div className="tt-header-cell">IV<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>12:10 - 1:05</span></div>
              <div className="tt-header-cell" style={{ background: '#DCFCE7', color: '#15803D' }}>Lunch Break<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>1:05 - 1:45</span></div>
              <div className="tt-header-cell">V<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>1:45 - 2:40</span></div>
              <div className="tt-header-cell">VI<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>2:40 - 3:35</span></div>
              <div className="tt-header-cell">VII<br/><span style={{ fontWeight: '500', fontSize: '0.7rem' }}>3:35 - 4:30</span></div>
            </div>

            {/* Grid Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '980px' }}>
              {timetableMatrixData.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'grid', gridTemplateColumns: '100px repeat(9, 1fr)', gap: '6px' }}>
                  <div className="tt-day-cell">{row.day}</div>
                  
                  {row.slots.map((slot, sIdx) => {
                    if (slot.break) {
                      return (
                        <div key={sIdx} className="tt-slot-card break" style={{ fontSize: '0.68rem', fontWeight: '800' }}>
                          ☕ {slot.label}
                        </div>
                      );
                    }
                    const isSelected = slot.selected;
                    return (
                      <div 
                        key={sIdx} 
                        className="tt-slot-card"
                        style={{
                          border: isSelected ? '2px solid var(--primary)' : '1px solid #E2E8F0',
                          background: isSelected ? '#E8F5E9' : '#FFFFFF'
                        }}
                        onClick={() => setSelectedSlot({ day: row.day, period: `Period ${sIdx}`, subject: slot.code })}
                      >
                        <div className="tt-subject-code">{slot.code}</div>
                        <div className="tt-faculty-name">{slot.faculty}</div>
                        <div className="tt-room-name">{slot.room}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '14px', background: '#F8FAFC', padding: '8px 14px', borderRadius: '8px' }}>
              ⓘ Note: Saturdays are reserved for Project work / Team based activities as per department guidelines.
            </div>
          </div>
        </div>

        {/* AI Assistant Right Drawer Side-Panel (Matching screenshots 10 & 11 & 12) */}
        {showAiDrawer && (
          <div className="skit-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '90px', height: 'fit-content' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', pb: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: '800', fontSize: '0.95rem' }}>AI Timetable Assistant</span>
                <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '99px', fontWeight: '800' }}>BETA</span>
              </div>
              <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowAiDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
              Hello Admin! How can I help you with the timetable today?
            </div>

            {/* Quick Action Suggestion Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: '0.78rem', textAlign: 'left' }}>
                🔍 Find best faculty for this slot
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: '0.78rem', textAlign: 'left' }}>
                💡 Suggest alternative subject
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: '0.78rem', textAlign: 'left' }}>
                📊 Check faculty workload
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: '0.78rem', textAlign: 'left' }}>
                ⚠️ Resolve timetable conflict
              </button>
            </div>

            {/* Slot Recommendations Box (Screenshot 12) */}
            <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text-dark)', marginBottom: '8px' }}>
                Best Available Faculty ({selectedSlot.day})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { name: 'Prof. Asghar Pasha', score: '95%', match: 'Best Match' },
                  { name: 'Dr. Maheswari L Patil', score: '90%', match: 'High' },
                  { name: 'Mr. V Sri Karan', score: '85%', match: 'Good' },
                  { name: 'Mrs. Nanda M B', score: '75%', match: 'Moderate' }
                ].map((rec, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--text-dark)' }}>{rec.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: '600' }}>{rec.match}</div>
                    </div>
                    <span className="badge badge-active">{rec.score}</span>
                  </div>
                ))}
              </div>

              <button className="btn-primary" style={{ width: '100%', marginTop: '12px', fontSize: '0.8rem', padding: '8px' }}>
                Assign Subject Slot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
