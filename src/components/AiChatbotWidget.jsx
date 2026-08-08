import React, { useState } from 'react';
import { Sparkles, Send, Plus, Trash2, Bot, User, CheckCheck } from 'lucide-react';
import { chatbotApi } from '../services/api';

export default function AiChatbotWidget({ isFullPage = false }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: 'Hello Admin! 👋 How can I help you with the academic scheduling system today?',
      time: '10:30 AM'
    },
    {
      id: 2,
      sender: 'user',
      text: 'How do I generate a timetable?',
      time: '10:30 AM'
    },
    {
      id: 3,
      sender: 'ai',
      text: `To generate a timetable, follow these steps:
1. Go to Timetables → Generate Timetable
2. Select the Department, Semester, and Scheme
3. Choose the preferred constraints (Faculty, Rooms, Subjects)
4. Click on Generate

The system will create an optimized timetable based on the selected preferences.`,
      time: '10:30 AM'
    }
  ]);

  const [input, setInput] = useState('');
  const [activeChat, setActiveChat] = useState('How to generate a timetable?');
  const [isSending, setIsSending] = useState(false);

  const suggestedPrompts = [
    "How to add a new department?",
    "How to generate a timetable?",
    "How to upload a scheme?",
    "View system usage summary"
  ];

  const handleSend = async (textToSend) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    setIsSending(true);
    try {
      const response = await chatbotApi.send(query);
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: response.answer,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      setMessages((prev) => [...prev, { id: Date.now() + 1, sender: 'ai', text: error.message, time: 'Just now' }]);
    } finally { setIsSending(false); }
  };

  return (
    <div 
      className="ai-assistant-card" 
      style={{ 
        height: isFullPage ? 'calc(100vh - 120px)' : '480px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div 
        style={{ 
          padding: '16px 20px', 
          borderBottom: '1px solid #E2E8F0', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: '#FFFFFF'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-dark)' }}>AI Assistant</span>
          <span style={{ fontSize: '0.68rem', background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '99px', fontWeight: '800' }}>BETA</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left Drawer / Chat History (if full page or expanded) */}
        {isFullPage && (
          <div 
            style={{ 
              width: '260px', 
              borderRight: '1px solid #E2E8F0', 
              padding: '16px', 
              display: 'flex', 
              flexDirection: 'column',
              background: '#FAFAFA'
            }}
          >
            <button 
              className="btn-secondary" 
              style={{ width: '100%', marginBottom: '16px', border: '1px solid var(--primary)', color: 'var(--primary)' }}
              onClick={() => setMessages([{ id: 1, sender: 'ai', text: 'Hello Admin! 👋 How can I help you today?', time: 'Just now' }])}
            >
              <Plus size={16} /> New Chat
            </button>

            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', marginBottom: '8px' }}>Today</div>
            <div 
              style={{ 
                padding: '10px 12px', 
                background: '#E8F5E9', 
                borderRadius: '8px', 
                fontSize: '0.82rem', 
                fontWeight: '700', 
                color: 'var(--primary)',
                cursor: 'pointer',
                marginBottom: '6px'
              }}
            >
              How to generate a timetable?
            </div>
            <div style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', color: '#475569', cursor: 'pointer', marginBottom: '6px' }}>
              How to add a new department?
            </div>

            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B', margin: '16px 0 8px 0' }}>Yesterday</div>
            <div style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem', color: '#475569', cursor: 'pointer' }}>
              View system summary
            </div>

            <button 
              onClick={() => setMessages([])}
              style={{ marginTop: 'auto', border: 'none', background: 'transparent', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', padding: '8px 0' }}
            >
              <Trash2 size={16} /> Clear Conversations
            </button>
          </div>
        )}

        {/* Right Messages Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F8FAFC', padding: '16px' }}>
          
          {/* Suggested prompts pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '8px' }}>
            {suggestedPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '6px 14px',
                  borderRadius: '99px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  fontSize: '0.78rem',
                  fontWeight: '600',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                className="btn-prompt-pill"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Thread messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.sender === 'ai' && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0, marginTop: '4px' }}>
                    <Bot size={18} style={{ margin: 'auto' }} />
                  </div>
                )}

                <div className={msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', fontSize: '0.68rem', opacity: 0.7, marginTop: '6px' }}>
                    <span>{msg.time}</span>
                    {msg.sender === 'user' && <CheckCheck size={14} style={{ color: 'var(--primary)' }} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              className="search-input"
              style={{ paddingLeft: '16px' }}
              placeholder="Ask me anything about the system..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button 
              className="btn-primary"
              style={{ width: '48px', height: '42px', padding: 0 }}
              onClick={() => handleSend()}
              disabled={isSending}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
