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
          {snacks.map(s => (
            <div key={s.id} style={{ pointerEvents: 'auto', background: s.type==='error' ? '#d32f2f' : s.type==='success' ? '#2e7d32' : '#333', color: 'white', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.25)', minWidth: 240, textAlign: 'center' }}>
              {s.message}
            </div>
          ))}
        </div>
      </div>
    </SnackbarCtx.Provider>
  )
}

export function useSnackbar() { return useContext(SnackbarCtx) }

