import React from 'react';

export default function Spinner({ size = 40, color = '#2563eb', style = {} }) {
  return (
    <div style={{ display: 'inline-block', ...style }}>
      <svg width={size} height={size} viewBox="0 0 50 50">
        <circle
          cx="25" cy="25" r="20"
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray="31.4 31.4"
          strokeLinecap="round"
          style={{
            transformOrigin: 'center',
            animation: 'spin 1s linear infinite'
          }}
        />
        <style>{`
          @keyframes spin {
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    </div>
  );
}
