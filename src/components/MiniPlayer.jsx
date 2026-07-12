import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, X, Zap, Settings as SettingsIcon, Moon, Mic, Music } from 'lucide-react';
import { usePlayback } from '../context/PlaybackContext';

const EDGE_VOICES = [
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava (US Female)' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew (US Male)' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK Female)' },
  { id: 'en-GB-RyanNeural', label: 'Ryan (UK Male)' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha (AU Female)' },
];

export default function MiniPlayer({ onOpenBook }) {
  const { 
    currentBook, isPlaying, progress, volume, speed, voice, pitch, sleepTimer, 
    pause, stop, setVolume, setSpeed, setVoice, setPitch, startSleepTimer, onNext, onPrev 
  } = usePlayback();
  
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  if (!currentBook) {
    return (
      <div className="dashboard-player dashboard-player--empty">
        <div className="dashboard-player-info">
          <div className="dashboard-player-cover" />
          <div className="dashboard-player-details">
            <h4>No book playing</h4>
            <p>Select a book to listen</p>
          </div>
        </div>
      </div>
    );
  }

  const formatSleepTime = (ms) => {
    if (!ms) return '';
    const diff = ms - Date.now();
    if (diff <= 0) return '0m';
    return Math.ceil(diff / 60000) + 'm';
  };

  return (
    <div className="dashboard-player">
      <div className="dashboard-player-info" onClick={() => onOpenBook?.(currentBook)}>
        <div className="dashboard-player-cover">
          {currentBook.cover ? (
            <img
              src={currentBook.cover}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
        </div>
        <div className="dashboard-player-details">
          <h4>{currentBook.title}</h4>
          <p>{currentBook.author || 'Unknown'}</p>
        </div>
      </div>
      <div className="dashboard-player-controls">
        <button
          className="dashboard-control-btn"
          onClick={() => onPrev?.()}
          disabled={!onPrev}
          title="Previous"
        >
          <SkipBack size={20} />
        </button>
        <button
          className="dashboard-play-btn"
          onClick={isPlaying ? pause : () => onOpenBook?.(currentBook)}
          title={isPlaying ? 'Pause' : 'Resume'}
        >
          {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </button>
        <button
          className="dashboard-control-btn"
          onClick={() => onNext?.()}
          disabled={!onNext}
          title="Next"
        >
          <SkipForward size={20} />
        </button>
      </div>
      <div className="dashboard-player-progress">
        <div className="dashboard-progress-bar">
          <div className="dashboard-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="dashboard-player-volume">
        <Volume2 size={18} color="var(--text-tertiary)" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume ?? 1}
          className="dashboard-volume-input"
          onChange={(e) => setVolume?.(parseFloat(e.target.value))}
        />
      </div>
      <div className="dashboard-player-speed">
        <Zap size={18} color="var(--text-tertiary)" />
        <button
          className="dashboard-speed-btn"
          onClick={() => setSpeed?.(Math.max(0.5, (speed ?? 1.0) - 0.25))}
          title="Decrease speed"
        >
          −
        </button>
        <span className="dashboard-speed-value">{(speed ?? 1.0).toFixed(2)}x</span>
        <button
          className="dashboard-speed-btn"
          onClick={() => setSpeed?.(Math.min(2.0, (speed ?? 1.0) + 0.25))}
          title="Increase speed"
        >
          +
        </button>
      </div>
      
      <div className="dashboard-player-settings-wrapper" ref={settingsRef} style={{ position: 'relative' }}>
        <button 
          className="dashboard-control-btn" 
          onClick={() => setShowSettings(!showSettings)}
          title="Audio Settings"
          style={{ position: 'relative' }}
        >
          <SettingsIcon size={20} />
          {sleepTimer && (
            <span style={{ position: 'absolute', top: -6, right: -12, fontSize: '0.65rem', background: 'var(--primary)', color: '#fff', padding: '1px 4px', borderRadius: 4 }}>
              {formatSleepTime(sleepTimer)}
            </span>
          )}
        </button>

        {showSettings && (
          <div className="dashboard-player-settings-popover" style={{
            position: 'absolute',
            bottom: '40px',
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            width: '240px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <Mic size={14} /> Voice
              </div>
              <select 
                value={voice} 
                onChange={(e) => setVoice(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {EDGE_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <Music size={14} /> Pitch ({pitch > 0 ? '+' : ''}{pitch}Hz)
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="5"
                value={pitch ?? 0}
                onChange={(e) => setPitch(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <Moon size={14} /> Sleep Timer
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[15, 30, 45, 60].map(mins => (
                  <button
                    key={mins}
                    onClick={() => { startSleepTimer(mins); setShowSettings(false); }}
                    style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    {mins}m
                  </button>
                ))}
                <button
                  onClick={() => { startSleepTimer(null); setShowSettings(false); }}
                  style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Off
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="dashboard-player-close" onClick={stop} title="Stop">
        <X size={18} />
      </button>
    </div>
  );
}
