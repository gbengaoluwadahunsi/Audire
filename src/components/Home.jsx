/**
 * Home / Library — from designs/dashboard
 */
import { useEffect, useState } from 'react';
import BookCard from './BookCard';
import Collections from './Collections';
import StatsPanel from './StatsPanel';
import { getCover, getCollectionsLocal } from '../lib/state';

function bookKey(book) {
  return book.key || `${book.name}__${book.size}`;
}

export default function Home({
  library = [],
  searchQuery = '',
  filterType = 'all',
  sortBy = 'recent',
  onSortChange,
  onFilterChange,
  onSearchChange,
  onOpenFile,
  onOpenBook,
  onPlayBook,
  onFileDrop,
  onOpenCatalog,
  onToggleFavorite,
  onAddToQueue,
  onRemoveBook,
}) {
  const [covers, setCovers] = useState({});
  const [showCollections, setShowCollections] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [viewMode, setViewMode] = useState('all');

  useEffect(() => {
    library.forEach((book) => {
      const key = bookKey(book);
      getCover(book.name, book.size).then((url) => {
        if (url) setCovers((prev) => ({ ...prev, [key]: url }));
      });
    });
  }, [library]);

  const filteredLibrary = library
    .filter((book) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!book.title?.toLowerCase().includes(q) && !book.name?.toLowerCase().includes(q) && !book.author?.toLowerCase().includes(q))
          return false;
      }
      if (filterType === 'pdf') return (book.format || book.name?.split('.').pop()?.toLowerCase()) === 'pdf';
      if (filterType === 'epub') return (book.format || book.name?.split('.').pop()?.toLowerCase()) === 'epub';
      if (filterType === 'txt') return (book.format || book.name?.split('.').pop()?.toLowerCase()) === 'txt';
      if (filterType === 'docx') return (book.format || book.name?.split('.').pop()?.toLowerCase()) === 'docx';
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') return (b.lastRead || 0) - (a.lastRead || 0);
      if (sortBy === 'title') return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      if (sortBy === 'progress') return (b.progress ?? 0) - (a.progress ?? 0);
      return 0;
    });

  const collections = getCollectionsLocal();
  const bookKeysInCollections = new Set(collections.flatMap((c) => c.books || []));
  const libraryByBookKey = Object.fromEntries(filteredLibrary.map((b) => [`${b.name}__${Number(b.size)}`, b]));
  const uncategorizedBooks = filteredLibrary.filter((b) => !bookKeysInCollections.has(`${b.name}__${Number(b.size)}`));

  // Continue reading: most recently read book with progress > 0, or most recent overall
  const continueBook = library.length === 0 ? null : (() => {
    const sorted = [...library].sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    const withProgress = sorted.find((b) => (b.progress ?? 0) > 0);
    return withProgress ?? sorted[0];
  })();

  return (
    <div className="min-h-screen bg-background-dark text-slate-100 overflow-x-hidden">
      <main className="max-w-7xl mx-auto px-6 py-12">
        {continueBook && (
          <section className="mb-10">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">play_circle</span>
              Continue reading
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <div className="w-14 h-20 shrink-0 rounded-lg overflow-hidden bg-slate-700">
                {covers[bookKey(continueBook)] ? (
                  <img src={covers[bookKey(continueBook)]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                    <span className="material-symbols-outlined text-2xl">menu_book</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate">{continueBook.title || continueBook.name}</p>
                {continueBook.author && <p className="text-sm text-slate-500 truncate">{continueBook.author}</p>}
                <p className="text-xs text-slate-500 mt-1">{Math.round((continueBook.progress ?? 0) * 100)}% read</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenBook?.(continueBook)}
                className="shrink-0 px-4 py-2 rounded-lg bg-primary text-white font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                Continue
              </button>
            </div>
          </section>
        )}
        {/* Library header + controls — clearer hierarchy and spacing */}
        <section className="mb-14">
          <div className="flex flex-col gap-8">
            <div>
              <h3 className="text-lg font-bold text-white">Your Library</h3>
              <p className="text-slate-500 text-sm mt-1">Organized for your focus.</p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'all' ? 'bg-primary text-white' : 'bg-slate-800/60 text-slate-400 hover:text-white'}`}
                >
                  All books
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('collections')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === 'collections' ? 'bg-primary text-white' : 'bg-slate-800/60 text-slate-400 hover:text-white'}`}
                >
                  <span className="material-symbols-outlined text-base">folder</span>
                  By collection
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex bg-slate-800/40 p-1 rounded-xl border border-slate-700/50">
                  {['all', 'pdf', 'epub', 'txt', 'docx'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onFilterChange?.(f)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                        filterType === f
                          ? f === 'epub'
                            ? 'bg-secondary-purple text-white'
                            : f === 'txt'
                              ? 'bg-secondary-green text-white'
                              : f === 'docx'
                                ? 'bg-amber-500/80 text-white'
                                : 'bg-primary text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f === 'all' ? 'All' : f}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => onSortChange?.(e.target.value)}
                    className="appearance-none bg-slate-800/40 border border-slate-700/50 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-all cursor-pointer pr-10"
                  >
                    <option value="recent">Recently read</option>
                    <option value="title">Title A–Z</option>
                    <option value="progress">Progress</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCollections(true)}
                  className="flex items-center gap-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-all"
                >
                  <span className="material-symbols-outlined text-lg">folder</span>
                  <span className="hidden sm:inline">Collections</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStats(true)}
                  className="flex items-center gap-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-all"
                >
                  <span className="material-symbols-outlined text-lg">analytics</span>
                  <span className="hidden sm:inline">Stats</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Book grid or grouped by collection */}
        {viewMode === 'collections' ? (
          <section className="space-y-10 mb-24">
            {collections.length === 0 && uncategorizedBooks.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <span className="material-symbols-outlined text-4xl mb-3 block opacity-50">folder</span>
                <p className="font-medium">No collections yet</p>
                <p className="text-sm mt-1">Create collections and add books to see them grouped here.</p>
                <button type="button" onClick={() => setShowCollections(true)} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90">
                  Open Collections
                </button>
              </div>
            ) : collections.every((c) => !((c.books || []).map((key) => libraryByBookKey[key]).filter(Boolean).length)) && uncategorizedBooks.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="font-medium">No books to show in this view</p>
                <p className="text-sm mt-1">Try changing your search or filter, or add books to collections.</p>
              </div>
            ) : (
              <>
                {collections.map((coll) => {
                  const booksInColl = (coll.books || []).map((key) => libraryByBookKey[key]).filter(Boolean);
                  if (booksInColl.length === 0) return null;
                  return (
                    <div key={coll.id}>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">folder</span>
                        {coll.name}
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {booksInColl.map((book) => (
                          <BookCard
                            key={bookKey(book)}
                            book={{ ...book, coverUrl: covers[bookKey(book)] ?? book.coverUrl }}
                            onOpen={() => onOpenBook?.(book)}
                            onPlay={() => onPlayBook?.(book)}
                            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(book) : undefined}
                            onAddToQueue={onAddToQueue ? () => onAddToQueue(book) : undefined}
                            onRemoveBook={onRemoveBook ? () => onRemoveBook(book) : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {uncategorizedBooks.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">menu_book</span>
                      Uncategorized
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {uncategorizedBooks.map((book) => (
                        <BookCard
                          key={bookKey(book)}
                          book={{ ...book, coverUrl: covers[bookKey(book)] ?? book.coverUrl }}
                          onOpen={() => onOpenBook?.(book)}
                          onPlay={() => onPlayBook?.(book)}
                          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(book) : undefined}
                          onAddToQueue={onAddToQueue ? () => onAddToQueue(book) : undefined}
                          onRemoveBook={onRemoveBook ? () => onRemoveBook(book) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-24">
          {filteredLibrary.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16">
              {searchQuery ? (
                /* Search with no results */
                <div className="max-w-2xl w-full flex flex-col items-center text-center">
                  {/* Empty State Illustration */}
                  <div className="relative w-64 h-64 mb-8 flex items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at center, rgba(17, 82, 212, 0.15) 0%, transparent 70%)' }}>
                    <div className="relative">
                      <div className="w-40 h-32 bg-slate-800 rounded-lg transform -rotate-6 shadow-xl flex items-center justify-center border border-slate-700">
                        <div className="w-full px-4 space-y-2">
                          <div className="h-2 w-3/4 bg-slate-700 rounded-full" />
                          <div className="h-2 w-1/2 bg-slate-700 rounded-full" />
                          <div className="h-2 w-2/3 bg-slate-700 rounded-full" />
                        </div>
                      </div>
                      <div className="absolute -bottom-4 -right-4 size-32 text-primary drop-shadow-2xl">
                        <span className="material-symbols-outlined !text-[120px] scale-x-[-1]">search</span>
                      </div>
                    </div>
                  </div>
                  {/* Text Content */}
                  <div className="space-y-4 mb-10">
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                      No matches found for <span className="text-primary">&quot;{searchQuery}&quot;</span>
                    </h1>
                    <p className="text-slate-400 text-base md:text-lg max-w-lg mx-auto leading-relaxed">
                      We couldn&apos;t find any books matching your search. Try a different keyword, check for typos, or explore your existing library.
                    </p>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 w-full justify-center px-4">
                    <button
                      type="button"
                      onClick={() => onSearchChange?.('')}
                      className="flex items-center justify-center h-12 px-8 bg-primary text-white rounded-lg font-bold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 min-w-[200px]"
                    >
                      Browse Library
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFile?.()}
                      className="flex items-center justify-center h-12 px-8 bg-slate-800 text-white rounded-lg font-bold text-base hover:bg-slate-700 transition-all min-w-[200px]"
                    >
                      Upload New Book
                    </button>
                  </div>
                  {/* Format Filter Chips */}
                  <div className="mt-16 w-full max-w-xl">
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-6">Filter by format</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {['all', 'pdf', 'epub', 'txt', 'docx'].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => onFilterChange?.(f)}
                          className="px-5 py-2 rounded-full bg-slate-800 border border-slate-700 text-sm font-medium text-slate-300 hover:border-primary hover:text-primary transition-all capitalize"
                        >
                          {f === 'all' ? 'All' : f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty library */
                <div className="text-center py-16 text-slate-500">
                  <span className="material-symbols-outlined text-5xl mb-4 block opacity-50">menu_book</span>
                  <p className="text-lg font-medium">No books yet</p>
                  <p className="text-sm mt-1">Upload a PDF or EPUB above to add to your library.</p>
                </div>
              )}
            </div>
          ) : (
            filteredLibrary.map((book) => (
              <BookCard
                key={bookKey(book)}
                book={{ ...book, coverUrl: covers[bookKey(book)] ?? book.coverUrl }}
                onOpen={() => onOpenBook?.(book)}
                onPlay={() => onPlayBook?.(book)}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(book) : undefined}
                onAddToQueue={onAddToQueue ? () => onAddToQueue(book) : undefined}
                onRemoveBook={onRemoveBook ? () => onRemoveBook(book) : undefined}
              />
            ))
          )}
        </section>
        )}
      </main>

      {/* Background decoration */}
      <div className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none opacity-20">
        <div className="absolute top-[10%] left-[5%] w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px]" />
      </div>

      {/* Collections Modal */}
      <Collections isOpen={showCollections} onClose={() => setShowCollections(false)} library={library} />

      {/* Stats Panel */}
      <StatsPanel isOpen={showStats} onClose={() => setShowStats(false)} />
    </div>
  );
}
