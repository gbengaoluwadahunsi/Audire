/**
 * Book detail screen — from designs/detail.
 * Cover, title, author, progress, Start Reading, Add to queue.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCover } from '../lib/state';

export default function BookDetail({ onStartReading }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const book = state?.book;
  const [coverUrl, setCoverUrl] = useState(null);

  useEffect(() => {
    if (!book) return;
    getCover(book.name, book.size).then(setCoverUrl);
  }, [book?.name, book?.size]);

  useEffect(() => {
    if (!book) navigate('/library', { replace: true });
  }, [book, navigate]);

  if (!book) return null;

  const title = book.title || book.name?.replace(/\.[^.]+$/, '') || 'Untitled';
  const author = book.author || 'Unknown author';
  const progress = book.progress ?? 0;
  const totalPages = book.totalPages || 0;

  const handleStartReading = () => {
    if (onStartReading) onStartReading(book);
    else navigate('/library/reader', { state: { book } });
  };

  return (
    <div className="min-h-screen bg-background-dark text-slate-100">
      <header className="sticky top-0 z-40 border-b border-border-dark bg-background-dark/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/library')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="hidden sm:inline">Library</span>
          </button>
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-2xl">menu_book</span>
            <h2 className="text-lg font-bold tracking-tight">Audire</h2>
          </div>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left: Cover */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start">
            <div className="relative group">
              <div className="absolute -inset-4 bg-primary/20 blur-3xl opacity-30 group-hover:opacity-50 transition-opacity rounded-full" />
              <div className="relative aspect-[2/3] w-full max-w-sm bg-slate-800 rounded-xl shadow-2xl overflow-hidden ring-1 ring-white/10">
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <span className="material-symbols-outlined text-5xl">menu_book</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Info + actions */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-4">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-serif text-white leading-tight">
                {title}
              </h1>
              <p className="text-xl text-slate-400">
                by <span className="text-primary font-semibold">{author}</span>
              </p>
            </div>

            {/* Progress */}
            {totalPages > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-400">{progress}% read</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={handleStartReading}
                className="bg-primary hover:bg-primary-hover text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-primary/20 transition-all flex items-center gap-3"
              >
                <span className="material-symbols-outlined">auto_stories</span>
                Start reading
              </button>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-border-dark">
              {totalPages > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Length</p>
                  <p className="font-semibold text-white">{totalPages} pages</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Format</p>
                <p className="font-semibold text-white capitalize">{book.format || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
