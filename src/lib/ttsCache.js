/**
 * ttsCache.js — IndexedDB cache of generated TTS audio blobs.
 *
 * Audio is keyed purely by (text + voice + rate), so it is book-agnostic and
 * shared across re-listens. Every playback transparently populates the cache;
 * "Download for offline" simply pre-generates a chapter's chunks so they're
 * available without a network connection (pairs with the PWA service worker).
 */

const DB_NAME = 'audire-tts-cache';
const STORE = 'audio';
const DB_VERSION = 1;

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/** Stable, compact key from the inputs that determine the audio. */
export function cacheKey(text, voice, rate, pitch = 0) {
  const raw = `${voice}|${rate}|${pitch}|${(text || '').trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x1000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${raw.length.toString(36)}_${h1.toString(36)}${h2.toString(36)}`;
}

export async function getCachedAudio(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putCachedAudio(key, blob) {
  try {
    if (!blob || blob.size < 100) return;
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, blob, size: blob.size, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore quota / private-mode failures */
  }
}

export async function getCacheStats() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      let count = 0;
      let bytes = 0;
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          count += 1;
          bytes += cursor.value?.size || 0;
          cursor.continue();
        } else {
          resolve({ count, bytes });
        }
      };
      cursorReq.onerror = () => resolve({ count, bytes });
    });
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function clearCache() {
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
