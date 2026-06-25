import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { ttsManager } from '../lib/ttsManager';
import { getSettings, saveSettings } from '../lib/settings';

const PlaybackContext = createContext(null);

export function PlaybackProvider({ children }) {
  const [currentBook, setCurrentBook] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [speed, setSpeedState] = useState(getSettings().speed || 1.0);

  const setVolume = useCallback((v) => {
    setVolumeState(v);
    ttsManager.setVolume(v);
  }, []);

  const setSpeed = useCallback((s) => {
    const clampedSpeed = Math.max(0.5, Math.min(2.0, s));
    setSpeedState(clampedSpeed);
    ttsManager.setSpeed(clampedSpeed);
    const settings = getSettings();
    saveSettings({ ...settings, speed: clampedSpeed });
  }, []);

  const [onNext, setOnNext] = useState(null);
  const [onPrev, setOnPrev] = useState(null);

  const play = useCallback((book) => {
    setCurrentBook(book);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    ttsManager.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    ttsManager.stop();
    try {
      window.dispatchEvent(new CustomEvent('audire-tts-global-stop'));
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
    setCurrentBook(null);
    setProgress(0);
    setOnNext(null);
    setOnPrev(null);
  }, []);

  const toggle = useCallback((book) => {
    if (currentBook?.id === book?.id && isPlaying) {
      pause();
    } else if (book) {
      play(book);
    }
  }, [currentBook, isPlaying, play, pause]);

  // Handle MediaSession metadata
  useEffect(() => {
    if ('mediaSession' in navigator && currentBook) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentBook.title || 'Unknown Title',
        artist: currentBook.author || 'Unknown Author',
        artwork: currentBook.cover ? [{ src: currentBook.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    }
  }, [currentBook]);

  // Sync play/pause state when controlled from the lock screen / notification.
  useEffect(() => {
    const onPause = () => setIsPlaying(false);
    const onResume = () => setIsPlaying(true);
    window.addEventListener('audire-tts-pause', onPause);
    window.addEventListener('audire-tts-resume', onResume);
    return () => {
      window.removeEventListener('audire-tts-pause', onPause);
      window.removeEventListener('audire-tts-resume', onResume);
    };
  }, []);

  // Keep a ref to the latest handlers so we don't need to re-register action handlers
  const handlersRef = useRef({ onNext, onPrev, play, pause, stop, currentBook, isPlaying });
  useEffect(() => {
    handlersRef.current = { onNext, onPrev, play, pause, stop, currentBook, isPlaying };
  }, [onNext, onPrev, play, pause, stop, currentBook, isPlaying]);

  // Register MediaSession action handlers
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        handlersRef.current.play(handlersRef.current.currentBook);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        handlersRef.current.pause();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        handlersRef.current.stop();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (handlersRef.current.onNext) handlersRef.current.onNext();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (handlersRef.current.onPrev) handlersRef.current.onPrev();
      });
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      }
    };
  }, []);

  return (
    <PlaybackContext.Provider value={{
      currentBook,
      isPlaying,
      progress,
      volume,
      speed,
      onNext,
      onPrev,
      setProgress,
      setVolume,
      setSpeed,
      setOnNext,
      setOnPrev,
      play,
      pause,
      stop,
      toggle,
      setCurrentBook,
    }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider');
  return ctx;
}
