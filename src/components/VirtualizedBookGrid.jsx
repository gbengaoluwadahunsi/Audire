import React from 'react';
import { FileText, Trash2, FolderPlus, Edit } from 'lucide-react';

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
  if (books.length === 0) return null;

  return (
    <div className="dashboard-grid">
      {books.map((book) => {
        const progress = getProgressPercent(book);

        return (
          <div
            key={book.id}
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
        );
      })}
    </div>
  );
}

export default React.memo(VirtualizedBookGrid);
