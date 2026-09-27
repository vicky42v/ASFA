import React from 'react';
import skitEmblem from '../assets/skit-emblem.png';

export default function SkitLogo({ size = 44, className = "" }) {
  return (
    <img
      src={skitEmblem}
      alt="Sri Krishna Institute of Technology Emblem"
      width={size}
      height={size}
      className={`skit-logo-img ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'contain',
        boxShadow: '0 2px 10px rgba(0, 94, 56, 0.25)',
        border: '1.5px solid #E2E8F0',
        background: '#FFFFFF',
        flexShrink: 0
      }}
    />
  );
}

