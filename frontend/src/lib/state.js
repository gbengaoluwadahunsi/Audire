/**
 * Persistence layer — localStorage for settings, per-book state, and library metadata.
 * IndexedDB for caching opened file buffers.
 */

import { normalizeFormat } from './bookFormats.js';

const SETTINGS_KEY = 'audire_settings';
const BOOKS_KEY = 'audire_books';
const LIBRARY_KEY = 'audire_library';
const DB_NAME = 'audire';
const DB_VERSION = 4;
const FILE_STORE = 'files';
const COVER_STORE = 'covers';
const PAGE_CACHE_STORE = 'page_cache';
const AUDIO_CACHE_STORE = 'audio_cache';

const defaults = { rate: 1.0, volume: 1.0, theme: 'dark', edgeVoice: '', piperVoice: 'lessac', autoSaveIntervalSeconds: 0, fontFamily: 'serif' };

// ── Settings ──

export function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; }
  catch { return { ...defaults }; }
}

export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── Per-book state (position, bookmarks) ──

function allBooks() {
  try { return JSON.parse(localStorage.getItem(BOOKS_KEY)) || {}; } catch { return {}; }
}

function bookKey(name, size) { return `${name}__${Number(size)}`; }

export function loadBook(name, size) {
  return allBooks()[bookKey(name, size)] || { page: 0, sentence: 0, bookmarks: [] };
}

export function saveBook(name, size, state) {
  const all = allBooks();
  all[bookKey(name, size)] = state;
  localStorage.setItem(BOOKS_KEY, JSON.stringify(all));
}

/** Speechify-style: persist reading position (page + sentence for TTS sync). */
export function updateReadingPosition(name, size, { page, sentence }) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [] };
  if (page !== undefined) current.page = page;
  if (sentence !== undefined) current.sentence = sentence;
  saveBook(name, size, current);
}

export function getBookmarks(name, size) {
  return (allBooks()[bookKey(name, size)]?.bookmarks || []).slice();
}

export function addBookmark(name, size, { page, sentence, text }) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [] };
  const bookmarks = current.bookmarks || [];
  bookmarks.push({ page: page ?? current.page, sentence: sentence ?? current.sentence, text: text || '', at: Date.now() });
  current.bookmarks = bookmarks.slice(-50);
  saveBook(name, size, current);
  return current.bookmarks;
}

export function removeBookmark(name, size, index) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [] };
  const bookmarks = (current.bookmarks || []).filter((_, i) => i !== index);
  current.bookmarks = bookmarks;
  saveBook(name, size, current);
  return current.bookmarks;
}

// Highlights and notes (per book)
export function getHighlights(name, size) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [], highlights: [] };
  return (current.highlights || []).slice();
}

export function addHighlight(name, size, { page, sentence_start, sentence_end, text, color, note }) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [], highlights: [] };
  const highlights = current.highlights || [];
  const id = `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  highlights.push({ id, page, sentence_start, sentence_end, text: text || '', color: color || 'yellow', note: note || '', at: Date.now() });
  current.highlights = highlights.slice(-100);
  saveBook(name, size, current);
  return current.highlights;
}

export function updateHighlightNote(name, size, highlightId, note) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [], highlights: [] };
  const highlights = (current.highlights || []).map((h) => (h.id === highlightId ? { ...h, note } : h));
  current.highlights = highlights;
  saveBook(name, size, current);
  return current.highlights;
}

export function removeHighlight(name, size, highlightId) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [], highlights: [] };
  current.highlights = (current.highlights || []).filter((h) => h.id !== highlightId);
  saveBook(name, size, current);
  return current.highlights;
}

export function addRecent(name, size) {
  const s = loadSettings();
  const recent = s.recent || [];
  const key = bookKey(name, size);
  const filtered = recent.filter(r => r.key !== key);
  filtered.unshift({ key, name, size, time: Date.now() });
  s.recent = filtered.slice(0, 20);
  saveSettings(s);
}

export function getRecent() {
  return (loadSettings().recent || []);
}

// ── Library (book card metadata) ──

export function getLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIBRARY_KEY)) || [];
    const seen = new Set();
    const deduped = raw.filter(b => {
      const k = b.key || bookKey(b.name, b.size);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (deduped.length !== raw.length) saveLibrary(deduped);
    return deduped;
  }
  catch { return []; }
}

function saveLibrary(lib) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

export function addToLibrary(item) {
  const lib = getLibrary();
  const key = bookKey(item.name, item.size);
  const idx = lib.findIndex(b => (b.key || bookKey(b.name, b.size)) === key);
  const entry = {
    key,
    name: item.name,
    size: item.size,
    title: item.title || item.name.replace(/\.[^.]+$/, ''),
    author: item.author || '',
    format: normalizeFormat(item.format || item.name.split('.').pop() || ''),
    totalPages: item.totalPages || 0,
    currentPage: item.currentPage || 1,
    progress: item.totalPages > 0 ? Math.round(((item.currentPage || 1) / item.totalPages) * 100) : 0,
    lastRead: Date.now(),
    coverHue: idx >= 0 ? lib[idx].coverHue : Math.floor(Math.random() * 360),
    isFavorite: idx >= 0 ? (lib[idx].isFavorite ?? false) : (item.isFavorite ?? false),
  };
  if (idx >= 0) lib[idx] = entry;
  else lib.unshift(entry);
  
  // Check if adding new book would exceed limit
  if (idx < 0 && lib.length > 50) {
    const trimmed = lib.slice(0, 50);
    try {
      saveLibrary(trimmed);
      console.warn('Library limit reached (50 books). Oldest book was removed.');
      return trimmed;
    } catch (e) {
      throw new Error('Library storage full. Try removing some books or clearing site data.');
    }
  }
  
  try {
    saveLibrary(lib);
  } catch (e) {
    throw new Error('Library storage full. Try removing some books or clearing site data.');
  }
  return lib;
}

export function updateLibraryProgress(name, size, page, totalPages) {
  const lib = getLibrary();
  const key = bookKey(name, size);
  const idx = lib.findIndex(b => b.key === key);
  if (idx >= 0) {
    lib[idx].currentPage = page;
    lib[idx].progress = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
    lib[idx].lastRead = Date.now();
    saveLibrary(lib);
  }
  return lib;
}

export function removeFromLibrary(name, size) {
  const lib = getLibrary();
  const key = bookKey(name, size);
  const filtered = lib.filter(b => b.key !== key);
  saveLibrary(filtered);
  return filtered;
}

export function toggleFavorite(name, size) {
  const lib = getLibrary();
  const key = bookKey(name, size);
  const idx = lib.findIndex(b => b.key === key);
  if (idx >= 0) {
    lib[idx].isFavorite = !lib[idx].isFavorite;
    saveLibrary(lib);
  }
  return lib;
}

// ── Local collections (no auth) ──

const COLLECTIONS_KEY = 'audire_collections';

function getCollectionsRaw() {
  try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY)) || []; } catch { return []; }
}

function saveCollections(collections) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

export function getCollectionsLocal() {
  return getCollectionsRaw().map(c => ({ ...c, books: c.books || [] }));
}

export function createCollectionLocal(id, { name, color }) {
  const list = getCollectionsRaw();
  list.push({ id, name: name || 'New collection', color: color || 'blue', books: [] });
  saveCollections(list);
  return list;
}

export function deleteCollectionLocal(id) {
  const list = getCollectionsRaw().filter(c => c.id !== id);
  saveCollections(list);
  return list;
}

export function addBookToCollectionLocal(collId, bookName, bookSize) {
  const list = getCollectionsRaw();
  const coll = list.find(c => c.id === collId);
  const key = bookKey(bookName, bookSize);
  
  if (!coll) return list;
  
  // Check if book already in collection
  if ((coll.books || []).includes(key)) return list;
  
  // Validate book exists in library
  const lib = getLibrary();
  const bookExists = lib.some(b => bookKey(b.name, b.size) === key);
  if (!bookExists) return list; // Don't add non-existent books
  
  coll.books = [...(coll.books || []), key];
  saveCollections(list);
  return list;
}

export function removeBookFromCollectionLocal(collId, bookName, bookSize) {
  const list = getCollectionsRaw();
  const coll = list.find(c => c.id === collId);
  const key = bookKey(bookName, bookSize);
  if (coll && coll.books) {
    coll.books = coll.books.filter(b => b !== key);
    saveCollections(list);
  }
  return list;
}

// ── Reading summaries (per book). Turn into article, blog, LinkedIn, Twitter, TikTok. ──

const SUMMARIES_KEY = 'audire_summaries';
const ANALYTICS_KEY = 'audire_analytics';
const VOICE_FAVORITES_KEY = 'audire_voice_favorites';

function summariesByBook() {
  try { return JSON.parse(localStorage.getItem(SUMMARIES_KEY)) || {}; } catch { return {}; }
}

function saveSummariesByBook(obj) {
  localStorage.setItem(SUMMARIES_KEY, JSON.stringify(obj));
}

export function getSummaries(name, size) {
  const key = `${name}__${Number(size)}`;
  const byBook = summariesByBook();
  return (byBook[key] || []).slice();
}

export function addSummary(name, size, { text, page }) {
  const key = `${name}__${Number(size)}`;
  const byBook = summariesByBook();
  const list = byBook[key] || [];
  const id = `sum-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  list.push({ id, text: (text || '').trim(), page: page ?? null, at: Date.now() });
  byBook[key] = list.slice(-50);
  saveSummariesByBook(byBook);
  return byBook[key];
}

export function removeSummary(name, size, summaryId) {
  const key = `${name}__${Number(size)}`;
  const byBook = summariesByBook();
  const list = (byBook[key] || []).filter((s) => s.id !== summaryId);
  byBook[key] = list;
  saveSummariesByBook(byBook);
  return list;
}

// ── Reading analytics (local, no auth) ──
function analyticsDefaults() {
  return {
    totalListenSeconds: 0,
    totalWordsHeard: 0,
    dailyListen: {}, // YYYY-MM-DD => seconds
    wpmSamples: [], // last 200 samples
    byBook: {}, // `${name}__${size}` => { listenSeconds, wordsHeard }
  };
}

export function getAnalytics() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANALYTICS_KEY)) || {};
    return { ...analyticsDefaults(), ...raw };
  } catch {
    return analyticsDefaults();
  }
}

export function saveAnalytics(analytics) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
}

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function recordListening(name, size, { seconds = 0, words = 0 } = {}) {
  const sec = Math.max(0, Number(seconds) || 0);
  const wrd = Math.max(0, Number(words) || 0);
  if (sec <= 0 && wrd <= 0) return getAnalytics();

  const analytics = getAnalytics();
  analytics.totalListenSeconds += sec;
  analytics.totalWordsHeard += wrd;
  const day = todayKey();
  analytics.dailyListen[day] = (analytics.dailyListen[day] || 0) + sec;

  const key = `${name}__${Number(size)}`;
  const current = analytics.byBook[key] || { listenSeconds: 0, wordsHeard: 0 };
  current.listenSeconds += sec;
  current.wordsHeard += wrd;
  analytics.byBook[key] = current;

  if (sec > 0 && wrd > 0) {
    const wpm = (wrd / sec) * 60;
    analytics.wpmSamples = [...(analytics.wpmSamples || []), Math.round(wpm)].slice(-200);
  }
  saveAnalytics(analytics);
  return analytics;
}

function computeStreak(dailyListen) {
  const activeDays = new Set(Object.entries(dailyListen || {}).filter(([, sec]) => (sec || 0) > 0).map(([d]) => d));
  if (activeDays.size === 0) return 0;
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = todayKey(cursor.getTime());
    if (!activeDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getReadingInsights() {
  const analytics = getAnalytics();
  const avgWpm = analytics.wpmSamples?.length
    ? Math.round(analytics.wpmSamples.reduce((a, b) => a + b, 0) / analytics.wpmSamples.length)
    : 0;
  return {
    totalListenSeconds: analytics.totalListenSeconds || 0,
    totalWordsHeard: analytics.totalWordsHeard || 0,
    avgWpm,
    streakDays: computeStreak(analytics.dailyListen),
  };
}

// ── Voice UX (favorites + per-book profile) ──
export function getVoiceFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(VOICE_FAVORITES_KEY)) || [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function setVoiceFavorites(ids) {
  const safe = Array.isArray(ids) ? ids.filter(Boolean).slice(0, 20) : [];
  localStorage.setItem(VOICE_FAVORITES_KEY, JSON.stringify(safe));
  return safe;
}

export function toggleVoiceFavorite(voiceId) {
  const current = getVoiceFavorites();
  if (!voiceId) return current;
  const next = current.includes(voiceId)
    ? current.filter((id) => id !== voiceId)
    : [...current, voiceId];
  return setVoiceFavorites(next);
}

export function getBookVoiceProfile(name, size) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || {};
  return current.voiceProfile || null;
}

export function setBookVoiceProfile(name, size, profile) {
  const key = bookKey(name, size);
  const current = allBooks()[key] || { page: 0, sentence: 0, bookmarks: [] };
  current.voiceProfile = {
    voice: profile?.voice || '',
    rate: profile?.rate ?? 1,
    updatedAt: Date.now(),
  };
  saveBook(name, size, current);
  return current.voiceProfile;
}

// ── IndexedDB file cache ──

let _db = null;

async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      if (!db.objectStoreNames.contains(COVER_STORE)) db.createObjectStore(COVER_STORE);
      if (!db.objectStoreNames.contains(PAGE_CACHE_STORE)) db.createObjectStore(PAGE_CACHE_STORE);
      if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) db.createObjectStore(AUDIO_CACHE_STORE);
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

export async function storeCover(name, size, dataUrl) {
  try {
    const db = await getDB();
    const tx = db.transaction(COVER_STORE, 'readwrite');
    tx.objectStore(COVER_STORE).put(dataUrl, bookKey(name, size));
    return new Promise((r, e) => { tx.oncomplete = r; tx.onerror = () => e(tx.error); });
  } catch { /* optional */ }
}

export async function getCover(name, size) {
  try {
    const db = await getDB();
    const tx = db.transaction(COVER_STORE, 'readonly');
    const req = tx.objectStore(COVER_STORE).get(bookKey(name, size));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function storeFile(name, size, buffer) {
  try {
    const db = await getDB();
    const tx = db.transaction(FILE_STORE, 'readwrite');
    const key = bookKey(name, size);
    tx.objectStore(FILE_STORE).put(buffer, key);
    await new Promise((resolve, reject) => { 
      tx.oncomplete = () => resolve(); 
      tx.onerror = () => {
        console.error('IndexedDB write error:', tx.error);
        reject(tx.error);
      };
    });
    return true;
  } catch (e) {
    console.error('Failed to store file:', e);
    return false;
  }
}

export async function getFile(name, size) {
  try {
    const db = await getDB();
    const tx = db.transaction(FILE_STORE, 'readonly');
    const key = bookKey(name, size);
    const req = tx.objectStore(FILE_STORE).get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => {
        console.error('IndexedDB read error:', req.error);
        reject(req.error);
      };
    });
  } catch (e) {
    console.error('Failed to retrieve file:', e);
    return null;
  }
}

function pageCacheKey(name, size, page) {
  return `${bookKey(name, size)}__p${Number(page)}`;
}

export async function setCachedPageText(name, size, page, text) {
  try {
    const db = await getDB();
    const tx = db.transaction(PAGE_CACHE_STORE, 'readwrite');
    tx.objectStore(PAGE_CACHE_STORE).put({
      text: text || '',
      updatedAt: Date.now(),
    }, pageCacheKey(name, size, page));
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getCachedPageText(name, size, page) {
  try {
    const db = await getDB();
    const tx = db.transaction(PAGE_CACHE_STORE, 'readonly');
    const req = tx.objectStore(PAGE_CACHE_STORE).get(pageCacheKey(name, size, page));
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.text || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedTtsChunk(cacheKey, audioB64) {
  if (!cacheKey || !audioB64) return false;
  try {
    const db = await getDB();
    const tx = db.transaction(AUDIO_CACHE_STORE, 'readwrite');
    tx.objectStore(AUDIO_CACHE_STORE).put({
      audioB64,
      updatedAt: Date.now(),
    }, cacheKey);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getCachedTtsChunk(cacheKey) {
  if (!cacheKey) return null;
  try {
    const db = await getDB();
    const tx = db.transaction(AUDIO_CACHE_STORE, 'readonly');
    const req = tx.objectStore(AUDIO_CACHE_STORE).get(cacheKey);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.audioB64 || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
