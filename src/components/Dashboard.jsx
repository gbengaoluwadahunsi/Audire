import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Book, Library, Settings, Plus, Play, Upload, FileText, Search, Trash2, FolderPlus, Folder, ChevronRight, CornerDownRight, Sun, Moon, X, ArrowLeft, Edit, TrendingUp, BookOpen, LayoutGrid, Link as LinkIcon } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { compressIfNeeded, MAX_SIZE } from '../lib/compression';
import { fetchBooks, uploadBook, uploadBookCover, deleteBook, importArticleFromUrl } from '../lib/api';
import { buildArticleEpub } from '../lib/articleEpub';
import { getCollections, saveCollections, addCollection, addBookToCollection, removeBookFromCollection, removeCollection } from '../lib/collections';

function getCollectionPath(colId, collections) {
  if (!colId || !collections) return [];
  const map = new Map(collections.map((c) => [c.id, c]));
  const path = [];
  let curr = map.get(colId);
  const visited = new Set();

  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    path.unshift(curr);
    curr = curr.parentId ? map.get(curr.parentId) : null;
  }

  return path;
}

function getCollectionTotalBooks(colId, collections) {
  if (!colId || !collections) return 0;
  const map = new Map(collections.map((c) => [c.id, c]));
  const bookSet = new Set();

  function collect(id) {
    const col = map.get(id);
    if (!col) return;
    (col.bookIds || []).forEach((b) => bookSet.add(b));
    collections.filter((c) => c.parentId === id).forEach((child) => collect(child.id));
  }

  collect(colId);
  return bookSet.size;
}
import { getSettings, saveSettings } from '../lib/settings';
import { ttsManager } from '../lib/ttsManager';
import { EDGE_TTS_VOICES } from '../lib/edgeTtsVoices';
import { setCustomPronunciations, setSkipJunk } from '../lib/textSanitation';
import { ensureNotificationPermission } from '../lib/listeningGoal';
import { getCacheStats, clearCache } from '../lib/ttsCache';
import { usePlayback } from '../context/PlaybackContext';
import MiniPlayer from './MiniPlayer';
import MetadataEditor from './MetadataEditor';
import StatsDashboard from './StatsDashboard';
import { ToastContainer } from './Toast';
import BookGrid from './BookGrid';
import SplitView from './SplitView';
import DragDropCollection from './DragDropCollection';
import ExportModal from './ExportModal';

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
  const { currentBook } = usePlayback();
  const [activeTab, setActiveTab] = useState('library');
  const [books, setBooks] = useState([]);
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState(null);
  const [secondaryBook, setSecondaryBook] = useState(null);
  const [splitPickerMode, setSplitPickerMode] = useState(null); // null, 'split', 'paneA', 'paneB'
  const [appSlot, setAppSlot] = useState(null); // 'A' | 'B' | null — the pane showing the app itself
  const [swapped, setSwapped] = useState(false); // which side each pane is drawn on
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showCollectionMenu, setShowCollectionMenu] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [librarySort, setLibrarySort] = useState(() => getSettings().librarySort || 'last_read');
  const [librarySortOrder, setLibrarySortOrder] = useState(() => getSettings().librarySortOrder || 'desc');
  const [theme, setTheme] = useState(() => getSettings().theme || 'dark');
  const [editingBook, setEditingBook] = useState(null);
  const [selectedBookIds, setSelectedBookIds] = useState(new Set());
  const [formatFilter, setFormatFilter] = useState('all');
  const [showCollectionDeleteConfirm, setShowCollectionDeleteConfirm] = useState(null);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const [exportBook, setExportBook] = useState(null);
  const [splitPickerSearch, setSplitPickerSearch] = useState('');
  const fileInputRef = useRef(null);
  const [coverErrorIds, setCoverErrorIds] = useState(() => new Set());

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    const s = getSettings();
    saveSettings({ ...s, theme: nextTheme });
    document.documentElement.classList.toggle('light', nextTheme === 'light');
    addToast(`${nextTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'success');
  };

  const addToast = (message, type = 'info', action = null, onAction = null) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, action, onAction }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Keep last_cfi in-memory fresh so switching books in split view restores the correct page.
  const handleProgressUpdate = React.useCallback((bookId, cfi) => {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, last_cfi: cfi } : b));
    setSelectedBook(prev => (prev?.id === bookId ? { ...prev, last_cfi: cfi } : prev));
    setSecondaryBook(prev => (prev?.id === bookId ? { ...prev, last_cfi: cfi } : prev));
  }, []);

  useEffect(() => {
    loadBooks();
    getCollections().then(setCollections);
  }, []);

  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const allBooks = await fetchBooks();
      setBooks(allBooks);
    } catch (err) {
      console.error('Failed to load books:', err);
      addToast('Could not connect to your library', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBookSelect = (bookId) => {
    setSelectedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filteredBooks.map(b => b.id);
    setSelectedBookIds(new Set(visibleIds));
  };

  const clearSelection = () => setSelectedBookIds(new Set());

  /* ---- Split panes -------------------------------------------------------
     Slot A and slot B each hold a book; `appSlot` marks the one showing the app
     instead, and `swapped` only decides which side each slot is drawn on. Books
     never move between slots, so a reader is never remounted (and never stops
     reading aloud) just because the panes were rearranged. */

  const bookInSlot = (slot) => (slot === 'A' ? selectedBook : secondaryBook);
  const setBookInSlot = (slot, book) => (slot === 'A' ? setSelectedBook(book) : setSecondaryBook(book));
  const otherSlot = (slot) => (slot === 'A' ? 'B' : 'A');

  const openBookPicker = (slot) => {
    setSplitPickerSearch('');
    setSplitPickerMode(slot === 'A' ? 'paneA' : 'paneB');
  };

  const closePane = (slot) => {
    setBookInSlot(slot, null);
    setAppSlot(null);
    setSwapped(false);
    loadBooks();
  };

  // Put the app on the side the user clicked. If that pane is the one currently
  // reading aloud — or the only book open — the app takes the other slot instead
  // and the panes flip, so it still appears where it was asked for without
  // unmounting (and silencing) the reader.
  const showAppOnSide = (slot) => {
    const here = bookInSlot(slot);
    const there = bookInSlot(otherSlot(slot));
    const readingHere = here && currentBook?.id === here.id;
    const target = there && !readingHere ? slot : otherSlot(slot);
    setAppSlot(target);
    if (target !== slot) setSwapped((s) => !s);
  };

  // Books can now be deleted from the app pane while other panes are reading them,
  // so close any pane whose book just disappeared.
  const dropDeletedFromPanes = (deletedIds) => {
    const gone = new Set(deletedIds);
    const keptA = selectedBook && !gone.has(selectedBook.id) ? selectedBook : null;
    const keptB = secondaryBook && !gone.has(secondaryBook.id) ? secondaryBook : null;
    if (!keptA) setSelectedBook(null);
    if (!keptB) setSecondaryBook(null);
    // An app pane needs a book on the other side to be worth showing.
    if ((appSlot === 'A' && !keptB) || (appSlot === 'B' && !keptA)) {
      setAppSlot(null);
      setSwapped(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedBookIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} book${ids.length > 1 ? 's' : ''}?`)) return;
    for (const id of ids) {
      try { await deleteBook(id); } catch { /* continue */ }
    }
    addToast(`${ids.length} book${ids.length > 1 ? 's' : ''} deleted`, 'success');
    setSelectedBookIds(new Set());
    dropDeletedFromPanes(ids);
    await loadBooks();
  };

  const handleBulkMoveToCollection = async (collectionId) => {
    const ids = [...selectedBookIds];
    if (ids.length === 0) return;
    for (const id of ids) {
      try { await addBookToCollection(collectionId, id); } catch { /* continue */ }
    }
    setCollections(await getCollections());
    addToast(`${ids.length} book${ids.length > 1 ? 's' : ''} added to collection`, 'success');
    setSelectedBookIds(new Set());
  };

  const handleReorderInCollection = async (collectionId, bookIds) => {
    setSelectedCollection(prev => prev ? { ...prev, bookIds } : prev);
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ''}/api/library-sync/collections/${collectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: selectedCollection?.name, bookIds }),
      });
      setCollections(await getCollections());
    } catch (err) {
      addToast('Failed to reorder: ' + err.message, 'error');
    }
  };

  /** Move a book out of a collection and into one of its subfolders. */
  const handleMoveBookToSubfolder = async (book, fromId, toId) => {
    const target = collections.find((c) => c.id === toId);
    if (!target || fromId === toId) return;

    // Add before removing, so a failure part-way leaves the book in a folder
    // rather than dropping it out of the collection tree entirely.
    // Each helper already returns the refreshed list, so use the last one rather
    // than paying for another round trip.
    let refreshed;
    try {
      await addBookToCollection(toId, book.id);
      refreshed = await removeBookFromCollection(fromId, book.id);
    } catch (err) {
      addToast(`Could not move "${book.title}": ${err.message}`, 'error');
      setCollections(await getCollections());
      return;
    }

    setCollections(refreshed);
    setSelectedCollection((prev) =>
      prev && prev.id === fromId
        ? { ...prev, bookIds: prev.bookIds.filter((id) => id !== book.id) }
        : prev
    );

    addToast(`"${book.title}" moved to "${target.name}"`, 'success', 'Undo', async () => {
      let undone;
      try {
        await addBookToCollection(fromId, book.id);
        undone = await removeBookFromCollection(toId, book.id);
      } catch (err) {
        addToast(`Could not undo the move: ${err.message}`, 'error');
      }
      setCollections(undone || (await getCollections()));
      setSelectedCollection((prev) =>
        prev && prev.id === fromId
          ? { ...prev, bookIds: [...(prev.bookIds || []), book.id] }
          : prev
      );
    });
  };

  const MAX_ATTEMPT_SIZE = 100 * 1024 * 1024; // 100 MB - won't try to compress larger (memory risk)

  const handleImportUrl = async () => {
    const pageUrl = (typeof window !== 'undefined' ? window.prompt('Paste a link to an article or web page to listen to:') : '')?.trim();
    if (!pageUrl) return;
    if (!/^https?:\/\//i.test(pageUrl)) {
      addToast('Please paste a full http(s):// link', 'error');
      return;
    }
    setIsUploading(true);
    addToast('Fetching article…', 'info');
    try {
      const article = await importArticleFromUrl(pageUrl);
      const blob = await buildArticleEpub(article);
      const fileName = `${(article.title || 'article').replace(/[^\w\d -]+/g, '').slice(0, 60) || 'article'}.epub`;
      const uploaded = await uploadBook(blob, fileName);
      addToast(`"${uploaded.title}" added to library`, 'success');
      await loadBooks();
    } catch (err) {
      console.error('URL import failed:', err);
      addToast(err.message || 'Could not import that link', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Covers are rendered here in the browser rather than on the server: rasterising
   * a PDF page server-side is what used to exhaust the 512MB instance. The backend
   * still pulls covers straight out of EPUB zips (cheap), so this only has to fill
   * the gap — mainly PDFs. Never let a cover failure fail the upload.
   */
  const attachCoverFromBrowser = async (uploaded, file) => {
    // `cover` is never null in the API response — the backend fills it with its own
    // /cover endpoint even when no image exists. A stored R2 URL is the only proof
    // that a real cover was extracted server-side.
    const hasRealCover = /r2\.dev|r2\.cloudflarestorage\.com/i.test(uploaded?.cover || '');
    if (!uploaded?.id || hasRealCover) return;
    try {
      // Loaded on demand — fileProcessor pulls in pdf.js and jszip.
      const { processFile } = await import('../lib/fileProcessor');
      const { coverBlob } = await processFile(file);
      if (!coverBlob) return;
      const ext = coverBlob.type === 'image/png' ? 'png' : 'jpg';
      await uploadBookCover(uploaded.id, new File([coverBlob], `cover.${ext}`, { type: coverBlob.type || 'image/jpeg' }));
    } catch (err) {
      console.warn(`Could not build a cover for ${file.name}:`, err?.message || err);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    const total = files.length;
    let completed = 0;
    let successCount = 0;

    addToast(`Uploading ${total} book${total > 1 ? 's' : ''}...`, 'info');

    // Process up to 3 files concurrently for fast, responsive batch uploading
    const MAX_CONCURRENT = 3;
    let index = 0;

    const uploadWorker = async () => {
      while (index < files.length) {
        const file = files[index++];
        if (!file) break;

        if (file.size > MAX_ATTEMPT_SIZE) {
          addToast(`File ${file.name} too large. Max 100 MB.`, 'error');
          completed++;
          continue;
        }

        try {
          let uploadBlob = file;
          if (file.size > MAX_SIZE) {
            addToast(`Compressing ${file.name}...`, 'info');
            const { blob, finalSize } = await compressIfNeeded(file);
            if (finalSize > MAX_SIZE) {
              addToast(`Could not compress ${file.name} under 50 MB.`, 'error');
              completed++;
              continue;
            }
            uploadBlob = blob;
          }

          const uploaded = await uploadBook(uploadBlob, file.name);
          await attachCoverFromBrowser(uploaded, file);
          successCount++;
          completed++;
          addToast(`[${completed}/${total}] "${uploaded.title || file.name}" added`, 'success');
        } catch (err) {
          console.error(`Upload error for ${file.name}:`, err);
          completed++;
          addToast(toUploadErrorMessage(file.name, err), 'error');
        }
      }
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, files.length) }, () => uploadWorker());
    await Promise.all(workers);

    await loadBooks();
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (successCount > 0) {
      addToast(`Successfully added ${successCount} book${successCount > 1 ? 's' : ''} to your library!`, 'success');
    }
  };

  const handleDelete = async (book) => {
    try {
      await deleteBook(book.id);
      const currentCollections = await getCollections();
      const nextCollections = currentCollections.map((c) => ({
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
      dropDeletedFromPanes([book.id]);
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

  // Most recently read book that's started but not finished — for the resume card.
  const continueBook = books
    .filter((b) => {
      const pct = getProgressPercent(b);
      return b.last_read && pct > 0 && pct < 100;
    })
    .sort((a, b) => new Date(b.last_read || 0) - new Date(a.last_read || 0))[0] || null;

  const filteredBooks = books
    .filter(
      (b) => {
        const isCollected = collectedBookIds.has(b.id);
        const matchesSearch = !searchQuery ||
          (b.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (b.author || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFormat = formatFilter === 'all' || b.format === formatFilter;

        return !isCollected && matchesSearch && matchesFormat;
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

  if (selectedBook || secondaryBook) {
    // Which slot the picker is filling. 'split' comes from a solo pane, so it targets
    // whichever slot is still empty.
    const pickerSlot =
      splitPickerMode === 'paneA' ? 'A'
      : splitPickerMode === 'paneB' ? 'B'
      : (selectedBook ? 'B' : 'A');

    return (
      <>
        {/* SplitView stays mounted for the whole session — opening, closing or swapping
            panes never remounts a reader, so a book keeps reading aloud throughout. */}
        <SplitView
          bookA={selectedBook}
          bookB={secondaryBook}
          appSlot={appSlot}
          appContent={appSlot ? renderDashboardShell(true) : null}
          swapped={swapped}
          onOpenBook={setSelectedBook}
          onChangeBook={openBookPicker}
          onClosePane={closePane}
          onMaximizePane={(slot) => closePane(slot === 'A' ? 'B' : 'A')}
          onShowApp={showAppOnSide}
          onReadBook={(slot) => {
            // Keep the app up until a book is actually chosen for this pane.
            if (bookInSlot(slot)) setAppSlot(null);
            else openBookPicker(slot);
          }}
          onSwapSides={() => setSwapped((s) => !s)}
          onRequestSplit={() => { setSplitPickerSearch(''); setSplitPickerMode('split'); }}
          onProgressUpdate={handleProgressUpdate}
          addToast={addToast}
        />
        {splitPickerMode && (
          <div className="split-picker-overlay" onClick={() => setSplitPickerMode(null)}>
            <div className="split-picker-modal" onClick={e => e.stopPropagation()}>
              <div className="split-picker-header">
                <div>
                  <h2>{splitPickerMode === 'split' ? "Open Split View" : "Fill This Pane"}</h2>
                  <p>
                    {splitPickerMode === 'split' ? (
                      <>Read another book alongside <strong>{bookInSlot(otherSlot(pickerSlot))?.title}</strong>, or browse your library while it keeps playing</>
                    ) : bookInSlot(pickerSlot) ? (
                      <>Pick what replaces <strong>{bookInSlot(pickerSlot).title}</strong> in this pane</>
                    ) : (
                      <>Pick what goes in this pane</>
                    )}
                  </p>
                </div>
                <button className="split-picker-close" onClick={() => setSplitPickerMode(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="split-picker-search">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search by title or author…"
                  value={splitPickerSearch}
                  onChange={e => setSplitPickerSearch(e.target.value)}
                  autoFocus
                  className="split-picker-search-input"
                />
                {splitPickerSearch && (
                  <button className="split-picker-search-clear" onClick={() => setSplitPickerSearch('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="split-picker-body">
                <button
                  type="button"
                  className="split-picker-app-btn"
                  onClick={() => { showAppOnSide(pickerSlot); setSplitPickerMode(null); }}
                >
                  <LayoutGrid size={18} />
                  <span className="split-picker-app-text">
                    <strong>Browse the app &amp; library</strong>
                    <em>Add books, manage collections, delete — all while the other pane keeps reading aloud</em>
                  </span>
                </button>
                {(() => {
                  const q = splitPickerSearch.toLowerCase().trim();
                  const excludeId = bookInSlot(otherSlot(pickerSlot))?.id;
                  const filtered = books
                    .filter(b => b.id !== excludeId)
                    .filter(b => !q || (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q));

                  const totalAvailable = books.filter(b => b.id !== excludeId).length;

                  if (totalAvailable === 0) {
                    return (
                      <div className="split-picker-empty">
                        <p>No other books are available in your library.</p>
                      </div>
                    );
                  }
                  if (filtered.length === 0) {
                    return (
                      <div className="split-picker-empty">
                        <p>No books match <strong>{splitPickerSearch}</strong></p>
                      </div>
                    );
                  }
                  return (
                    <div className="split-picker-grid">
                      {splitPickerMode !== 'split' && (
                        <button
                          className="split-picker-remove-btn"
                          onClick={() => { closePane(pickerSlot); setSplitPickerMode(null); }}
                        >
                          <X size={16} />
                          <span>Close This Pane (Exit Split View)</span>
                        </button>
                      )}
                      {filtered.map(book => (
                      <button
                        key={book.id}
                        className="split-picker-card"
                        onClick={() => {
                          setBookInSlot(pickerSlot, book);
                          if (appSlot === pickerSlot) setAppSlot(null);
                          setSplitPickerMode(null);
                        }}
                      >
                        <div className="split-picker-cover">
                          {book.cover ? (
                            <img src={book.cover} alt="" loading="lazy" />
                          ) : (
                            <div className="split-picker-cover-placeholder">
                              {(book.title || '?')[0]}
                            </div>
                          )}
                        </div>
                        <div className="split-picker-info">
                            <span className="split-picker-title">{book.title}</span>
                            <span className="split-picker-author">{book.author || 'Unknown Author'}</span>
                            <span className="split-picker-format">{(book.format || '').toUpperCase()}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return renderDashboardShell(false);

  // The whole dashboard UI. Rendered full-screen normally, and also inside whichever
  // split pane is in app mode (`inSplitPane`) so the library, collections and book
  // management stay usable while the other pane keeps reading aloud.
  // Declared as a function statement so it is hoisted for the reader branch above.
  function renderDashboardShell(inSplitPane = false) {
    // In a pane, opening a book fills that same pane rather than replacing what is being read.
    const openBook = inSplitPane
      ? (book) => {
          if (!book) return;
          const reading = bookInSlot(otherSlot(appSlot));
          if (book.id === reading?.id) {
            // Already open on the other side — collapse back to a single reader.
            closePane(appSlot);
            return;
          }
          setBookInSlot(appSlot, book);
          setAppSlot(null);
        }
      : setSelectedBook;

    return (
    <div className={`dashboard${inSplitPane ? ' dashboard-in-pane' : ''}`}>
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
          <button
            className={`dashboard-nav-item ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => { setActiveTab('stats'); setSelectedCollection(null); }}
          >
            <TrendingUp size={20} />
            <span>Stats</span>
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
          <button
            className="dashboard-import-url"
            onClick={handleImportUrl}
            disabled={isUploading}
            title="Import an article or web page by URL"
          >
            <LinkIcon size={18} />
            <span>Import from URL</span>
          </button>
        </div>
      </aside>

      {/* ===== MOBILE HEADER (hidden on desktop via CSS) ===== */}
      <header className="dashboard-mobile-header">
        <div className="dashboard-mobile-brand">
          <img src="/logo.svg" alt="Audire" />
          <span>Audire</span>
        </div>
        <div className="dashboard-mobile-actions">
          <button
            className="dashboard-mobile-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            className="dashboard-mobile-btn"
            onClick={onBackToLanding}
            title="Back to Landing"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            className="dashboard-mobile-add"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Add Book"
          >
            {isUploading ? <div className="small-loader" /> : <Plus size={18} />}
            {isUploading ? 'Uploading…' : 'Add Book'}
          </button>
        </div>
      </header>

      {/* ===== MOBILE BOTTOM TAB NAV (hidden on desktop via CSS) ===== */}
      <nav className="dashboard-mobile-nav">
        <button
          className={`dashboard-mobile-tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => { setActiveTab('library'); setSelectedCollection(null); }}
        >
          <Library size={22} />
          Library
        </button>
        <button
          className={`dashboard-mobile-tab ${activeTab === 'collections' ? 'active' : ''}`}
          onClick={() => { setActiveTab('collections'); setSelectedCollection(null); }}
        >
          <FolderPlus size={22} />
          Collections
        </button>
        <button
          className={`dashboard-mobile-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => { setActiveTab('settings'); setSelectedCollection(null); }}
        >
          <Settings size={22} />
          Settings
        </button>
        <button
          className={`dashboard-mobile-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => { setActiveTab('stats'); setSelectedCollection(null); }}
        >
          <TrendingUp size={22} />
          Stats
        </button>
      </nav>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <h1>
            {activeTab === 'library' && 'Your Library'}
            {activeTab === 'collections' && 'Collections'}
            {activeTab === 'settings' && 'Settings'}
            {activeTab === 'stats' && 'Reading Statistics'}
          </h1>
          {activeTab === 'library' && (
            <div className="dashboard-library-toolbar" role="toolbar" aria-label="Library controls">
              <div className="dashboard-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search books..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search books"
                />
              </div>
              <div className="dashboard-sort">
                <select
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value)}
                  className="dashboard-sort-select"
                  aria-label="Filter by format"
                >
                  <option value="all">All Formats</option>
                  <option value="epub">EPUB</option>
                  <option value="pdf">PDF</option>
                </select>
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
              <button
                className={`dashboard-sort-order ${selectedBookIds.size > 0 ? 'active' : ''}`}
                onClick={() => selectedBookIds.size > 0 ? clearSelection() : selectAllVisible()}
                title={selectedBookIds.size > 0 ? 'Clear selection' : 'Select all'}
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              >
                {selectedBookIds.size > 0 ? `${selectedBookIds.size} selected` : 'Select'}
              </button>
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
                  <div className="dashboard-skeleton-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="skeleton-card">
                        <div className="skeleton-cover" />
                        <div className="skeleton-info">
                          <div className="skeleton-title" />
                          <div className="skeleton-author" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredBooks.length > 0 ? (
                  <>
                    {continueBook && !searchQuery && selectedBookIds.size === 0 && (
                      <button
                        type="button"
                        className="continue-listening-card"
                        onClick={() => openBook(continueBook)}
                      >
                        {continueBook.cover ? (
                          <img src={continueBook.cover} alt="" className="continue-listening-cover" />
                        ) : (
                          <div className="continue-listening-cover continue-listening-cover-fallback">
                            <BookOpen size={28} />
                          </div>
                        )}
                        <div className="continue-listening-info">
                          <span className="continue-listening-label">Continue listening</span>
                          <h3 className="continue-listening-title">{continueBook.title || 'Untitled'}</h3>
                          <p className="continue-listening-author">{continueBook.author || 'Unknown author'}</p>
                          <div className="continue-listening-progress">
                            <div className="continue-listening-bar">
                              <div
                                className="continue-listening-fill"
                                style={{ width: `${Math.min(100, Math.max(0, getProgressPercent(continueBook)))}%` }}
                              />
                            </div>
                            <span>{Math.round(getProgressPercent(continueBook))}%</span>
                          </div>
                        </div>
                        <span className="continue-listening-play">
                          <Play size={22} fill="currentColor" />
                        </span>
                      </button>
                    )}
                    {selectedBookIds.size > 0 && (
                      <div className="bulk-actions-bar">
                        <span className="bulk-actions-count">{selectedBookIds.size} book{selectedBookIds.size > 1 ? 's' : ''} selected</span>
                        <div className="bulk-actions-buttons">
                          <select
                            className="bulk-actions-select"
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'new-collection') {
                                const name = prompt('New collection name');
                                if (name) {
                                  addCollection(name).then(async () => {
                                    const cols = await getCollections();
                                    const newCol = cols.find(c => c.name === name);
                                    if (newCol) handleBulkMoveToCollection(newCol.id);
                                  });
                                }
                              } else if (val) {
                                handleBulkMoveToCollection(val);
                              }
                              e.target.value = '';
                            }}
                          >
                            <option value="">Move to collection...</option>
                            {collections.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                            <option value="new-collection">+ New collection</option>
                          </select>
                          <button className="bulk-actions-btn danger" onClick={handleBulkDelete}>
                            <Trash2 size={14} /> Delete
                          </button>
                          <button className="bulk-actions-btn" onClick={clearSelection}>Cancel</button>
                        </div>
                      </div>
                    )}
                    <BookGrid
                      books={filteredBooks}
                      selectedBookIds={selectedBookIds}
                      onToggleSelect={toggleBookSelect}
                      onSelectBook={openBook}
                      onDelete={(book) => setShowDeleteConfirm(book.id)}
                      onAddToCollection={(book) => setShowCollectionMenu(showCollectionMenu === book.id ? null : book.id)}
                      onEditMetadata={(book) => setEditingBook(book)}
                      onExport={(book) => setExportBook(book)}
                      coverErrorIds={coverErrorIds}
                      onCoverError={(book) => {
                        setCoverErrorIds(prev => new Set([...prev, book.id]));
                        setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, cover: null } : b)));
                      }}
                      getProgressPercent={getProgressPercent}
                    />
                  </>
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
                      <div className="collection-breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <button
                          className="back-btn"
                          onClick={() => { setSelectedCollection(null); setCollectionSearchQuery(''); }}
                          style={{ padding: 0, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          Collections
                        </button>
                        {getCollectionPath(selectedCollection.id, collections).map((step, idx, arr) => (
                          <React.Fragment key={step.id}>
                            <ChevronRight size={14} color="var(--text-tertiary)" />
                            <button
                              onClick={() => setSelectedCollection(step)}
                              style={{
                                padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                                color: idx === arr.length - 1 ? 'var(--text-primary)' : 'var(--accent)',
                                fontWeight: idx === arr.length - 1 ? 600 : 400
                              }}
                            >
                              {step.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="collection-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <h2>{selectedCollection.name}</h2>
                          <p>
                            {getCollectionTotalBooks(selectedCollection.id, collections)} book
                            {getCollectionTotalBooks(selectedCollection.id, collections) !== 1 ? 's' : ''}
                            {collections.filter(c => c.parentId === selectedCollection.id).length > 0 &&
                              ` • ${collections.filter(c => c.parentId === selectedCollection.id).length} subfolder(s)`
                            }
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="secondary-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                            onClick={async () => {
                              const name = prompt(`New subfolder in "${selectedCollection.name}"`);
                              if (name && name.trim()) {
                                await addCollection(name.trim(), selectedCollection.id);
                                setCollections(await getCollections());
                                addToast(`Subfolder "${name.trim()}" created`, 'success');
                              }
                            }}
                          >
                            <FolderPlus size={14} /> + New Subfolder
                          </button>
                          <button
                            className="danger-outline-btn"
                            onClick={() => setShowCollectionDeleteConfirm(selectedCollection)}
                          >
                            Delete Folder
                          </button>
                        </div>
                      </div>
                    </header>

                    {/* Render Child Subfolders inside this collection */}
                    {collections.filter((c) => c.parentId === selectedCollection.id).length > 0 && (
                      <div className="collection-subfolders-section" style={{ marginBottom: '24px' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Folder size={14} /> Subfolders
                        </h4>
                        <div className="dashboard-collections-list">
                          {collections.filter((c) => c.parentId === selectedCollection.id).map((sub) => {
                            const subTotalBooks = getCollectionTotalBooks(sub.id, collections);
                            const childCount = collections.filter((c) => c.parentId === sub.id).length;
                            return (
                              <div
                                key={sub.id}
                                className="dashboard-collection-card"
                                onClick={() => setSelectedCollection(sub)}
                                style={{ padding: '16px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                  <Folder size={18} color="var(--accent)" />
                                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{sub.name}</h3>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                                  {childCount > 0 ? `${childCount} subfolder${childCount > 1 ? 's' : ''} • ` : ''}
                                  {subTotalBooks} book{subTotalBooks !== 1 ? 's' : ''}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="dashboard-search" style={{ marginBottom: '16px' }}>
                      <Search size={18} />
                      <input
                        type="text"
                        placeholder="Search in collection..."
                        value={collectionSearchQuery}
                        onChange={(e) => setCollectionSearchQuery(e.target.value)}
                        aria-label="Search in collection"
                      />
                    </div>
                    <DragDropCollection
                      bookIds={selectedCollection.bookIds}
                      books={books}
                      onReorder={(newIds) => handleReorderInCollection(selectedCollection.id, newIds)}
                      onRemoveBook={(book) => {
                        removeBookFromCollection(selectedCollection.id, book.id).then(async () => {
                          setCollections(await getCollections());
                          setSelectedCollection(prev => ({
                            ...prev,
                            bookIds: prev.bookIds.filter(id => id !== book.id)
                          }));
                          addToast(
                            `"${book.title}" removed from collection`,
                            'info',
                            'Undo',
                            async () => {
                              await addBookToCollection(selectedCollection.id, book.id);
                              setCollections(await getCollections());
                              setSelectedCollection(prev => ({
                                ...prev,
                                bookIds: [...(prev?.bookIds || []), book.id]
                              }));
                            }
                          );
                        });
                      }}
                      onDeleteBook={(book) => setShowDeleteConfirm(book.id)}
                      subfolders={collections.filter((c) => c.parentId === selectedCollection.id)}
                      onMoveBook={(book, targetId) =>
                        handleMoveBookToSubfolder(book, selectedCollection.id, targetId)
                      }
                      onSelectBook={openBook}
                      coverErrorIds={coverErrorIds}
                      onCoverError={(book) => {
                        setCoverErrorIds(prev => new Set([...prev, book.id]));
                        setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, cover: null } : b)));
                      }}
                      searchQuery={collectionSearchQuery}
                      getProgressPercent={getProgressPercent}
                    />
                  </div>
                ) : collections.length === 0 ? (
                  <div className="dashboard-empty">
                    <p>No collections yet. Add books to collections from the library.</p>
                    <button
                      className="dashboard-empty-btn"
                      onClick={async () => {
                        const name = prompt('Collection name');
                        if (name) {
                          await addCollection(name);
                          setCollections(await getCollections());
                        }
                      }}
                    >
                      Create collection
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Collections</h2>
                      <button
                        className="secondary-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        onClick={async () => {
                          const name = prompt('New top-level collection name');
                          if (name && name.trim()) {
                            await addCollection(name.trim());
                            setCollections(await getCollections());
                            addToast(`Collection "${name.trim()}" created`, 'success');
                          }
                        }}
                      >
                        <FolderPlus size={14} /> + New Collection
                      </button>
                    </div>

                    <div className="dashboard-collections-list">
                      {collections.filter((c) => !c.parentId).map((c) => {
                        const totalBooks = getCollectionTotalBooks(c.id, collections);
                        const childFolders = collections.filter((sub) => sub.parentId === c.id).length;
                        const visibleBooks = c.bookIds
                          .map((bid) => books.find((b) => b.id === bid))
                          .filter(Boolean);

                        return (
                          <div
                            key={c.id}
                            className="dashboard-collection-card"
                            onClick={() => {
                              setSelectedCollection(c);
                            }}
                          >
                            <button
                              type="button"
                              className="dashboard-collection-delete"
                              title="Rename collection"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newName = prompt('Rename collection', c.name);
                                if (newName && newName !== c.name) {
                                  try {
                                    await fetch(`${import.meta.env.VITE_API_URL || ''}/api/library-sync/collections/${c.id}`, {
                                      method: 'PATCH',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({ name: newName }),
                                    });
                                    setCollections(await getCollections());
                                    addToast('Collection renamed', 'success');
                                  } catch (err) {
                                    addToast('Failed to rename: ' + err.message, 'error');
                                  }
                                }
                              }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className="dashboard-collection-delete"
                              title="Delete collection"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowCollectionDeleteConfirm(c);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Folder size={20} color="var(--accent)" />
                              <h3>{c.name}</h3>
                            </div>
                            <p>
                              {childFolders > 0 ? `${childFolders} subfolder${childFolders > 1 ? 's' : ''} • ` : ''}
                              {totalBooks} book{totalBooks !== 1 ? 's' : ''}
                            </p>
                            {visibleBooks.length === 0 ? (
                              <div className="dashboard-collection-empty">
                                {childFolders > 0 ? 'Contains subfolders.' : 'No books in this collection yet.'}
                              </div>
                            ) : (
                              <div className="dashboard-collection-books">
                                {visibleBooks.map((b) => (
                                  <div
                                    key={b.id}
                                    className="dashboard-collection-book-thumb"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBook(b);
                                    }}
                                  >
                                    {b.cover ? (
                                      <img src={b.cover} alt={b.title} />
                                    ) : (
                                      <div className="dashboard-collection-book-placeholder">
                                        <FileText size={16} />
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      className="dashboard-collection-book-remove"
                                      title="Remove from collection"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await removeBookFromCollection(c.id, b.id);
                                        setCollections(await getCollections());
                                        addToast(`"${b.title}" removed from collection`, 'info');
                                      }}
                                    >
                                      <X size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className="dashboard-collection-book-delete-btn"
                                      title="Delete book from library"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDeleteConfirm(b.id);
                                      }}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                <SettingsPanel />
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div
                key="stats"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <StatsDashboard addToast={addToast} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* The left pane already owns playback controls in split view. */}
      {!inSplitPane && <MiniPlayer onOpenBook={setSelectedBook} />}

      {exportBook && (
        <ExportModal 
          bookData={exportBook} 
          onClose={() => setExportBook(null)} 
          addToast={addToast} 
        />
      )}

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
                  const fullPath = getCollectionPath(c.id, collections).map((p) => p.name).join(' / ');
                  const isSub = !!c.parentId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      style={{ paddingLeft: isSub ? '24px' : '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
                      onClick={async () => {
                        if (inCol) await removeBookFromCollection(c.id, book.id);
                        else await addBookToCollection(c.id, book.id);
                        setCollections(await getCollections());
                        setShowCollectionMenu(null);
                      }}
                    >
                      <Folder size={14} color="var(--accent)" />
                      <span>{inCol ? '✓ ' : ''}{fullPath}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="collection-modal-new"
                  onClick={async () => {
                    const name = prompt('Collection name');
                    if (name) {
                      await addCollection(name);
                      setCollections(await getCollections());
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

      {showCollectionDeleteConfirm && createPortal(
        <div className="delete-modal-overlay" onClick={() => setShowCollectionDeleteConfirm(null)} role="presentation">
          <div className="delete-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="collection-delete-title">
            <p id="collection-delete-title">Delete collection "{showCollectionDeleteConfirm.name}"? Books will stay in your library.</p>
            <div className="delete-modal-actions">
              <button type="button" onClick={() => setShowCollectionDeleteConfirm(null)}>Cancel</button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  setCollections(await removeCollection(showCollectionDeleteConfirm.id));
                  if (selectedCollection?.id === showCollectionDeleteConfirm.id) setSelectedCollection(null);
                  setShowCollectionDeleteConfirm(null);
                  addToast('Collection deleted', 'success');
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingBook && (
        <MetadataEditor
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onUpdated={loadBooks}
          addToast={addToast}
        />
      )}
    </div>
    );
  }
}

function SettingsPanel() {
  const [settings, setSettings] = useState(getSettings);
  const [numberDrafts, setNumberDrafts] = useState({});
  const [pronunciationText, setPronunciationText] = useState(
    () => JSON.stringify(getSettings().pronunciationDict || {}, null, 2)
  );
  const [previewing, setPreviewing] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  const handleClearCache = async () => {
    setClearingCache(true);
    await clearCache();
    const stats = await getCacheStats().catch(() => ({ count: 0, bytes: 0 }));
    setCacheStats(stats);
    setClearingCache(false);
  };

  const toggleReminders = async (enabled) => {
    if (enabled) {
      const granted = await ensureNotificationPermission();
      update('remindersEnabled', granted);
      return;
    }
    update('remindersEnabled', false);
  };

  useEffect(() => {
    ttsManager.setSpeed(settings.speed);
    ttsManager.setEdgeTtsVoice(settings.edgeTtsVoice);
    setSkipJunk(settings.skipJunk !== false);
    if (settings.pronunciationDict) {
      setCustomPronunciations(settings.pronunciationDict);
    }
  }, [settings.speed, settings.edgeTtsVoice, settings.skipJunk, settings.pronunciationDict]);

  useEffect(() => () => { ttsManager.stop(); }, []);

  const previewVoice = async () => {
    if (previewing) {
      ttsManager.stop();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      ttsManager.setEdgeTtsVoice(settings.edgeTtsVoice);
      ttsManager.setSpeed(settings.speed || 1);
      await ttsManager.speak('Hi, this is how this voice sounds when reading your books aloud.');
    } catch {
      /* ignore preview failures */
    } finally {
      setPreviewing(false);
    }
  };

  const persist = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  const update = (key, value) => {
    persist({ ...settings, [key]: value });
  };

  const numberValue = (key, fallback) => {
    if (numberDrafts[key] !== undefined) return numberDrafts[key];
    const value = settings[key];
    return value !== undefined ? String(value) : String(fallback);
  };

  const handleNumberChange = (key, raw) => {
    setNumberDrafts((prev) => ({ ...prev, [key]: raw }));
  };

  const commitNumber = (key, fallback, parser = parseFloat) => {
    const raw = numberDrafts[key];
    setNumberDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (raw === undefined) return;

    const parsed = parser(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    update(key, value);
  };

  const commitPronunciation = () => {
    try {
      const dict = JSON.parse(pronunciationText);
      update('pronunciationDict', dict);
      setCustomPronunciations(dict);
    } catch {
      setPronunciationText(JSON.stringify(settings.pronunciationDict || {}, null, 2));
    }
  };


  return (
    <div className="dashboard-settings">
      <div className="dashboard-settings-card">
        <h3>TTS Engine</h3>
        <p className="dashboard-settings-hint">
          <strong>Edge TTS</strong> — High-quality neural voices powered by Microsoft Azure. Streams from server, no download needed.
        </p>
        <select
          value="edge-tts"
          disabled
          className="dashboard-settings-select"
        >
          <option value="edge-tts">Edge TTS (neural)</option>
        </select>
      </div>
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
        <button
          type="button"
          className="dashboard-settings-preview-btn"
          onClick={previewVoice}
        >
          {previewing ? 'Stop preview' : 'Preview voice'}
        </button>
      </div>
      <div className="dashboard-settings-card">
        <h3>Skip junk while reading</h3>
        <p className="dashboard-settings-hint">
          Skip page numbers, running footers, and bare links so the voice doesn&apos;t read &quot;Page 47&quot; mid-sentence.
        </p>
        <label className="dashboard-settings-toggle">
          <input
            type="checkbox"
            checked={settings.skipJunk !== false}
            onChange={(e) => update('skipJunk', e.target.checked)}
          />
          <span>{settings.skipJunk !== false ? 'On' : 'Off'}</span>
        </label>
      </div>
      <div className="dashboard-settings-card">
        <h3>Daily listening goal</h3>
        <p className="dashboard-settings-hint">Set a target and build a daily habit. Progress shows on the Stats tab.</p>
        <div className="dashboard-settings-row">
          <label>Minutes per day</label>
          <input
            type="number"
            min="1"
            max="600"
            className="dashboard-settings-select"
            style={{ width: 100 }}
            value={numberValue('dailyGoalMinutes', 20)}
            onChange={(e) => handleNumberChange('dailyGoalMinutes', e.target.value)}
            onBlur={() => commitNumber('dailyGoalMinutes', 20, (v) => parseInt(v, 10))}
          />
        </div>
        <label className="dashboard-settings-toggle" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={!!settings.remindersEnabled}
            onChange={(e) => toggleReminders(e.target.checked)}
          />
          <span>Notify me when I reach my goal</span>
        </label>
      </div>
      <div className="dashboard-settings-card">
        <h3>Offline audio</h3>
        <p className="dashboard-settings-hint">
          Audio you listen to is cached for instant, offline replay. Use the download button in the reader to pre-save a section.
        </p>
        <p className="dashboard-settings-hint">
          {cacheStats
            ? `${cacheStats.count} segment${cacheStats.count === 1 ? '' : 's'} cached · ${(cacheStats.bytes / (1024 * 1024)).toFixed(1)} MB`
            : 'Calculating…'}
        </p>
        <button
          type="button"
          className="dashboard-settings-preview-btn"
          onClick={handleClearCache}
          disabled={clearingCache || !(cacheStats?.count)}
        >
          {clearingCache ? 'Clearing…' : 'Clear offline audio'}
        </button>
      </div>
      <div className="dashboard-settings-card">
        <h3>Highlight while reading <span style={{ fontWeight: 400, fontSize: '0.78rem', opacity: 0.7 }}>(experimental)</span></h3>
        <p className="dashboard-settings-hint">
          Highlight each sentence as it&apos;s read aloud (karaoke style). May occasionally mis-highlight on complex layouts.
        </p>
        <label className="dashboard-settings-toggle">
          <input
            type="checkbox"
            checked={!!settings.karaokeHighlight}
            onChange={(e) => update('karaokeHighlight', e.target.checked)}
          />
          <span>{settings.karaokeHighlight ? 'On' : 'Off'}</span>
        </label>
      </div>
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
          <label>Layout</label>
          <select
            value={settings.layout || 'single'}
            onChange={(e) => update('layout', e.target.value)}
            className="dashboard-settings-select"
          >
            <option value="single">Single Page</option>
            <option value="dual">Dual Page (Spread)</option>
          </select>
        </div>
        <div className="dashboard-settings-row">
          <label>Font Family</label>
          <select
            value={settings.fontFamily || 'System'}
            onChange={(e) => update('fontFamily', e.target.value)}
            className="dashboard-settings-select"
          >
            <option value="System">System Default</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="'OpenDyslexic', sans-serif">OpenDyslexic</option>
            <option value="'Noto Sans', sans-serif">Noto Sans</option>
            <option value="'Noto Serif', serif">Noto Serif</option>
            <option value="'Courier New', monospace">Courier New</option>
          </select>
        </div>
        <div className="dashboard-settings-row">
          <label>Font size</label>
          <input
            type="number"
            min="12"
            max="24"
            value={numberValue('fontSize', settings.fontSize ?? 15)}
            onChange={(e) => handleNumberChange('fontSize', e.target.value)}
            onBlur={() => commitNumber('fontSize', 15, (v) => parseInt(v, 10))}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Line height</label>
          <input
            type="number"
            min="1.2"
            max="2.5"
            step="0.1"
            value={numberValue('lineHeight', settings.lineHeight ?? 1.6)}
            onChange={(e) => handleNumberChange('lineHeight', e.target.value)}
            onBlur={() => commitNumber('lineHeight', 1.6)}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Paragraph spacing (rem)</label>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={numberValue('paragraphSpacing', settings.paragraphSpacing ?? 0.5)}
            onChange={(e) => handleNumberChange('paragraphSpacing', e.target.value)}
            onBlur={() => commitNumber('paragraphSpacing', 0.5)}
          />
        </div>
        <div className="dashboard-settings-row">
          <label>Side Margins (rem)</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={numberValue('margin', settings.margin ?? 1.0)}
            onChange={(e) => handleNumberChange('margin', e.target.value)}
            onBlur={() => commitNumber('margin', 1.0)}
          />
        </div>
      </div>
      <div className="dashboard-settings-card">
        <h3>Pronunciation Dictionary</h3>
        <p className="dashboard-settings-hint">Define custom word pronunciations for TTS (one per line: <code>word=pronunciation</code>)</p>
        <textarea
          className="dashboard-settings-textarea"
          value={pronunciationText}
          onChange={(e) => setPronunciationText(e.target.value)}
          onBlur={commitPronunciation}
          rows={6}
          placeholder='{&#10;  "Audire": "aw-deer-ray",&#10;  "TTS": "tee-tee-ess"&#10;}'
        />
      </div>
      <div className="dashboard-settings-card">
        <h3>Storage</h3>
        <p>Books are stored in the cloud. Connect your project to sync across devices.</p>
      </div>
    </div >
  );
}

export default Dashboard;
