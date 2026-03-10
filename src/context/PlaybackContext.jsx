import React, { createContext, useContext, useState, useCallback } from 'react';
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
    setIsPlaying(false);
    setCurrentBook(null);
    setProgress(0);
  }, []);

  const toggle = useCallback((book) => {
    if (currentBook?.id === book?.id && isPlaying) {
      pause();
    } else if (book) {
      play(book);
    }
  }, [currentBook, isPlaying, play, pause]);

  return (
    <PlaybackContext.Provider value={{
      currentBook,
      isPlaying,
      progress,
      volume,
      speed,
      setProgress,
      setVolume,
      setSpeed,
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
