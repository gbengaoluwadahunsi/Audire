import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Grid } from 'react-window';
import { FileText, Trash2, FolderPlus, Edit } from 'lucide-react';

const CARD_MIN_WIDTH = 180;
const CARD_GAP = 24;
const CARD_HEIGHT = 260;

function BookCell({
  columnIndex,
  rowIndex,
  style,
  books,
  columnCount,
  selectedBookIds,
  coverErrorIds,
  onToggleSelect,
  onSelectBook,
  onDelete,
  onAddToCollection,
  onEditMetadata,
  onCoverError,
  getProgressPercent,
}) {
  const bookIndex = rowIndex * columnCount + columnIndex;
  const book = books[bookIndex];
  if (!book) return null;

  const progress = getProgressPercent(book);

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
        {(book.last_cfi || book.progress_percent != null) && progress > 0 && (
          <div className="dashboard-book-progress">
            <div
              className="dashboard-book-progress-fill"
              style={{ width: `${progress}%` }}
            />
            <span className="dashboard-book-progress-label">{Math.round(progress)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const cellProps = useMemo(() => ({
    books,
    columnCount,
    selectedBookIds,
    coverErrorIds,
    onToggleSelect,
    onSelectBook,
    onDelete,
    onAddToCollection,
    onEditMetadata,
    onCoverError,
    getProgressPercent,
  }), [
    books,
    columnCount,
    selectedBookIds,
    coverErrorIds,
    onToggleSelect,
    onSelectBook,
    onDelete,
    onAddToCollection,
    onEditMetadata,
    onCoverError,
    getProgressPercent,
  ]);

  if (books.length === 0) return null;

  const gridHeight = Math.min(dimensions.height || 600, rowCount * (CARD_HEIGHT + CARD_GAP));

  return (
    <div ref={containerRef} className="virtualized-grid-container" style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      {dimensions.width > 0 && (
        <Grid
          cellComponent={BookCell}
          cellProps={cellProps}
          columnCount={columnCount}
          columnWidth={columnWidth + CARD_GAP}
          rowCount={rowCount}
          rowHeight={CARD_HEIGHT + CARD_GAP}
          defaultHeight={gridHeight}
          defaultWidth={dimensions.width}
          style={{ height: gridHeight, width: dimensions.width }}
          overscanCount={2}
        />
      )}
    </div>
  );
}

export default React.memo(VirtualizedBookGrid);
