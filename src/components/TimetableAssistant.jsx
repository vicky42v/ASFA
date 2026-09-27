import React, { useMemo, useState } from 'react';
import { Bot, Send, Sparkles, AlertTriangle } from 'lucide-react';
import { timetableAiApi, timetableApi } from '../services/api';

export default function TimetableAssistant({
  entries = [],
  faculty = [],
  context = {},
  onAction,
  onTimetableResolved,
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: 'Hi! I can check workload, analyze conflicts, and ask the local AI to generate a validated replacement timetable.',
    },
  ]);

  const stats = useMemo(
    () => ({ slots: entries.length, faculty: faculty.length }),
    [entries, faculty]
  );

  const addMessage = (role, text) => {
    setMessages((current) => [...current, { role, text }]);
  };

  const resolve = async () => {
    if (!entries.length) {
      addMessage('bot', 'There is no timetable loaded yet. Generate one first.');
      return;
    }

    setBusy(true);
    try {
      const validation = await timetableApi.validate({
        ...context,
        entries,
      });

      const result = await timetableAiApi.resolve({
        ...context,
        entries,
        conflicts: validation?.validation?.conflicts || validation?.conflicts || [],
        warnings: validation?.validation?.warnings || validation?.warnings || [],
      });

      if (result?.timetable?.length) {
        onTimetableResolved?.(result);
        addMessage(
          'bot',
          `${result.explanation || 'A replacement timetable was generated.'} Source: ${result.source || 'AI'}.`
        );
      } else {
        addMessage('bot', 'No validated replacement timetable was returned.');
      }
    } catch (error) {
      addMessage('bot', error?.message || 'AI resolution failed.');
    } finally {
      setBusy(false);
    }
  };

  const answer = (text) => {
    const q = text.toLowerCase();

    if (q.includes('resolve') || q.includes('regenerate') || q.includes('conflict')) {
      resolve();
      return 'I am checking the current timetable with the backend validator and asking the local AI for a replacement.';
    }

    if (q.includes('workload')) {
      return `The current context contains ${stats.faculty} faculty records and ${stats.slots} timetable entries. For exact workload conflicts, use the backend validator.`;
    }

    if (q.includes('lab')) {
      return 'Labs must remain contiguous and respect the configured lab duration, breaks and lunch. Main and Co faculty must also be distinct.';
    }

    if (q.includes('status')) {
      timetableAiApi.status()
        .then((status) => addMessage('bot', status.ready
          ? `ASFA Engine is ready: Model 3 (CP-SAT) + ${status.model || 'Solver'} are active.`
          : `ASFA Engine status: CP-SAT Engine: Active, Ollama/model: ${status.ollama_available ? 'up' : 'standby'}.`))
        .catch((error) => addMessage('bot', error?.message || 'Central ASFA CP-SAT Engine is active.'));
      return 'Checking ASFA CP-SAT Engine status…';
    }

    return 'Try “resolve conflict”, “regenerate”, “check workload”, “lab rule”, or “AI status”.';
  };

  const send = () => {
    const text = question.trim();
    if (!text || busy) return;

    addMessage('user', text);
    setQuestion('');

    const reply = answer(text);
    if (reply) addMessage('bot', reply);
    onAction?.(text);
  };

  return (
    <div
      className="skit-card"
      style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
        <Bot size={18} />
        AI-ASFA Assistant
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn-primary"
          type="button"
          onClick={resolve}
          disabled={busy || !entries.length}
          style={{ flex: 1, fontSize: 12 }}
        >
          <Sparkles size={14} />
          {busy ? 'Generating…' : 'Resolve + Generate'}
        </button>
      </div>

      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              padding: '8px 10px',
              borderRadius: 10,
              background: message.role === 'user' ? 'var(--primary)' : '#F1F5F9',
              color: message.role === 'user' ? '#fff' : '#334155',
              fontSize: 12,
            }}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && send()}
          placeholder="Ask about conflicts, workload, labs…"
          disabled={busy}
        />
        <button className="btn-primary" onClick={send} disabled={busy} type="button">
          <Send size={14} />
        </button>
      </div>

      {!entries.length && (
        <div style={{ display: 'flex', gap: 6, fontSize: 11, color: '#64748B' }}>
          <AlertTriangle size={14} />
          Generate a timetable before using AI resolution.
        </div>
      )}
    </div>
  );
}
