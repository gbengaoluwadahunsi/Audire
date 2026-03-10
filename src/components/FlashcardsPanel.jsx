import React, { useState } from 'react';
import { Layers, Loader2, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAI } from '../context/AIContext';

export default function FlashcardsPanel({ text, getChapterText, onClose }) {
  const { generateFlashcards, init, isReady, isLoading, loadProgress } = useAI();
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (useChapterText = false) => {
    let t = useChapterText ? '' : (text || '').trim();
    if (!t && getChapterText) t = (await getChapterText() || '').trim();
    if (!t || t.length < 50) {
      setCards([{ front: 'Select or view more text (at least 50 chars) to generate flashcards.', back: '' }]);
      return;
    }

    setGenerating(true);
    try {
      if (!isReady) await init();
      const result = await generateFlashcards(t);
      const valid = Array.isArray(result)
        ? result.filter((c) => c && (String(c.front || '').trim() && String(c.back || '').trim()))
        : [];
      setCards(valid.length > 0 ? valid : [{ front: 'No flashcards generated. Try more text or ensure backend is running with GROQ_API_KEY.', back: '' }]);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setCards([{ front: err.message || 'Failed to generate.', back: '' }]);
    } finally {
      setGenerating(false);
    }
  };

  const card = cards[index];

  return (
    <div className="reader-sidebar reader-flashcards">
      <div className="reader-sidebar-header">
        <h3>Flashcards</h3>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <div className="flashcards-body">
        {!cards.length ? (
          <>
            <p>Generate flashcards from the current chapter or selected text using AI.</p>
            {isLoading && (
              <div className="flashcards-loading">
                <Loader2 size={24} className="spin" />
                <span>{loadProgress?.text || 'Loading AI...'}</span>
              </div>
            )}
            <button
              className="flashcards-generate-btn"
              onClick={handleGenerate}
              disabled={generating || isLoading}
            >
              {generating ? <Loader2 size={18} className="spin" /> : <Layers size={18} />}
              <span>{generating ? 'Generating...' : 'Generate from chapter'}</span>
            </button>
          </>
        ) : (
          <>
            <div
              className="flashcard"
              onClick={() => setFlipped(!flipped)}
            >
              <div className="flashcard-inner">
                <p className="flashcard-text">{flipped ? card.back : card.front}</p>
              </div>
            </div>
            <div className="flashcards-nav">
              <button
                type="button"
                onClick={() => { setIndex(Math.max(0, index - 1)); setFlipped(false); }}
                disabled={index === 0}
                aria-label="Previous card"
              >
                <ChevronLeft size={20} />
              </button>
              <span>{index + 1} / {cards.length}</span>
              <button
                type="button"
                onClick={() => { setIndex(Math.min(cards.length - 1, index + 1)); setFlipped(false); }}
                disabled={index >= cards.length - 1}
                aria-label="Next card"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <button
              type="button"
              className="flashcards-regenerate"
              onClick={() => handleGenerate(true)}
              disabled={generating}
            >
              {generating ? <Loader2 size={16} className="spin" /> : null}
              <span>{generating ? 'Regenerating...' : 'Regenerate'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
