import {
  isLibrarySyncConfigured,
  librarySyncFetchCollections,
  librarySyncCreateCollection,
  librarySyncDeleteCollection,
  librarySyncAddBookToCollection,
  librarySyncRemoveBookFromCollection,
} from './api.js';

const STORAGE_KEY = 'audire-collections';

function getCollectionsLocal() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCollectionsLocal(collections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

/** Normalize server row { id, name, bookIds } */
function normalizeCollection(c) {
  return {
    id: c.id,
    name: c.name,
    bookIds: Array.isArray(c.bookIds) ? c.bookIds : [],
  };
}

export async function getCollections() {
  if (!isLibrarySyncConfigured()) return getCollectionsLocal();
  try {
    const rows = await librarySyncFetchCollections();
    return Array.isArray(rows) ? rows.map(normalizeCollection) : [];
  } catch {
    return getCollectionsLocal();
  }
}

export async function saveCollections(collections) {
  if (!isLibrarySyncConfigured()) {
    saveCollectionsLocal(collections);
    return;
  }
  // Remote mode: callers should use add/remove APIs; this keeps local backup only
  saveCollectionsLocal(collections);
}

export async function addCollection(name) {
  if (!isLibrarySyncConfigured()) {
    const cols = getCollectionsLocal();
    const id = Date.now();
    cols.push({ id, name, bookIds: [] });
    saveCollectionsLocal(cols);
    return cols;
  }
  const created = await librarySyncCreateCollection(name);
  return getCollections();
}

export async function removeCollection(id) {
  if (!isLibrarySyncConfigured()) {
    const cols = getCollectionsLocal().filter((c) => c.id !== id);
    saveCollectionsLocal(cols);
    return cols;
  }
  await librarySyncDeleteCollection(id);
  return getCollections();
}

export async function addBookToCollection(collectionId, bookId) {
  if (!isLibrarySyncConfigured()) {
    const cols = getCollectionsLocal();
    const c = cols.find((x) => x.id === collectionId);
    if (c && !c.bookIds.includes(bookId)) c.bookIds.push(bookId);
    saveCollectionsLocal(cols);
    return cols;
  }
  await librarySyncAddBookToCollection(collectionId, bookId);
  return getCollections();
}

export async function removeBookFromCollection(collectionId, bookId) {
  if (!isLibrarySyncConfigured()) {
    const cols = getCollectionsLocal();
    const c = cols.find((x) => x.id === collectionId);
    if (c) c.bookIds = c.bookIds.filter((bid) => bid !== bookId);
    saveCollectionsLocal(cols);
    return cols;
  }
  await librarySyncRemoveBookFromCollection(collectionId, bookId);
  return getCollections();
}

export async function getBookCollections(bookId) {
  const all = await getCollections();
  return all.filter((c) => c.bookIds.includes(bookId));
}
