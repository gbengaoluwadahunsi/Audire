import React, { useState, useEffect, useRef, useCallback } from 'react';
import Reader from './Reader';
import { usePlayback } from '../context/PlaybackContext';
import { BookOpen, LayoutGrid, X, Plus } from 'lucide-react';

/**
 * N-pane split view (N = 1 … 4).
 *
 * Each slot (A, B, C, D) is a stable identity for a reader — slots never
 * swap positions so a reader is never unmounted (and never stops reading
 * aloud) just because panes were rearranged.
 *
 * Props
 * -----
 * paneBooks     – array of exactly 4 entries; each is a book object or null.
 *                 Index 0→A, 1→B, 2→C, 3→D.
 * appSlot       – 'A'|'B'|'C'|'D'|null — which slot shows the app shell.
 * appContent    – the React element to render in the app pane.
 * onOpenBook    – (book) => void
 * onChangeBook  – (slot) => void   – open picker to change this pane's book
 * onClosePane   – (slot) => void
 * onMaximizePane– (slot) => void   – keep this pane, close all others
 * onShowApp     – (slot) => void   – show app shell in this pane
 * onReadBook    – (slot) => void   – switch this pane back to reading mode
 * onAddPane     – () => void       – open picker to add a new pane
 * onProgressUpdate – (bookId, cfi) => void
 * addToast      – (msg, type) => void
 */

const SLOTS = ['A', 'B', 'C', 'D'];
const slotIndex = (slot) => SLOTS.indexOf(slot);

function SplitView({
  paneBooks,           // [bookA, bookB, bookC, bookD] — always length 4
  appSlot = null,
  appContent,
  onOpenBook,
  onChangeBook,
  onClosePane,
  onMaximizePane,
  onShowApp,
  onReadBook,
  onAddPane,           // () => void
  onProgressUpdate,
  addToast,
}) {
  const { currentBook, setCurrentBook } = usePlayback();

  // Derive active slots (those with a book OR the app slot)
  const activeSlots = SLOTS.filter((slot) => {
    const idx = slotIndex(slot);
    return paneBooks[idx] != null || slot === appSlot;
  });
  const activePaneCount = activeSlots.length;
  const isSplit = activePaneCount > 1;
  const canAddPane = activePaneCount < 4;

  // Set default TTS book
  useEffect(() => {
    const firstBook = paneBooks.find(Boolean);
    if (!currentBook && firstBook) setCurrentBook(firstBook);
  }, [paneBooks, currentBook, setCurrentBook]);

  // Pane widths — one entry per active slot, sum = 100
  const [widths, setWidths] = useState(() => {
    const n = Math.max(activePaneCount, 1);
    return Array(4).fill(100 / n);
  });

  // Re-distribute widths when the number of active panes changes
  const prevCountRef = useRef(activePaneCount);
  useEffect(() => {
    if (prevCountRef.current !== activePaneCount) {
      prevCountRef.current = activePaneCount;
      const n = Math.max(activePaneCount, 1);
      setWidths(Array(4).fill(100 / n));
    }
  }, [activePaneCount]);

  // Tell pdf.js / epub.js to re-paginate after layout changes
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(id);
  }, [activePaneCount, appSlot]);

  // Drag state
  const draggingRef = useRef(null); // { leftSlotIdx, rightSlotIdx, startX, startLeftW, startRightW }

  const handleResizerMouseDown = useCallback((e, leftActiveIdx, rightActiveIdx) => {
    e.preventDefault();
    const leftSlot = activeSlots[leftActiveIdx];
    const rightSlot = activeSlots[rightActiveIdx];
    draggingRef.current = {
      leftSlotIdx: slotIndex(leftSlot),
      rightSlotIdx: slotIndex(rightSlot),
      startX: e.clientX,
      startLeftW: widths[slotIndex(leftSlot)],
      startRightW: widths[slotIndex(rightSlot)],
    };
    document.body.style.cursor = 'col-resize';
  }, [activeSlots, widths]);

  useEffect(() => {
    const MIN_W = 15; // minimum pane width %

    const onMouseMove = (e) => {
      const d = draggingRef.current;
      if (!d) return;
      const totalW = window.innerWidth;
      const deltaPct = ((e.clientX - d.startX) / totalW) * 100;
      let newLeft = d.startLeftW + deltaPct;
      let newRight = d.startRightW - deltaPct;
      if (newLeft < MIN_W) { newRight += newLeft - MIN_W; newLeft = MIN_W; }
      if (newRight < MIN_W) { newLeft += newRight - MIN_W; newRight = MIN_W; }
      setWidths((prev) => {
        const next = [...prev];
        next[d.leftSlotIdx] = newLeft;
        next[d.rightSlotIdx] = newRight;
        return next;
      });
    };

    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        document.body.style.cursor = 'default';
        window.dispatchEvent(new Event('resize'));
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const renderTopBar = (slot, kind, book) => {
    return (
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
          {canAddPane && (
            <button
              type="button"
              className="split-pane-mode-btn split-pane-add-btn"
              onClick={onAddPane}
              title="Add another book side by side (up to 4)"
            >
              <Plus size={14} />
              <span>Add Book</span>
            </button>
          )}
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
  };

  const renderPane = (slot, activeIdx) => {
    const idx = slotIndex(slot);
    const book = paneBooks[idx];
    const isApp = slot === appSlot;
    const kind = isApp ? 'app' : (book ? 'book' : null);
    if (!kind) return null;

    const widthPct = isSplit ? widths[idx] : 100;

    return (
      <div
        key={`pane-${slot}`}
        className={[
          'split-pane',
          kind === 'book' && currentBook?.id === book?.id ? 'active-pane' : '',
          kind === 'app' ? 'split-pane-app-mode' : '',
        ].filter(Boolean).join(' ')}
        style={{ width: `${widthPct}%` }}
        onPointerDownCapture={() => {
          if (kind === 'book' && book && currentBook?.id !== book.id) setCurrentBook(book);
        }}
      >
        {isSplit && renderTopBar(slot, kind, book)}
        <div className="split-pane-body">
          {kind === 'book' ? (
            <Reader
              bookData={book}
              onBack={() => onClosePane(slot)}
              onOpenBook={onOpenBook}
              inSplitView={isSplit}
              onSplitScreen={isSplit ? () => onMaximizePane(slot) : onAddPane}
              onAddPane={canAddPane ? onAddPane : null}
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
    <div className={['split-view-container', isSplit ? 'is-split' : ''].filter(Boolean).join(' ')}>
      {activeSlots.map((slot, i) => (
        <React.Fragment key={slot}>
          {renderPane(slot, i)}
          {i < activeSlots.length - 1 && (
            <div
              key={`resizer-${i}`}
              className="split-resizer"
              onMouseDown={(e) => handleResizerMouseDown(e, i, i + 1)}
            >
              <div className="split-resizer-handle" />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default SplitView;
