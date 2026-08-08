import React from 'react';

export default function SkitLogo({ size = 44, className = "" }) {
  return (
    <div 
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #005E38 0%, #003D24 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontWeight: '900',
        fontSize: size * 0.36,
        letterSpacing: '-0.02em',
        boxShadow: '0 2px 8px rgba(0, 94, 56, 0.25)',
        border: '2px solid #E8F5E9',
        flexShrink: 0
      }}
      className={className}
    >
      <svg width={size * 0.75} height={size * 0.75} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="46" stroke="#4ADE80" strokeWidth="4" fill="none" />
        <circle cx="50" cy="50" r="38" stroke="#FFFFFF" strokeWidth="2" fill="none" opacity="0.4" />
        <text x="50" y="58" fontSize="28" fontWeight="900" fill="#FFFFFF" textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif">SKIT</text>
        <path d="M 25 32 L 50 16 L 75 32" stroke="#4ADE80" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
