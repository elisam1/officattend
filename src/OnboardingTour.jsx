import React, { useEffect, useState } from 'react';

const steps = [
  {
    title: 'Welcome to OfficAttend!',
    content: 'This quick tour will show you how to register employees, track attendance, and use admin features.'
  },
  {
    title: 'Register Employees',
    content: 'Go to the Register tab and capture each employee’s face. This enables face recognition for attendance.'
  },
  {
    title: 'Attendance',
    content: 'Employees check in/out by facing the camera. The system records their attendance automatically.'
  },
  {
    title: 'Admin Features',
    content: 'Admins can manage employees, view history, export CSVs, and change settings from the Admin tab.'
  },
  {
    title: 'Theme & Settings',
    content: 'Switch between dark/light mode and adjust settings using the toggle and settings panel.'
  },
  {
    title: 'All Set!',
    content: 'You’re ready to use OfficAttend. You can revisit this tour anytime from the settings panel.'
  }
];

export default function OnboardingTour({ open, onClose }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!open) setStep(0);
  }, [open]);
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 400, boxShadow: '0 8px 32px #0002', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 12px' }}>{steps[step].title}</h2>
        <div style={{ marginBottom: 24, color: '#444' }}>{steps[step].content}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #bbb', background: '#f3f4f6', color: '#222', cursor: 'pointer' }}>Skip</button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Next</button>
          ) : (
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #2563eb', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Finish</button>
          )}
        </div>
      </div>
    </div>
  );
}
