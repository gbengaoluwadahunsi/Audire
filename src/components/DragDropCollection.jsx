import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, GripVertical } from 'lucide-react';

function SortableBookCard({
  book,
  coverErrorIds,
  onCoverError,
  onRemove,
  onDelete,
  onSelectBook,
  onUndoRemove,
  collectionId,
  getProgressPercent,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} className="dashboard-book-card collection-book-card" onClick={() => onSelectBook(book)}>
      <div className="dashboard-book-cover">
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
        {getProgressPercent && getProgressPercent(book) >= 99.5 && (
          <span className="dashboard-book-done-badge">DONE</span>
        )}
        <button
          className="drag-handle"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>
      </div>
      <div className="dashboard-book-info">
        <h3>{book.title}</h3>
        <p>{book.author || 'Unknown'}</p>
      </div>
      <div className="collection-book-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="collection-book-action"
          onClick={() => onRemove(book)}
          title="Remove from this collection"
        >
          Remove
        </button>
        <button
          type="button"
          className="collection-book-action danger"
          onClick={() => onDelete(book)}
          title="Delete book from library"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function DragDropCollection({
  bookIds,
  books,
  collectionId,
  onReorder,
  onRemoveBook,
  onDeleteBook,
  onSelectBook,
  coverErrorIds,
  onCoverError,
  searchQuery = '',
  getProgressPercent,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const items = bookIds.filter(bid => {
    const book = books.find(b => b.id === bid);
    if (!book) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (book.title || '').toLowerCase().includes(q) || (book.author || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div className="dashboard-grid collection-detail-grid">
          {items.map(bid => {
            const book = books.find(b => b.id === bid);
            if (!book) return null;
            return (
              <SortableBookCard
                key={book.id}
                book={book}
                coverErrorIds={coverErrorIds}
                onCoverError={onCoverError}
                onRemove={onRemoveBook}
                onDelete={onDeleteBook}
                onSelectBook={onSelectBook}
                collectionId={collectionId}
                getProgressPercent={getProgressPercent}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

export default React.memo(DragDropCollection);
