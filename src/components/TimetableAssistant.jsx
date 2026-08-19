import React, { useMemo, useState } from 'react';
import { Bot, Send } from 'lucide-react';

export default function TimetableAssistant({ entries = [], faculty = [], onAction }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! I can help with faculty workload, conflicts, alternatives and timetable rules.' },
  ]);
  const stats = useMemo(() => ({ slots: entries.length, faculty: faculty.length }), [entries, faculty]);
  const answer = (text) => {
    const q = text.toLowerCase();
    if (q.includes('workload')) return `There are ${stats.faculty} faculty members in the current context. I can check who is closest to their configured limit.`;
    if (q.includes('conflict')) return `The current generated timetable contains ${stats.slots} scheduled entries. Use Validate/Conflict Analysis for the authoritative backend result.`;
    if (q.includes('lab')) return 'Labs should remain consecutive two-period blocks. Main and Co faculty cannot overlap another teaching assignment.';
    if (q.includes('project')) return 'Major Project should be concentrated into the configured project sessions rather than scattered across the week.';
    if (q.includes('regenerate')) return 'Use Regenerate to request a fresh set of alternatives without replacing the previous generated files.';
    return 'Try asking: “check workload”, “find conflict”, “lab rule”, “project rule”, or “regenerate”.';
  };
  const send = () => {
    const text = question.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: 'user', text }, { role: 'bot', text: answer(text) }]);
    setQuestion('');
    onAction?.(text);
  };
  return (
    <div className="skit-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}><Bot size={18} /> AI-ASFA Assistant</div>
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '8px 10px', borderRadius: 10, background: m.role === 'user' ? 'var(--primary)' : '#F1F5F9', color: m.role === 'user' ? '#fff' : '#334155', fontSize: 12 }}>{m.text}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about workload, conflict, labs..." />
        <button className="btn-primary" onClick={send}><Send size={14} /></button>
      </div>
    </div>
  );
}
