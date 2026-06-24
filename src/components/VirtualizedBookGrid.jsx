import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Grid } from 'react-window';
import { FileText, Trash2, FolderPlus, Edit } from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

const CARD_MIN_WIDTH = 180;
const CARD_GAP = 24;
const CARD_HEIGHT = 260;

function VirtualizedBookGrid({
  books,
  selectedBookIds,
  onToggleSelect,
  onSelectBook,
  onDelete,
  onAddToCollection,
  onEditMetadata,
  coverErrorIds,
  onCoverError,
  onCoverRepair,
  getProgressPercent,
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setDimensions({ width, height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columnCount = Math.max(1, Math.floor((dimensions.width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));
  const columnWidth = (dimensions.width - CARD_GAP * (columnCount - 1)) / columnCount;
  const rowCount = Math.ceil(books.length / columnCount);

  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const bookIndex = rowIndex * columnCount + columnIndex;
    const book = books[bookIndex];
    if (!book) return null;

    return (
      <div style={{ ...style, paddingLeft: CARD_GAP / 2, paddingRight: CARD_GAP / 2, paddingBottom: CARD_GAP }}>
        <div
          className={`dashboard-book-card ${selectedBookIds.has(book.id) ? 'selected' : ''}`}
          onClick={(e) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey || selectedBookIds.size > 0) {
              e.preventDefault();
              onToggleSelect(book.id);
            } else {
              onSelectBook(book);
            }
          }}
        >
          <div className="dashboard-book-cover">
            <input
              type="checkbox"
              className="book-select-checkbox"
              checked={selectedBookIds.has(book.id)}
              onChange={() => onToggleSelect(book.id)}
              onClick={(e) => e.stopPropagation()}
            />
            {book.cover && !coverErrorIds.has(book.id) ? (
              <img
                src={book.cover}
                alt={book.title}
                onError={() => onCoverError(book)}
              />
            ) : (
              <FileText size={40} color="var(--text-tertiary)" />
            )}
            <span className="dashboard-book-badge">{(book.format || 'epub').toUpperCase()}</span>
            <button
              className="dashboard-book-delete"
              onClick={(e) => { e.stopPropagation(); onDelete(book); }}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
            <button
              className="dashboard-book-collection"
              onClick={(e) => { e.stopPropagation(); onEditMetadata(book); }}
              title="Edit metadata"
            >
              <Edit size={14} />
            </button>
            <button
              className="dashboard-book-collection"
              onClick={(e) => { e.stopPropagation(); onAddToCollection(book); }}
              title="Add to collection"
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <div className="dashboard-book-info">
            <h3>{book.title}</h3>
            <p>{book.author || 'Unknown'}</p>
          </div>
          {(book.last_cfi || book.progress_percent != null) && getProgressPercent(book) > 0 && (
            <div className="dashboard-book-progress">
              <div
                className="dashboard-book-progress-fill"
                style={{ width: `${getProgressPercent(book)}%` }}
              />
              <span className="dashboard-book-progress-label">{Math.round(getProgressPercent(book))}%</span>
            </div>
          )}
        </div>
      </div>
    );
  }, [books, selectedBookIds, columnCount, coverErrorIds, onToggleSelect, onSelectBook, onDelete, onAddToCollection, onEditMetadata, onCoverError, onCoverRepair, getProgressPercent]);

  if (books.length === 0) return null;

  const gridHeight = Math.min(dimensions.height || 600, rowCount * (CARD_HEIGHT + CARD_GAP));

  return (
    <div ref={containerRef} className="virtualized-grid-container" style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      {dimensions.width > 0 && (
        <Grid
          columnCount={columnCount}
          columnWidth={columnWidth + CARD_GAP}
          height={gridHeight}
          rowCount={rowCount}
          rowHeight={CARD_HEIGHT + CARD_GAP}
          width={dimensions.width}
          overscanRowCount={2}
        >
          {Cell}
        </Grid>
      )}
    </div>
  );
}

export default React.memo(VirtualizedBookGrid);
