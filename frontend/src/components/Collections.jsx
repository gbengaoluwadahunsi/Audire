import { useState, useEffect } from 'react';
import {
  getCollectionsLocal,
  createCollectionLocal,
  deleteCollectionLocal,
  addBookToCollectionLocal,
  removeBookFromCollectionLocal,
} from '../lib/state';

const COLORS = [
  { name: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/50' },
  { name: 'purple', bg: 'bg-secondary-purple/20', border: 'border-secondary-purple/50' },
  { name: 'green', bg: 'bg-secondary-green/20', border: 'border-secondary-green/50' },
  { name: 'red', bg: 'bg-red-500/20', border: 'border-red-500/50' },
  { name: 'orange', bg: 'bg-orange-500/20', border: 'border-orange-500/50' },
  { name: 'pink', bg: 'bg-pink-500/20', border: 'border-pink-500/50' },
];

export default function Collections({ isOpen, onClose, library = [] }) {
  const [collections, setCollections] = useState([]);
  const [loading] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionColor, setNewCollectionColor] = useState('blue');
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [dragOverCollectionId, setDragOverCollectionId] = useState(null);
  const [slideIn, setSlideIn] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)));
    return () => cancelAnimationFrame(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    loadCollections();
  }, [isOpen]);

  const loadCollections = () => {
    setCollections(getCollectionsLocal());
  };

  const handleCreateCollection = (e) => {
    e.preventDefault();
    if (!newCollectionName.trim()) return;
    const id = crypto.randomUUID();
    createCollectionLocal(id, { name: newCollectionName, color: newCollectionColor });
    setNewCollectionName('');
    setNewCollectionColor('blue');
    setShowAddForm(false);
    loadCollections();
  };

  const handleDeleteCollection = (collId) => {
    if (!window.confirm('Delete this collection?')) return;
    deleteCollectionLocal(collId);
    loadCollections();
  };

  const handleAddBookToCollection = (collId, bookName, bookSize) => {
    addBookToCollectionLocal(collId, bookName, bookSize);
    loadCollections();
  };

  const handleRemoveBookFromCollection = (collId, bookName, bookSize) => {
    removeBookFromCollectionLocal(collId, bookName, bookSize);
    loadCollections();
  };

  const handleCollectionDragOver = (e, collId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCollectionId(collId);
  };

  const handleCollectionDragLeave = (e, collId) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverCollectionId((id) => (id === collId ? null : id));
  };

  const handleCollectionDrop = (e, collId) => {
    e.preventDefault();
    setDragOverCollectionId(null);
    const raw = e.dataTransfer.getData('application/x-audire-book');
    if (!raw) return;
    try {
      const { name, size } = JSON.parse(raw);
      if (name) handleAddBookToCollection(collId, name, size);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-card-dark border-l border-border-dark shadow-2xl w-full max-w-md sm:max-w-lg h-full flex flex-col transition-transform duration-200 ease-out ${slideIn ? 'translate-x-0' : 'translate-x-full'}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-dark shrink-0">
          <h2 className="text-xl font-bold text-white">Collections & Shelves</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="px-4 pb-3 text-slate-400 text-sm shrink-0">Drag books from the library and drop them into a folder below to group them.</p>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-slate-400">Loading...</p>}

          {/* Create New Collection */}
          {showAddForm ? (
            <form onSubmit={handleCreateCollection} className="mb-6 p-4 bg-surface rounded-lg border border-border-dark">
              <input
                type="text"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Collection name..."
                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2.5 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary mb-3"
                disabled={loading}
                autoFocus
              />
              <div className="mb-3">
                <label className="text-sm text-slate-400 block mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setNewCollectionColor(color.name)}
                      className={`w-8 h-8 rounded-full ${color.bg} border-2 ${newCollectionColor === color.name ? color.border : 'border-transparent'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-surface hover:bg-surface-elevated text-slate-300 font-semibold py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full mb-6 flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/50 rounded-lg py-2.5 text-primary font-semibold transition-colors"
            >
              <span className="material-symbols-outlined">add</span>
              New collection
            </button>
          )}

          {/* Collections List */}
          {collections.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No collections yet. Create one to organize your library!</p>
          ) : (
            <div className="space-y-4">
              {collections.map((coll) => {
                const collColor = COLORS.find(c => c.name === coll.color) || COLORS[0];
                const booksInColl = coll.books || [];
                const isDropTarget = dragOverCollectionId === coll.id;
                return (
                  <div
                    key={coll.id}
                    className={`border-2 rounded-lg p-4 transition-all ${collColor.border} ${collColor.bg} ${isDropTarget ? 'ring-2 ring-primary ring-offset-2 ring-offset-card-dark scale-[1.02]' : ''}`}
                    onDragOver={(e) => handleCollectionDragOver(e, coll.id)}
                    onDragLeave={(e) => handleCollectionDragLeave(e, coll.id)}
                    onDrop={(e) => handleCollectionDrop(e, coll.id)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-white">{coll.name}</h3>
                      <button
                        type="button"
                        onClick={() => handleDeleteCollection(coll.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                        aria-label="Delete collection"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                    <p className="text-slate-400 text-sm mb-3">{booksInColl.length} book{booksInColl.length !== 1 ? 's' : ''}</p>

                    {/* Books in collection */}
                    {booksInColl.length > 0 && (
                      <div className="mb-3 space-y-1">
                        {booksInColl.map((bookName) => (
                          <div key={bookName} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-slate-300">{library.find(b => b.name === bookName)?.title || bookName}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveBookFromCollection(coll.id, bookName)}
                              className="text-slate-500 hover:text-red-400 text-xs"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add book to collection */}
                    {selectedCollection === coll.id && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddBookToCollection(coll.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                        className="w-full bg-background-dark border border-border-dark rounded px-2 py-1 text-white text-sm"
                      >
                        <option value="">Add book...</option>
                        {library
                          .filter(b => !booksInColl.includes(b.name))
                          .map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.title}
                            </option>
                          ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCollection(selectedCollection === coll.id ? null : coll.id)}
                      className="text-xs text-primary hover:text-primary-hover font-semibold mt-2"
                    >
                      {selectedCollection === coll.id ? 'Done' : '+ Add book'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
