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

function App() {
  const [view, setView] = useState('landing');

  useEffect(() => {
    const settings = getSettings();
    document.documentElement.classList.toggle('light', settings.theme === 'light');
  }, []);

  // Wake the backend once on load so it is warm by the time the reader presses play.
  // (A repeating ping from every open tab only cost requests; it can't keep a free
  // server awake once tabs close, and the player now says when it is waking up.)
  useEffect(() => {
    if (!API_BASE) return;
    fetch(`${API_BASE.replace(/\/$/, '')}/api/health`).catch(() => {});
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
