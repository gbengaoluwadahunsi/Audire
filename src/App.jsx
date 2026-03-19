import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import { getSettings } from './lib/settings';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_URL || '').trim();
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function App() {
  const [view, setView] = useState('landing');

  // Apply initial theme
  useEffect(() => {
    const settings = getSettings();
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, []);

  // Keep Render free-tier backend awake: ping /api/health every 5 minutes
  useEffect(() => {
    if (!API_BASE) return;
    const healthUrl = `${API_BASE.replace(/\/$/, '')}/api/health`;
    const ping = () => setTimeout(() => fetch(healthUrl).catch(() => {}), 0);
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {view === 'landing' ? (
        <LandingPage onEnter={() => setView('dashboard')} />
      ) : (
        <Dashboard onBackToLanding={() => setView('landing')} />
      )}
    </>
  );
}

export default App;
