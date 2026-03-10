import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PlaybackProvider } from './context/PlaybackContext'
import { AIProvider } from './context/AIContext'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PlaybackProvider>
      <AIProvider>
        <App />
      </AIProvider>
    </PlaybackProvider>
  </StrictMode>,
)
