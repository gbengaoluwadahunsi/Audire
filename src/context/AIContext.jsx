import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import * as api from '../lib/api.js';

const AIContext = createContext(null);

const API_URL = (import.meta.env.VITE_API_URL || '').trim();
const AI_UNAVAILABLE_MSG = 'AI features require backend with GROQ_API_KEY. Set VITE_API_URL in .env.';

export function AIProvider({ children }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const wrap = useCallback((apiFn) => {
    return async (...args) => {
      setIsLoading(true);
      setError(null);
      try {
        if (!API_URL) throw new Error(AI_UNAVAILABLE_MSG);
        return await api[apiFn](...args);
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    };
  }, []);

  const explain = useMemo(() => wrap('aiExplain'), [wrap]);
  const define = useMemo(() => wrap('aiDefine'), [wrap]);
  const summarize = useMemo(() => wrap('aiSummarize'), [wrap]);
  const generateFlashcards = useMemo(() => wrap('aiFlashcards'), [wrap]);
  const ask = useMemo(() => wrap('aiAsk'), [wrap]);
  const catchup = useMemo(() => wrap('aiCatchup'), [wrap]);

  return (
    <AIContext.Provider value={{
      isReady: !!API_URL,
      isLoading,
      error,
      loadProgress: null,
      explain,
      define,
      summarize,
      generateFlashcards,
      ask,
      catchup,
      init: () => Promise.resolve(!!API_URL),
    }}>
      {children}
    </AIContext.Provider>
  );
}

// Provider + hook in one file is intentional; only the hook is consumed elsewhere.
// eslint-disable-next-line react-refresh/only-export-components
export function useAI() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}
