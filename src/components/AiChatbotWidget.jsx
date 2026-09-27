import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Bot,
  Copy,
  Check,
  X,
  BookOpen,
  Building,
  Calendar,
  Clock,
  Printer,
  ChevronRight,
  RotateCcw,
  User,
} from 'lucide-react';
import { chatbotApi } from '../services/api';

const TOPIC_CHANNELS = [
  {
    id: 'general',
    name: 'All Knowledge Hub',
    icon: Sparkles,
    badge: 'Real-Time',
    desc: 'General queries, schemes, schedules, and operations',
  },
  {
    id: 'hods',
    name: 'Departments & HODs',
    icon: Building,
    badge: 'Directory',
    desc: 'Verified Head of Department, faculty roles, and staff details',
  },
  {
    id: 'schemes',
    name: 'Curriculum & Schemes',
    icon: BookOpen,
    badge: '2022 / 2025',
    desc: 'Course codes, categories (IPCC, PCC, PEC, OEC), and credits',
  },
  {
    id: 'saturday',
    name: 'Saturday Project & Labs',
    icon: Calendar,
    badge: 'Sem 7 Rule',
    desc: 'Major Project Phase-II 7-period allocation and IPCC 2-period lab rules',
  },
  {
    id: 'workload',
    name: 'Faculty Workloads',
    icon: Clock,
    badge: 'Constraints',
    desc: 'Weekly teaching hour limits, proctor assignment (0h), and cross-semester rules',
  },
  {
    id: 'print',
    name: 'Print & Zoom Layouts',
    icon: Printer,
    badge: 'Format',
    desc: 'Official SKIT institutional format, Ctrl+ / Ctrl- interface zoom',
  },
];

const QUICK_STARTER_CARDS = [
  {
    title: 'HOD of AIML',
    category: 'Directory',
    query: 'Who is the Head of Department (HOD) for Artificial Intelligence & Machine Learning (AIML)?',
    icon: '🏛️',
  },
  {
    title: 'Saturday Sem 7 Rule',
    category: 'Curriculum',
    query: 'How are 7th semester Saturdays scheduled for Major Project Phase-II?',
    icon: '📅',
  },
  {
    title: '2022 vs 2025 Schemes',
    category: 'VTU Scheme',
    query: 'What is the difference between 2022 and 2025 schemes at SKIT?',
    icon: '📚',
  },
  {
    title: 'Section A vs Section B',
    category: 'Scheduling Engine',
    query: 'How does ASFA generate distinct schedules for Section A and Section B without clashes?',
    icon: '🔀',
  },
];

export default function AiChatbotWidget({ isFullPage = false, isFloating = false, onClose = null }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: "### 🏛️ Welcome Administrator!\n\nI am your **ASFA AI Academic Assistant**, with real-time insight into the SKIT scheduling database, faculty allocations, VTU schemes (2022 & 2025), and conflict-free timetable generation.\n\nAsk me about **Department Heads (HODs)**, **7th Sem Saturday Major Project allocations**, **Faculty Workloads**, **IPCC Lab batch assignments**, or **Institutional Print formatting**.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeChannel, setActiveChannel] = useState('general');
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  const handleSend = async (textToSend) => {
    const query = textToSend || input;
    if (!query || !query.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const response = await chatbotApi.send(query);
      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: response.answer || response.reply || 'Information retrieved successfully.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'ai',
          text: `⚠️ Error fetching response: ${error.message || 'Please check backend server connection.'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: Date.now(),
        sender: 'ai',
        text: "### 🏛️ New Session Initialized\n\nHow can I help you with SKIT scheduling, department structures, or timetable generation today?",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const renderInline = (str) => {
    const parts = [];
    let remaining = str;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
      const codeMatch = remaining.match(/`(.*?)`/);
      let nextMatch = null;
      let type = null;

      if (boldMatch && codeMatch) {
        if (boldMatch.index < codeMatch.index) {
          nextMatch = boldMatch;
          type = 'bold';
        } else {
          nextMatch = codeMatch;
          type = 'code';
        }
      } else if (boldMatch) {
        nextMatch = boldMatch;
        type = 'bold';
      } else if (codeMatch) {
        nextMatch = codeMatch;
        type = 'code';
      }

      if (nextMatch) {
        if (nextMatch.index > 0) {
          parts.push(<span key={key++}>{remaining.substring(0, nextMatch.index)}</span>);
        }
        if (type === 'bold') {
          parts.push(
            <strong key={key++} style={{ fontWeight: '800', color: '#0F172A' }}>
              {nextMatch[1]}
            </strong>
          );
        } else {
          parts.push(
            <code
              key={key++}
              style={{
                background: '#F1F5F9',
                color: '#0F766E',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '0.80rem',
                fontFamily: 'monospace',
                border: '1px solid #E2E8F0',
              }}
            >
              {nextMatch[1]}
            </code>
          );
        }
        remaining = remaining.substring(nextMatch.index + nextMatch[0].length);
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }
    }
    return parts;
  };

  const renderFormattedText = (text) => {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) {
        return (
          <h4
            key={lIdx}
            style={{
              margin: '10px 0 6px 0',
              fontSize: '0.96rem',
              fontWeight: '800',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {trimmed.replace('### ', '')}
          </h4>
        );
      }
      if (trimmed.startsWith('- ')) {
        return (
          <div key={lIdx} style={{ display: 'flex', gap: '8px', margin: '3px 0 3px 6px', fontSize: '0.86rem', color: '#334155' }}>
            <span style={{ color: 'var(--primary)', fontWeight: '900' }}>•</span>
            <div style={{ flex: 1 }}>{renderInline(trimmed.substring(2))}</div>
          </div>
        );
      }
      if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+\.)\s*(.*)$/);
        return (
          <div key={lIdx} style={{ display: 'flex', gap: '8px', margin: '3px 0 3px 6px', fontSize: '0.86rem', color: '#334155' }}>
            <span style={{ color: '#047857', fontWeight: '800', minWidth: '18px' }}>{match[1]}</span>
            <div style={{ flex: 1 }}>{renderInline(match[2])}</div>
          </div>
        );
      }
      if (trimmed === '') {
        return <div key={lIdx} style={{ height: '6px' }} />;
      }
      return (
        <div key={lIdx} style={{ margin: '3px 0', fontSize: '0.86rem', lineHeight: '1.5', color: '#334155' }}>
          {renderInline(trimmed)}
        </div>
      );
    });
  };

  return (
    <div
      className="ai-assistant-card"
      style={{
        height: isFullPage ? 'calc(100vh - 120px)' : isFloating ? '560px' : '480px',
        maxHeight: isFloating ? '84vh' : 'none',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isFloating ? '0 16px 40px rgba(0, 0, 0, 0.22)' : '0 2px 10px rgba(0, 0, 0, 0.05)',
        borderRadius: isFloating ? '16px' : '12px',
        overflow: 'hidden',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, #FFFFFF 0%, #F8FAFC 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--primary) 0%, #15803D 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 2px 6px rgba(0, 94, 56, 0.3)',
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '800', fontSize: '1rem', color: '#0F172A' }}>
                ASFA AI Assistant
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  background: '#DCFCE7',
                  color: '#15803D',
                  padding: '1px 7px',
                  borderRadius: '99px',
                  fontWeight: '800',
                  letterSpacing: '0.04em',
                }}
              >
                ONLINE
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
              Sri Krishna Institute of Technology • Automated Scheduling Engine
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleResetChat}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '0.75rem',
              fontWeight: '700',
              cursor: 'pointer',
            }}
            title="Start new conversation"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '6px',
                padding: '5px',
                cursor: 'pointer',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close Assistant"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left Topic Channels Panel */}
        {isFullPage && (
          <div
            style={{
              width: '280px',
              borderRight: '1px solid #E2E8F0',
              padding: '16px 12px',
              display: 'flex',
              flexDirection: 'column',
              background: '#F8FAFC',
              gap: '6px',
              overflowY: 'auto',
            }}
          >
            <button
              className="btn-primary"
              style={{
                width: '100%',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                fontWeight: '800',
                padding: '8px 12px',
                borderRadius: '8px',
              }}
              onClick={handleResetChat}
            >
              <Plus size={16} /> New Chat Session
            </button>

            <div style={{ fontSize: '0.70rem', fontWeight: '800', color: '#64748B', padding: '4px 8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Knowledge Channels
            </div>

            {TOPIC_CHANNELS.map((ch) => {
              const active = activeChannel === ch.id;
              const IconComp = ch.icon;

              return (
                <div
                  key={ch.id}
                  onClick={() => setActiveChannel(ch.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: active ? '#FFFFFF' : 'transparent',
                    border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    boxShadow: active ? '0 2px 4px rgba(0, 0, 0, 0.04)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <IconComp size={15} color={active ? 'var(--primary)' : '#64748B'} />
                      <span style={{ fontSize: '0.80rem', fontWeight: active ? '800' : '700', color: active ? 'var(--primary)' : '#1E293B' }}>
                        {ch.name}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.58rem', background: active ? '#DCFCE7' : '#E2E8F0', color: active ? '#15803D' : '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                      {ch.badge}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', lineHeight: '1.3', paddingLeft: '22px' }}>
                    {ch.desc}
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setMessages([])}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  color: '#EF4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '6px 0',
                }}
              >
                <Trash2 size={14} /> Clear Message History
              </button>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#FFFFFF' }}>
          {/* Messages Stream */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Quick Starter Cards if only initial greeting */}
            {messages.length <= 1 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', marginBottom: '8px', letterSpacing: '0.03em' }}>
                  POPULAR INQUIRIES & ACTIONS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isFullPage ? 'repeat(2, 1fr)' : '1fr', gap: '10px' }}>
                  {QUICK_STARTER_CARDS.map((card, cIdx) => (
                    <div
                      key={cIdx}
                      onClick={() => handleSend(card.query)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1.5px solid #E2E8F0',
                        background: '#F8FAFC',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary)';
                        e.currentTarget.style.background = '#FFFFFF';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.3rem' }}>{card.icon}</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0F172A' }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '1px' }}>
                            {card.category}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} color="#94A3B8" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      maxWidth: isUser ? '80%' : '92%',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: isUser ? '#2563EB' : 'linear-gradient(135deg, var(--primary) 0%, #15803D 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      {isUser ? <User size={15} /> : <Bot size={15} />}
                    </div>

                    <div
                      style={{
                        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                        padding: '12px 16px',
                        background: isUser ? '#2563EB' : '#F8FAFC',
                        color: isUser ? '#FFFFFF' : '#0F172A',
                        border: isUser ? 'none' : '1.5px solid #E2E8F0',
                        boxShadow: isUser
                          ? '0 3px 10px rgba(37, 99, 235, 0.25)'
                          : '0 2px 6px rgba(0, 0, 0, 0.03)',
                        lineHeight: '1.5',
                        position: 'relative',
                      }}
                    >
                      {isUser ? (
                        <div style={{ fontSize: '0.88rem', fontWeight: '500' }}>{msg.text}</div>
                      ) : (
                        <div>{renderFormattedText(msg.text)}</div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: isUser ? 'flex-end' : 'space-between',
                          gap: '12px',
                          marginTop: '6px',
                          paddingTop: '4px',
                          borderTop: isUser ? 'none' : '1px solid #E2E8F0',
                        }}
                      >
                        <span style={{ fontSize: '0.65rem', opacity: 0.7, color: isUser ? '#E0E7FF' : '#64748B' }}>
                          {msg.time}
                        </span>

                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.text)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedId === msg.id ? '#10B981' : '#64748B',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              padding: '2px 4px',
                            }}
                            title="Copy response to clipboard"
                          >
                            {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary) 0%, #15803D 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bot size={15} />
                </div>
                <div
                  style={{
                    background: '#F1F5F9',
                    borderRadius: '12px',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: '#475569',
                    fontWeight: '700',
                  }}
                >
                  <Sparkles size={14} className="animate-spin" color="var(--primary)" />
                  <span>Searching SKIT Academic Engine & Database...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Elevated Floating Input Bar */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #E2E8F0',
              background: '#FFFFFF',
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#F8FAFC',
                border: '1.5px solid #CBD5E1',
                borderRadius: '12px',
                padding: '4px 6px 4px 14px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about SKIT schedules, HODs, Saturday project, schemes, workloads..."
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '0.86rem',
                  color: '#0F172A',
                }}
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                style={{
                  background: input.trim() ? 'var(--primary)' : '#94A3B8',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: input.trim() ? 'pointer' : 'default',
                  fontWeight: '700',
                  fontSize: '0.82rem',
                  transition: 'background 0.15s ease',
                }}
              >
                <span>Send</span>
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
