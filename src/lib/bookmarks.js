const STORAGE_KEY = 'audire-bookmarks';
const HIGHLIGHTS_KEY = 'audire-highlights';

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', color: '#fef08a' },
  { id: 'green', label: 'Green', color: '#86efac' },
  { id: 'blue', label: 'Blue', color: '#93c5fd' },
  { id: 'pink', label: 'Pink', color: '#f9a8d4' },
  { id: 'purple', label: 'Purple', color: '#c4b5fd' },
];

export function getBookmarks(bookId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return all[bookId] || [];
  } catch (e) {
    return [];
  }
}

export function addBookmark(bookId, { cfi, text }) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const list = all[bookId] || [];
  list.push({ id: Date.now(), cfi, text: (text || '').slice(0, 100), createdAt: new Date().toISOString() });
  all[bookId] = list;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return list;
}

export function removeBookmark(bookId, bookmarkId) {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const list = (all[bookId] || []).filter(b => b.id !== bookmarkId);
  all[bookId] = list;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return list;
}

export function getHighlights(bookId) {
  try {
    const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
    return all[bookId] || [];
  } catch (e) {
    return [];
  }
}

export function addHighlight(bookId, { cfi, text, color = 'yellow' }) {
  const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
  const list = all[bookId] || [];
  list.push({ id: Date.now(), cfi, text: (text || '').slice(0, 200), color, createdAt: new Date().toISOString() });
  all[bookId] = list;
  localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
  return list;
}

export function removeHighlight(bookId, highlightId) {
  const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
  const list = (all[bookId] || []).filter(h => h.id !== highlightId);
  all[bookId] = list;
  localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
  return list;
}

export function updateHighlightColor(bookId, highlightId, color) {
  const all = JSON.parse(localStorage.getItem(HIGHLIGHTS_KEY) || '{}');
  const list = (all[bookId] || []).map(h => (h.id === highlightId ? { ...h, color } : h));
  all[bookId] = list;
  localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
  return list;
}
