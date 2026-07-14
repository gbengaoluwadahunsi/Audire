import React, { useState, useEffect, useRef } from 'react';
import Reader from './Reader';
import { usePlayback } from '../context/PlaybackContext';

function SplitView({ book1, book2, onBack1, onBack2, onOpenBook, addToast }) {
  const { currentBook, setCurrentBook } = usePlayback();
  
  // By default, make book1 the active context for TTS
  useEffect(() => {
    if (!currentBook && book1) {
      setCurrentBook(book1);
    }
  }, [book1, currentBook, setCurrentBook]);

  const [splitRatio, setSplitRatio] = useState(50);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const width = window.innerWidth;
      let newRatio = (e.clientX / width) * 100;
      if (newRatio < 20) newRatio = 20;
      if (newRatio > 80) newRatio = 80;
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = 'default';
      // Dispatch a resize event so that pdf.js or epub.js recalculates layout
      window.dispatchEvent(new Event('resize'));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="split-view-container">
      <div 
        className={`split-pane ${currentBook?.id === book1.id ? 'active-pane' : ''}`}
        style={{ width: `${splitRatio}%` }}
        onPointerDownCapture={() => {
          if (currentBook?.id !== book1.id) setCurrentBook(book1);
        }}
      >
        <Reader
          bookData={book1}
          onBack={onBack1}
          onOpenBook={onOpenBook}
          addToast={addToast}
        />
      </div>

      <div 
        className="split-resizer"
        onMouseDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
        }}
      >
        <div className="split-resizer-handle" />
      </div>

      <div 
        className={`split-pane ${currentBook?.id === book2.id ? 'active-pane' : ''}`}
        style={{ width: `${100 - splitRatio}%` }}
        onPointerDownCapture={() => {
          if (currentBook?.id !== book2.id) setCurrentBook(book2);
        }}
      >
        <Reader
          bookData={book2}
          onBack={onBack2}
          onOpenBook={onOpenBook}
          addToast={addToast}
        />
      </div>
    </div>
  );
}

export default SplitView;
