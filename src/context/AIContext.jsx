import React, { createContext, useContext, useState, useCallback } from 'react';

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
        const api = await import('../lib/api.js');
        return await api[apiFn](...args);
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    };
  }, []);

  const explain = useCallback(wrap('aiExplain'), [wrap]);
  const define = useCallback(wrap('aiDefine'), [wrap]);
  const summarize = useCallback(wrap('aiSummarize'), [wrap]);
  const generateFlashcards = useCallback(wrap('aiFlashcards'), [wrap]);
  const visualizeScene = useCallback(wrap('aiVisualize'), [wrap]);

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
      visualizeScene,
      init: () => Promise.resolve(!!API_URL),
    }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}
