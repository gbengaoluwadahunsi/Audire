import React, { useRef, useEffect, useState } from 'react';
import { X, Download, Share2, RefreshCw } from 'lucide-react';

const GRADIENTS = [
  { label: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'], text: '#f4f3f8' },
  { label: 'Aurora',   colors: ['#0d324d', '#7f5a83', '#a0508f'], text: '#f4f3f8' },
  { label: 'Ember',    colors: ['#1f0e0e', '#7b2d2d', '#c86b3c'], text: '#f9e4c8' },
  { label: 'Forest',   colors: ['#0a1f0a', '#1b4332', '#40916c'], text: '#d8f3dc' },
  { label: 'Ocean',    colors: ['#03045e', '#0077b6', '#48cae4'], text: '#e0f7fa' },
  { label: 'Rose',     colors: ['#3d0b1a', '#89216b', '#da4453'], text: '#fce4ec' },
];

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY;
}

export default function QuoteShareModal({ text, bookTitle, bookAuthor, onClose, addToast }) {
  const canvasRef = useRef(null);
  const [gradientIndex, setGradientIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedGradient = GRADIENTS[gradientIndex];

  const drawCard = (canvas) => {
    if (!canvas) return;
    const W = 900, H = 500;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const { colors, text: textColor } = selectedGradient;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Decorative circles
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = textColor;
    ctx.beginPath(); ctx.arc(W - 60, 60, 180, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(60, H - 60, 120, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Opening quote mark
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = textColor;
    ctx.font = 'bold 200px Georgia, serif';
    ctx.fillText('\u201C', 40, 180);
    ctx.restore();

    // Quote text
    const pad = 80;
    ctx.fillStyle = textColor;
    ctx.font = `500 28px 'Outfit', 'Georgia', serif`;
    const maxLineWidth = W - pad * 2;
    const truncated = text.length > 350 ? text.slice(0, 347) + '\u2026' : text;
    const lastY = wrapText(ctx, `\u201C${truncated}\u201D`, pad, 130, maxLineWidth, 44);

    // Divider
    const divY = Math.min(lastY + 36, H - 90);
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, divY); ctx.lineTo(pad + 60, divY); ctx.stroke();
    ctx.restore();

    // Book info
    const attrY = divY + 28;
    ctx.font = `600 18px 'Outfit', sans-serif`;
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.9;
    ctx.fillText(`\u2014 ${bookTitle || 'Unknown Book'}`, pad, attrY);

    if (bookAuthor) {
      ctx.font = `400 15px 'Outfit', sans-serif`;
      ctx.globalAlpha = 0.6;
      ctx.fillText(bookAuthor, pad, attrY + 24);
    }

    // Audire watermark
    ctx.globalAlpha = 0.35;
    ctx.font = `500 14px 'Outfit', sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('Made with Audire', W - pad, H - 28);
    ctx.restore();
  };

  useEffect(() => {
    drawCard(canvasRef.current);
  }, [gradientIndex, text, bookTitle, bookAuthor]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsGenerating(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(bookTitle || 'quote').replace(/[^\w\d-_]/g, '_')}_quote.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addToast?.('Quote card downloaded!', 'success');
    } catch {
      addToast?.('Download failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        const file = new File([blob], 'quote.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: bookTitle || 'Quote' });
        } else {
          // Fallback: just copy the text quote
          await navigator.clipboard.writeText(`"${text}" — ${bookTitle}`);
          addToast?.('Copied quote to clipboard (Web Share not supported)', 'info');
        }
      }, 'image/png');
    } catch (err) {
      if (err.name !== 'AbortError') addToast?.('Share failed', 'error');
    }
  };

  return (
    <div className="quote-modal-overlay" onClick={onClose}>
      <div className="quote-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="quote-modal-header">
          <h2 className="quote-modal-title">
            <Share2 size={18} />
            Share Quote
          </h2>
          <button className="quote-modal-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Canvas Preview */}
        <div className="quote-canvas-wrapper">
          <canvas ref={canvasRef} className="quote-canvas" />
        </div>

        {/* Gradient Picker */}
        <div className="quote-gradient-picker">
          <span className="quote-gradient-label">Style</span>
          <div className="quote-gradient-swatches">
            {GRADIENTS.map((g, i) => (
              <button
                key={g.label}
                className={`quote-gradient-swatch ${gradientIndex === i ? 'active' : ''}`}
                style={{
                  background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]}, ${g.colors[2]})`
                }}
                onClick={() => setGradientIndex(i)}
                title={g.label}
              />
            ))}
            <button
              className="quote-gradient-swatch shuffle"
              onClick={() => setGradientIndex((gradientIndex + 1) % GRADIENTS.length)}
              title="Next style"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="quote-modal-actions">
          <button className="quote-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="quote-btn primary" onClick={handleShare}>
            <Share2 size={16} />
            Share
          </button>
          <button
            className="quote-btn primary download"
            onClick={handleDownload}
            disabled={isGenerating}
          >
            <Download size={16} />
            {isGenerating ? 'Saving…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
