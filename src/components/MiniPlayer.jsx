import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, X, Zap } from 'lucide-react';
import { usePlayback } from '../context/PlaybackContext';

export default function MiniPlayer({ onOpenBook }) {
  const { currentBook, isPlaying, progress, volume, speed, pause, stop, setVolume, setSpeed, onNext, onPrev } = usePlayback();

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
      <button className="dashboard-player-close" onClick={stop} title="Stop">
        <X size={18} />
      </button>
    </div>
  );
}
