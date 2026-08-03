import React, { useState, useEffect, useRef } from 'react';
import Reader from './Reader';
import { usePlayback } from '../context/PlaybackContext';
import { BookOpen, LayoutGrid, X, ArrowLeftRight } from 'lucide-react';

/**
 * Two interchangeable panes. Each one can hold a book or the app itself
 * (library, collections, settings…), and either side can be either thing.
 *
 * Two slots — A and B — own the state; `swapped` only flips which side they are
 * drawn on. Books therefore never move between slots, which matters because
 * Reader stops TTS when it unmounts: keeping a reader in its slot is what lets a
 * book keep reading aloud while you rearrange the panes around it.
 *
 * This component also stays mounted when only one pane is open, so opening and
 * closing the split never remounts the surviving reader.
 */
function SplitView({
  bookA,
  bookB,
  appSlot = null, // 'A' | 'B' | null — which slot shows the app instead of a book
  appContent,
  swapped = false,
  onOpenBook,
  onChangeBook, // (slot) => void
  onClosePane, // (slot) => void
  onMaximizePane, // (slot) => void — keep this pane, close the other
  onShowApp, // (slot) => void — put the app on this pane's side
  onReadBook, // (slot) => void — put a book back on this pane's side
  onSwapSides,
  onRequestSplit, // opening a split from a solo pane
  onProgressUpdate,
  addToast,
}) {
  const { currentBook, setCurrentBook } = usePlayback();

  // The app pane only earns its place while the other slot is actually reading.
  const appOn = ((appSlot === 'A' && bookB) || (appSlot === 'B' && bookA)) ? appSlot : null;
  const paneKind = {
    A: appOn === 'A' ? 'app' : (bookA ? 'book' : null),
    B: appOn === 'B' ? 'app' : (bookB ? 'book' : null),
  };
  const splitActive = !!paneKind.A && !!paneKind.B;

  // By default, make the first available book the active context for TTS
  useEffect(() => {
    const fallback = bookA || bookB;
    if (!currentBook && fallback) {
      setCurrentBook(fallback);
    }
  }, [bookA, bookB, currentBook, setCurrentBook]);

  const [splitRatio, setSplitRatio] = useState(50);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const width = window.innerWidth;
      // splitRatio is always slot A's share; when the panes are swapped, slot A
      // is the one on the right, so the pointer position has to be mirrored.
      let newRatio = (e.clientX / width) * 100;
      if (swapped) newRatio = 100 - newRatio;
      if (newRatio < 20) newRatio = 20;
      if (newRatio > 80) newRatio = 80;
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
        // Dispatch a resize event so that pdf.js or epub.js recalculates layout
        window.dispatchEvent(new Event('resize'));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [swapped]);

  // The panes changed shape — let pdf.js / epub.js re-paginate.
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [splitActive, appSlot, swapped]);

  const renderTopBar = (slot, kind, book) => (
    <div className="split-pane-top-bar">
      <div className="split-pane-title">
        {kind === 'book' ? (
          <span><BookOpen size={14} /> {book?.title || 'Book'}</span>
        ) : (
          <span><LayoutGrid size={14} /> App &amp; Library</span>
        )}
      </div>
      <div className="split-pane-actions">
        {kind === 'book' ? (
          <>
            <button
              type="button"
              className="split-pane-mode-btn"
              onClick={() => onShowApp(slot)}
              title="Show the app & library on this side"
            >
              <LayoutGrid size={14} />
              <span>Browse App</span>
            </button>
            <button
              type="button"
              className="split-pane-mode-btn"
              onClick={() => onChangeBook(slot)}
              title="Change the book in this pane"
            >
              Change Book
            </button>
          </>
        ) : (
          <button
            type="button"
            className="split-pane-mode-btn"
            onClick={() => onReadBook(slot)}
            title="Read a book on this side"
          >
            <BookOpen size={14} />
            <span>Read Book</span>
          </button>
        )}
        <button
          type="button"
          className="split-pane-icon-btn"
          onClick={onSwapSides}
          title="Swap the two panes"
        >
          <ArrowLeftRight size={14} />
        </button>
        <button
          type="button"
          className="split-pane-close-btn"
          onClick={() => onClosePane(slot)}
          title="Close this pane"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );

  const renderPane = (slot) => {
    const kind = paneKind[slot];
    if (!kind) return null;
    const book = slot === 'A' ? bookA : bookB;
    const share = slot === 'A' ? splitRatio : 100 - splitRatio;

    return (
      <div
        key={`pane-${slot}`}
        className={[
          'split-pane',
          kind === 'book' && currentBook?.id === book?.id ? 'active-pane' : '',
          kind === 'app' ? 'split-pane-app-mode' : '',
        ].filter(Boolean).join(' ')}
        style={{ width: splitActive ? `${share}%` : '100%' }}
        onPointerDownCapture={() => {
          if (kind === 'book' && book && currentBook?.id !== book.id) setCurrentBook(book);
        }}
      >
        {splitActive && renderTopBar(slot, kind, book)}
        <div className="split-pane-body">
          {kind === 'book' ? (
            <Reader
              bookData={book}
              onBack={() => onClosePane(slot)}
              onOpenBook={onOpenBook}
              inSplitView={splitActive}
              onSplitScreen={splitActive ? () => onMaximizePane(slot) : onRequestSplit}
              onProgressUpdate={onProgressUpdate}
              addToast={addToast}
            />
          ) : (
            <div className="split-pane-app-body">{appContent}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={[
        'split-view-container',
        splitActive ? 'is-split' : '',
        swapped ? 'is-swapped' : '',
      ].filter(Boolean).join(' ')}
    >
      {renderPane('A')}

      {splitActive && (
        <div
          key="resizer"
          className="split-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
          }}
        >
          <div className="split-resizer-handle" />
        </div>
      )}

      {renderPane('B')}
    </div>
  );
}

export default SplitView;
