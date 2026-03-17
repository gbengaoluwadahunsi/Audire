import React, { useState } from 'react';
import { Sparkles, X, Loader2, BookOpen, BookMarked, FileText, Image as ImageIcon } from 'lucide-react';
import { useAI } from '../context/AIContext';

const ACTIONS = [
  { id: 'explain', label: 'Explain', icon: BookOpen },
  { id: 'define', label: 'Define', icon: BookMarked },
  { id: 'summarize', label: 'Summarize', icon: FileText },
  { id: 'visualize', label: 'Visualize', icon: ImageIcon },
];

export default function AIPanel({ text, context, isFullPage, onClose }) {
  const { explain, define, summarize, visualizeScene, isLoading, error, isReady } = useAI();
  const [result, setResult] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [activeAction, setActiveAction] = useState(null);

  const runAction = async (actionId) => {
    const t = (text || '').trim();
    if (!t) {
      setResult('Please select text or wait for the page to load.');
      return;
    }

    setActiveAction(actionId);
    setResult('');
    setImageUrl('');

    try {
      let res = '';
      if (actionId === 'explain') res = await explain(t, context);
      else if (actionId === 'define') res = await define(t, context);
      else if (actionId === 'summarize') res = await summarize(t);
      else if (actionId === 'visualize') {
        const out = await visualizeScene(t);
        if (typeof out === 'string' && (out.startsWith('http') || out.startsWith('data:'))) {
          setImageUrl(out);
        } else {
          setResult(out || 'No visualization.');
        }
        return;
      }
      setResult(res || 'No response.');
    } catch (err) {
      setResult(err.message || 'Something went wrong.');
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-panel-title">
          <Sparkles size={20} color="var(--primary)" />
          <span>AI Assistant</span>
        </div>
        <button className="ai-panel-close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="ai-panel-body">
        {isLoading && !activeAction && (
          <div className="ai-panel-loading">
            <Loader2 size={24} className="spin" />
            <p>Processing...</p>
          </div>
        )}

        <>
          {!isReady && (
            <p className="ai-panel-selection-empty" style={{ marginBottom: 12 }}>
              AI features (Explain, Define, Summarize, Visualize) are not configured. Add your own AI provider to enable them.
            </p>
          )}
          <div className="ai-panel-selection">
            {text ? (
              <div className="ai-panel-selection-text-wrap">
                <p className="ai-panel-selection-label">
                  {isFullPage ? 'Full current page' : 'Selected text'}
                </p>
                <div className="ai-panel-selection-text">"{text}"</div>
              </div>
            ) : (
              <p className="ai-panel-selection-empty">Select text in the book to use AI.</p>
            )}
          </div>

          <div className="ai-panel-actions">
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                className="ai-panel-action"
                onClick={() => runAction(a.id)}
                disabled={!text?.trim() || activeAction !== null}
              >
                {activeAction === a.id ? (
                  <Loader2 size={18} className="spin" />
                ) : (
                  <a.icon size={18} />
                )}
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </>

        {error && !isLoading && (
          <p className="ai-panel-error">{error}</p>
        )}

        {imageUrl && (
          <div className="ai-panel-result image">
            <h4>Visualization</h4>
            <div className="ai-scene-image">
              <img src={imageUrl} alt="AI Generated Scene" />
              <button className="download-img-btn" onClick={() => window.open(imageUrl, '_blank')}>View Fullscreen</button>
            </div>
          </div>
        )}

        {result && (
          <div className="ai-panel-result">
            <h4>Insight</h4>
            <p>{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}
