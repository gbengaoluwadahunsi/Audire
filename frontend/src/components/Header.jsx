/**
 * App header — from designs/dashboard. Responsive: mobile menu on small screens.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';
import { isPiperReady } from '../lib/tts';

export default function Header({ searchQuery, onSearchChange, onOpenFile, onImportUrl, onSettings }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMobileOpen(false);
    };
    document.addEventListener('click', close);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('click', close);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const searchBlock = (
    <div className="flex-1 min-w-0 max-w-xl relative">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        search
      </span>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchChange?.(e.target.value)}
        placeholder="Search your library..."
        className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2.5 text-slate-100 focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-500 transition-all"
      />
    </div>
  );

  const actionsBlock = (
    <>
      {isPiperReady() && (
        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium">
          <span className="material-symbols-outlined text-sm">check_circle</span>
          <span className="hidden sm:inline">Natural voice</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => { onOpenFile?.(); setMobileOpen(false); }}
        className="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 min-h-[44px]"
      >
        <span className="material-symbols-outlined text-lg">add</span>
        Upload
      </button>
      <button
        type="button"
        onClick={() => { onImportUrl?.(); setMobileOpen(false); }}
        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2 px-3 rounded-xl flex items-center gap-2 min-h-[44px]"
        title="Import from URL, Drive, Dropbox"
      >
        <span className="material-symbols-outlined text-lg">link</span>
        Import Link
      </button>
      <button
        type="button"
        onClick={() => { navigate('/help'); setMobileOpen(false); }}
        className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white transition-colors rounded-lg flex items-center justify-center"
        aria-label="Help"
      >
        <span className="material-symbols-outlined">help</span>
      </button>
      <button
        type="button"
        onClick={() => { onSettings?.(); setMobileOpen(false); }}
        className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white transition-colors rounded-lg flex items-center justify-center"
        aria-label="Settings"
      >
        <span className="material-symbols-outlined">settings</span>
      </button>
    </>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border-dark bg-background-dark/90 backdrop-blur-md px-4 sm:px-6 py-3 safe-area-top md:min-h-0">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 md:gap-8">
        <Logo className="text-slate-100 shrink-0" />
        {/* Desktop: search + actions */}
        <div className="hidden md:flex flex-1 min-w-0 max-w-2xl items-center gap-4 lg:gap-8">
          {searchBlock}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {actionsBlock}
          </div>
        </div>
        {/* Mobile: hamburger + overlay menu */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2.5 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white rounded-lg flex items-center justify-center"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </div>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div
          ref={menuRef}
          className="fixed inset-x-0 top-14 bottom-0 z-40 md:hidden bg-background-dark/98 backdrop-blur-md border-t border-border-dark overflow-y-auto"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="p-4 space-y-4">
            <div className="pt-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Search</label>
              {searchBlock}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border-dark">
              {actionsBlock}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
