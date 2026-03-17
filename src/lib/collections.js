const STORAGE_KEY = 'audire-collections';

export function getCollections() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveCollections(collections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

export function addCollection(name) {
  const cols = getCollections();
  const id = Date.now();
  cols.push({ id, name, bookIds: [] });
  saveCollections(cols);
  return cols;
}

export function removeCollection(id) {
  const cols = getCollections().filter(c => c.id !== id);
  saveCollections(cols);
  return cols;
}

export function addBookToCollection(collectionId, bookId) {
  const cols = getCollections();
  const c = cols.find(x => x.id === collectionId);
  if (c && !c.bookIds.includes(bookId)) c.bookIds.push(bookId);
  saveCollections(cols);
  return cols;
}

export function removeBookFromCollection(collectionId, bookId) {
  const cols = getCollections();
  const c = cols.find(x => x.id === collectionId);
  if (c) c.bookIds = c.bookIds.filter(id => id !== bookId);
  saveCollections(cols);
  return cols;
}

export function getBookCollections(bookId) {
  return getCollections().filter(c => c.bookIds.includes(bookId));
}
