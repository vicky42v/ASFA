import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { authApi } from '../services/api';
import collegeBg from '../assets/skit-college-campus.jpg';
import skitEmblem from '../assets/skit-emblem.png';

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
        backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.76) 0%, rgba(2, 44, 34, 0.80) 50%, rgba(6, 78, 59, 0.84) 100%), url(${collegeBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
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
        style={{ position: 'absolute', top: -50, left: -50, width: '320px', height: '320px', pointerEvents: 'none', opacity: 0.6 }} 
        viewBox="0 0 200 200"
      >
        <circle cx="50" cy="50" r="120" fill="#005E38" opacity="0.35" />
        <circle cx="50" cy="50" r="90" fill="none" stroke="#DC2626" strokeWidth="2.5" opacity="0.5" />
        <circle cx="50" cy="50" r="140" fill="none" stroke="#005E38" strokeWidth="3" opacity="0.7" />
      </svg>

      {/* Bottom Right Swooshes */}
      <svg 
        style={{ position: 'absolute', bottom: -80, right: -80, width: '420px', height: '420px', pointerEvents: 'none', opacity: 0.7 }} 
        viewBox="0 0 200 200"
      >
        <circle cx="150" cy="150" r="130" fill="#005E38" opacity="0.4" />
        <circle cx="150" cy="150" r="100" fill="none" stroke="#DC2626" strokeWidth="2.5" opacity="0.6" />
        <circle cx="150" cy="150" r="150" fill="none" stroke="#10B981" strokeWidth="3" opacity="0.7" />
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
          opacity: 0.5
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
          opacity: 0.5
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
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderRadius: '28px',
          border: '1.5px solid rgba(255, 255, 255, 0.98)',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.4), 0 10px 20px rgba(0, 0, 0, 0.25)',
          padding: '36px 36px 28px 36px',
          textAlign: 'center',
          zIndex: 10,
          margin: '20px',
          boxSizing: 'border-box'
        }}
      >
        {/* SKIT Circular Emblem Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <img 
            src={skitEmblem} 
            alt="Sri Krishna Institute of Technology Emblem"
            style={{
              width: '82px',
              height: '82px',
              borderRadius: '50%',
              objectFit: 'contain',
              boxShadow: '0 8px 24px rgba(0, 94, 56, 0.3)',
              border: '3px solid #FFFFFF',
              background: '#FFFFFF',
              padding: '2px'
            }}
          />
        </div>

        {/* Institution Brand Header */}
        <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#005E38', letterSpacing: '0.04em' }}>
          SKIT
        </div>
        <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#1E293B', letterSpacing: '0.06em', marginBottom: '10px' }}>
          SRI KRISHNA INSTITUTE OF TECHNOLOGY
        </div>

        <div style={{ display: 'inline-block', padding: '3px 12px', background: '#E8F5E9', border: '1px solid #A7F3D0', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '800', color: '#005E38', marginBottom: '14px', letterSpacing: '0.05em' }}>
          AI-ASFA
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
