import React, { useState } from 'react';
import { Sparkles, X, Loader2, BookOpen, BookMarked, FileText, Send, History } from 'lucide-react';
import { useAI } from '../context/AIContext';

const ACTIONS = [
  { id: 'explain', label: 'Explain', icon: BookOpen },
  { id: 'define', label: 'Define', icon: BookMarked },
  { id: 'summarize', label: 'Summarize', icon: FileText },
  { id: 'catchup', label: 'Catch me up', icon: History },
];

export default function AIPanel({ text, context, isFullPage, onClose }) {
  const { explain, define, summarize, ask, catchup, isLoading, error, isReady } = useAI();
  const [result, setResult] = useState('');
  const [activeAction, setActiveAction] = useState(null);
  const [question, setQuestion] = useState('');

  const askQuestion = async (e) => {
    e?.preventDefault?.();
    const q = question.trim();
    if (!q || activeAction) return;
    setActiveAction('ask');
    setResult('');
    try {
      // Prefer the selected/page text as grounding; fall back to surrounding context.
      const grounding = (text || '').trim() || (context || '').trim();
      const res = await ask(q, grounding);
      setResult(res || 'No response.');
    } catch (err) {
      setResult(err.message || 'Something went wrong.');
    } finally {
      setActiveAction(null);
    }
  };

  const runAction = async (actionId) => {
    const t = (text || '').trim();
    if (!t) {
      setResult('Please select text or wait for the page to load.');
      return;
    }

    setActiveAction(actionId);
    setResult('');

    try {
      let res = '';
      if (actionId === 'explain') res = await explain(t, context);
      else if (actionId === 'define') res = await define(t, context);
      else if (actionId === 'summarize') res = await summarize(t);
      else if (actionId === 'catchup') res = await catchup(`${context || ''}\n${t}`.trim());
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
              AI features (Explain, Define, Summarize) are not configured. Add your own AI provider to enable them.
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

          <form className="ai-panel-ask" onSubmit={askQuestion}>
            <p className="ai-panel-selection-label">Ask about this {isFullPage ? 'page' : 'passage'}</p>
            <div className="ai-panel-ask-row">
              <input
                type="text"
                className="ai-panel-ask-input"
                placeholder="e.g. What is the main argument here?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={!isReady || activeAction !== null}
              />
              <button
                type="submit"
                className="ai-panel-ask-btn"
                disabled={!isReady || !question.trim() || activeAction !== null}
                title="Ask"
              >
                {activeAction === 'ask' ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </div>
          </form>
        </>

        {error && !isLoading && (
          <p className="ai-panel-error">{error}</p>
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
