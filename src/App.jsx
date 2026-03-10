import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import { getSettings } from './lib/settings';
import './App.css';

function App() {
  const [view, setView] = useState('landing');

  // Apply initial theme
  useEffect(() => {
    const settings = getSettings();
    document.documentElement.classList.toggle('light', settings.theme === 'light');
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
