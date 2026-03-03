import { createContext, useContext, useState } from 'react';

const PlaybackContext = createContext();

export function PlaybackProvider({ children }) {
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playbackQueue, setPlaybackQueue] = useState([]);

  return (
    <PlaybackContext.Provider value={{ nowPlaying, setNowPlaying, playbackQueue, setPlaybackQueue }}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider');
  return ctx;
}
