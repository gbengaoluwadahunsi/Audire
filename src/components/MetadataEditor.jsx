import React, { useState } from 'react';
import { X, Search, Upload, Loader2, FileText } from 'lucide-react';
import { updateBookMetadata, uploadBookCover, searchBookMetadata } from '../lib/api';

export default function MetadataEditor({ book, onClose, onUpdated, addToast }) {
  const [title, setTitle] = useState(book?.title || '');
  const [author, setAuthor] = useState(book?.author || '');
  const [coverPreview, setCoverPreview] = useState(book?.cover || null);
  const [coverFile, setCoverFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const results = await searchBookMetadata(q);
      setSearchResults(results);
    } catch (err) {
      addToast?.('Failed to search metadata: ' + err.message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleApplyResult = (result) => {
    if (result.title) setTitle(result.title);
    if (result.author) setAuthor(result.author);
    if (result.cover) setCoverPreview(result.cover);
    setShowSearch(false);
    setSearchResults([]);
    addToast?.('Metadata applied. Click Save to confirm.', 'info');
  };

  const handleCoverChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast?.('Please select an image file', 'error');
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      addToast?.('Title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await updateBookMetadata(book.id, { title: title.trim(), author: author.trim() || null });
      if (coverFile) {
        await uploadBookCover(book.id, coverFile);
      }
      addToast?.('Book metadata updated', 'success');
      onUpdated?.();
      onClose?.();
    } catch (err) {
      addToast?.('Failed to update: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="delete-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="metadata-editor-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-editor-title"
        style={{
          background: 'var(--bg-primary)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '480px',
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 id="metadata-editor-title" style={{ margin: 0, fontSize: '1.25rem' }}>Edit Book Details</h2>
          <button onClick={onClose} aria-label="Close metadata editor" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div style={{ flexShrink: 0, width: '120px' }}>
            {coverPreview ? (
              <img
                src={coverPreview}
                alt="Cover"
                style={{ width: '120px', height: '160px', objectFit: 'cover', borderRadius: '6px' }}
              />
            ) : (
              <div style={{
                width: '120px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-tertiary)', borderRadius: '6px'
              }}>
                <FileText size={32} color="var(--text-tertiary)" />
              </div>
            )}
            <label
              style={{
                display: 'block', marginTop: '8px', textAlign: 'center',
                padding: '6px', fontSize: '0.8rem', cursor: 'pointer',
                background: 'var(--bg-tertiary)', borderRadius: '6px',
                color: 'var(--text-secondary)', border: '1px solid var(--border)',
              }}
            >
              <Upload size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Upload Cover
              <input type="file" accept="image/*" onChange={handleCoverChange} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text)', fontSize: '0.95rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px', color: 'var(--text-secondary)' }}>Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                  color: 'var(--text)', fontSize: '0.95rem',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '8px 14px', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Search size={14} />
            {showSearch ? 'Hide Search' : 'Auto-fetch from Google Books'}
          </button>
        </div>

        {showSearch && (
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by book title..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border)', background: 'var(--bg-primary)',
                  color: 'var(--text)', fontSize: '0.9rem',
                }}
              />
              <button
                onClick={handleSearch}
                disabled={searching || searchQuery.trim().length < 2}
                style={{
                  padding: '8px 14px', borderRadius: '6px', border: 'none',
                  background: 'var(--accent)', color: 'white', cursor: 'pointer',
                  opacity: searching || searchQuery.trim().length < 2 ? 0.5 : 1,
                }}
              >
                {searching ? <Loader2 size={16} className="spin" /> : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleApplyResult(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '8px', borderRadius: '6px', border: '1px solid var(--border)',
                      background: 'var(--bg-primary)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {r.cover && (
                      <img src={r.cover} alt="" style={{ width: '36px', height: '50px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }} />
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.author || 'Unknown'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'white', cursor: 'pointer',
              opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {saving && <Loader2 size={14} className="spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
