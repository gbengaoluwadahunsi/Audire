/**
 * One-time migration from localStorage bookmarks/highlights/collections to API (Postgres).
 */
import {
  isLibrarySyncConfigured,
  librarySyncFetchCollections,
  librarySyncCreateCollection,
  librarySyncFetchBookmarks,
  librarySyncCreateBookmark,
  librarySyncFetchHighlights,
  librarySyncCreateHighlight,
  librarySyncAddBookToCollection,
} from './api.js';

const MIGRATION_KEY = 'audire-library-sync-migrated-v1';

export async function migrateLegacyLibraryDataIfNeeded() {
  if (!isLibrarySyncConfigured()) return;
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return;
  } catch {
    return;
  }

  try {
    const serverCols = await librarySyncFetchCollections();
    const localCols = JSON.parse(localStorage.getItem('audire-collections') || '[]');

    if ((!serverCols || serverCols.length === 0) && Array.isArray(localCols) && localCols.length > 0) {
      for (const c of localCols) {
        if (!c?.name) continue;
        const created = await librarySyncCreateCollection(c.name);
        const cid = created.id;
        for (const bid of c.bookIds || []) {
          if (typeof bid === 'string' && bid.length > 10) {
            try {
              await librarySyncAddBookToCollection(cid, bid);
            } catch {
              /* book may be deleted */
            }
          }
        }
      }
    }

    const rawBm = JSON.parse(localStorage.getItem('audire-bookmarks') || '{}');
    for (const bookId of Object.keys(rawBm)) {
      if (!/^[0-9a-f-]{36}$/i.test(bookId)) continue;
      let serverList = [];
      try {
        serverList = await librarySyncFetchBookmarks(bookId);
      } catch {
        continue;
      }
      if (serverList.length > 0) continue;
      const items = rawBm[bookId] || [];
      for (const b of items) {
        if (b?.cfi) {
          try {
            await librarySyncCreateBookmark(bookId, { cfi: b.cfi, text: b.text || '' });
          } catch {
            /* ignore */
          }
        }
      }
    }

    const rawHl = JSON.parse(localStorage.getItem('audire-highlights') || '{}');
    for (const bookId of Object.keys(rawHl)) {
      if (!/^[0-9a-f-]{36}$/i.test(bookId)) continue;
      let serverList = [];
      try {
        serverList = await librarySyncFetchHighlights(bookId);
      } catch {
        continue;
      }
      if (serverList.length > 0) continue;
      const items = rawHl[bookId] || [];
      for (const h of items) {
        if (h?.cfi) {
          try {
            await librarySyncCreateHighlight(bookId, {
              cfi: h.cfi,
              text: h.text || '',
              color: h.color || 'yellow',
            });
          } catch {
            /* ignore */
          }
        }
      }
    }

    try {
      localStorage.setItem(MIGRATION_KEY, '1');
      localStorage.removeItem('audire-bookmarks');
      localStorage.removeItem('audire-highlights');
      localStorage.removeItem('audire-collections');
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[librarySync] Migration skipped:', e?.message || e);
  }
}
