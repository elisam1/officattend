import React from 'react';

export default function EmptyState({ label = 'No data', style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, color: '#bbb', ...style }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12 }}>
        <rect x="10" y="20" width="60" height="40" rx="8" fill="#f3f3f3" stroke="#e0e0e0" strokeWidth="2" />
        <circle cx="40" cy="40" r="8" fill="#e0e0e0" />
        <rect x="24" y="54" width="32" height="4" rx="2" fill="#e0e0e0" />
      </svg>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{label}</div>
    </div>
  );
}
