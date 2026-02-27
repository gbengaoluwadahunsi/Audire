/**
 * App header — from designs/dashboard
 */
import { useNavigate } from 'react-router-dom';
import Logo from './Logo';

export default function Header({ searchQuery, onSearchChange, onOpenFile, onSettings }) {
  const navigate = useNavigate();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border-dark bg-background-dark/90 backdrop-blur-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
        <Logo className="text-slate-100" />
        <div className="flex-1 max-w-xl relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            search
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search your library..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-slate-100 focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenFile}
            className="bg-primary hover:bg-primary/90 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Upload
          </button>
          <button
            type="button"
            onClick={() => navigate('/help')}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg"
            aria-label="Help"
          >
            <span className="material-symbols-outlined">help</span>
          </button>
          <button
            type="button"
            onClick={onSettings}
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg"
            aria-label="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
