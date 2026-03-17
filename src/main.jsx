import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { PlaybackProvider } from './context/PlaybackContext'
import { AIProvider } from './context/AIContext'

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  } else {
    // Unregister stale service workers in dev to prevent cached HTML being served for JS modules
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PlaybackProvider>
        <AIProvider>
          <App />
        </AIProvider>
      </PlaybackProvider>
    </ErrorBoundary>
  </StrictMode>,
)
