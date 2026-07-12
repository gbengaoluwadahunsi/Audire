import React, { useEffect, useState } from 'react';
import { X, Download, Copy } from 'lucide-react';
import { getHighlights } from '../lib/bookmarks';

function ExportModal({ bookData, onClose, addToast }) {
  const [highlights, setHighlights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const hs = await getHighlights(bookData.id);
        setHighlights(hs || []);
      } catch (err) {
        addToast?.('Failed to load highlights', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [bookData.id, addToast]);

  const generateMarkdown = () => {
    if (highlights.length === 0) {
      return `No highlights found for *${bookData.title}*.`;
    }

    const lines = [];
    lines.push(`# Highlights from ${bookData.title}`);
    if (bookData.author) {
      lines.push(`**Author:** ${bookData.author}`);
    }
    lines.push('');

    highlights.forEach((h) => {
      lines.push(`> ${h.text}`);
      lines.push('');
      lines.push(`— *${bookData.title}*`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  };

  const handleCopy = () => {
    const md = generateMarkdown();
    navigator.clipboard.writeText(md)
      .then(() => addToast?.('Copied markdown to clipboard', 'success'))
      .catch(() => addToast?.('Failed to copy', 'error'));
  };

  const handleDownload = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bookData.title.replace(/[^\w\d-_]/g, '_')}_highlights.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast?.('Downloaded highlights', 'success');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Export Highlights</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          {isLoading ? (
            <p>Loading highlights...</p>
          ) : highlights.length === 0 ? (
            <p>You haven't made any highlights in this book yet.</p>
          ) : (
            <p>Ready to export {highlights.length} highlight{highlights.length !== 1 ? 's' : ''} from <strong>{bookData.title}</strong>.</p>
          )}
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="primary-btn" 
            onClick={handleCopy}
            disabled={isLoading || highlights.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Copy size={16} /> Copy Markdown
          </button>
          <button 
            className="primary-btn" 
            onClick={handleDownload}
            disabled={isLoading || highlights.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Download size={16} /> Download .md
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
