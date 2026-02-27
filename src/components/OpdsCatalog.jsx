/**
 * OPDS catalog — Librera-style. Enter feed URL, fetch, list entries. Direct download + add to library.
 */
import { useState, useCallback } from 'react';
import { fetchOPDSFeed } from '../lib/opds';
import { isSupported } from '../lib/bookFormats';

function resolveUrl(link, baseUrl) {
  if (!link) return '';
  try {
    return new URL(link, baseUrl || undefined).href;
  } catch {
    return link;
  }
}

function extensionFromType(type) {
  if (!type) return 'epub';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('epub')) return 'epub';
  if (type.includes('plain') || type.includes('text')) return 'txt';
  return 'epub';
}

export default function OpdsCatalog({ onClose, onAddBook }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadId, setDownloadId] = useState(null);
  const [error, setError] = useState(null);
  const [feed, setFeed] = useState(null);
  const [feedBaseUrl, setFeedBaseUrl] = useState('');

  const handleFetch = useCallback(async () => {
    const u = url.trim();
    if (!u) return;
    setError(null);
    setFeed(null);
    setLoading(true);
    try {
      const result = await fetchOPDSFeed(u);
      setFeed(result);
      try {
        setFeedBaseUrl(new URL(u).origin + new URL(u).pathname.replace(/\/[^/]*$/, '/'));
      } catch {
        setFeedBaseUrl(u);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load feed. Check URL and CORS.');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleDirectAdd = useCallback(async (entry) => {
    const absoluteUrl = resolveUrl(entry.link, feedBaseUrl || url);
    if (!absoluteUrl || !onAddBook) return;
    setError(null);
    setDownloadId(entry.title);
    try {
      const res = await fetch(absoluteUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const ext = extensionFromType(entry.type);
      const safeTitle = (entry.title || 'book').replace(/[^a-zA-Z0-9\s-_]/g, '').trim().slice(0, 80) || 'book';
      const name = `${safeTitle}.${ext}`;
      if (!isSupported(ext)) throw new Error(`Format .${ext} is not supported.`);
      await onAddBook(buffer, name, { title: entry.title, author: entry.author });
    } catch (e) {
      setError(e?.message || 'Download failed. Try "Get book" to open in a new tab.');
    } finally {
      setDownloadId(null);
    }
  }, [feedBaseUrl, url, onAddBook]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card-dark border border-border-dark rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border-dark">
          <h2 className="text-xl font-bold text-white">Add from catalog (OPDS)</h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-4 border-b border-border-dark">
          <label className="block text-sm font-medium text-slate-400 mb-2">Feed URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/opds.xml or .json"
              className="flex-1 bg-background-dark border border-border-dark rounded-xl px-4 py-2 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary"
            />
            <button type="button" onClick={handleFetch} disabled={loading} className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover disabled:opacity-50">
              {loading ? 'Loading…' : 'Fetch'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {feed && (
            <>
              {feed.title && <p className="text-slate-400 text-sm mb-3">{feed.title}</p>}
              {feed.entries.length === 0 && <p className="text-slate-500">No entries in this feed.</p>}
              <ul className="space-y-3">
                {feed.entries.map((entry, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-background-dark border border-border-dark">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white truncate">{entry.title || 'Untitled'}</p>
                      {entry.author && <p className="text-sm text-slate-500 truncate">{entry.author}</p>}
                    </div>
                    {entry.link ? (
                      <div className="flex gap-2 shrink-0">
                        {onAddBook && (
                          <button
                            type="button"
                            onClick={() => handleDirectAdd(entry)}
                            disabled={downloadId !== null}
                            className="px-3 py-1.5 bg-secondary-green text-white text-sm font-medium rounded-lg hover:bg-secondary-green-hover disabled:opacity-50"
                          >
                            {downloadId === entry.title ? 'Adding…' : 'Add to library'}
                          </button>
                        )}
                        <a
                          href={resolveUrl(entry.link, feedBaseUrl || url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover"
                        >
                          Open link
                        </a>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-sm">No link</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
