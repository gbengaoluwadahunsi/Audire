import React, { useState, useEffect, lazy, Suspense } from 'react';
import LandingPage from './components/LandingPage';
import ErrorBoundary from './components/ErrorBoundary';

const safeLazyImport = (importFn) =>
  lazy(async () => {
    try {
      const component = await importFn();
      sessionStorage.removeItem('chunk_reload_attempted');
      return component;
    } catch (error) {
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        /Failed to fetch dynamically imported module|Importing a module script failed/i.test(
          error?.message || ''
        );
      if (isChunkError && !sessionStorage.getItem('chunk_reload_attempted')) {
        sessionStorage.setItem('chunk_reload_attempted', 'true');
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });

const Dashboard = safeLazyImport(() => import('./components/Dashboard'));
import { getSettings } from './lib/settings';
import './App.css';

const API_BASE = (import.meta.env.VITE_API_URL || '').trim();
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function App() {
  const [view, setView] = useState('landing');

  useEffect(() => {
    const settings = getSettings();
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, []);

  useEffect(() => {
    if (!API_BASE) return;
    const healthUrl = `${API_BASE.replace(/\/$/, '')}/api/health`;
    const ping = () => setTimeout(() => fetch(healthUrl).catch(() => {}), 0);
    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.activeElement?.blur();
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          const searchInput = document.querySelector('.dashboard-search input');
          if (searchInput) searchInput.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ErrorBoundary>
      {view === 'landing' ? (
        <LandingPage onEnter={() => setView('dashboard')} />
      ) : (
        <Suspense fallback={<div className="app-route-fallback">Loading library…</div>}>
          <Dashboard onBackToLanding={() => setView('landing')} />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

export default App;
