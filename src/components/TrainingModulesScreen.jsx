import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, PlayCircle } from 'lucide-react';

const modules = [
  { id: 1, title: 'Faculty Assignment', level: 'Core', lessons: ['Select department and semester', 'Assign Theory Main faculty', 'Assign Lab Main and optional Co faculty', 'Validate workload before saving'] },
  { id: 2, title: 'AI Timetable Generation', level: 'Core', lessons: ['Choose semester type', 'Generate up to 3 alternatives', 'Read validation and conflict messages', 'Use Regenerate for fresh schedules'] },
  { id: 3, title: 'Lab Scheduling Rules', level: 'Advanced', lessons: ['Understand consecutive two-period lab blocks', 'Check Main/Co faculty conflicts', 'Verify weekly faculty workload'] },
  { id: 4, title: 'Major Project Planning', level: 'Advanced', lessons: ['Keep project sessions concentrated', 'Review project workload', 'Avoid conflicts with regular theory/lab'] },
  { id: 5, title: 'Generated Timetable Library', level: 'Core', lessons: ['Browse by department', 'View three files at a time', 'Open, export, regenerate or delete a file'] },
  { id: 6, title: 'AI Assistant', level: 'Core', lessons: ['Find available faculty', 'Check workload', 'Detect timetable conflicts', 'Ask for alternative placement suggestions'] },
];

export default function TrainingModulesScreen() {
  const [selected, setSelected] = useState(modules[0].id);
  const active = useMemo(() => modules.find((m) => m.id === selected) || modules[0], [selected]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 18 }}>
      <div className="skit-card" style={{ padding: 14 }}>
        <h3 style={{ margin: '4px 8px 14px' }}>Training Modules</h3>
        {modules.map((module) => (
          <button key={module.id} onClick={() => setSelected(module.id)} style={{ width: '100%', textAlign: 'left', border: 'none', borderRadius: 9, padding: '11px 12px', marginBottom: 6, cursor: 'pointer', background: selected === module.id ? 'var(--primary)' : '#F8FAFC', color: selected === module.id ? '#fff' : '#334155' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{module.title}</div>
            <div style={{ fontSize: 10, marginTop: 3, opacity: .75 }}>{module.level}</div>
          </button>
        ))}
      </div>
      <div className="skit-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><BookOpen size={22} /><div><h2 style={{ margin: 0 }}>{active.title}</h2><div style={{ color: '#64748B', fontSize: 12 }}>{active.level} module</div></div></div>
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.lessons.map((lesson, index) => <div key={lesson} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, border: '1px solid #E2E8F0', borderRadius: 10 }}><CheckCircle2 size={17} /><div><strong>Step {index + 1}</strong> · {lesson}</div></div>)}
        </div>
        <button className="btn-primary" style={{ marginTop: 20 }}><PlayCircle size={15} /> Start Module</button>
      </div>
    </div>
  );
}
