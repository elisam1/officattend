// src/Avatar.jsx
import React from 'react';

export default function Avatar({ name, size = 32, style = {} }) {
  const initials = (name || '').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#1976d2',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size / 2,
        userSelect: 'none',
        ...style,
      }}
      aria-label={name ? `Avatar for ${name}` : 'Avatar'}
    >
      {initials || <span role="img" aria-label="user">👤</span>}
    </div>
  );
}
