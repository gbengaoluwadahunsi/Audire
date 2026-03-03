/**
 * Book card for library grid. Receives coverUrl from parent (parent can load from state.getCover).
 */
import { useState, useRef, useEffect } from 'react';

export default function BookCard({ book, onOpen, onPlay, onToggleFavorite, onAddToQueue, onRemoveBook }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  const progress = book.progress ?? 0;
  const coverUrl = book.coverUrl ?? null;
  const isFavorite = book.isFavorite ?? false;
  const format = (book.format || book.name?.split('.').pop() || '').toLowerCase();
  const tagClass =
    format === 'pdf'
      ? 'bg-primary/30 text-primary border-primary/40'
      : format === 'txt'
        ? 'bg-secondary-green-muted text-secondary-green border-secondary-green/40'
        : format === 'docx'
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
          : 'bg-secondary-purple-muted text-secondary-purple border-secondary-purple/40';
  const isComplete = progress >= 100;

  useEffect(() => {
    if (!showMenu) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showMenu]);

  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-audire-book', JSON.stringify({ name: book.name, size: book.size }));
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', book.title || book.name);
  };

  return (
    <div
      className="group cursor-pointer relative"
      onClick={onOpen}
      draggable
      onDragStart={handleDragStart}
      title="Drag to a collection to group"
    >
      {/* Cover image — clean, no text overlay */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-lg transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-primary/20">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-slate-600">menu_book</span>
          </div>
        )}
        {/* Format badge — top left */}
        <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border backdrop-blur-md ${tagClass}`}>
          {format || 'Book'}
        </span>
        {/* Hover actions — top right */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(book); }}
              className={`w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${isFavorite ? 'bg-amber-500/90 border-amber-400 text-white' : 'bg-black/50 border-white/20 text-white hover:bg-amber-500/30'}`}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <span className="material-symbols-outlined text-lg">{isFavorite ? 'star' : 'star_border'}</span>
            </button>
          )}
          {onAddToQueue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddToQueue(); }}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/70"
              aria-label="Add to queue"
            >
              <span className="material-symbols-outlined text-lg">queue_music</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); (onPlay || onOpen)?.(); }}
            className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/70"
            aria-label="Play"
          >
            <span className="material-symbols-outlined text-lg">play_arrow</span>
          </button>
        </div>
        {/* Delete — bottom right, separate from other actions */}
        {onRemoveBook && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemoveBook(book); }}
            className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-red-600/80 backdrop-blur-md border border-red-500/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            aria-label="Remove from library"
          >
            <span className="material-symbols-outlined text-lg">delete_outline</span>
          </button>
        )}
      </div>
      {/* Title, author, progress — below the cover */}
      <div className="mt-2 px-0.5">
        <h4 className="text-sm font-semibold text-white leading-tight line-clamp-1">
          {book.title || book.name?.replace(/\.[^.]+$/, '') || 'Untitled'}
        </h4>
        <p className="text-slate-400 text-xs mt-0.5 truncate">{book.author || 'Unknown author'}</p>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-secondary-green' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
            </div>
            <span className={`text-[10px] font-bold ${isComplete ? 'text-secondary-green' : 'text-slate-500'}`}>{progress}%</span>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="text-slate-500 hover:text-primary transition-colors p-0.5"
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
              aria-label="More options"
              aria-expanded={showMenu}
            >
              <span className="material-symbols-outlined text-base">more_horiz</span>
            </button>
            {showMenu && onRemoveBook && (
              <div
                className="absolute right-0 bottom-full mb-1 py-1 min-w-[160px] rounded-lg bg-slate-800 border border-slate-700 shadow-xl z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700/80 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onRemoveBook(book); }}
                >
                  <span className="material-symbols-outlined text-lg">delete_outline</span>
                  Remove from library
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
