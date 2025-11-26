import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { SnackbarProvider } from './snackbar.jsx'

const root = createRoot(document.getElementById('root'))
root.render(
  <SnackbarProvider>
    <App />
  </SnackbarProvider>
)
