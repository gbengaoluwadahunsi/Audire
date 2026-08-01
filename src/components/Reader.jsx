import React, { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Bookmark, List, X, Sparkles, Highlighter, Layers, Search, MoreVertical, Download, Check, Share2, FileText, Columns, Maximize2 } from 'lucide-react';
import ePub from 'epubjs';
import * as pdfjs from 'pdfjs-dist';
import { ttsManager } from '../lib/ttsManager';
import { sanitizeTextForTTS, splitIntoSentenceChunks, setSkipJunk } from '../lib/textSanitation';
import {
  extractTextFromSection,
  extractTextFromPdfDoc,
  extractTextFromPdfDocRange,
  getEpubToc,
  searchInBook,
} from '../lib/fileProcessor';
import { ocrPdfPage, ocrEpubSection, mergeOcrText, terminateOcr } from '../lib/ocr';

pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs';
const PDFJS_WASM_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/wasm/';
import { updateBookProgress, downloadBookFile, startReadingSession, endReadingSession } from '../lib/api';
import { getSettings, getPdfOffset, setPdfOffset, saveSettings } from '../lib/settings';
import { addListeningSeconds } from '../lib/listeningGoal';
import {
  setKaraokeEnabled,
  applyPdfTtsHighlight,
  applyEpubTtsHighlight,
  clearPdfTtsHighlight,
  clearEpubTtsHighlight,
} from '../lib/ttsHighlight';
import { getBookmarks, addBookmark, removeBookmark, getHighlights, addHighlight, removeHighlight, HIGHLIGHT_COLORS } from '../lib/bookmarks';
import { usePlayback } from '../context/PlaybackContext';
import AIPanel from './AIPanel';
import FlashcardsPanel from './FlashcardsPanel';
import ExportModal from './ExportModal';
import QuoteShareModal from './QuoteShareModal';

function Reader({ bookData, onBack, onSplitScreen, inSplitView, onProgressUpdate, addToast }) {
  const viewerRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);
  const pdfRef = useRef(null);

  const { play, pause, setProgress: setPlaybackProgress, setOnNext, setOnPrev, currentBook, isPlaying } = usePlayback();

  const isPlayingTTS = currentBook?.id === bookData.id && isPlaying;
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
  const [showExport, setShowExport] = useState(false);
  const [quoteShareData, setQuoteShareData] = useState(null); // { text, bookTitle, bookAuthor }
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState('idle'); // 'idle' | 'downloading' | 'done'
  const [offlineProgress, setOfflineProgress] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [selectionContext, setSelectionContext] = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const continuousModeRef = useRef(true);
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');

  // Sleep Timer state
  const [sleepTimer, setSleepTimer] = useState(null); // time in minutes, null means off
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(null); // time remaining in seconds

  useEffect(() => {
    if (sleepTimer === null) {
      setSleepTimerRemaining(null);
      return;
    }
    
    // Set the end time
    const endTime = Date.now() + sleepTimer * 60000;
    setSleepTimerRemaining(sleepTimer * 60);

    const interval = setInterval(() => {
      const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setSleepTimerRemaining(remain);
      
      if (remain <= 0) {
        setSleepTimer(null);
        ttsManager.pause();
        pause();
        addToast?.('Sleep timer ended. Playback paused.', 'info');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimer, pause, addToast]);
  const [pdfPageOffset, setPdfPageOffsetState] = useState(0);
  const pdfCanvasRef = useRef(null);
  const pdfTextLayerRef = useRef(null);
  const pdfLinkLayerRef = useRef(null);
  const ttsHighlightFromRef = useRef(0);
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
  const playbackSessionRef = useRef(0);
  const playbackStartHrefRef = useRef(null);
  const playbackStartPdfPageRef = useRef(null);
  const pageInputRef = useRef(null);
  const fontSizeRef = useRef(null);
  const selectedCfiRangeRef = useRef(null);
  const epubResizeObserverRef = useRef(null);
  const pdfViewerContentRef = useRef(null);
  const [pdfViewport, setPdfViewport] = useState({ width: 0, height: 0 });

  const settings = getSettings();
  const readerFontSize = settings.fontSize ?? 15;

  const readingSessionRef = useRef(null);
  const sessionPagesRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    startReadingSession(bookData?.id).then((session) => {
      if (mounted) readingSessionRef.current = session;
    }).catch(() => { });
    return () => {
      if (readingSessionRef.current) {
        endReadingSession(readingSessionRef.current.id, sessionPagesRef.current).catch(() => { });
      }
    };
  }, [bookData?.id]);

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
        } catch {
          // Selection APIs can throw in cross-origin iframe edge cases.
        }
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
      getBookmarks(bookData.id).then(setBookmarks);
      getHighlights(bookData.id).then(setHighlights);
    }
  }, [bookData?.id]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const s = getSettings();
    ttsManager.setSpeed(s.speed);
    ttsManager.setEdgeTtsVoice(s.edgeTtsVoice);
    setSkipJunk(s.skipJunk !== false);
    setKaraokeEnabled(!!s.karaokeHighlight);
  }, []);

  // Clear any karaoke highlight once playback stops.
  useEffect(() => {
    if (isPlayingTTS) return;
    try {
      if (bookData?.format === 'pdf') {
        clearPdfTtsHighlight(pdfTextLayerRef.current);
      } else if (bookData?.format === 'epub') {
        const contents = renditionRef.current?.getContents?.();
        const list = Array.isArray(contents) ? contents : (contents ? [contents] : []);
        if (list[0]?.document) clearEpubTtsHighlight(list[0].document);
      }
    } catch {
      /* ignore */
    }
  }, [isPlayingTTS, bookData?.format]);

  // Accumulate listening time toward the daily goal while audio is actually playing.
  useEffect(() => {
    if (!isPlayingTTS) return;
    const TICK = 5;
    const id = setInterval(() => {
      if (!ttsManager.isPaused && ttsManager.hasActivePlayback) {
        addListeningSeconds(TICK);
      }
    }, TICK * 1000);
    return () => clearInterval(id);
  }, [isPlayingTTS]);



  useEffect(() => {
    if (bookData?.format !== 'pdf' || pdfLoading || totalPages <= 0 || !pdfRef.current) return;
    const phys = currentPage + pdfPageOffset;
    if (phys < 1 || phys > totalPages) return;
    let cancelled = false;
    let tries = 0;
    const maxTries = 12;

    const tryRender = () => {
      if (cancelled) return;
      if (pdfCanvasRef.current) {
        renderPdfPage(phys);
        return;
      }
      if (tries >= maxTries) return;
      tries += 1;
      requestAnimationFrame(tryRender);
    };

    const rafId = requestAnimationFrame(tryRender);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [bookData?.format, pdfLoading, totalPages, currentPage, pdfPageOffset]);

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
            spread: settings.layout === 'dual' ? 'auto' : 'none',
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
              } catch {
                // Ignore annotation failures for incompatible CFI ranges.
              }
            };
            doc.addEventListener('selectionchange', notifySelection);

            // Make external links clickable (epub.js swallows link clicks by default).
            doc.addEventListener(
              'click',
              (e) => {
                const anchor = e.target?.closest?.('a[href]');
                if (!anchor) return;
                const href = anchor.getAttribute('href') || '';
                if (/^(https?:)?\/\//i.test(href) || /^mailto:/i.test(href)) {
                  e.preventDefault();
                  e.stopPropagation();
                  const abs = href.startsWith('//') ? `https:${href}` : href;
                  window.open(abs, '_blank', 'noopener,noreferrer');
                }
              },
              true
            );

            getHighlights(bookData.id).then((bookHighlights) => {
              bookHighlights.forEach((h) => {
                try {
                  const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === h.color) || HIGHLIGHT_COLORS[0];
                  rendition.annotations?.highlight?.(h.cfi, {}, () => { }, 'hl', {
                    fill: colorInfo.color,
                    'fill-opacity': '0.4',
                    'mix-blend-mode': 'multiply',
                  });
                } catch {
                  // CFI may be in different section.
                }
              });
            });

            const fontStyle = settings.fontFamily === 'System' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : settings.fontFamily;
            const marginValue = `${settings.margin}rem`;
            const paragraphSpacing = `${settings.paragraphSpacing !== undefined ? settings.paragraphSpacing : 0.5}rem`;

            const style = doc.createElement('style');
            if (settings.theme === 'dark') {
              style.innerHTML = `
                  html, body {
                      background-color: #0a0a0a !important;
                      background: #0a0a0a !important;
                      color: #e5e5e5 !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                      font-family: ${fontStyle} !important;
                      margin-left: ${marginValue} !important;
                      margin-right: ${marginValue} !important;
                  }
                  *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
                      background-color: transparent !important;
                      background: transparent !important;
                      color: #e5e5e5 !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                  p {
                      margin-top: ${paragraphSpacing} !important;
                      margin-bottom: ${paragraphSpacing} !important;
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
                      font-family: ${fontStyle} !important;
                      margin-left: ${marginValue} !important;
                      margin-right: ${marginValue} !important;
                  }
                  *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
                      background-color: transparent !important;
                      background: transparent !important;
                      color: #1a1a1a !important;
                      user-select: text !important;
                      -webkit-user-select: text !important;
                  }
                  p {
                      margin-top: ${paragraphSpacing} !important;
                      margin-bottom: ${paragraphSpacing} !important;
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
              try { r.resize(el2.offsetWidth, el2.offsetHeight); } catch {
                // Ignore transient resize errors from epubjs internals.
              }
            }
          });
          ro.observe(el);
          epubResizeObserverRef.current = ro;

          book.ready.then(() => getEpubToc(book).then(setToc));

          rendition.on('relocated', (location) => {
            const pct = book.locations?.percentageFromCfi?.(location.start.cfi) ?? 0;
            const percent = pct * 100;
            setProgress(percent);
            updateBookProgress(bookData.id, location.start.cfi, percent).catch(() => { });
            onProgressUpdate?.(bookData.id, location.start.cfi);
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
      terminateOcr();
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
    playbackStartPdfPageRef.current = contentPageNum;
    currentPageRef.current = contentPageNum;
    const phys = contentPageNum + pdfPageOffset;
    const contentTotal = Math.max(1, pdfRef.current.numPages - pdfPageOffset);
    if (contentPageNum < 1 || phys > pdfRef.current.numPages) return;
    isNavigatingRef.current = true;
    setCurrentPage(contentPageNum);
    sessionPagesRef.current += 1;
    let extractedText = '';
    try {
      extractedText = await extractTextFromPdfDoc(pdfRef.current, phys);
      setPdfText(extractedText);
    } catch (err) {
      console.error('PDF page error:', err);
    } finally {
      isNavigatingRef.current = false;
    }
    const pct = (contentPageNum / contentTotal) * 100;
    setProgress(pct);
    updateBookProgress(bookData.id, String(phys), pct, pdfRef.current.numPages).catch(() => { });
    onProgressUpdate?.(bookData.id, String(phys));
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
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') throw err;
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
    const displayScale = containerW > 0
      ? Math.min(2.5, Math.max(0.1, containerW / baseViewport.width))
      : 1.25;
    const viewport = page.getViewport({ scale: displayScale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);

    const canvas = pdfCanvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
    });
    pdfRenderTaskRef.current = renderTask;
    try {
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') throw err;
    } finally {
      if (pdfRenderTaskRef.current === renderTask) pdfRenderTaskRef.current = null;
    }
    if (pdfRenderLockRef.current !== myId || pdfRenderPendingRef.current !== pageNum) {
      return;
    }

    pdfViewportRef.current = { width: viewport.width, height: viewport.height };
    setPdfViewport({ width: viewport.width, height: viewport.height });

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

    // Clickable link layer for URI annotations (PDF hyperlinks).
    const linkLayerEl = pdfLinkLayerRef.current;
    if (linkLayerEl) {
      linkLayerEl.innerHTML = '';
      linkLayerEl.style.width = `${viewport.width}px`;
      linkLayerEl.style.height = `${viewport.height}px`;
      try {
        const annotations = await page.getAnnotations({ intent: 'display' });
        for (const a of annotations) {
          const href = a?.url || a?.unsafeUrl;
          if (a?.subtype !== 'Link' || !href || !a.rect) continue;
          const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
          const left = Math.min(x1, x2);
          const top = Math.min(y1, y2);
          const w = Math.abs(x2 - x1);
          const h = Math.abs(y2 - y1);
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.className = 'pdf-link';
          anchor.style.left = `${left}px`;
          anchor.style.top = `${top}px`;
          anchor.style.width = `${w}px`;
          anchor.style.height = `${h}px`;
          linkLayerEl.appendChild(anchor);
        }
      } catch (err) {
        console.warn('PDF link layer error:', err);
      }
    }
  };

  const handlePlayPauseRef = useRef(null);
  const ttsStartingRef = useRef(false);
  const lastPlayToggleAtRef = useRef(0);

  const handlePlayPause = async () => {
    // Guard against duplicate clicks/events firing in quick succession.
    const now = Date.now();
    if (now - lastPlayToggleAtRef.current < 250) return;
    lastPlayToggleAtRef.current = now;

    // Synchronously unlock/resume AudioContext under the user gesture context
    try {
      ttsManager.unlockAudioContext();
    } catch {
      // Ignore context errors.
    }

    // Unlock audio for delayed playback (browser autoplay policy)
    try {
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
      silent.volume = 0;
      await silent.play();
    } catch {
      // Ignore autoplay unlock failures.
    }

    // 1. If actually playing, then PAUSE
    if (isPlayingTTS) {
      console.log('Reader: Pausing TTS');
      ttsManager.pause();
      pause();
      return;
    }

    // 2. If it was paused and we have playback to resume, then RESUME
    if (
      ttsManager.isPaused &&
      ttsManager.hasActivePlayback &&
      playbackSessionRef.current === ttsManager.currentSessionId
    ) {
      console.log('Reader: Resuming TTS');
      ttsManager.resume();
      play(bookData);
      return;
    }

    // Stop any existing TTS playback globally before starting a new session
    ttsManager.stop();

    // 3. Prevent double-start (ref guard since setState is async)
    if (ttsStartingRef.current) return;
    ttsStartingRef.current = true;

    const sessionId = Date.now();
    playbackSessionRef.current = sessionId;

    ttsManager.startSession();
    ttsManager._stopped = false;

    console.log('Reader: Starting fresh TTS session', sessionId);
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
            } catch {
              // Not ready yet.
            }
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
          pause();
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
        let playbackPdfPage = bookData.format === 'pdf'
          ? (playbackStartPdfPageRef.current || currentPageRef.current || 1)
          : currentPage;

        const forcedStartHref = playbackStartHrefRef.current;
        playbackStartHrefRef.current = null;
        if (bookData.format === 'pdf') {
          playbackStartPdfPageRef.current = null;
        }

        if (bookData.format === 'pdf') {
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
            } catch {
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
          let currentHref = forcedStartHref || loc.start.href;

          // Skip empty sections (covers, etc) — cap at 20 to avoid looping the entire spine
          const MAX_EMPTY_SECTIONS = 20;
          let epubSkipped = 0;
          while (sessionId === playbackSessionRef.current && epubSkipped < MAX_EMPTY_SECTIONS) {
            console.log('Reader: Extracting text from', currentHref);
            text = await extractTextFromSection(book, currentHref);
            text = (text || '').replace(/\s+/g, ' ').trim();

            // Try OCR on EPUB section if text is short/empty or image-based figure
            if (text.length <= 15 && bookRef.current) {
              try {
                console.log('Reader: EPUB section has little text, running OCR on section images...');
                const ocrText = await ocrEpubSection(bookRef.current, currentHref);
                if (ocrText && ocrText.trim().length > 2) {
                  text = mergeOcrText(text, ocrText);
                  addToast?.('Extracted text from figure/image via OCR!', 'success');
                }
              } catch (e) {
                console.warn('Reader: EPUB section OCR failed', e);
              }
            }

            if (text.length > 2) break;

            const section = book.spine.get(currentHref);
            const next = section?.next();
            if (!next) {
              console.log('Reader: End of spine reached');
              break;
            }
            currentHref = next.href;
            epubSkipped++;
            console.log('Reader: Advancing to next section for text...', currentHref);
            await rendition.display(currentHref);
          }

          if (!text || sessionId !== playbackSessionRef.current) break;
          lastEpubHref = currentHref;
          const sanitized = sanitizeTextForTTS(text);
          chunks = splitIntoSentenceChunks(sanitized);
          if (!chunks.length) chunks = [sanitized.substring(0, 1000)];
        } else {
          // PDF - skip empty pages, falling back to OCR for scanned pages & figure images
          const MAX_SKIP_PAGES = 50;
          let skipped = 0;
          let ocrInitialized = false;
          console.log('Reader: Starting PDF skip loop, playbackPdfPage=', playbackPdfPage, 'contentTotalPages=', contentTotalPages);
          while (sessionId === playbackSessionRef.current && playbackPdfPage <= contentTotalPages && skipped < MAX_SKIP_PAGES) {
            if (!pdfRef.current) break;
            const from = playbackPdfPage + pdfPageOffset;
            console.log('Reader: Extracting PDF page', from, '(logical page:', playbackPdfPage, ', offset:', pdfPageOffset, ')');
            text = await extractTextFromPdfDoc(pdfRef.current, from);
            let clean = (text || '').replace(/\s+/g, ' ').trim();

            // If embedded text is missing or sparse/short (e.g. caption only or scanned figure), run OCR to capture figure writings & diagrams
            if (clean.length < 150) {
              try {
                if (!ocrInitialized) {
                  addToast?.('Scanning page for figure writings / image text via OCR...', 'info');
                  ocrInitialized = true;
                }
                console.log('Reader: Sparse text on page', from, '(len:', clean.length, '), trying OCR...');
                const ocrText = await ocrPdfPage(pdfRef.current, from);
                const cleanOcr = (ocrText || '').replace(/\s+/g, ' ').trim();
                if (cleanOcr.length > 2) {
                  clean = mergeOcrText(clean, cleanOcr);
                  addToast?.('Extracted figure/image text via OCR!', 'success');
                }
              } catch (ocrErr) {
                console.warn('Reader: OCR failed for page', from, ocrErr?.message);
                if (clean.length <= 2) {
                  addToast?.(`OCR failed on page ${playbackPdfPage}: ${ocrErr?.message || 'unknown error'}`, 'error');
                }
              }
            }

            if (clean.length > 2) {
              text = clean; // Preserve final text (may include merged OCR figure text) for UI state
              const sanitized = sanitizeTextForTTS(clean);
              chunks = splitIntoSentenceChunks(sanitized);
              if (!chunks.length) chunks = [sanitized.substring(0, 1000)];
              break;
            }
            skipped += 1;
            console.log('Reader: PDF page yielded little/no text, advancing...');
            if (playbackPdfPage >= contentTotalPages) break;
            playbackPdfPage += 1;
          }
          // Update visual state without blocking on canvas render (useEffect handles render)
          if (chunks?.length) {
            currentPageRef.current = playbackPdfPage;
            setCurrentPage(playbackPdfPage);
            setPdfText(text);
            const phys = playbackPdfPage + pdfPageOffset;
            const ct = Math.max(1, pdfRef.current.numPages - pdfPageOffset);
            const pct = (playbackPdfPage / ct) * 100;
            setProgress(pct);
            updateBookProgress(bookData.id, String(phys), pct, pdfRef.current.numPages).catch(() => { });
            onProgressUpdate?.(bookData.id, String(phys));
          }
          if (!chunks?.length) {
            if (skipped >= MAX_SKIP_PAGES) {
              console.warn('Reader: OCR could not extract readable text from this section.');
              addToast?.('Could not extract readable text from this section, even with OCR. The pages may be too low quality.', 'info');
            } else {
              console.warn('Reader: No text found in PDF');
              addToast?.('No readable text found on this page.', 'info');
            }
            break;
          }
        }

        if (sessionId !== playbackSessionRef.current) break;

        // No extra prefetch here — the prewarm from page-load already submitted
        // chunk 0, and runLoop submits chunk N+1 while chunk N plays. Adding more
        // jobs here would flood the serial worker queue and starve earlier chunks.

        // For Web Speech: clear loading immediately (no generation delay, starts instantly).
        // For Edge TTS: keep spinner up until the first chunk is generated and about to play,
        // so there's no silent gap between the spinner disappearing and audio starting.
        const isEdgeTTS = ttsManager.engine === 'edge-tts';
        if (!isEdgeTTS) setIsTTSLoading(false);

        if (chunks && chunks.length > 0) {
          console.log(`Reader: Sending ${chunks.length} chunks to TTS engine`);
          let firstChunkSignalled = !isEdgeTTS;
          ttsHighlightFromRef.current = 0;
          const karaokeText = text;

          await ttsManager.speakContinuous(chunks, (done, total) => {
            if (!firstChunkSignalled) {
              firstChunkSignalled = true;
              setIsTTSLoading(false); // Edge TTS: first chunk generated, audio is about to play
            }
            if (bookData.format === 'pdf' && sessionId === playbackSessionRef.current) {
              const ct = Math.max(1, totalPages - pdfPageOffset);
              setPlaybackProgress(((playbackPdfPage - 1 + (done / total)) / ct) * 100);
            }
            if (getSettings().karaokeHighlight && sessionId === playbackSessionRef.current) {
              highlightTtsChunk(chunks[done - 1], karaokeText);
            }
          }, sessionId, {
            title: bookData.title,
            author: bookData.author,
            cover: bookData.cover,
          });

          if (!firstChunkSignalled) setIsTTSLoading(false); // fallback: all chunks were skipped
        }

        // Check if session changed or stopped while reading
        const sessionChanged = sessionId !== playbackSessionRef.current;
        const stopped = ttsManager._stopped;
        const paused = ttsManager.isPaused;
        if (sessionChanged || !continuousModeRef.current || stopped || paused) {
          console.log('Reader: Loop finished', { sessionChanged, continuousMode: continuousModeRef.current, stopped, paused });
          break;
        }

        // Advance to next part
        if (bookData.format === 'epub') {
          let loc = null;
          try {
            const r = renditionRef.current;
            const curr = r?.currentLocation;
            loc = (typeof curr === 'function' ? curr() : curr?.()) ?? null;
          } catch {
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
          await scrollViewerToTop();
          await new Promise(r => setTimeout(r, 100));
        } else {
          if (playbackPdfPage >= contentTotalPages) {
            console.log('Reader: PDF finished');
            break;
          }
          playbackPdfPage += 1;
          currentPageRef.current = playbackPdfPage;
          setCurrentPage(playbackPdfPage);
          scrollViewerToTop();
          console.log('Reader: Auto-advancing PDF page to', playbackPdfPage);
        }
      }
    } catch (err) {
      console.error('Reader: TTS Loop Error:', err);
      addToast?.(err?.message || 'TTS failed. Try switching to Web Speech engine.', 'error');
    } finally {
      ttsStartingRef.current = false;
      setIsTTSLoading(false); // always clear spinner, even if session changed
      if (sessionId === playbackSessionRef.current && currentBook?.id === bookData.id) {
        setIsTTSLoading(false);
        // Only reset global UI states if we truly finished the whole book or errored out
        if (!ttsManager.isPaused) {
          console.log('Reader: Sequence complete, resetting UI');
          pause();
          ttsManager.stop();
        }
      }
    }
  };

  handlePlayPauseRef.current = handlePlayPause;

  const stopTTSIfPlaying = () => {
    const active =
      isPlayingTTS ||
      (playbackSessionRef.current === ttsManager.currentSessionId &&
        (ttsManager.isPaused || ttsManager.hasActivePlayback));
    if (active) {
      playbackSessionRef.current = 0;
      ttsManager.stop();
      ttsManager.isPaused = false;
      setIsTTSLoading(false);
      pause();
    }
  };

  const scrollViewerToTop = async () => {
    // Wait two animation frames so the new content/page is fully committed to the DOM
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    if (bookData?.format === 'epub') {
      // Scroll EPUB iframe content to top
      const iframe = viewerRef.current?.querySelector?.('iframe');
      if (iframe?.contentDocument) {
        try {
          iframe.contentDocument.documentElement.scrollTop = 0;
          iframe.contentDocument.body.scrollTop = 0;
          // Also scroll the outer viewer wrapper in case it is the scroll root
          viewerRef.current.scrollTop = 0;
        } catch {
          // Ignore cross-origin errors
        }
      }
    } else if (bookData?.format === 'pdf') {
      // Give the PDF canvas render time to complete, then scroll to top
      await new Promise((r) => setTimeout(r, 80));
      if (pdfViewerContentRef.current) {
        pdfViewerContentRef.current.scrollTop = 0;
        pdfViewerContentRef.current.scrollLeft = 0;
      }
    }
  };

  const prevPage = async () => {
    const wasActive = isPlayingTTS || ttsManager.isPaused || ttsManager.hasActivePlayback;
    stopTTSIfPlaying();
    let moved = false;
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
          playbackStartHrefRef.current = prev.href;
          await rendition.display(prev.href);
          await scrollViewerToTop();
          moved = true;
        } else {
          try {
            await rendition.prev();
            await scrollViewerToTop();
            moved = true;
          } catch {
            addToast?.('Start of book', 'info');
          }
        }
      } catch {
        addToast?.('Could not go to previous page.', 'info');
      }
    } else if (!isNavigatingRef.current) {
      const target = (currentPageRef.current || currentPage) - 1;
      await goToPdfPage(target);
      await scrollViewerToTop();
      moved = currentPageRef.current === target;
    }

    if (wasActive && moved) {
      await new Promise((r) => setTimeout(r, 120));
      await handlePlayPauseRef.current?.();
    }
  };

  const nextPage = async () => {
    const wasActive = isPlayingTTS || ttsManager.isPaused || ttsManager.hasActivePlayback;
    stopTTSIfPlaying();
    let moved = false;
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
          playbackStartHrefRef.current = next.href;
          await rendition.display(next.href);
          await scrollViewerToTop();
          moved = true;
        } else {
          try {
            await rendition.next();
            await scrollViewerToTop();
            moved = true;
          } catch {
            addToast?.('End of book', 'info');
          }
        }
      } catch {
        addToast?.('Could not go to next page.', 'info');
      }
    } else if (!isNavigatingRef.current) {
      const target = (currentPageRef.current || currentPage) + 1;
      await goToPdfPage(target);
      await scrollViewerToTop();
      moved = currentPageRef.current === target;
    }

    if (wasActive && moved) {
      await new Promise((r) => setTimeout(r, 120));
      await handlePlayPauseRef.current?.();
    }
  };

  // Register next/prev with PlaybackContext so MiniPlayer skip buttons work
  useEffect(() => {
    if (currentBook?.id === bookData.id || !currentBook) {
      setOnNext(() => nextPage);
      setOnPrev(() => prevPage);
      return () => {
        setOnNext(null);
        setOnPrev(null);
      };
    }
  }, [bookData?.id, totalPages, currentPage, pdfPageOffset, isPlayingTTS, currentBook?.id]);

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

  const highlightTtsChunk = (chunkText, rawPageText) => {
    if (!chunkText) return;
    try {
      if (bookData.format === 'pdf') {
        applyPdfTtsHighlight(
          pdfTextLayerRef.current,
          chunkText,
          ttsHighlightFromRef,
          pdfPageWrapperRef.current,
          rawPageText
        );
      } else if (bookData.format === 'epub') {
        const contents = renditionRef.current?.getContents?.();
        const list = Array.isArray(contents) ? contents : (contents ? [contents] : []);
        const doc = list[0]?.document;
        if (doc) applyEpubTtsHighlight(doc, chunkText, ttsHighlightFromRef);
      }
    } catch {
      /* highlighting is best-effort; never break playback */
    }
  };

  const handleDownloadOffline = async () => {
    if (offlineStatus === 'downloading') return;
    setOfflineStatus('downloading');
    setOfflineProgress(0);
    try {
      let rawText = '';
      if (bookData.format === 'pdf' && pdfRef.current && totalPages > 0) {
        const from = Math.min(totalPages, (currentPage || 1) + pdfPageOffset);
        const to = Math.min(totalPages, from + 24); // ~25 pages ≈ a chapter
        rawText = await extractTextFromPdfDocRange(pdfRef.current, from, to);
      } else if (bookData.format === 'epub') {
        const loc = renditionRef.current?.currentLocation?.();
        const href = loc?.start?.href;
        if (href && bookRef.current) {
          rawText = await extractTextFromSection(bookRef.current, href);
        }
      }

      const chunks = splitIntoSentenceChunks(sanitizeTextForTTS(rawText || ''));
      if (!chunks.length) {
        addToast?.('Nothing to download here yet — try once the page has loaded.', 'info');
        setOfflineStatus('idle');
        return;
      }

      ttsManager.setEdgeTtsVoice(getSettings().edgeTtsVoice);
      ttsManager.setSpeed(getSettings().speed || 1);
      const ok = await ttsManager.downloadChunks(chunks, (done, total) => {
        setOfflineProgress(total ? Math.round((done / total) * 100) : 0);
      });
      setOfflineStatus('done');
      addToast?.(`Saved ${ok} segment${ok === 1 ? '' : 's'} for offline listening`, 'success');
      setTimeout(() => setOfflineStatus('idle'), 4000);
    } catch (err) {
      console.error('Offline download failed:', err);
      addToast?.('Could not download for offline use', 'error');
      setOfflineStatus('idle');
    }
  };

  const handleAddHighlight = async () => {
    if (bookData.format === 'epub') {
      const cfiRange = selectedCfiRangeRef.current;
      const loc = renditionRef.current?.currentLocation?.();
      const cfi = cfiRange || loc?.start?.cfi;
      if (cfi && selectedText) {
        await addHighlight(bookData.id, { cfi, text: selectedText, color: highlightColor });
        setHighlights(await getHighlights(bookData.id));
        try {
          const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === highlightColor) || HIGHLIGHT_COLORS[0];
          renditionRef.current?.annotations?.highlight?.(cfi, {}, () => { }, 'hl', {
            fill: colorInfo.color,
            'fill-opacity': '0.4',
            'mix-blend-mode': 'multiply',
          });
        } catch {
          // Annotation may fail for some CFIs.
        }
      } else if (cfi) {
        const doc = bookRef.current?.spine?.get(loc?.start?.href)?.document;
        const text = doc?.body?.textContent?.slice(0, 200) || selectedText || '';
        await addHighlight(bookData.id, { cfi, text, color: highlightColor });
        setHighlights(await getHighlights(bookData.id));
        try {
          const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === highlightColor) || HIGHLIGHT_COLORS[0];
          renditionRef.current?.annotations?.highlight?.(cfi, {}, () => { }, 'hl', {
            fill: colorInfo.color,
            'fill-opacity': '0.4',
            'mix-blend-mode': 'multiply',
          });
        } catch {
          // Ignore fallback annotation failures.
        }
      } else {
        addToast?.('Select text first, then click the highlighter.', 'info');
      }
    } else {
      if (selectedText) {
        await addHighlight(bookData.id, { cfi: String(currentPage + pdfPageOffset), text: selectedText, color: highlightColor });
        setHighlights(await getHighlights(bookData.id));
      } else {
        addToast?.('Select text in the PDF first. If selection doesn\'t work, try a different PDF or use EPUB for full highlighting.', 'info');
      }
    }
  };

  const handleGotoHighlight = async (h) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub') {
      renditionRef.current?.display(h.cfi);
      await scrollViewerToTop();
    } else {
      const phys = parseInt(h.cfi) || 1;
      const contentPage = Math.max(1, Math.min(phys - pdfPageOffset, contentTotalPages));
      await goToPdfPage(contentPage);
      await scrollViewerToTop();
    }
    setShowHighlights(false);
  };

  const handleGotoBookmark = async (bm) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub') {
      renditionRef.current?.display(bm.cfi);
      await scrollViewerToTop();
    } else {
      const phys = parseInt(bm.cfi) || 1;
      const contentPage = Math.max(1, Math.min(phys - pdfPageOffset, contentTotalPages));
      await goToPdfPage(contentPage);
      await scrollViewerToTop();
    }
    setShowBookmarks(false);
  };

  const handleGotoToc = async (item) => {
    if (item.href) {
      stopTTSIfPlaying();
      renditionRef.current?.display(item.href);
      await scrollViewerToTop();
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

  const handleGotoSearchResult = async (match) => {
    stopTTSIfPlaying();
    if (bookData.format === 'epub' && match.href) {
      renditionRef.current?.display(match.href);
      await scrollViewerToTop();
      setShowSearch(false);
    } else if (bookData.format === 'pdf' && match.page != null) {
      const contentPage = Math.max(1, Math.min(match.page - pdfPageOffset, contentTotalPages));
      await goToPdfPage(contentPage);
      await scrollViewerToTop();
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

  useEffect(() => {
    if (bookData.format !== renditionRef.current) return;
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book) return;

    const currentLocation = rendition.currentLocation?.();
    const cfi = currentLocation?.start?.cfi;

    const el = viewerRef.current;
    const w = el?.offsetWidth || 800;
    const h = el?.offsetHeight || 600;

    try {
      rendition.destroy();
    } catch { /* ignore */ }

    const newRendition = book.renderTo(el, {
      width: w,
      height: h,
      flow: 'paginated',
      spread: settings.layout === 'dual' ? 'auto' : 'none',
      manager: 'default',
      allowScriptedContent: true,
    });
    renditionRef.current = newRendition;

    newRendition.on('selected', (cfiRange) => {
      selectedCfiRangeRef.current = cfiRange;
    });

    newRendition.hooks.content.register((contents) => {
      const doc = contents.document;
      if (!doc) return;

      const notifySelection = () => {
        try {
          const sel = doc.getSelection?.()?.toString?.()?.trim() ?? '';
          const ctx = doc.body?.textContent?.slice(0, 500) ?? '';
          setSelectedText(sel);
          setSelectionContext(ctx);
        } catch { /* ignore */ }
      };
      doc.addEventListener('selectionchange', notifySelection);

      const bookHighlights = getHighlights(bookData.id);
      bookHighlights.forEach((h) => {
        try {
          const colorInfo = HIGHLIGHT_COLORS.find((c) => c.id === h.color) || HIGHLIGHT_COLORS[0];
          newRendition.annotations?.highlight?.(h.cfi, {}, () => { }, 'hl', {
            fill: colorInfo.color,
            'fill-opacity': '0.4',
            'mix-blend-mode': 'multiply',
          });
        } catch { /* ignore */ }
      });

      const fontStyle = settings.fontFamily === 'System' ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' : settings.fontFamily;
      const marginValue = `${settings.margin}rem`;
      const paragraphSpacing = `${settings.paragraphSpacing !== undefined ? settings.paragraphSpacing : 0.5}rem`;

      const style = doc.createElement('style');
      if (settings.theme === 'dark') {
        style.innerHTML = `
          html, body {
              background-color: #0a0a0a !important;
              background: #0a0a0a !important;
              color: #e5e5e5 !important;
              user-select: text !important;
              -webkit-user-select: text !important;
              font-family: ${fontStyle} !important;
              margin-left: ${marginValue} !important;
              margin-right: ${marginValue} !important;
          }
          *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
              background-color: transparent !important;
              background: transparent !important;
              color: #e5e5e5 !important;
              user-select: text !important;
              -webkit-user-select: text !important;
          }
          p {
              margin-top: ${paragraphSpacing} !important;
              margin-bottom: ${paragraphSpacing} !important;
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
              font-family: ${fontStyle} !important;
              margin-left: ${marginValue} !important;
              margin-right: ${marginValue} !important;
          }
          *, div, p, span, h1, h2, h3, h4, h5, h6, li, blockquote, section, article {
              background-color: transparent !important;
              background: transparent !important;
              color: #1a1a1a !important;
              user-select: text !important;
              -webkit-user-select: text !important;
          }
          p {
              margin-top: ${paragraphSpacing} !important;
              margin-bottom: ${paragraphSpacing} !important;
          }
        `;
      }
      doc.head.appendChild(style);
    });

    if (cfi) {
      newRendition.display(cfi);
    }
  }, [settings.layout]);

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
            className={`control-btn mobile-visible ${showAIPanel ? 'active' : ''}`}
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
            className={`control-btn ${offlineStatus !== 'idle' ? 'active' : ''}`}
            onClick={handleDownloadOffline}
            disabled={offlineStatus === 'downloading'}
            title="Download this section for offline listening"
          >
            {offlineStatus === 'downloading' ? (
              <span className="offline-progress-label">{offlineProgress}%</span>
            ) : offlineStatus === 'done' ? (
              <Check size={18} />
            ) : (
              <Download size={18} />
            )}
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
          <button
            className="control-btn"
            onClick={() => setShowExport(true)}
            title="Export Highlights"
          >
            <FileText size={18} />
          </button>
          {onSplitScreen && (
            <button
              className="control-btn"
              onClick={onSplitScreen}
              title={inSplitView ? "Exit Split View (Maximize)" : "Split Screen Reading"}
            >
              {inSplitView ? <Maximize2 size={18} /> : <Columns size={18} />}
            </button>
          )}

          {/* Mobile-only More button — opens drawer */}
          <button
            className="control-btn reader-mobile-more-btn"
            onClick={() => setShowMobileDrawer(true)}
            title="More options"
          >
            <MoreVertical size={18} />
          </button>
        </div>

        <div className="playback-controls">
          <button
            className="play-btn-large"
            onClick={handlePlayPause}
            disabled={isTTSLoading}
            title={isPlayingTTS ? "Pause TTS" : "Play TTS"}
          >
            {isTTSLoading ? (
              <div className="small-loader" />
            ) : isPlayingTTS ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <div className="reader-continuous-inline">
            <label title="Continuous TTS">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => { setContinuousMode(e.target.checked); continuousModeRef.current = e.target.checked; }}
              /> Cont.
            </label>
          </div>
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
                    onClick={async () => {
                      await removeBookmark(bookData.id, bm.id);
                      setBookmarks(await getBookmarks(bookData.id));
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
                    <div className="reader-highlight-actions">
                      <button
                        className="share"
                        onClick={() => setQuoteShareData({ text: h.text, bookTitle: bookData.title, bookAuthor: bookData.author })}
                        title="Share as quote card"
                      >
                        <Share2 size={13} />
                      </button>
                      <button
                        className="remove"
                        onClick={async () => {
                          if (bookData.format === 'epub') {
                            try {
                              renditionRef.current?.annotations?.remove?.(h.cfi, 'highlight');
                            } catch {
                              // Ignore scroll-sync edge cases during selection.
                            }
                          }
                          await removeHighlight(bookData.id, h.id);
                          setHighlights(await getHighlights(bookData.id));
                        }}
                        title="Delete highlight"
                      >
                        <X size={13} />
                      </button>
                    </div>
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
              <div ref={pdfViewerContentRef} className="pdf-viewer-content">
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
                    <span className="pdf-page-total">
                      <span className="pdf-page-total-label">of</span>
                      <span className="pdf-page-total-value">{contentTotalPages}</span>
                    </span>
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
                        <div ref={pdfLinkLayerRef} className="pdf-link-layer" />
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

      {/* ===== SELECTION TOOLTIP ===== */}
      {selectedText && (
        <div className="reader-selection-tooltip" style={{
          position: 'absolute',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-full)',
          padding: '8px 16px',
          display: 'flex',
          gap: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}>
          <button 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              handleAddHighlight();
              if (bookData.format === 'epub') {
                const iframe = viewerRef.current?.querySelector?.('iframe');
                iframe?.contentDocument?.getSelection?.()?.empty?.();
              } else {
                window.getSelection?.()?.empty?.();
              }
              setSelectedText('');
              setSelectionContext('');
            }}
          >
            <Highlighter size={16} color="var(--primary)" /> Highlight
          </button>
          <div style={{ width: 1, background: 'var(--border)' }} />
          <button 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              navigator.clipboard.writeText(selectedText);
              addToast?.('Copied to clipboard', 'success');
              if (bookData.format === 'epub') {
                const iframe = viewerRef.current?.querySelector?.('iframe');
                iframe?.contentDocument?.getSelection?.()?.empty?.();
              } else {
                window.getSelection?.()?.empty?.();
              }
              setSelectedText('');
              setSelectionContext('');
            }}
          >
            <Bookmark size={16} /> Copy
          </button>
        </div>
      )}

      {/* ===== MOBILE OPTIONS DRAWER ===== */}
      {showMobileDrawer && (
        <div className="reader-mobile-drawer-overlay" onClick={() => setShowMobileDrawer(false)}>
          <div className="reader-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="reader-mobile-drawer-title">Reader Options</div>

            <button
              className={`reader-mobile-drawer-item ${showSearch ? 'active' : ''}`}
              onClick={() => {
                setShowSearch(!showSearch);
                setSearchResults([]);
                setSearchQuery('');
                if (!showSearch) { setShowToc(false); setShowBookmarks(false); setShowHighlights(false); setShowFlashcards(false); }
                setShowMobileDrawer(false);
              }}
            >
              <Search size={20} /> Search in Book
            </button>

            <button
              className={`reader-mobile-drawer-item ${showToc ? 'active' : ''}`}
              onClick={() => { setShowToc(!showToc); setShowMobileDrawer(false); }}
            >
              <List size={20} /> Table of Contents
            </button>

            <div className="reader-mobile-drawer-divider" />

            <button
              className={`reader-mobile-drawer-item ${showBookmarks ? 'active' : ''}`}
              onClick={() => { setShowBookmarks(!showBookmarks); setShowHighlights(false); setShowFlashcards(false); setShowMobileDrawer(false); }}
            >
              <Bookmark size={20} /> Bookmarks
            </button>

            <button
              className="reader-mobile-drawer-item"
              onClick={() => { handleAddBookmark(); setShowMobileDrawer(false); }}
            >
              <Bookmark size={20} style={{ opacity: 0.6 }} /> Add Bookmark
            </button>

            <button
              className={`reader-mobile-drawer-item ${showHighlights ? 'active' : ''}`}
              onClick={() => { setShowHighlights(!showHighlights); setShowBookmarks(false); setShowFlashcards(false); setShowMobileDrawer(false); }}
            >
              <Highlighter size={20} /> Highlights
            </button>

            <div className="reader-mobile-drawer-divider" />

            <button
              className={`reader-mobile-drawer-item ${showFlashcards ? 'active' : ''}`}
              onClick={() => { setShowFlashcards(!showFlashcards); setShowBookmarks(false); setShowHighlights(false); setShowMobileDrawer(false); }}
            >
              <Layers size={20} /> Flashcards
            </button>

            <div className="reader-mobile-drawer-divider" />

            <div className="reader-mobile-drawer-continuous">
              <label>
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => { setContinuousMode(e.target.checked); continuousModeRef.current = e.target.checked; }}
                />
                Continuous TTS
              </label>
            </div>

            <div className="reader-mobile-drawer-continuous">
              <label>
                <input
                  type="checkbox"
                  checked={settings.layout === 'dual'}
                  onChange={(e) => {
                    const next = e.target.checked ? 'dual' : 'single';
                    saveSettings({ ...settings, layout: next });
                  }}
                />
                Dual-page (Spread)
              </label>
            </div>

            <div className="reader-mobile-drawer-continuous">
              <label>
                <span>Sleep Timer</span>
                <select
                  value={sleepTimer || ''}
                  onChange={(e) => setSleepTimer(e.target.value ? parseInt(e.target.value, 10) : null)}
                  style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)' }}
                >
                  <option value="">Off</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <ExportModal 
          bookData={bookData} 
          onClose={() => setShowExport(false)} 
          addToast={addToast} 
        />
      )}

      {quoteShareData && (
        <QuoteShareModal
          text={quoteShareData.text}
          bookTitle={quoteShareData.bookTitle}
          bookAuthor={quoteShareData.bookAuthor}
          onClose={() => setQuoteShareData(null)}
          addToast={addToast}
        />
      )}

      {/* ===== MOBILE READER FOOTER ===== */}
      <div className="reader-mobile-footer">
        <button
          type="button"
          className="reader-mobile-footer-btn"
          onClick={prevPage}
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="reader-mobile-footer-progress">
          <div className="reader-mobile-footer-page">
            {bookData.format === 'pdf'
              ? `Page ${currentPage} of ${contentTotalPages}`
              : `${Math.round(progress)}%`}
          </div>
          <div className="reader-mobile-footer-bar">
            <div
              className="reader-mobile-footer-bar-fill"
              style={{ width: `${Math.round(progress)}%` }}
            />
          </div>
        </div>

        <button
          className="reader-mobile-play-btn"
          onClick={handlePlayPause}
          disabled={isTTSLoading}
          title={isPlayingTTS ? 'Pause TTS' : 'Play TTS'}
        >
          {isTTSLoading ? (
            <div className="small-loader" />
          ) : isPlayingTTS ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>

        <button
          type="button"
          className="reader-mobile-footer-btn"
          onClick={nextPage}
          aria-label="Next page"
        >
          <ChevronRight size={22} />
        </button>
      </div>
    </div>
  );
}

export default Reader;
