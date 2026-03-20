import {
  isLibrarySyncConfigured,
  librarySyncFetchBookmarks,
  librarySyncCreateBookmark,
  librarySyncDeleteBookmark,
  librarySyncFetchHighlights,
  librarySyncCreateHighlight,
  librarySyncUpdateHighlightColor,
  librarySyncDeleteHighlight,
} from './api.js';

const STORAGE_KEY = 'audire-bookmarks';
const HIGHLIGHTS_KEY = 'audire-highlights';

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', color: '#fef08a' },
  { id: 'green', label: 'Green', color: '#86efac' },
  { id: 'blue', label: 'Blue', color: '#93c5fd' },
  { id: 'pink', label: 'Pink', color: '#f9a8d4' },
  { id: 'purple', label: 'Purple', color: '#c4b5fd' },
];

function getBookmarksLocal(bookId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[bookId] || [];
  } catch {
    return [];
  }
}

function getHighlightsLocal(bookId) {
  try {
    const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
    return all[bookId] || [];
  } catch {
    return [];
  }
}

/** Normalize server row to same shape as legacy local items */
function normalizeBookmark(b) {
  return {
    id: b.id,
    cfi: b.cfi,
    text: b.text ?? '',
    createdAt: b.createdAt,
  };
}

function normalizeHighlight(h) {
  return {
    id: h.id,
    cfi: h.cfi,
    text: h.text ?? '',
    color: h.color || 'yellow',
    createdAt: h.createdAt,
  };
}

export async function getBookmarks(bookId) {
  if (!isLibrarySyncConfigured()) return getBookmarksLocal(bookId);
  try {
    const rows = await librarySyncFetchBookmarks(bookId);
    return Array.isArray(rows) ? rows.map(normalizeBookmark) : [];
  } catch {
    return getBookmarksLocal(bookId);
  }
}

export async function addBookmark(bookId, { cfi, text }) {
  if (!isLibrarySyncConfigured()) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const list = all[bookId] || [];
    list.push({ id: Date.now(), cfi, text: (text || '').slice(0, 100), createdAt: new Date().toISOString() });
    all[bookId] = list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return list;
  }
  const created = await librarySyncCreateBookmark(bookId, { cfi, text: (text || '').slice(0, 500) });
  return getBookmarks(bookId);
}

export async function removeBookmark(bookId, bookmarkId) {
  if (!isLibrarySyncConfigured()) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const list = (all[bookId] || []).filter((b) => b.id !== bookmarkId);
    all[bookId] = list;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return list;
  }
  await librarySyncDeleteBookmark(bookmarkId);
  return getBookmarks(bookId);
}

export async function getHighlights(bookId) {
  if (!isLibrarySyncConfigured()) return getHighlightsLocal(bookId);
  try {
    const rows = await librarySyncFetchHighlights(bookId);
    return Array.isArray(rows) ? rows.map(normalizeHighlight) : [];
  } catch {
    return getHighlightsLocal(bookId);
  }
}

export async function addHighlight(bookId, { cfi, text, color = 'yellow' }) {
  if (!isLibrarySyncConfigured()) {
    const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
    const list = all[bookId] || [];
    list.push({ id: Date.now(), cfi, text: (text || '').slice(0, 200), color, createdAt: new Date().toISOString() });
    all[bookId] = list;
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
    return list;
  }
  await librarySyncCreateHighlight(bookId, { cfi, text: (text || '').slice(0, 2000), color });
  return getHighlights(bookId);
}

export async function removeHighlight(bookId, highlightId) {
  if (!isLibrarySyncConfigured()) {
    const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
    const list = (all[bookId] || []).filter((h) => h.id !== highlightId);
    all[bookId] = list;
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
    return list;
  }
  await librarySyncDeleteHighlight(highlightId);
  return getHighlights(bookId);
}

export async function updateHighlightColor(bookId, highlightId, color) {
  if (!isLibrarySyncConfigured()) {
    const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
    const list = (all[bookId] || []).map((h) => (h.id === highlightId ? { ...h, color } : h));
    all[bookId] = list;
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
    return list;
  }
  await librarySyncUpdateHighlightColor(highlightId, color);
  return getHighlights(bookId);
}
