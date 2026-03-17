/**
 * Audire API client - replaces Supabase for books, progress, and TTS.
 * Backend runs on Render/Neon. Set VITE_API_URL in .env (e.g. http://localhost:3001 for dev).
 */

const BASE = import.meta.env.VITE_API_URL || '';

function url(path) {
  return `${BASE.replace(/\/$/, '')}${path}`;
}

function apiOrigin() {
  try {
    if (!BASE) return null;
    return new URL(BASE, window.location.origin).origin;
  } catch {
    return null;
  }
}

function normalizeBackendUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.startsWith('/')) return url(rawUrl);

  const origin = apiOrigin();
  if (!origin) return rawUrl;

  return rawUrl
    .replace(/^http:\/\/localhost:3001/i, origin)
    .replace(/^http:\/\/127\.0\.0\.1:3001/i, origin);
}

function normalizeBookUrls(book) {
  if (!book || typeof book !== 'object') return book;
  return {
    ...book,
    cover: normalizeBackendUrl(book.cover),
    file_url: normalizeBackendUrl(book.file_url),
  };
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(url(path), {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function fetchBooks() {
  const books = await fetchJson('/api/books');
  return Array.isArray(books) ? books.map(normalizeBookUrls) : [];
}

export async function uploadBook(fileBlob, fileName = 'book.epub') {
  const form = new FormData();
  form.append('file', fileBlob, fileName);

  const res = await fetch(url('/api/books'), {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const created = await res.json();
  return normalizeBookUrls(created);
}

export async function updateBookProgress(bookId, cfi, progressPercent = null, totalPages = null) {
  const body = { last_cfi: cfi };
  if (progressPercent != null) body.progress_percent = Math.round(progressPercent);
  if (totalPages != null) body.total_pages = totalPages;
  return fetch(url(`/api/books/${bookId}/progress`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => (r.ok ? r.json() : r.json().then((e) => { throw new Error(e.error || r.statusText); })));
}

export async function downloadBookFile(fileUrl) {
  const normalized = normalizeBackendUrl(fileUrl || '');
  const fullUrl = normalized?.startsWith('http') ? normalized : url(normalized || '');
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error(res.statusText || 'Failed to download');
  return res.arrayBuffer();
}

/** URL for EPUB-converted-to-PDF (used when displaying EPUB as PDF) */
export function getEpubPdfUrl(bookId) {
  return url(`/api/books/${bookId}/pdf`);
}

export async function deleteBook(bookId) {
  return fetchJson(`/api/books/${bookId}`, { method: 'DELETE' });
}

export async function repairBookCover(book) {
  if (!book?.id || book.cover || !book.file_url) return null;
  try {
    // Skip if the book file doesn't exist (avoids 404 on repair-cover)
    const fileUrl = normalizeBackendUrl(book.file_url)?.startsWith('http')
      ? normalizeBackendUrl(book.file_url)
      : url(`/api/books/${book.id}/file`);
    const headRes = await fetch(fileUrl, { method: 'HEAD' });
    if (!headRes.ok) return null;

    const res = await fetch(url(`/api/books/${book.id}/repair-cover`), { method: 'POST' });
    if (!res.ok) return null;
    const updated = await res.json();
    return normalizeBackendUrl(updated?.cover || null);
  } catch {
    return null;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL || '').trim();

async function aiFetch(endpoint, body) {
  const base = API_BASE.replace(/\/$/, '');
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function aiExplain(text, context = '') {
  const { content } = await aiFetch('/api/ai/explain', { text, context });
  return content ?? '';
}

export async function aiDefine(text, context = '') {
  const { content } = await aiFetch('/api/ai/define', { text, context });
  return content ?? '';
}

export async function aiSummarize(text) {
  const { content } = await aiFetch('/api/ai/summarize', { text });
  return content ?? '';
}

export async function aiFlashcards(text) {
  const { cards } = await aiFetch('/api/ai/flashcards', { text });
  return Array.isArray(cards) ? cards : [];
}

export async function aiVisualize(text) {
  const { content } = await aiFetch('/api/ai/visualize', { text });
  return content ?? '';
}

