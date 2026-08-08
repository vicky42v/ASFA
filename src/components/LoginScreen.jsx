import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { authApi } from '../services/api';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const user = await authApi.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #0F172A 0%, #003822 50%, #005E38 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      {/* Decorative Background Graphics */}
      {/* Top Left Swooshes */}
      <svg 
        style={{ position: 'absolute', top: -50, left: -50, width: '320px', height: '320px', pointerEvents: 'none', opacity: 0.8 }} 
        viewBox="0 0 200 200"
      >
        <circle cx="50" cy="50" r="120" fill="#005E38" opacity="0.4" />
        <circle cx="50" cy="50" r="90" fill="none" stroke="#DC2626" strokeWidth="2.5" opacity="0.6" />
        <circle cx="50" cy="50" r="140" fill="none" stroke="#005E38" strokeWidth="3" opacity="0.8" />
      </svg>

      {/* Bottom Right Swooshes */}
      <svg 
        style={{ position: 'absolute', bottom: -80, right: -80, width: '420px', height: '420px', pointerEvents: 'none', opacity: 0.85 }} 
        viewBox="0 0 200 200"
      >
        <circle cx="150" cy="150" r="130" fill="#005E38" opacity="0.5" />
        <circle cx="150" cy="150" r="100" fill="none" stroke="#DC2626" strokeWidth="2.5" opacity="0.7" />
        <circle cx="150" cy="150" r="150" fill="none" stroke="#10B981" strokeWidth="3" opacity="0.8" />
      </svg>

      {/* Top Right Dot Grid */}
      <div 
        style={{
          position: 'absolute',
          top: '40px',
          right: '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 8px)',
          gap: '12px',
          opacity: 0.6
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34D399' }} />
        ))}
      </div>

      {/* Bottom Left Dot Grid */}
      <div 
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 8px)',
          gap: '12px',
          opacity: 0.6
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34D399' }} />
        ))}
      </div>

      {/* Translucent Glassmorphic Login Card */}
      <div 
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '28px',
          border: '1.5px solid rgba(255, 255, 255, 0.95)',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.35), 0 10px 20px rgba(0, 0, 0, 0.2)',
          padding: '38px 36px 30px 36px',
          textAlign: 'center',
          zIndex: 10,
          margin: '20px',
          boxSizing: 'border-box'
        }}
      >
        {/* SKIT Circular Emblem Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
          <div 
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: '#FFFFFF',
              border: '2.5px solid #005E38',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(0, 94, 56, 0.2)',
              padding: '6px'
            }}
          >
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
              <circle cx="50" cy="50" r="46" fill="none" stroke="#005E38" strokeWidth="3" />
              <path d="M50 12 L78 28 L78 68 L50 86 L22 68 L22 28 Z" fill="#005E38" opacity="0.1" />
              <text x="50" y="32" textAnchor="middle" fill="#005E38" fontSize="11" fontWeight="800" letterSpacing="0.5">SKIT</text>
              <circle cx="50" cy="52" r="14" fill="#005E38" />
              <path d="M43 52 L57 52 M50 45 L50 59" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              <text x="50" y="78" textAnchor="middle" fill="#005E38" fontSize="6.5" fontWeight="700">BENGALURU</text>
            </svg>
          </div>
        </div>

        {/* Institution Brand Header */}
        <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#005E38', letterSpacing: '0.04em' }}>
          SKIT
        </div>
        <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#1E293B', letterSpacing: '0.06em', marginBottom: '16px' }}>
          SRI KRISHNA INSTITUTE OF TECHNOLOGY
        </div>

        {/* System Title & Motto */}
        <h1 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0F172A', lineHeight: '1.25', margin: '0 0 6px 0' }}>
          AI Academic Scheduling System
        </h1>
        <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#475569', marginBottom: '24px' }}>
          — &nbsp;Simplify. Schedule. Succeed.&nbsp; —
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Username Input */}
          <div style={{ position: 'relative', width: '100%' }}>
            <User 
              size={18} 
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} 
            />
            <input 
              type="text" 
              style={{
                width: '100%',
                padding: '13px 16px 13px 44px',
                borderRadius: '12px',
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                fontSize: '0.95rem',
                fontWeight: '600',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s ease'
              }}
              placeholder="Username / Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Password Input */}
          <div style={{ position: 'relative', width: '100%' }}>
            <Lock 
              size={18} 
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} 
            />
            <input 
              type={showPassword ? 'text' : 'password'} 
              style={{
                width: '100%',
                padding: '13px 44px 13px 44px',
                borderRadius: '12px',
                border: '1.5px solid #CBD5E1',
                background: '#F8FAFC',
                fontSize: '0.95rem',
                fontWeight: '600',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s ease'
              }}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Remember Me & Forgot Password Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: '#334155', margin: '2px 0 6px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', fontWeight: '600' }}>
              <input 
                type="checkbox" 
                defaultChecked 
                style={{ width: '16px', height: '16px', accentColor: '#005E38', cursor: 'pointer' }} 
              /> 
              Remember Me
            </label>
            <span style={{ color: '#005E38', fontWeight: '700', cursor: 'pointer' }}>Forgot Password?</span>
          </div>

          {/* Sign In Button */}
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: '#005E38',
              color: '#FFFFFF',
              fontSize: '1rem',
              fontWeight: '700',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 18px rgba(0, 94, 56, 0.35)',
              transition: 'background 0.2s ease, transform 0.1s ease'
            }}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'} <ArrowRight size={18} />
          </button>

          {error && (
            <div style={{ color: '#DC2626', fontSize: '0.82rem', fontWeight: '700', marginTop: '6px' }}>
              {error}
            </div>
          )}
        </form>

        {/* Footer info */}
        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '24px' }}>
          v1.0
          <div style={{ marginTop: '2px', fontWeight: '700', color: '#005E38' }}>
            © 2026 Sri Krishna Institute of Technology
          </div>
        </div>
      </div>
    </div>
  );
}
