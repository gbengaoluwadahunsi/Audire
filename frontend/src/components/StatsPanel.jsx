import { useEffect, useState } from 'react';
import { getLibrary, getReadingInsights } from '../lib/state';

export default function StatsPanel({ isOpen, onClose }) {
  const [stats, setStats] = useState({
    booksRead: 0,
    booksInProgress: 0,
    hoursListened: 0,
    currentStreak: 0,
    favoriteGenre: 'Fiction',
    avgReadingTime: 0,
  });

  useEffect(() => {
    if (!isOpen) return;
    loadStats();
  }, [isOpen]);

  const loadStats = () => {
    try {
      const library = getLibrary();
      const insights = getReadingInsights();

      const booksRead = library.filter(b => b.progress >= 100).length;
      const booksInProgress = library.filter(b => b.progress > 0 && b.progress < 100).length;
      const hoursListened = insights.totalListenSeconds || 0;
      const currentStreak = insights.streakDays || 0;
      const avgWpm = insights.avgWpm || 0;

      setStats({
        booksRead,
        booksInProgress,
        hoursListened: (hoursListened / 3600).toFixed(1),
        currentStreak,
        favoriteGenre: avgWpm ? `${avgWpm} wpm` : 'No data',
        avgReadingTime: library.length > 0 ? (hoursListened / library.length / 3600).toFixed(1) : 0,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined">analytics</span>
            Reading Stats
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Books Read */}
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary mb-1">{stats.booksRead}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Books Read</p>
          </div>

          {/* Books In Progress */}
          <div className="bg-secondary-purple/10 border border-secondary-purple/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-secondary-purple mb-1">{stats.booksInProgress}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">In Progress</p>
          </div>

          {/* Hours Listened */}
          <div className="bg-secondary-green/10 border border-secondary-green/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-secondary-green mb-1">{stats.hoursListened}h</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Hours Listened</p>
          </div>

          {/* Reading Streak */}
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-orange-400 mb-1">{stats.currentStreak}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Day Streak</p>
          </div>

          {/* Avg Reading Time */}
          <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-pink-400 mb-1">{stats.avgReadingTime}h</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Avg per Book</p>
          </div>

          {/* Average speed */}
          <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 text-center">
            <p className="text-xl font-bold text-white mb-1">{stats.favoriteGenre}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Average Speed</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border-dark p-4 flex justify-between items-center text-sm text-slate-400">
          <p>Keep reading to build your streak!</p>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
