import React, { useState } from 'react';
import { Bot, Sparkles, X, MessageSquare } from 'lucide-react';
import AiChatbotWidget from './AiChatbotWidget';

export default function GlobalAiChatbotButton({ hide = false }) {
  const [isOpen, setIsOpen] = useState(false);

  if (hide) return null;

  return (
    <>
      {/* Floating Action Button (Visible on all screens) */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px',
        }}
      >
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 18px',
              background: 'linear-gradient(135deg, #005E38 0%, #008751 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '999px',
              boxShadow: '0 8px 24px rgba(0, 94, 56, 0.35)',
              cursor: 'pointer',
              fontWeight: '800',
              fontSize: '0.88rem',
              letterSpacing: '0.01em',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 94, 56, 0.45)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 94, 56, 0.35)';
            }}
            title="Ask ASFA AI Assistant"
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} color="#FFFFFF" />
            </div>
            <span>AI Assistant</span>
            <span
              style={{
                background: '#86EFAC',
                color: '#064E3B',
                fontSize: '0.62rem',
                fontWeight: '900',
                padding: '2px 6px',
                borderRadius: '99px',
              }}
            >
              ONLINE
            </span>
          </button>
        )}
      </div>

      {/* Floating Modal / Drawer */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '460px',
            maxWidth: 'calc(100vw - 32px)',
            height: '560px',
            maxHeight: 'calc(100vh - 48px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            animation: 'fadeInUp 0.2s ease-out',
          }}
        >
          <AiChatbotWidget
            isFullPage={false}
            isFloating={true}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </>
  );
}
