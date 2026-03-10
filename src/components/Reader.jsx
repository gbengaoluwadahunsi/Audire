import React, { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Bookmark, List, X, Sparkles, Highlighter, Layers, Search } from 'lucide-react';
import ePub from 'epubjs';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ttsManager } from '../lib/ttsManager';
import {
  extractTextFromSection,
  extractTextFromPdfDoc,
  extractTextFromPdfDocRange,
  getEpubToc,
  searchInBook,
} from '../lib/fileProcessor';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
const PDFJS_WASM_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/wasm/';
import { updateBookProgress, downloadBookFile } from '../lib/api';
import { getSettings, getPdfOffset, setPdfOffset } from '../lib/settings';
import { getBookmarks, addBookmark, removeBookmark, getHighlights, addHighlight, removeHighlight, HIGHLIGHT_COLORS } from '../lib/bookmarks';
import { usePlayback } from '../context/PlaybackContext';
import AIPanel from './AIPanel';
import FlashcardsPanel from './FlashcardsPanel';

function Reader({ bookData, onBack, onOpenBook, addToast }) {
  const viewerRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);
  const pdfRef = useRef(null);

  const { play, pause, setProgress: setPlaybackProgress, currentBook, isPlaying } = usePlayback();

  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfText, setPdfText] = useState('');
  const [toc, setToc] = useState([]);
  const [showToc, setShowToc] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionContext, setSelectionContext] = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');
  const [pdfPageOffset, setPdfPageOffsetState] = useState(0);
  const pdfCanvasRef = useRef(null);
  const pdfTextLayerRef = useRef(null);
  const pdfTextLayerInstanceRef = useRef(null);
  const pdfPageWrapRef = useRef(null);
  const pdfPageWrapperRef = useRef(null);
  const pdfViewportRef = useRef({ width: 0, height: 0 });
  const pdfDataRef = useRef(null);
  const pdfRenderTaskRef = useRef(null);
  const pdfRenderPendingRef = useRef(null);
  const pdfRenderLockRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const currentPageRef = useRef(1);
  const triggerPlayAfterNavRef = useRef(false);
  const pageInputRef = useRef(null);
  const fontSizeRef = useRef(null);
  const selectedCfiRangeRef = useRef(null);
  const epubResizeObserverRef = useRef(null);
  const [pdfScale, setPdfScale] = useState(1);
  const [pdfViewport, setPdfViewport] = useState({ width: 0, height: 0 });

  const settings = getSettings();
  const readerFontSize = settings.fontSize ?? 16;

  useEffect(() => {
    const updateSelection = () => {
      let sel = '';
      let ctx = '';
      if (bookData?.format === 'pdf') {
        sel = window.getSelection?.()?.toString?.()?.trim() ?? '';
        ctx = pdfText || '';
      } else {
        const iframe = viewerRef.current?.querySelector?.('iframe');
        const doc = iframe?.contentDocument ?? document;
        try {
          sel = doc.getSelection?.()?.toString?.()?.trim() ?? '';
          ctx = doc.body?.textContent?.slice(0, 500) ?? '';
        } catch (_) { }
      }
      setSelectedText(sel);
      setSelectionContext(ctx);
    };

    updateSelection();
    const doc = bookData?.format === 'pdf' ? document : viewerRef.current?.querySelector?.('iframe')?.contentDocument;
    if (doc) {
      doc.addEventListener('selectionchange', updateSelection);
    }
    const id = setInterval(updateSelection, isPlayingTTS ? 800 : 200);

    if (bookData?.format === 'pdf') {
      const onMouseUp = () => { updateSelection(); };
      document.addEventListener('mouseup', onMouseUp);
      return () => {
        if (doc) doc.removeEventListener('selectionchange', updateSelection);
        clearInterval(id);
        document.removeEventListener('mouseup', onMouseUp);
      };
    }

    return () => {
      if (doc) doc.removeEventListener('selectionchange', updateSelection);
      clearInterval(id);
    };
  }, [bookData?.format, pdfText, isPlayingTTS]);

  useEffect(() => {
    if (bookData?.id) {
      setBookmarks(getBookmarks(bookData.id));
      setHighlights(getHighlights(bookData.id));
    }
  }, [bookData?.id]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:triggerEffect',message:'trigger effect run',data:{triggerRef:triggerPlayAfterNavRef.current,format:bookData?.format,totalPages,currentPage},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (triggerPlayAfterNavRef.current && bookData?.format === 'pdf' && pdfRef.current && totalPages > 0) {
      triggerPlayAfterNavRef.current = false;
      console.log('Reader: Triggering play after nav, currentPage=', currentPageRef.current);
      const id = setTimeout(() => {
        const fn = handlePlayPauseRef.current;
        if (fn) {
          // #region agent log
          fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:triggerTimeout',message:'calling handlePlayPause after nav',data:{currentPageRef:currentPageRef.current},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log('Reader: Calling handlePlayPause after nav');
          fn();
        }
      }, 300);
      return () => clearTimeout(id);
    }
  }, [bookData?.format, totalPages, currentPage]);

  useEffect(() => {
    const s = getSettings();
    ttsManager.setSpeed(s.speed);
    ttsManager.setVoice(s.ttsVoice);
    ttsManager.setEngine(s.ttsEngine);
    ttsManager.setKokoroVoice(s.kokoroVoice);
  }, []);

  useEffect(() => {
    if (bookData?.format !== 'pdf' || totalPages <= 0 || !pdfRef.current) return;
    const phys = currentPage + pdfPageOffset;
    if (phys < 1 || phys > totalPages) return;
    const rafId = requestAnimationFrame(() => {
      if (pdfCanvasRef.current) renderPdfPage(phys);
    });
    return () => cancelAnimationFrame(rafId);
  }, [bookData?.format, totalPages, currentPage, pdfPageOffset]);

  useEffect(() => {
    const container = pdfPageWrapperRef.current;
    if (bookData?.format !== 'pdf' || !container) return;
    let debounceId = null;
    const onResize = () => {
      if (bookData?.format !== 'pdf' || totalPages <= 0) return;
      const phys = currentPage + pdfPageOffset;
      if (phys < 1 || phys > (pdfRef.current?.numPages ?? 0)) return;
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        renderPdfPage(phys);
      }, 80);
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    return () => {
      if (debounceId) clearTimeout(debounceId);
      ro.disconnect();
    };
  }, [bookData?.format, bookData?.id, totalPages, currentPage, pdfPageOffset]);

  useEffect(() => {
    if (!bookData) return;
    if (bookData.format === 'epub') {
      if (!viewerRef.current) return;

      const initEpub = async () => {
        try {
          let source = bookData.file_url;
          if (source?.includes('/api/books/')) {
            source = await downloadBookFile(source);
          }

          const book = ePub(source);
          bookRef.current = book;

          const el = viewerRef.current;
          const w = el.offsetWidth || 800;
          const h = el.offsetHeight || 600;
          const rendition = book.renderTo(el, {
            width: w,
            height: h,
            flow: 'paginated',
            spread: 'none',
            manager: 'default',
            allowScriptedContent: true,
          });
          renditionRef.current = rendition;

          rendition.on('selected', (cfiRange) => {
            selectedCfiRangeRef.current = cfiRange;
          });

          rendition.hooks.content.register((contents) => {
            const doc = contents.document;
            if (!doc) return;

            const notifySelection = () => {
              try {
                const sel = doc.getSelection?.()?.toString?.()?.trim() ?? '';
                const ctx = doc.body?.textContent?.slice(0, 500) ?? '';
                setSelectedText(sel);
                setSelectionContext(ctx);
              } catch (_) { }
            };
            doc.addEventListener('selectionchange', notifySelection);

            const bookHighlights = getHighlights(bookData.id);
            bookHighlights.forEach((h) => {
              try {
                const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === h.color) || HIGHLIGHT_COLORS[0];
                rendition.annotations?.highlight?.(h.cfi, {}, () => {}, 'hl', {
                  fill: colorInfo.color,
                  'fill-opacity': '0.4',
                  'mix-blend-mode': 'multiply',
                });
              } catch (_) { /* CFI may be in different section */ }
            });

            const style = doc.createElement('style');
            if (settings.theme === 'dark') {
              style.innerHTML = `
                  html, body {
                      background-color: #0a0a0a !important;
                      background: #0a0a0a !important;
                      color: #e5e5e5 !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                  *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
                      background-color: transparent !important;
                      background: transparent !important;
                      color: #e5e5e5 !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                  a { color: #a8b1ff !important; }
                  img { mix-blend-mode: luminosity; opacity: 0.9; }
                `;
            } else {
              style.innerHTML = `
                  html, body {
                      background-color: #fafafa !important;
                      background: #fafafa !important;
                      color: #1a1a1a !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                  *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
                      background-color: transparent !important;
                      background: transparent !important;
                      color: #1a1a1a !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                `;
            }
            doc.head.appendChild(style);
          });

          rendition.display(bookData.last_cfi || undefined);

          const ro = new ResizeObserver(() => {
            const r = renditionRef.current;
            const el2 = viewerRef.current;
            if (el2 && r?.manager && el2.offsetWidth > 0 && el2.offsetHeight > 0) {
              try { r.resize(el2.offsetWidth, el2.offsetHeight); } catch (_) {}
            }
          });
          ro.observe(el);
          epubResizeObserverRef.current = ro;

          book.ready.then(() => getEpubToc(book).then(setToc));

          rendition.on('relocated', (location) => {
            const pct = book.locations?.percentageFromCfi?.(location.start.cfi) ?? 0;
            const percent = pct * 100;
            setProgress(percent);
            updateBookProgress(bookData.id, location.start.cfi, percent);
            setPlaybackProgress(percent);
          });
        } catch (err) {
          console.error('EPUB init error:', err);
        }
      };

      initEpub();
    } else if (bookData.format === 'pdf') {
      setPdfLoadError(null);
      setPdfLoading(true);
      setTotalPages(0);
      setCurrentPage(1);
      const offset = getPdfOffset(bookData.id);
      setPdfPageOffsetState(offset);
      loadPdf(bookData.file_url, offset);
    }

    return () => {
      ttsManager.stop();
      if (bookRef.current) bookRef.current.destroy();
      const ro = epubResizeObserverRef.current;
      if (ro) { ro.disconnect(); epubResizeObserverRef.current = null; }
      if (pdfRenderTaskRef.current) {
        pdfRenderTaskRef.current.cancel();
        pdfRenderTaskRef.current = null;
      }
      isNavigatingRef.current = false;
      pdfDataRef.current = null;
    };
  }, [bookData?.id, bookData?.format]);

  const loadPdf = async (url, offset = 0) => {
    try {
      let arrayBuffer;
      if (url?.includes('/api/books/')) {
        arrayBuffer = await downloadBookFile(url);
      } else {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
        arrayBuffer = await res.arrayBuffer();
      }
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer, wasmUrl: PDFJS_WASM_URL });
      const pdf = await loadingTask.promise;
      pdfRef.current = pdf;
      if (pdf.numPages === 0) throw new Error('PDF has no pages');
      setTotalPages(pdf.numPages);
      const contentTotal = Math.max(1, pdf.numPages - offset);
      const savedPhysical = Math.min(parseInt(bookData.last_cfi) || 1, pdf.numPages);
      const contentPage = Math.max(1, Math.min(savedPhysical - offset, contentTotal));
      await goToPdfPage(contentPage);
    } catch (err) {
      console.error('PDF load error:', err);
      setPdfLoadError(err?.message || 'Failed to load PDF. The file may be corrupted or inaccessible.');
    } finally {
      setPdfLoading(false);
    }
  };

  const contentTotalPages = bookData?.format === 'pdf' ? Math.max(1, totalPages - pdfPageOffset) : totalPages;

  const handlePageInputSubmit = (e) => {
    e?.preventDefault?.();
    const raw = String(pageInputValue || currentPage).trim();
    const num = parseInt(raw, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= contentTotalPages) {
      stopTTSIfPlaying();
      goToPdfPage(num);
    }
    setPageInputValue('');
  };

  const handlePageInputFocus = () => {
    setPageInputValue(String(currentPage));
    setTimeout(() => pageInputRef.current?.select(), 0);
  };

  const goToPdfPage = async (contentPageNum) => {
    if (!pdfRef.current) return;
    currentPageRef.current = contentPageNum;
    const phys = contentPageNum + pdfPageOffset;
    const contentTotal = Math.max(1, pdfRef.current.numPages - pdfPageOffset);
    if (contentPageNum < 1 || phys > pdfRef.current.numPages) return;
    isNavigatingRef.current = true;
    setCurrentPage(contentPageNum);
    try {
      const text = await extractTextFromPdfDoc(pdfRef.current, phys);
      setPdfText(text);
    } catch (err) {
      console.error('PDF page error:', err);
    } finally {
      isNavigatingRef.current = false;
    }
    const pct = (contentPageNum / contentTotal) * 100;
    setProgress(pct);
    updateBookProgress(bookData.id, String(phys), pct, pdfRef.current.numPages);
    if (pdfCanvasRef.current) await renderPdfPage(phys);
  };

  const renderPdfPage = async (pageNum) => {
    if (!pdfRef.current || !pdfCanvasRef.current) return;
    const myId = {};
    pdfRenderLockRef.current = myId;
    pdfRenderPendingRef.current = pageNum;
    const prevTask = pdfRenderTaskRef.current;
    if (prevTask) {
      try {
        prevTask.cancel();
        await prevTask.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException' && e?.name !== 'AbortException') throw e;
      }
      pdfRenderTaskRef.current = null;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (pdfRenderLockRef.current !== myId || pdfRenderPendingRef.current !== pageNum) {
      return;
    }
    const prevTextLayer = pdfTextLayerInstanceRef.current;
    if (prevTextLayer?.cancel) prevTextLayer.cancel();
    pdfTextLayerInstanceRef.current = null;

    const pdf = pdfRef.current;
    const page = await pdf.getPage(pageNum);
    const containerEl = pdfPageWrapperRef.current;
    const baseViewport = page.getViewport({ scale: 1 });
    const containerW = containerEl?.offsetWidth || 800;
    const displayScale = containerW > 0 ? Math.min(2, Math.max(0.5, containerW / baseViewport.width)) : 1.5;
    const viewport = page.getViewport({ scale: displayScale });

    const canvas = pdfCanvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const renderTask = page.render({ canvasContext: ctx, viewport });
    pdfRenderTaskRef.current = renderTask;
    try {
      await renderTask.promise;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException' && e?.name !== 'AbortException') throw e;
    } finally {
      if (pdfRenderTaskRef.current === renderTask) pdfRenderTaskRef.current = null;
    }
    if (pdfRenderLockRef.current !== myId || pdfRenderPendingRef.current !== pageNum) {
      return;
    }

    pdfViewportRef.current = { width: viewport.width, height: viewport.height };
    setPdfViewport({ width: viewport.width, height: viewport.height });
    setPdfScale(1);

    const textLayerEl = pdfTextLayerRef.current;
    if (textLayerEl) {
      textLayerEl.innerHTML = '';
      textLayerEl.style.width = `${viewport.width}px`;
      textLayerEl.style.height = `${viewport.height}px`;
      try {
        const textContent = await page.getTextContent();
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerEl,
          viewport,
        });
        pdfTextLayerInstanceRef.current = textLayer;
        await textLayer.render();
      } catch (err) {
        console.warn('PDF text layer error:', err);
      }
    }
  };

  // Add a ref to track the current playback session ID
  const playbackSessionRef = useRef(0);
  const handlePlayPauseRef = useRef(null);

  const handlePlayPause = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:handlePlayPause:entry',message:'handlePlayPause entry',data:{isPlayingTTS,isPaused:ttsManager.isPaused,hasActivePlayback:ttsManager.hasActivePlayback,playbackSessionRef:playbackSessionRef.current,currentPageRef:currentPageRef.current,currentPage},timestamp:Date.now(),hypothesisId:'B,C,D'})}).catch(()=>{});
    // #endregion
    // Unlock audio for delayed playback (browser autoplay policy)
    try {
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
      silent.volume = 0;
      await silent.play();
    } catch (_) { /* ignore */ }

    // 1. If actually playing, then PAUSE
    if (isPlayingTTS) {
      console.log('Reader: Pausing TTS');
      setIsPlayingTTS(false);
      ttsManager.pause();
      pause();
      return;
    }

    // 2. If it was paused and we have playback to resume, then RESUME
    if (ttsManager.isPaused && ttsManager.hasActivePlayback) {
      // #region agent log
      fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:handlePlayPause',message:'taking RESUME path',data:{},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.log('Reader: Resuming TTS');
      setIsPlayingTTS(true);
      ttsManager.resume();
      play(bookData);
      return;
    }

    // 3. If there's an active session ID set but UI shows not playing, wait a moment before creating new session
    if (playbackSessionRef.current > 0 && !isPlayingTTS) {
      console.log('Reader: Waiting for previous session to fully close');
      await new Promise(r => setTimeout(r, 100));
    }

    const sessionId = Date.now();
    playbackSessionRef.current = sessionId;

    // #region agent log
    fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:handlePlayPause',message:'taking FRESH START path',data:{sessionId,currentPageRef:currentPageRef.current,currentPage},timestamp:Date.now(),hypothesisId:'B,C'})}).catch(()=>{});
    // #endregion
    ttsManager.startSession();
    ttsManager._stopped = false;
    await new Promise((r) => setTimeout(r, 150));

    console.log('Reader: Starting fresh TTS session', sessionId);
    setIsPlayingTTS(true);
    setIsTTSLoading(true);
    play(bookData);

    try {
      if (bookData.format === 'epub') {
        for (let w = 0; w < 10 && sessionId === playbackSessionRef.current; w++) {
          const book = bookRef.current;
          const rendition = renditionRef.current;
          if (book && rendition) {
            try {
              const curr = rendition?.currentLocation;
              const loc = (typeof curr === 'function' ? curr() : curr?.()) ?? null;
              if (loc?.start?.href) break;
            } catch (_) { /* not ready */ }
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } else if (bookData.format === 'pdf') {
        for (let w = 0; w < 20 && sessionId === playbackSessionRef.current; w++) {
          if (pdfRef.current && totalPages > 0) break;
          await new Promise(r => setTimeout(r, 300));
        }
        if (!pdfRef.current || totalPages <= 0) {
          console.warn('Reader: PDF not ready for TTS');
          addToast?.('PDF is still loading. Please wait and try again.', 'info');
          setIsTTSLoading(false);
          setIsPlayingTTS(false);
          return;
        }
      }

      // Clear the "starting session" tracking now that we're ready to actually play

      while (sessionId === playbackSessionRef.current) {
        if (ttsManager._stopped) {
          console.log('Reader: Manager stopped, breaking loop');
          break;
        }

        let text = '';
        let chunks = [];
        let lastEpubHref = null;
        // Use currentPageRef for PDF - it's updated synchronously in goToPdfPage, avoiding closure staleness after nav
        let playbackPdfPage = bookData.format === 'pdf'
          ? (currentPageRef.current || 1)
          : currentPage;

        if (bookData.format === 'pdf') {
          // #region agent log
          fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:handlePlayPause:pdfLoop',message:'PDF playback page',data:{playbackPdfPage,currentPageRef:currentPageRef.current,currentPage,contentTotalPages},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.log('Reader: Playback page initialized to', playbackPdfPage, 'currentPageRef=', currentPageRef.current, 'currentPage=', currentPage);
        }

        if (bookData.format === 'epub') {
          const book = bookRef.current;
          const rendition = renditionRef.current;
          if (!book || !rendition) {
            console.warn('Reader: Book or rendition not ready');
            break;
          }
          let loc = null;
          for (let attempt = 0; attempt < 6 && sessionId === playbackSessionRef.current; attempt++) {
            try {
              const curr = rendition?.currentLocation;
              loc = (typeof curr === 'function' ? curr() : curr?.()) ?? null;
              if (loc?.start?.href) break;
            } catch (_) {
              /* rendition may not be ready yet */
            }
            if (attempt < 5) await new Promise(r => setTimeout(r, 400));
          }
          if (!loc?.start?.href) {
            const first = book.spine?.first?.();
            if (first?.href) {
              loc = { start: { href: first.href } };
            }
          }
          if (!loc?.start?.href) {
            console.warn('Reader: No location found');
            break;
          }
          let currentHref = loc.start.href;

          // Skip empty sections (covers, etc)
          while (sessionId === playbackSessionRef.current) {
            console.log('Reader: Extracting text from', currentHref);
            text = await extractTextFromSection(book, currentHref);
            text = (text || '').replace(/\s+/g, ' ').trim();
            if (text.length > 30) break;

            const section = book.spine.get(currentHref);
            const next = section?.next();
            if (!next) {
              console.log('Reader: End of spine reached');
              break;
            }
            currentHref = next.href;
            console.log('Reader: Advancing to next section for text...', currentHref);
            await rendition.display(currentHref);
          }

          if (!text || sessionId !== playbackSessionRef.current) break;
          lastEpubHref = currentHref;
          chunks = text.match(/.{1,1000}(?=\s|$)/g) || [text.substring(0, 1000)];
        } else {
          // PDF - skip empty pages (covers, image-only pages) like we do for EPUB
          const MAX_SKIP_PAGES = 15; // Stop if image-based (scanned) PDF
          let skipped = 0;
          console.log('Reader: Starting PDF skip loop, playbackPdfPage=', playbackPdfPage, 'contentTotalPages=', contentTotalPages);
          while (sessionId === playbackSessionRef.current && playbackPdfPage <= contentTotalPages && skipped < MAX_SKIP_PAGES) {
            const from = playbackPdfPage + pdfPageOffset;
            console.log('Reader: Extracting PDF page', from, '(logical page:', playbackPdfPage, ', offset:', pdfPageOffset, ')');
            text = await extractTextFromPdfDoc(pdfRef.current, from);
            const clean = (text || '').replace(/\s+/g, ' ').trim();
            if (clean.length > 30) {
              chunks = clean.match(/.{1,1000}(?=\s|$)/g) || [clean.substring(0, 1000)];
              break;
            }
            skipped += 1;
            console.log('Reader: PDF page yielded little/no text, advancing...');
            if (playbackPdfPage >= contentTotalPages) break;
            playbackPdfPage += 1;
            await goToPdfPage(playbackPdfPage);
            await new Promise(r => setTimeout(r, 300));
          }
          if (!chunks?.length) {
            if (skipped >= MAX_SKIP_PAGES) {
              console.warn('Reader: PDF appears image-based (scanned). TTS cannot read it.');
              addToast?.('This section is scanned images. TTS works with text-based PDFs. Try an earlier section or a different book.', 'info');
            } else {
              console.warn('Reader: No text found in PDF');
              addToast?.('No readable text found on this page.', 'info');
            }
            break;
          }
        }

        if (sessionId !== playbackSessionRef.current) break;

        setIsTTSLoading(false);
        if (chunks && chunks.length > 0) {
          console.log(`Reader: Sending ${chunks.length} chunks to TTS engine`);
          await ttsManager.speakContinuous(chunks, (done, total) => {
            if (bookData.format === 'pdf' && sessionId === playbackSessionRef.current) {
              const ct = Math.max(1, totalPages - pdfPageOffset);
              setPlaybackProgress(((playbackPdfPage - 1 + (done / total)) / ct) * 100);
            }
          });
        }

        // Check if session changed or stopped while reading
        const sessionChanged = sessionId !== playbackSessionRef.current;
        const stopped = ttsManager._stopped;
        const paused = ttsManager.isPaused;
        if (sessionChanged || !continuousMode || stopped || paused) {
          console.log('Reader: Loop finished', { sessionChanged, continuousMode, stopped, paused });
          break;
        }

        // Advance to next part
        if (bookData.format === 'epub') {
          let loc = null;
          try {
            const r = renditionRef.current;
            const curr = r?.currentLocation;
            loc = (typeof curr === 'function' ? curr() : curr?.()) ?? null;
          } catch (_) {
            /* rendition may not be ready */
          }
          const hrefToUse = loc?.start?.href ?? lastEpubHref;
          if (!hrefToUse) {
            console.warn('Reader: No href for advance');
            break;
          }
          const section = bookRef.current?.spine?.get(hrefToUse);
          const next = section?.next();
          if (!next) {
            console.log('Reader: Book finished');
            break;
          }
          console.log('Reader: Auto-advancing EPUB section');
          await renditionRef.current.display(next.href);
          await new Promise(r => setTimeout(r, 800));
        } else {
          if (playbackPdfPage >= contentTotalPages) {
            console.log('Reader: PDF finished');
            break;
          }
          playbackPdfPage += 1;
          console.log('Reader: Auto-advancing PDF page');
          await goToPdfPage(playbackPdfPage);
        }
      }
    } catch (err) {
      console.error('Reader: TTS Loop Error:', err);
      addToast?.(err?.message || 'TTS failed. Try Web Speech or enable backend Kokoro.', 'error');
    } finally {
      if (sessionId === playbackSessionRef.current) {
        setIsTTSLoading(false);
        // Only reset global UI states if we truly finished the whole book or errored out
        if (!ttsManager.isPaused) {
          console.log('Reader: Sequence complete, resetting UI');
          setIsPlayingTTS(false);
          pause();
          ttsManager.stop();
        }
      }
    }
  };

  handlePlayPauseRef.current = handlePlayPause;

  const stopTTSIfPlaying = () => {
    if (isPlayingTTS) {
      playbackSessionRef.current = 0;
      ttsManager.stop();
      ttsManager.isPaused = false;
      setIsPlayingTTS(false);
      pause();
    }
  };

  const prevPage = async () => {
    const wasPlaying = isPlayingTTS;
    stopTTSIfPlaying();
    if (bookData.format === 'epub') {
      const rendition = renditionRef.current;
      const book = bookRef.current;
      if (!rendition || !book) return;
      try {
        await book.ready;
        const spine = book.spine;
        if (!spine) return;
        let loc = rendition.location ?? rendition.currentLocation?.();
        const resolvedLoc = loc && typeof loc?.then === 'function' ? await loc : loc;
        const idx = resolvedLoc?.start?.index;
        const href = resolvedLoc?.start?.href;
        const section = (idx != null ? spine.get(idx) : null) || (href ? spine.get(href) : null) || spine.first?.();
        const prev = section?.prev?.() ?? (section?.index > 0 ? spine.get(section.index - 1) : null);
        if (prev?.href) {
          await rendition.display(prev.href);
        } else {
          try {
            await rendition.prev();
          } catch (_) {
            addToast?.('Start of book', 'info');
          }
        }
        if (wasPlaying) setTimeout(() => handlePlayPause(), 400);
      } catch (e) {
        addToast?.('Could not go to previous page.', 'info');
      }
    } else if (!isNavigatingRef.current) {
      if (wasPlaying) triggerPlayAfterNavRef.current = true;
      await goToPdfPage(currentPage - 1);
    }
  };

  const nextPage = async () => {
    const shouldResumeTTS = isPlayingTTS;
    stopTTSIfPlaying();
    if (bookData.format === 'epub') {
      const rendition = renditionRef.current;
      const book = bookRef.current;
      if (!rendition || !book) return;
      try {
        await book.ready;
        const spine = book.spine;
        if (!spine) return;
        let loc = rendition.location ?? rendition.currentLocation?.();
        const resolvedLoc = loc && typeof loc?.then === 'function' ? await loc : loc;
        if (resolvedLoc?.atEnd) {
          addToast?.('End of book', 'info');
          return;
        }
        const idx = resolvedLoc?.start?.index;
        const href = resolvedLoc?.start?.href;
        const section = (idx != null ? spine.get(idx) : null) || (href ? spine.get(href) : null) || spine.first?.();
        let next = section?.next?.();
        if (!next && section?.index != null && section.index < spine.length - 1) {
          for (let i = section.index + 1; i < spine.length; i++) {
            const s = spine.get(i);
            if (s?.linear && s?.href) { next = s; break; }
          }
        }
        if (next?.href) {
          await rendition.display(next.href);
        } else {
          try {
            await rendition.next();
          } catch (_) {
            addToast?.('End of book', 'info');
          }
        }
        if (shouldResumeTTS) setTimeout(() => handlePlayPause(), 400);
      } catch (e) {
        addToast?.('Could not go to next page.', 'info');
      }
    } else if (!isNavigatingRef.current) {
      // Set trigger BEFORE goToPdfPage so the effect runs when currentPage changes (effect deps include currentPage)
      if (shouldResumeTTS) {
        // #region agent log
        fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4daa43'},body:JSON.stringify({sessionId:'4daa43',location:'Reader.jsx:nextPage',message:'set trigger BEFORE goToPdfPage',data:{shouldResumeTTS},timestamp:Date.now(),hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
        // #endregion
        triggerPlayAfterNavRef.current = true;
      }
      await goToPdfPage(currentPage + 1);
    }
  };

  const handleAddBookmark = () => {
    if (bookData.format === 'epub') {
      const loc = renditionRef.current?.currentLocation();
      if (loc) {
        const doc = bookRef.current?.spine?.get(loc.start.href)?.document;
        const text = doc?.body?.textContent?.slice(0, 100) || '';
        addBookmark(bookData.id, { cfi: loc.start.cfi, text });
        setBookmarks(getBookmarks(bookData.id));
      }
    } else {
      addBookmark(bookData.id, { cfi: String(currentPage + pdfPageOffset), text: pdfText?.slice(0, 100) || '' });
      setBookmarks(getBookmarks(bookData.id));
    }
  };

  const handleAddHighlight = () => {
    if (bookData.format === 'epub') {
      const cfiRange = selectedCfiRangeRef.current;
      const loc = renditionRef.current?.currentLocation?.();
      const cfi = cfiRange || loc?.start?.cfi;
      if (cfi && selectedText) {
        addHighlight(bookData.id, { cfi, text: selectedText, color: highlightColor });
        setHighlights(getHighlights(bookData.id));
        try {
          const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === highlightColor) || HIGHLIGHT_COLORS[0];
          renditionRef.current?.annotations?.highlight?.(cfi, {}, () => {}, 'hl', {
            fill: colorInfo.color,
            'fill-opacity': '0.4',
            'mix-blend-mode': 'multiply',
          });
        } catch (_) { /* annotation may fail for some CFIs */ }
      } else if (cfi) {
        const doc = bookRef.current?.spine?.get(loc?.start?.href)?.document;
        const text = doc?.body?.textContent?.slice(0, 200) || selectedText || '';
        addHighlight(bookData.id, { cfi, text, color: highlightColor });
        setHighlights(getHighlights(bookData.id));
        try {
          const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === highlightColor) || HIGHLIGHT_COLORS[0];
          renditionRef.current?.annotations?.highlight?.(cfi, {}, () => {}, 'hl', {
            fill: colorInfo.color,
            'fill-opacity': '0.4',
            'mix-blend-mode': 'multiply',
          });
        } catch (_) { }
      } else {
        addToast?.('Select text first, then click the highlighter.', 'info');
      }
    } else {
      if (selectedText) {
        addHighlight(bookData.id, { cfi: String(currentPage + pdfPageOffset), text: selectedText, color: highlightColor });
        setHighlights(getHighlights(bookData.id));
      } else {
        addToast?.('Select text in the PDF first. If selection doesn\'t work, try a different PDF or use EPUB for full highlighting.', 'info');
      }
    }
  };

  const handleGotoHighlight = (h) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub') renditionRef.current?.display(h.cfi);
    else {
      const phys = parseInt(h.cfi) || 1;
      const contentPage = Math.max(1, Math.min(phys - pdfPageOffset, contentTotalPages));
      goToPdfPage(contentPage);
    }
    setShowHighlights(false);
  };

  const handleGotoBookmark = (bm) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub') {
      renditionRef.current?.display(bm.cfi);
    } else {
      const phys = parseInt(bm.cfi) || 1;
      const contentPage = Math.max(1, Math.min(phys - pdfPageOffset, contentTotalPages));
      goToPdfPage(contentPage);
    }
    setShowBookmarks(false);
  };

  const handleGotoToc = (item) => {
    if (item.href) {
      stopTTSIfPlaying();
      renditionRef.current?.display(item.href);
      setShowToc(false);
    }
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const opts = bookData.format === 'epub'
        ? { book: bookRef.current, format: 'epub', query: q }
        : { pdfDoc: pdfRef.current, format: 'pdf', query: q };
      const results = await searchInBook(opts);
      setSearchResults(results.slice(0, 50));
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleGotoSearchResult = (match) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub' && match.href) {
      renditionRef.current?.display(match.href);
      setShowSearch(false);
    } else if (bookData.format === 'pdf' && match.page != null) {
      const contentPage = Math.max(1, Math.min(match.page - pdfPageOffset, contentTotalPages));
      goToPdfPage(contentPage);
      setShowSearch(false);
    }
  };

  const readerStyles = {
    '--reader-font-size': `${readerFontSize}px`,
    '--reader-line-height': settings.lineHeight,
  };

  useEffect(() => {
    fontSizeRef.current = readerFontSize;
    const rendition = renditionRef.current;
    if (rendition?.themes?.fontSize) {
      rendition.themes.fontSize(`${readerFontSize}px`);
    }
  }, [readerFontSize]);

  return (
    <div className={`reader-view ${settings.theme === 'light' ? 'reader-view--light' : ''}`} style={readerStyles}>
      <div className="reader-header">
        <button
          type="button"
          className="back-btn"
          onClick={() => onBack?.()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBack?.(); } }}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.stopPropagation();
              onBack?.();
            }
          }}
          title="Back to Library"
        >
          <ChevronLeft size={20} />
          <span>Library</span>
        </button>
        <div className="book-title">
          <h2>{bookData.title}</h2>
          <p>{bookData.author}</p>
        </div>
        <div className="reader-actions">
          <button
            className={`control-btn ${showAIPanel ? 'active' : ''}`}
            onClick={() => setShowAIPanel(!showAIPanel)}
            title="AI Assistant (Explain, Define, Summarize)"
          >
            <Sparkles size={18} />
          </button>
          <button
            className={`control-btn ${showSearch ? 'active' : ''}`}
            onClick={() => {
              setShowSearch(!showSearch);
              setSearchResults([]);
              setSearchQuery('');
              if (!showSearch) {
                setShowToc(false);
                setShowBookmarks(false);
                setShowHighlights(false);
                setShowFlashcards(false);
              }
            }}
            title="Search in book"
          >
            <Search size={18} />
          </button>
          <button
            className={`control-btn ${showToc ? 'active' : ''}`}
            onClick={() => setShowToc(!showToc)}
            title="Table of contents"
          >
            <List size={18} />
          </button>
          <button
            className={`control-btn ${showBookmarks ? 'active' : ''}`}
            onClick={() => { setShowBookmarks(!showBookmarks); setShowHighlights(false); setShowFlashcards(false); }}
            title="Bookmarks"
          >
            <Bookmark size={18} />
          </button>
          <button
            className={`control-btn ${showHighlights ? 'active' : ''}`}
            onClick={() => { setShowHighlights(!showHighlights); setShowBookmarks(false); setShowFlashcards(false); }}
            title="Highlights"
          >
            <Highlighter size={18} />
          </button>
          <button className="control-btn" onClick={handleAddBookmark} title="Add bookmark">
            <Bookmark size={18} style={{ opacity: 0.6 }} />
          </button>
          <button
            className={`control-btn ${showFlashcards ? 'active' : ''}`}
            onClick={() => { setShowFlashcards(!showFlashcards); setShowBookmarks(false); setShowHighlights(false); }}
            title="Flashcards"
          >
            <Layers size={18} />
          </button>
        </div>
      </div>

      {showAIPanel && (
        <div className="reader-sidebar reader-ai">
          <AIPanel
            text={selectedText || (bookData?.format === 'pdf' && pdfText ? pdfText : '')}
            context={selectionContext || (bookData?.format === 'pdf' ? pdfText : '')}
            onClose={() => setShowAIPanel(false)}
          />
        </div>
      )}

      {showSearch && (
        <div className="reader-sidebar reader-search">
          <div className="reader-sidebar-header">
            <h3>Search in book</h3>
            <button onClick={() => setShowSearch(false)}><X size={18} /></button>
          </div>
          <div className="reader-search-form">
            <input
              type="search"
              placeholder="Search… (min 2 chars)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              className="reader-search-input"
              autoFocus
            />
            <button type="button" className="reader-search-btn" onClick={runSearch} disabled={searching || searchQuery.trim().length < 2}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="reader-search-results">
            {searchResults.length === 0 && !searching && searchQuery.trim().length >= 2 && (
              <p className="reader-search-empty">No matches found.</p>
            )}
            {searchResults.map((match, i) => (
              <button
                key={i}
                className="reader-search-result"
                onClick={() => handleGotoSearchResult(match)}
              >
                {match.page != null && (
                  <span className="reader-search-page">
                    p. {Math.max(1, match.page - pdfPageOffset)}
                  </span>
                )}
                <span className="reader-search-snippet">{match.snippet}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showToc && toc.length > 0 && (
        <div className="reader-sidebar reader-toc">
          <div className="reader-sidebar-header">
            <h3>Contents</h3>
            <button onClick={() => setShowToc(false)}><X size={18} /></button>
          </div>
          <div className="reader-toc-list">
            {toc.map((item) => (
              <div key={item.id || item.href}>
                <button onClick={() => handleGotoToc(item)}>{item.label}</button>
                {(item.subitems || []).map((sub) => (
                  <button key={sub.id} className="toc-sub" onClick={() => handleGotoToc(sub)}>
                    {sub.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {showBookmarks && (
        <div className="reader-sidebar reader-bookmarks">
          <div className="reader-sidebar-header">
            <h3>Bookmarks</h3>
            <button onClick={() => setShowBookmarks(false)}><X size={18} /></button>
          </div>
          <div className="reader-bookmarks-list">
            {bookmarks.length === 0 ? (
              <p>No bookmarks yet.</p>
            ) : (
              bookmarks.map((bm) => (
                <div key={bm.id} className="reader-bookmark-item">
                  <button onClick={() => handleGotoBookmark(bm)}>{bm.text || 'Bookmark'}</button>
                  <button
                    className="remove"
                    onClick={() => {
                      removeBookmark(bookData.id, bm.id);
                      setBookmarks(getBookmarks(bookData.id));
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showHighlights && (
        <div className="reader-sidebar reader-highlights">
          <div className="reader-sidebar-header">
            <h3>Highlights</h3>
            <button onClick={() => setShowHighlights(false)}><X size={18} /></button>
          </div>
          <div className="highlights-color-picker">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                className={`highlight-color-btn ${highlightColor === c.id ? 'active' : ''}`}
                style={{ background: c.color }}
                onClick={() => setHighlightColor(c.id)}
                title={c.label}
              />
            ))}
          </div>
          <button
            className="highlights-add-btn"
            onClick={handleAddHighlight}
            disabled={!selectedText}
            title={selectedText ? 'Add highlight' : 'Select text first'}
          >
            <Highlighter size={16} />
            <span>{selectedText ? 'Add highlight' : 'Select text, then add'}</span>
          </button>
          <div className="reader-highlights-list">
            {highlights.length === 0 ? (
              <p>No highlights yet. Select text in the book, pick a color, then click Add highlight.</p>
            ) : (
              highlights.map((h) => {
                const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === h.color) || HIGHLIGHT_COLORS[0];
                return (
                  <div key={h.id} className="reader-highlight-item">
                    <button onClick={() => handleGotoHighlight(h)}>
                      <span className="highlight-swatch" style={{ background: colorInfo.color }} />
                      {h.text || 'Highlight'}
                    </button>
                    <button
                      className="remove"
                      onClick={() => {
                        if (bookData.format === 'epub') {
                          try {
                            renditionRef.current?.annotations?.remove?.(h.cfi, 'highlight');
                          } catch (_) {}
                        }
                        removeHighlight(bookData.id, h.id);
                        setHighlights(getHighlights(bookData.id));
                      }}
                      title="Delete highlight"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {showFlashcards && (
        <FlashcardsPanel
          text={selectedText || (bookData?.format === 'pdf' ? pdfText : null)}
          getChapterText={async () => {
            if (bookData?.format === 'epub' && renditionRef.current && bookRef.current) {
              try {
                const curr = renditionRef.current?.currentLocation;
                const loc = typeof curr === 'function' ? curr() : curr?.();
                return extractTextFromSection(bookRef.current, loc?.start?.href || '') || '';
              } catch {
                return '';
              }
            }
            if (bookData?.format === 'pdf' && pdfRef.current) {
              const phys = currentPage + pdfPageOffset;
              const from = Math.max(1, phys - 1);
              const to = Math.min(pdfRef.current.numPages, phys + 2);
              try {
                return await extractTextFromPdfDocRange(pdfRef.current, from, to);
              } catch {
                return pdfText || '';
              }
            }
            return pdfText || '';
          }}
          onClose={() => setShowFlashcards(false)}
        />
      )}

      <div className="reader-main">
        <div className="reader-container">
          <button
            type="button"
            className="nav-btn prev"
            onClick={prevPage}
            onPointerDown={(e) => { e.stopPropagation(); }}
            aria-label="Previous page"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="viewer-wrapper">
            {bookData.format === 'epub' ? (
              <div ref={viewerRef} className="epub-viewer" />
            ) : (
              <div className="pdf-viewer-content">
                <div className="pdf-page-row">
                  <form className="pdf-page-indicator" onSubmit={handlePageInputSubmit}>
                    <span className="pdf-page-label">Page</span>
                    <input
                      ref={pageInputRef}
                      type="number"
                      min={1}
                      max={contentTotalPages}
                      value={pageInputValue !== '' ? pageInputValue : currentPage}
                      onChange={(e) => setPageInputValue(e.target.value)}
                      onBlur={handlePageInputSubmit}
                      onFocus={handlePageInputFocus}
                      className="pdf-page-input"
                      aria-label="Page number"
                    />
                    <span className="pdf-page-total">of {contentTotalPages}</span>
                    {pdfPageOffset > 0 && (
                      <span className="pdf-page-offset-hint" title="Skipping front matter (roman numerals, blanks)">
                        (+{pdfPageOffset} skipped)
                      </span>
                    )}
                  </form>
                  <div className="pdf-offset-control">
                    <label htmlFor="pdf-skip-pages">Skip first</label>
                    <input
                      id="pdf-skip-pages"
                      type="number"
                      min={0}
                      max={Math.max(0, totalPages - 1)}
                      value={pdfPageOffset}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, Math.max(0, totalPages - 1)));
                        const oldOffset = pdfPageOffset;
                        setPdfOffset(bookData.id, val);
                        setPdfPageOffsetState(val);
                        const phys = currentPage + oldOffset;
                        const newContentTotal = Math.max(1, totalPages - val);
                        const newContentPage = Math.max(1, Math.min(phys - val, newContentTotal));
                        setCurrentPage(newContentPage);
                      }}
                      className="pdf-offset-input"
                      title="Skip front matter (roman numerals, blank pages)"
                    />
                    <span>pages</span>
                  </div>
                </div>
                {pdfLoadError ? (
                  <div className="pdf-error">
                    <p>{pdfLoadError}</p>
                    <p className="pdf-error-hint">Try re-uploading the book or use a different file.</p>
                  </div>
                ) : pdfLoading ? (
                  <div className="pdf-loading">Loading PDF...</div>
                ) : totalPages === 0 ? (
                  <div className="pdf-error">
                    <p>Could not load PDF. The file may be missing or corrupted.</p>
                    <p className="pdf-error-hint">Delete this book from the library and re-upload it.</p>
                  </div>
                ) : (
                  <div ref={pdfPageWrapperRef} className="pdf-page-wrapper">
                    <div
                      ref={pdfPageWrapRef}
                      className="pdf-page-canvas-wrap"
                      style={
                        pdfViewport.width > 0
                          ? {
                              width: `${pdfViewport.width}px`,
                              height: `${pdfViewport.height}px`,
                            }
                          : undefined
                      }
                    >
                      <div
                        className="pdf-page-inner"
                        style={{
                          width: pdfViewport.width || undefined,
                          height: pdfViewport.height || undefined,
                        }}
                      >
                        <canvas ref={pdfCanvasRef} className="pdf-canvas" />
                        <div ref={pdfTextLayerRef} className="pdf-text-layer textLayer" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="nav-btn next"
            onClick={nextPage}
            onPointerDown={(e) => { e.stopPropagation(); }}
            aria-label="Next page"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>

      <div className="reader-footer">
        <label className="reader-continuous">
          <input
            type="checkbox"
            checked={continuousMode}
            onChange={(e) => setContinuousMode(e.target.checked)}
          />
          Continuous TTS
        </label>
        <div className="playback-container">
          <div className="playback-bar">
            <div className="playback-progress" style={{ width: `${progress}%` }} />
          </div>
          <div className="playback-info">{Math.round(progress)}%</div>
        </div>

        <div className="playback-controls">
          <button type="button" className="control-btn" onClick={prevPage}>
            <ChevronLeft size={18} />
          </button>
          <button
            className="play-btn-large"
            onClick={handlePlayPause}
            disabled={isTTSLoading}
          >
            {isTTSLoading ? (
              <div className="small-loader" />
            ) : isPlayingTTS ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" />
            )}
          </button>
          <button type="button" className="control-btn" onClick={nextPage}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Reader;
