/**
 * Audire — Personal reading app. Routes: / (landing), /library (app), /library/reader (reader).
 * No authentication or pricing — for personal use.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Header from './components/Header';
import Home from './components/Home';
import MiniPlayer from './components/MiniPlayer';
import Reader from './components/Reader';
import BookDetail from './components/BookDetail';
import OpdsCatalog from './components/OpdsCatalog';
import Settings from './components/Settings';
import HelpPage from './components/HelpPage';
import { PlaybackProvider, usePlayback } from './context/PlaybackContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { getLibrary, addToLibrary, storeCover, storeFile, toggleFavorite, removeFromLibrary } from './lib/state';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import { isSupported, supportedExtensions } from './lib/bookFormats';
import { createBook } from './lib/parsers';

function GlobalMiniPlayer() {
  const navigate = useNavigate();
  const { nowPlaying, setNowPlaying, playbackQueue, setPlaybackQueue } = usePlayback();
  if (!nowPlaying) return null;
  return (
    <MiniPlayer
      book={nowPlaying}
      queue={playbackQueue.filter((b) => b.name !== nowPlaying.name || b.size !== nowPlaying.size)}
      onClose={() => setNowPlaying(null)}
      onOpen={() => navigate('/library/book', { state: { book: nowPlaying } })}
      onPlay={() => navigate('/library/reader', { state: { book: nowPlaying, autoPlay: true } })}
      onPlayFromQueue={(b) => {
        setNowPlaying(b);
        setPlaybackQueue((q) => q.filter((x) => x.name !== b.name || x.size !== b.size));
        navigate('/library/reader', { state: { book: b, autoPlay: true } });
      }}
    />
  );
}

function LibraryView() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const openFile = useCallback(() => fileInputRef.current?.click(), []);
  const { addToast } = useToast();

  const [library, setLibrary] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const { nowPlaying, setNowPlaying, playbackQueue, setPlaybackQueue } = usePlayback();
  const [showCatalog, setShowCatalog] = useState(false);
  const [bookToDelete, setBookToDelete] = useState(null);

  useEffect(() => {
    setLibrary(getLibrary());
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const name = file.name || 'Untitled';
    const size = file.size || 0;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!isSupported(ext)) {
      addToast({ type: 'error', title: 'Unsupported format', message: `"${name}" is not supported. Use PDF, EPUB, TXT, or DOCX.` });
      return;
    }
    
    // Show loading toast
    const loadingId = `upload-${Date.now()}`;
    addToast({ id: loadingId, type: 'info', title: 'Uploading...', message: `Processing "${name}"...`, duration: 0 });
    
    const fallbackTitle = name.replace(/\.[^.]+$/, '');
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not read the file.' });
      return;
    }

    // Store file FIRST — parsers (pdf.js) can detach/transfer the ArrayBuffer
    const stored = await storeFile(name, size, buffer.slice(0));
    if (!stored) {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not save the file. Storage may be full — try removing a book or freeing space.' });
      return;
    }

    let bookTitle = fallbackTitle;
    let bookAuthor = '';
    let totalPages = 0;
    try {
      const book = createBook(name);
      await book.open(buffer);
      const meta = await book.metadata();
      totalPages = book.pages || 0;
      bookTitle = (meta?.title || fallbackTitle).trim() || fallbackTitle;
      bookAuthor = (meta?.author || '').trim();
      let coverUrl = null;
      if (typeof book.coverImage === 'function') {
        try { coverUrl = await book.coverImage(); } catch { /* ignore */ }
      }
      if (coverUrl) await storeCover(name, size, coverUrl);
      if (typeof book.close === 'function') book.close();
    } catch {
      // Metadata extraction failed — file is already stored, add with fallback info
    }

    try {
      const added = addToLibrary({
        name,
        size,
        title: bookTitle,
        author: bookAuthor,
        format: ext,
        totalPages,
        currentPage: 1,
      });
      setLibrary(added);
      
      // Warn if approaching library limit
      if (added.length >= 45) {
        addToast({ type: 'warning', title: 'Library full soon', message: `You have ${added.length}/50 books. You can add ${50 - added.length} more before the limit.` });
      } else {
        addToast({ type: 'success', title: 'Book added', message: `${bookTitle} added to your library.` });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Upload failed', message: err?.message || 'Could not add book to library.' });
    }
  }, [addToast]);

  const handleOpenBook = useCallback((book) => {
    navigate('/library/book', { state: { book } });
  }, [navigate]);

  const handleAddBookFromOpds = useCallback(async (buffer, name, meta = {}) => {
    const size = buffer.byteLength;
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!isSupported(ext)) {
      addToast({ type: 'error', title: 'Unsupported format', message: `"${name}" is not a supported format.` });
      return;
    }
    const fallbackTitle = meta.title || name.replace(/\.[^.]+$/, '');

    const stored = await storeFile(name, size, buffer.slice(0));
    if (!stored) {
      addToast({ type: 'error', title: 'Download failed', message: 'Could not save the file. Storage may be full.' });
      return;
    }

    let bookTitle = fallbackTitle;
    let bookAuthor = meta.author || '';
    let totalPages = 0;
    try {
      const book = createBook(name);
      await book.open(buffer);
      const md = await book.metadata();
      totalPages = book.pages || 0;
      bookTitle = (meta.title || md?.title || fallbackTitle).trim();
      bookAuthor = (meta.author || md?.author || '').trim();
      let coverUrl = null;
      if (typeof book.coverImage === 'function') {
        try { coverUrl = await book.coverImage(); } catch { /* ignore */ }
      }
      if (coverUrl) await storeCover(name, size, coverUrl);
      if (typeof book.close === 'function') book.close();
    } catch { /* metadata extraction failed — file already stored */ }

    try {
      const added = addToLibrary({ name, size, title: bookTitle, author: bookAuthor, format: ext, totalPages, currentPage: 1 });
      setLibrary(added);
      addToast({ type: 'success', title: 'Book added', message: `${bookTitle} added to your library.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Download failed', message: err?.message || 'Could not add book to library.' });
    }
  }, [addToast]);

  return (
    <div className="min-h-screen bg-background-dark">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenFile={openFile}
        onSettings={() => navigate('/settings')}
      />
      <Home
        library={library}
        searchQuery={searchQuery}
        filterType={filterType}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onFilterChange={setFilterType}
        onSearchChange={setSearchQuery}
        onOpenFile={openFile}
        onOpenBook={handleOpenBook}
        onPlayBook={(b) => {
          setNowPlaying(b);
          navigate('/library/reader', { state: { book: b, autoPlay: true } });
        }}
        onFileDrop={handleFile}
        onOpenCatalog={() => setShowCatalog(true)}
        onToggleFavorite={(b) => {
          toggleFavorite(b.name, b.size);
          setLibrary(getLibrary());
        }}
        onAddToQueue={(b) => setPlaybackQueue((q) => (q.some((x) => x.name === b.name && x.size === b.size) ? q : [...q, b]))}
        onRemoveBook={setBookToDelete}
        playbackQueue={playbackQueue}
        nowPlaying={nowPlaying}
      />
      {showCatalog && <OpdsCatalog onClose={() => setShowCatalog(false)} onAddBook={handleAddBookFromOpds} />}
      <ConfirmDeleteModal
        isOpen={!!bookToDelete}
        book={bookToDelete ? { title: bookToDelete.title, author: bookToDelete.author, name: bookToDelete.name, size: bookToDelete.size, coverUrl: bookToDelete.coverUrl } : null}
        onConfirm={() => {
          if (bookToDelete) {
            removeFromLibrary(bookToDelete.name, bookToDelete.size);
            setLibrary(getLibrary());
            setBookToDelete(null);
          }
        }}
        onCancel={() => setBookToDelete(null)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={supportedExtensions().map((e) => `.${e}`).join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function BookDetailView() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const book = state?.book;
  const { setPlaybackQueue } = usePlayback();
  return (
    <BookDetail
      onStartReading={(b) => navigate('/library/reader', { state: { book: b } })}
      onAddToQueue={(b) => setPlaybackQueue((q) => (q.some((x) => x.name === b.name && x.size === b.size) ? q : [...q, b]))}
    />
  );
}

function ReaderView() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const book = state?.book;
  const autoPlay = state?.autoPlay === true;
  useEffect(() => {
    if (!book) navigate('/library', { replace: true });
  }, [book, navigate]);
  if (!book) return null;
  return (
    <Reader
      book={book}
      onBack={() => navigate('/library')}
      autoPlay={autoPlay}
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <PlaybackProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/library/book" element={<BookDetailView />} />
            <Route path="/library/reader" element={<ReaderView />} />
          </Routes>
          <GlobalMiniPlayer />
        </PlaybackProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
