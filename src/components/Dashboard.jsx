import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Book, Library, Settings, Plus, Play, Upload, FileText, Search, Trash2, FolderPlus, Sun, Moon, X } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { processFile } from '../lib/fileProcessor';
import { compressIfNeeded, MAX_SIZE } from '../lib/compression';
import { fetchBooks, uploadBook, deleteBook, repairBookCover, importOrphanBook } from '../lib/api';
import { getCollections, saveCollections, addCollection, addBookToCollection, removeBookFromCollection, removeCollection } from '../lib/collections';
import { getSettings, saveSettings } from '../lib/settings';
import { ttsManager, getVoices, sortVoicesNaturalFirst } from '../lib/ttsManager';
import { EDGE_TTS_VOICES } from '../lib/edgeTtsVoices';
import Reader from './Reader';
import MiniPlayer from './MiniPlayer';
import { ToastContainer } from './Toast';

const SORT_OPTIONS = [
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'added_at', label: 'Date added' },
  { id: 'progress_percent', label: 'Progress' },
  { id: 'last_read', label: 'Last read' },
];

function toUploadErrorMessage(fileName, err) {
  const raw = String(err?.message || 'Upload failed');
  const lower = raw.toLowerCase();
  const isEpubCorrupt =
    lower.includes('failed to open epub') ||
    lower.includes('invalid epub') ||
    lower.includes('container.xml') ||
    lower.includes('package document') ||
    lower.includes('invalid xml inside epub');

  if (isEpubCorrupt) {
    return `${fileName}: This EPUB appears corrupted or incomplete (missing required internal files).`;
  }

  return `${fileName}: ${raw}`;
}

function Dashboard({ onBackToLanding }) {
  const [activeTab, setActiveTab] = useState('library');
  const [books, setBooks] = useState([]);
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showCollectionMenu, setShowCollectionMenu] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [librarySort, setLibrarySort] = useState(() => getSettings().librarySort || 'last_read');
  const [librarySortOrder, setLibrarySortOrder] = useState(() => getSettings().librarySortOrder || 'desc');
  const [theme, setTheme] = useState(() => getSettings().theme || 'dark');
  const fileInputRef = useRef(null);
  const coverErrorIds = useRef(new Set());
  const coverRepairAttempted = useRef(new Set());
  const coverRepairQueueRef = useRef(Promise.resolve());

  const enqueueCoverRepair = (book, { refreshList = false } = {}) => {
    if (!book?.id || !book.file_url || coverRepairAttempted.current.has(book.id)) return;

    coverRepairAttempted.current.add(book.id);
    coverRepairQueueRef.current = coverRepairQueueRef.current
      .then(async () => {
        const newCoverUrl = await repairBookCover(book);
        if (newCoverUrl) {
          coverErrorIds.current.delete(book.id);
          setBooks(prev => prev.map(b => b.id === book.id ? { ...b, cover: newCoverUrl } : b));
          if (refreshList) {
            const latest = await fetchBooks();
            setBooks(latest);
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      })
      .catch(() => {});
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const s = getSettings();
    saveSettings({ ...s, theme: nextTheme });
    document.documentElement.classList.toggle('light', nextTheme === 'light');
    addToast(`${nextTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'success');
  };

  const addToast = (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    loadBooks();
    setCollections(getCollections());
  }, []);

  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const allBooks = await fetchBooks();
      setBooks(allBooks);

      // Auto-repair missing covers in the background (backend already filters invalid covers)
      const booksNeedingCovers = allBooks
        .filter(b => !b.cover && b.file_url && !coverRepairAttempted.current.has(b.id))
        .slice(0, 12);
      for (const book of booksNeedingCovers) enqueueCoverRepair(book);
    } catch (err) {
      console.error('Failed to load books:', err);
      addToast('Could not connect to your library', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const MAX_ATTEMPT_SIZE = 100 * 1024 * 1024; // 100 MB - won't try to compress larger (memory risk)

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);

    for (const file of files) {
      if (file.size > MAX_ATTEMPT_SIZE) {
        addToast(`File ${file.name} too large. Max 100 MB.`, 'error');
        continue;
      }

      addToast(`Processing ${file.name}...`, 'info');

      try {
        await processFile(file);
        let uploadBlob = file;

        if (file.size > MAX_SIZE) {
          addToast(`Compressing ${file.name} to fit 50 MB limit...`, 'info');
          const { blob, wasCompressed, finalSize } = await compressIfNeeded(file);
          uploadBlob = blob;
          if (finalSize > MAX_SIZE) {
            addToast(`Could not compress ${file.name} under 50 MB.`, 'error');
            continue;
          }
          if (wasCompressed) addToast(`${file.name} compressed successfully, uploading...`, 'info');
        }

        const uploaded = await uploadBook(uploadBlob, file.name);
        // #region agent log
        fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c7180c'},body:JSON.stringify({sessionId:'c7180c',location:'Dashboard.jsx:handleFileUpload',message:'Upload done, about to loadBooks',data:{uploadedId:uploaded?.id,uploadedTitle:uploaded?.title},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        addToast(`"${uploaded.title}" added to library`, 'success');
        setSearchQuery('');
        setActiveTab('library');
        setBooks((prev) => [uploaded, ...prev.filter((b) => b.id !== uploaded.id)]);
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        addToast(toUploadErrorMessage(file.name, err), 'error');
      }
    }

    // Don't refetch after upload - setBooks already added the book; loadBooks would overwrite
    // and can drop the new book if GET /api/books filters it out (e.g. bookFileExists check).
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (book) => {
    try {
      await deleteBook(book.id);
      const nextCollections = getCollections().map((c) => ({
        ...c,
        bookIds: c.bookIds.filter((id) => id !== book.id),
      }));
      saveCollections(nextCollections);
      setCollections(nextCollections);
      setSelectedCollection((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bookIds: prev.bookIds.filter((id) => id !== book.id),
        };
      });
      addToast(`"${book.title}" removed`, 'success');
      await loadBooks();
      setShowDeleteConfirm(null);
    } catch {
      addToast('Could not delete book', 'error');
    }
  };

  const getProgressPercent = (book) => {
    if (book.progress_percent != null) return book.progress_percent;
    if (!book.last_cfi) return 0;
    if (book.format === 'pdf' && book.total_pages) {
      const page = parseInt(book.last_cfi) || 1;
      return Math.round((page / book.total_pages) * 100);
    }
    return 0;
  };

  const collectedBookIds = new Set(collections.flatMap(c => c.bookIds));

  const filteredBooks = books
    .filter(
      (b) => {
        const isCollected = collectedBookIds.has(b.id);
        const matchesSearch = !searchQuery ||
          (b.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.author || '').toLowerCase().includes(searchQuery.toLowerCase());

        return !isCollected && matchesSearch;
      }
    )
    .sort((a, b) => {
      const sortBy = librarySort;
      const order = librarySortOrder;
      const mult = order === 'asc' ? 1 : -1;

      let cmp = 0;
      if (sortBy === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '');
      } else if (sortBy === 'author') {
        cmp = (a.author || '').localeCompare(b.author || '');
      } else if (sortBy === 'added_at') {
        cmp = new Date(a.added_at || 0) - new Date(b.added_at || 0);
      } else if (sortBy === 'progress_percent') {
        cmp = (getProgressPercent(a) || 0) - (getProgressPercent(b) || 0);
      } else {
        cmp = new Date(a.last_read || 0) - new Date(b.last_read || 0);
      }
      const tiebreaker = typeof a.id === 'string' ? (a.id || '').localeCompare(b.id || '') : ((a.id || 0) - (b.id || 0));
      return mult * (cmp || tiebreaker);
    });

  if (selectedBook) {
    return (
      <Reader
        bookData={selectedBook}
        onBack={() => setSelectedBook(null)}
        onOpenBook={setSelectedBook}
        addToast={addToast}
      />
    );
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <img src="/logo.svg" alt="Audire" className="dashboard-brand-icon" />
          <span>Audire</span>
        </div>

        <button className="dashboard-back" onClick={onBackToLanding}>
          ← Landing
        </button>

        <nav className="dashboard-nav">
          <button
            className={`dashboard-nav-item ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => { setActiveTab('library'); setSelectedCollection(null); }}
          >
            <Library size={20} />
            <span>Library</span>
          </button>
          <button
            className={`dashboard-nav-item ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => { setActiveTab('collections'); setSelectedCollection(null); }}
          >
            <FolderPlus size={20} />
            <span>Collections</span>
          </button>
          <button
            className={`dashboard-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setSelectedCollection(null); }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>

          <div style={{ flex: 1, minHeight: '20px' }} />

          <button
            className="dashboard-nav-item"
            style={{ marginTop: 'auto' }}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </nav>

        <div className="dashboard-sidebar-footer">
          <input
            type="file"
            accept=".epub,.pdf"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            multiple
          />
          <button
            className="dashboard-add-book"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <div className="small-loader" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Plus size={20} />
                <span>Add Book</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>
            {activeTab === 'library' && 'Your Library'}
            {activeTab === 'collections' && 'Collections'}
            {activeTab === 'settings' && 'Settings'}
          </h1>
          {activeTab === 'library' && (
            <div className="dashboard-library-toolbar">
              <div className="dashboard-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search books..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="dashboard-sort">
                <select
                  value={librarySort}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLibrarySort(v);
                    saveSettings({ ...getSettings(), librarySort: v });
                  }}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  className="dashboard-sort-order"
                  onClick={() => {
                    const v = librarySortOrder === 'asc' ? 'desc' : 'asc';
                    setLibrarySortOrder(v);
                    saveSettings({ ...getSettings(), librarySortOrder: v });
                  }}
                  title={librarySortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {librarySortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          )}
        </header>

        <section className="dashboard-content">
          <AnimatePresence mode="wait">
            {activeTab === 'library' && (
              <motion.div
                key="library"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {isLoading ? (
                  <div className="dashboard-loader">
                    <div className="loader-spinner" />
                    <span>Loading library...</span>
                  </div>
                ) : filteredBooks.length > 0 ? (
                  <div className="dashboard-grid">
                    {filteredBooks.map((book) => (
                      <motion.div
                        key={book.id}
                        className="dashboard-book-card"
                        onClick={() => setSelectedBook(book)}
                        whileHover={{ y: -6, transition: { duration: 0.2 } }}
                      >
                        <div className="dashboard-book-cover">
                          {book.cover && !coverErrorIds.current.has(book.id) ? (
                            <img
                              src={book.cover}
                              alt={book.title}
                              onError={() => {
                                coverErrorIds.current.add(book.id);
                                setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, cover: null } : b)));
                                enqueueCoverRepair({ ...book, cover: null }, { refreshList: true });
                              }}
                            />
                          ) : (
                            <FileText size={40} color="var(--text-tertiary)" />
                          )}
                          <span className="dashboard-book-badge">{(book.format || 'epub').toUpperCase()}</span>
                          <button
                            className="dashboard-book-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(showDeleteConfirm === book.id ? null : book.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            className="dashboard-book-collection"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCollectionMenu(showCollectionMenu === book.id ? null : book.id);
                            }}
                            title="Add to collection"
                          >
                            <FolderPlus size={14} />
                          </button>
                        </div>
                        <div className="dashboard-book-info">
                          <h3>{book.title}</h3>
                          <p>{book.author || 'Unknown'}</p>
                        </div>
                        {(book.last_cfi || book.progress_percent != null) && (
                          <div className="dashboard-book-progress">
                            <div
                              className="dashboard-book-progress-fill"
                              style={{ width: `${getProgressPercent(book)}%` }}
                            />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-empty">
                    <div className="dashboard-empty-icon">
                      <Book size={48} color="var(--text-tertiary)" />
                    </div>
                    <h2>
                      {searchQuery ? 'No books match your search' : 'Your library is empty'}
                    </h2>
                    <p>
                      {searchQuery
                        ? 'Try a different search term.'
                        : 'Add an EPUB or PDF to start reading with podcast-quality voice.'}
                    </p>
                    {!searchQuery && (
                      <button className="dashboard-empty-btn" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={18} />
                        Browse Files
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'collections' && (
              <motion.div
                key="collections"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="dashboard-collections"
              >
                {selectedCollection ? (
                  <div className="collection-detail">
                    <header className="collection-detail-header">
                      <button className="back-btn" onClick={() => setSelectedCollection(null)}>← All Collections</button>
                      <div className="collection-info">
                        <h2>{selectedCollection.name}</h2>
                        <p>{selectedCollection.bookIds.length} books in this collection</p>
                      </div>
                      <button
                        className="danger-outline-btn"
                        onClick={() => {
                          if (confirm(`Delete collection "${selectedCollection.name}"? Books will return to library.`)) {
                            setCollections(removeCollection(selectedCollection.id));
                            setSelectedCollection(null);
                          }
                        }}
                      >
                        Delete Collection
                      </button>
                    </header>
                    <div className="dashboard-grid collection-detail-grid">
                      {selectedCollection.bookIds.map(bid => {
                        const book = books.find(b => b.id === bid);
                        if (!book) return null;
                        return (
                          <motion.div
                            key={book.id}
                            className="dashboard-book-card collection-book-card"
                            onClick={() => setSelectedBook(book)}
                            whileHover={{ y: -6, transition: { duration: 0.2 } }}
                          >
                            <div className="dashboard-book-cover">
                              {book.cover && !coverErrorIds.current.has(book.id) ? (
                                <img
                                  src={book.cover}
                                  alt={book.title}
                                  onError={() => {
                                    coverErrorIds.current.add(book.id);
                                    setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, cover: null } : b)));
                                    enqueueCoverRepair({ ...book, cover: null }, { refreshList: true });
                                  }}
                                />
                              ) : (
                                <FileText size={40} color="var(--text-tertiary)" />
                              )}
                              <span className="dashboard-book-badge">{(book.format || 'epub').toUpperCase()}</span>
                            </div>
                            <div className="dashboard-book-info">
                              <h3>{book.title}</h3>
                              <p>{book.author || 'Unknown'}</p>
                            </div>
                            <div className="collection-book-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="collection-book-action"
                                onClick={() => {
                                  const ok = confirm(`Remove "${book.title}" from "${selectedCollection.name}"?`);
                                  if (!ok) return;
                                  removeBookFromCollection(selectedCollection.id, book.id);
                                  setCollections(getCollections());
                                  setSelectedCollection(prev => ({
                                    ...prev,
                                    bookIds: prev.bookIds.filter(id => id !== book.id)
                                  }));
                                }}
                                title="Remove from this collection"
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                className="collection-book-action danger"
                                onClick={() => setShowDeleteConfirm(book.id)}
                                title="Delete book from library"
                              >
                                Delete
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : collections.length === 0 ? (
                  <div className="dashboard-empty">
                    <p>No collections yet. Add books to collections from the library.</p>
                    <button
                      className="dashboard-empty-btn"
                      onClick={() => {
                        const name = prompt('Collection name');
                        if (name) {
                          addCollection(name);
                          setCollections(getCollections());
                        }
                      }}
                    >
                      Create collection
                    </button>
                  </div>
                ) : (
                  <div className="dashboard-collections-list">
                    {collections.map((c) => {
                      const visibleBooks = c.bookIds
                        .map((bid) => books.find((b) => b.id === bid))
                        .filter(Boolean);
                      const visibleBookIds = visibleBooks.map((b) => b.id);

                      return (
                        <div
                          key={c.id}
                          className="dashboard-collection-card"
                          onClick={() => {
                            setSelectedCollection({ ...c, bookIds: visibleBookIds });
                          }}
                        >
                          <button
                            type="button"
                            className="dashboard-collection-delete"
                            title="Delete collection"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete collection "${c.name}"? Books will stay in your library.`)) {
                                setCollections(removeCollection(c.id));
                                if (selectedCollection?.id === c.id) setSelectedCollection(null);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                          <h3>{c.name}</h3>
                          <p>
                            {visibleBooks.length} book
                            {visibleBooks.length !== 1 ? 's' : ''}
                          </p>
                          {visibleBooks.length === 0 ? (
                            <div className="dashboard-collection-empty">No books in this collection yet.</div>
                          ) : (
                            <div className="dashboard-collection-books">
                              {visibleBooks.slice(0, 6).map((b) => (
                                <div
                                  key={b.id}
                                  className="dashboard-collection-book-thumb"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBook(b);
                                  }}
                                >
                                  {b.cover && !coverErrorIds.current.has(b.id) ? (
                                    <img
                                      src={b.cover}
                                      alt=""
                                      onError={() => {
                                        coverErrorIds.current.add(b.id);
                                        setBooks((prev) => prev.map((x) => (x.id === b.id ? { ...x, cover: null } : x)));
                                        enqueueCoverRepair({ ...b, cover: null }, { refreshList: true });
                                      }}
                                    />
                                  ) : (
                                    <FileText size={16} />
                                  )}
                                  <button
                                    type="button"
                                    className="dashboard-collection-book-remove"
                                    title="Remove from collection"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeBookFromCollection(c.id, b.id);
                                      setCollections(getCollections());
                                    }}
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <SettingsPanel addToast={addToast} onBooksChange={loadBooks} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <MiniPlayer onOpenBook={setSelectedBook} />

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {showDeleteConfirm && (() => {
        const book = books.find((b) => b.id === showDeleteConfirm);
        if (!book) return null;
        return createPortal(
          <div
            className="delete-modal-overlay"
            onClick={() => setShowDeleteConfirm(null)}
            role="presentation"
          >
            <div
              className="delete-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
            >
              <p id="delete-modal-title">Delete "{book.title}"?</p>
              <div className="delete-modal-actions">
                <button type="button" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
                <button type="button" className="danger" onClick={() => handleDelete(book)}>Delete</button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {showCollectionMenu && (() => {
        const book = books.find((b) => b.id === showCollectionMenu);
        if (!book) return null;
        return createPortal(
          <div
            className="delete-modal-overlay"
            onClick={() => setShowCollectionMenu(null)}
            role="presentation"
          >
            <div
              className="collection-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="collection-modal-title"
            >
              <p id="collection-modal-title">Add "{book.title}" to collection</p>
              <div className="collection-modal-list">
                {collections.map((c) => {
                  const inCol = c.bookIds.includes(book.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (inCol) removeBookFromCollection(c.id, book.id);
                        else addBookToCollection(c.id, book.id);
                        setCollections(getCollections());
                        setShowCollectionMenu(null);
                      }}
                    >
                      {inCol ? '✓ ' : ''}{c.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="collection-modal-new"
                  onClick={() => {
                    const name = prompt('Collection name');
                    if (name) {
                      addCollection(name);
                      setCollections(getCollections());
                    }
                  }}
                >
                  + New collection
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}

function ImportOrphanSection({ addToast, onImported }) {
  const [bookId, setBookId] = useState('');
  const [importing, setImporting] = useState(false);
  const handleImport = async () => {
    const id = bookId.trim();
    if (!id) {
      addToast('Enter the book ID (e.g. from Supabase filename)', 'error');
      return;
    }
    setImporting(true);
    try {
      const book = await importOrphanBook(id);
      addToast(`"${book.title}" added to library`, 'success');
      setBookId('');
      onImported?.();
    } catch (err) {
      addToast(err?.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };
  return (
    <div className="dashboard-settings-row" style={{ marginTop: 12 }}>
      <label>Import orphaned book</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="72c6a43c-3be2-412e-9a0f-45f96ad35dfb"
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          style={{ flex: 1, fontFamily: 'monospace' }}
        />
        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          className="dashboard-btn"
        >
          {importing ? 'Importing...' : 'Import'}
        </button>
      </div>
      <p className="dashboard-settings-hint" style={{ marginTop: 4 }}>
        If a book was uploaded to Supabase but not added to the library, paste its file ID here (the UUID from the filename, e.g. 72c6a43c-3be2-412e-9a0f-45f96ad35dfb).
      </p>
    </div>
  );
}

function SettingsPanel({ addToast, onBooksChange }) {
  const [settings, setSettings] = useState(getSettings);
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    const load = async () => {
      const v = await getVoices();
      setVoices(Array.isArray(v) ? v : window.speechSynthesis?.getVoices?.() ?? []);
    };
    load();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  useEffect(() => {
    ttsManager.setSpeed(settings.speed);
    ttsManager.setVoice(settings.ttsVoice);
    ttsManager.setEngine(settings.ttsEngine);
    ttsManager.setEdgeTtsVoice(settings.edgeTtsVoice);
  }, [settings.speed, settings.ttsVoice, settings.ttsEngine, settings.edgeTtsVoice]);

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    if (key === 'speed') ttsManager.setSpeed(value);
    if (key === 'ttsVoice') ttsManager.setVoice(value);
    if (key === 'ttsEngine') ttsManager.setEngine(value);
    if (key === 'edgeTtsVoice') ttsManager.setEdgeTtsVoice(value);
    addToast('Settings saved', 'success');
  };

  let voiceList = voices.filter(v => v.lang?.startsWith('en'));
  if (voiceList.length === 0 && voices.length > 0) {
    voiceList = voices.slice(0, 20);
  }
  voiceList = sortVoicesNaturalFirst(voiceList);

  return (
    <div className="dashboard-settings">
      <div className="dashboard-settings-card">
        <h3>TTS Engine</h3>
        <p className="dashboard-settings-hint">
          <strong>Edge TTS</strong> — High-quality neural voices powered by Microsoft Azure. Streams from server, no download needed. <strong>Web Speech</strong> — Uses browser built-in voices (Edge/Chrome have best quality).
        </p>
        <select
          value={settings.ttsEngine || 'web-speech'}
          onChange={(e) => update('ttsEngine', e.target.value)}
          className="dashboard-settings-select"
        >
          <option value="web-speech">Web Speech (browser)</option>
          <option value="edge-tts">Edge TTS (neural)</option>
        </select>
      </div>
      {(settings.ttsEngine || 'web-speech') === 'edge-tts' ? (
        <>
          <div className="dashboard-settings-card">
            <h3>Edge TTS Voice</h3>
            <p className="dashboard-settings-hint">
              Neural voices from Microsoft Azure. Ava and Jenny are recommended.
            </p>
            <select
              value={settings.edgeTtsVoice || 'en-US-AvaMultilingualNeural'}
              onChange={(e) => update('edgeTtsVoice', e.target.value)}
              className="dashboard-settings-select"
            >
              {EDGE_TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.grade})</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div className="dashboard-settings-card">
          <h3>Voice (Web Speech)</h3>
          <p className="dashboard-settings-hint">
            For natural voices: use <strong>Microsoft Edge</strong> and pick a voice with &quot;Microsoft&quot; or &quot;Online&quot; in the name.
          </p>
          <select
            value={settings.ttsVoice || ''}
            onChange={(e) => update('ttsVoice', e.target.value)}
            className="dashboard-settings-select"
          >
            <option value="">Default (browser)</option>
            {voiceList.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.name?.toLowerCase().includes('microsoft') || v.name?.toLowerCase().includes('online') ? ' — natural' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="dashboard-settings-card">
        <h3>Playback speed</h3>
        <div className="dashboard-settings-speed">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.speed}
            onChange={(e) => update('speed', parseFloat(e.target.value))}
          />
          <span>{settings.speed}x</span>
        </div>
      </div>
      <div className="dashboard-settings-card">
        <h3>Reader appearance</h3>
        <div className="dashboard-settings-row">
          <label>Font size</label>
          <input
            type="number"
            min="12"
            max="24"
            value={settings.fontSize}
            onChange={(e) => update('fontSize', parseInt(e.target.value) || 16)}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Line height</label>
          <input
            type="number"
            min="1.2"
            max="2.5"
            step="0.1"
            value={settings.lineHeight}
            onChange={(e) => update('lineHeight', parseFloat(e.target.value) || 1.6)}
          />
        </div>
      </div>
      <div className="dashboard-settings-card">
        <h3>Storage</h3>
        <p>Books are stored in Supabase. Connect your project to sync across devices.</p>
        <ImportOrphanSection addToast={addToast} onImported={onBooksChange} />
      </div>
    </div >
  );
}

export default Dashboard;
