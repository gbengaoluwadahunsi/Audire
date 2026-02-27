/**
 * Mini player - fixed bottom. Play opens Reader with TTS. Queue: up next.
 */
import { useState } from 'react';

export default function MiniPlayer({ book, queue = [], onClose, onOpen, onPlay, onPlayFromQueue }) {
  const title = book?.title || book?.name?.replace(/\.[^.]+$/, '') || 'Now Playing';
  const coverUrl = book?.coverUrl || null;
  const [showQueue, setShowQueue] = useState(false);

  const handlePlay = (e) => {
    e?.stopPropagation?.();
    if (onPlay) onPlay();
    else onOpen?.();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-50">
      <div className="glass-panel border border-primary/20 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
        <button type="button" onClick={onOpen} className="flex items-center gap-4 min-w-0 flex-1 text-left">
          <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden shadow-lg border border-slate-700/50 shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined text-2xl">menu_book</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-secondary-purple uppercase tracking-tighter">Now Playing</p>
            <p className="text-sm font-bold text-white truncate">{title}</p>
          </div>
        </button>
        <div className="flex items-center gap-6 shrink-0">
          <button type="button" className="text-slate-400 hover:text-white transition-colors p-1" aria-label="Previous">
            <span className="material-symbols-outlined">skip_previous</span>
          </button>
          <button
            type="button"
            onClick={handlePlay}
            className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/40 hover:scale-105 transition-transform"
            aria-label="Play"
          >
            <span className="material-symbols-outlined">play_arrow</span>
          </button>
          <button type="button" className="text-slate-400 hover:text-white transition-colors p-1" aria-label="Next">
            <span className="material-symbols-outlined">skip_next</span>
          </button>
        </div>
        <div className="hidden md:flex items-center gap-4 border-l border-slate-700/50 pl-6 shrink-0">
          {queue.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setShowQueue((v) => !v)} className="text-slate-400 hover:text-white p-1" aria-label="Queue">
                <span className="material-symbols-outlined">queue_music</span>
              </button>
              {showQueue && (
                <div className="absolute bottom-full right-0 mb-2 w-56 max-h-48 overflow-y-auto bg-card-dark border border-border-dark rounded-xl shadow-xl py-2 z-50">
                  <p className="px-3 py-1 text-xs font-bold text-slate-400 uppercase">Up next</p>
                  {queue.slice(0, 5).map((b) => (
                    <button key={`${b.name}-${b.size}`} type="button" onClick={() => { onPlayFromQueue?.(b); setShowQueue(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 truncate">
                      {b.title || b.name?.replace(/\.[^.]+$/, '')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={onOpen} className="text-slate-400 hover:text-white p-1" aria-label="Expand">
            <span className="material-symbols-outlined">open_in_full</span>
          </button>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
