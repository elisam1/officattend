import React from 'react';

export default function SettingsPanel({ theme, setTheme, cameraList, selectedCamera, setSelectedCamera, language, setLanguage, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.25)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: '#fff', color: '#222', borderRadius: 12, minWidth: 320, maxWidth: 360, boxShadow: '0 4px 32px rgba(0,0,0,0.10)', padding: 24, display: 'grid', gap: 18, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer' }} aria-label="Close settings">✕</button>
        <h2 style={{ margin: 0, fontSize: 20 }}>Settings</h2>
        <div>
          <label style={{ fontWeight: 500 }}>Theme:</label>
          <select value={theme} onChange={e => setTheme(e.target.value)} style={{ marginLeft: 10, padding: 6, borderRadius: 6 }}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div>
          <label style={{ fontWeight: 500 }}>Language:</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={{ marginLeft: 10, padding: 6, borderRadius: 6 }}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            {/* Add more languages as needed */}
          </select>
        </div>
        <div>
          <label style={{ fontWeight: 500 }}>Camera:</label>
          <select value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)} style={{ marginLeft: 10, padding: 6, borderRadius: 6 }}>
            {cameraList.map(cam => (
              <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId}`}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
