import React, { createContext, useContext, useMemo, useState } from 'react'

const SnackbarCtx = createContext({ push: () => {} })

export function SnackbarProvider({ children }) {
  const [snacks, setSnacks] = useState([])
  const api = useMemo(() => ({
    push(message, type = 'info', duration = 3500) {
      const id = Date.now() + Math.random()
      setSnacks(s => [...s, { id, message, type }])
      setTimeout(() => setSnacks(s => s.filter(x => x.id !== id)), duration)
    }
  }), [])

  return (
    <SnackbarCtx.Provider value={api}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, left: 0, right: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 9999 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {snacks.map(s => {
            let bg = '#333', icon = 'ℹ️', border = '#1976d2';
            if (s.type === 'error') { bg = '#f44336'; icon = '❌'; border = '#b71c1c'; }
            else if (s.type === 'success') { bg = '#43a047'; icon = '✅'; border = '#1b5e20'; }
            else if (s.type === 'warning') { bg = '#ffa000'; icon = '⚠️'; border = '#ff6f00'; }
            return (
              <div
                key={s.id}
                role="status"
                aria-live={s.type === 'error' ? 'assertive' : 'polite'}
                style={{
                  pointerEvents: 'auto',
                  background: bg,
                  color: 'white',
                  padding: '10px 18px',
                  borderRadius: 8,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                  minWidth: 260,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderLeft: `5px solid ${border}`,
                  fontSize: 16
                }}
              >
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ flex: 1 }}>{s.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </SnackbarCtx.Provider>
  )
}

export function useSnackbar() { return useContext(SnackbarCtx) }

