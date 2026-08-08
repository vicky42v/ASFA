import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import SkitLogo from './SkitLogo';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('admin@skit.ac.in');
  const [password, setPassword] = useState('••••••••');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.65) 0%, rgba(0,94,56,0.55) 100%), url("https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1920&auto=format&fit=crop")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Glassmorphic Login Box */}
      <div 
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '40px 36px',
          textAlign: 'center',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <SkitLogo size={64} />
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary)', letterSpacing: '-0.01em' }}>
          SKIT
        </h2>
        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', letterSpacing: '0.05em' }}>
          SRI KRISHNA INSTITUTE OF TECHNOLOGY
        </div>

        <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-dark)', marginTop: '16px', lineHeight: 1.2 }}>
          AI Academic Scheduling System
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 24px 0' }}>
          — Simplify. Schedule. Succeed. —
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
            <User className="search-icon" style={{ left: '16px' }} />
            <input 
              type="text" 
              className="search-input"
              style={{ paddingLeft: '44px', padding: '12px 14px 12px 44px', background: '#FFFFFF' }}
              placeholder="Username / Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="search-input-wrapper" style={{ maxWidth: '100%' }}>
            <Lock className="search-icon" style={{ left: '16px' }} />
            <input 
              type={showPassword ? 'text' : 'password'} 
              className="search-input"
              style={{ paddingLeft: '44px', paddingRight: '44px', padding: '12px 44px', background: '#FFFFFF' }}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--primary)' }} /> Remember Me
            </label>
            <span style={{ color: 'var(--primary)', fontWeight: '700', cursor: 'pointer' }}>Forgot Password?</span>
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            style={{ width: '100%', padding: '14px', borderRadius: '12px', fontSize: '1rem', marginTop: '8px' }}
          >
            Sign In <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '24px' }}>
          v1.0 • © 2026 Sri Krishna Institute of Technology
        </div>
      </div>
    </div>
  );
}
