/**
 * Full Reader — text view + TTS (Speechify-style listen-while-you-read).
 * Loads book from IndexedDB, shows page text, sentence highlight sync, play/pause/speed/voice, bookmarks.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { getFile } from '../lib/state';
import { createBook, splitSentences, splitIntoParagraphs, isFigureOrTableCaption } from '../lib/parsers';
import {
  loadBook,
  updateReadingPosition,
  updateLibraryProgress,
  loadSettings,
  saveSettings,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getHighlights,
  addHighlight,
  removeHighlight,
  updateHighlightNote,
  removeFromLibrary,
  getSummaries,
  addSummary,
  removeSummary,
  recordListening,
  getBookVoiceProfile,
  setBookVoiceProfile,
  getVoiceFavorites,
  toggleVoiceFavorite,
  getCachedPageText,
  setCachedPageText,
} from '../lib/state';
import { FORMATS } from '../lib/summaryFormats';
import { setCallbacks, getEngine, getBrowserVoices, getBrowserVoicesSorted, getPreferredNaturalVoice, checkBackend, preloadModel, isPiperReady, prebufferStreamChunks, FIXED_PIPER_VOICE_ID, getPiperVoices, hasOfflineAudioForPage } from '../lib/tts';

function TTS() { return getEngine(); }

function PdfRightPanel({ pdfRightRef, pdfPages, totalPages, currentPage, theme, displayPageLabel }) {
  const bgClass = theme === 'dark' ? 'bg-slate-900/50' : theme === 'light' ? 'bg-slate-50' : 'bg-amber-50/50';
  const textMuted = theme === 'dark' ? 'text-slate-500' : theme === 'light' ? 'text-slate-400' : 'text-amber-500';
  const borderClass = theme === 'dark' ? 'border-border-dark' : theme === 'light' ? 'border-slate-200' : 'border-amber-200';

  return (
    <div className={`w-full lg:w-1/2 flex flex-col min-h-0 ${bgClass}`}>
      {/* PDF page label only — same page as left; navigation is in the main footer */}
      <div className={`shrink-0 flex items-center justify-center px-3 py-2 border-b ${borderClass}`}>
        <span className={`text-xs font-medium ${textMuted}`}>
          Page {displayPageLabel(currentPage)} of {totalPages}
        </span>
      </div>
      {/* PDF page display — always the same page as the text on the left */}
      <div ref={pdfRightRef} className="flex-1 overflow-y-auto p-4">
        {pdfPages[currentPage] ? (
          <img
            src={pdfPages[currentPage]}
            alt={`Page ${currentPage}`}
            className={`w-full rounded shadow-lg ${theme === 'dark' ? 'border border-slate-700' : 'border border-slate-300'}`}
          />
        ) : (
          <div className={`flex items-center justify-center rounded aspect-[3/4] ${theme === 'dark' ? 'bg-slate-800/50 text-slate-600' : theme === 'light' ? 'bg-slate-200 text-slate-400' : 'bg-amber-100 text-amber-400'}`}>
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl block mb-2 animate-pulse">hourglass_top</span>
              <p className="text-sm">Rendering…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Reader({ book, onBack, autoPlay = false }) {
  const name = book?.name || '';
  const size = Number(book?.size) || 0;
  const title = book?.title || book?.name?.replace(/\.[^.]+$/, '') || 'Untitled';
  const author = book?.author || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookInstance, setBookInstance] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageText, setPageText] = useState('');
  const [sentences, setSentences] = useState([]);
  const [paragraphBreaks, setParagraphBreaks] = useState(new Set());
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [voice, setVoice] = useState('');
  const [voices, setVoices] = useState(() => getBrowserVoicesSorted());
  const [voiceFavorites, setVoiceFavorites] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [showHighlights, setShowHighlights] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState(null);
  const [helperResult, setHelperResult] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState(null);
  const wasManuallyPlaying = useRef(false);
  const [pageHasVisualContent, setPageHasVisualContent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSummaries, setShowSummaries] = useState(false);
  const [summaries, setSummaries] = useState([]);
  const [expandedFormat, setExpandedFormat] = useState(null);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState('serif');
  const [lineSpacing, setLineSpacing] = useState(1.6);
  const [theme, setTheme] = useState('dark');
  const [sleepTimer, setSleepTimer] = useState(null);
  const [sleepTimeRemaining, setSleepTimeRemaining] = useState(null);
  const [goToPageInput, setGoToPageInput] = useState('');
  const [pageLabels, setPageLabels] = useState(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const [searchScope, setSearchScope] = useState('page'); // page | book
  const [bookSearchResults, setBookSearchResults] = useState([]);
  const [bookSearching, setBookSearching] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [dyslexiaMode, setDyslexiaMode] = useState(false);
  const [largeControls, setLargeControls] = useState(false);
  const [pdfPages, setPdfPages] = useState({});
  const [modelStatus, setModelStatus] = useState(() =>
    isPiperReady() ? { status: 'ready', progress: 100, message: 'Voice ready!' } : null
  );
  const [offlineAudioReady, setOfflineAudioReady] = useState(false);
  const [offlinePreparing, setOfflinePreparing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const sentenceRefs = useRef({});
  const contentRef = useRef(null);
  const sleepTimerRef = useRef(null);
  const currentPageRef = useRef(currentPage);
  const currentSentenceRef = useRef(currentSentenceIdx);
  const totalPagesRef = useRef(totalPages);
  const bookLoadedRef = useRef(false);
  const ttsToDisplayRef = useRef([]);
  const displayToTtsRef = useRef([]);
  const ttsSentencesRef = useRef([]);
  const progressBarRef = useRef(null);
  const autoAdvanceTriggeredRef = useRef(false);
  const advancingToPageRef = useRef(null);
  const loadedPageForContentRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { currentSentenceRef.current = currentSentenceIdx; }, [currentSentenceIdx]);
  useEffect(() => { totalPagesRef.current = totalPages; }, [totalPages]);

  // Build TTS-only sentence list (skip figure/table captions) so voice and body text stay in sync
  const { ttsSentences, ttsToDisplay, displayToTts } = (() => {
    const td = [];
    const dt = [];
    let ttsIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
      if (!isFigureOrTableCaption(sentences[i])) {
        td[ttsIdx] = i;
        dt[i] = ttsIdx;
        ttsIdx++;
      } else {
        dt[i] = ttsIdx;
      }
    }
    const filtered = sentences.filter((s) => !isFigureOrTableCaption(s));
    const ttsSentences = filtered.length > 0 ? filtered : sentences;
    const ttsToDisplayFinal = filtered.length > 0 ? td : sentences.map((_, i) => i);
    const displayToTtsFinal = filtered.length > 0 ? dt : sentences.map((_, i) => i);
    return { ttsSentences, ttsToDisplay: ttsToDisplayFinal, displayToTts: displayToTtsFinal };
  })();
  useEffect(() => {
    ttsToDisplayRef.current = ttsToDisplay;
    displayToTtsRef.current = displayToTts;
    ttsSentencesRef.current = ttsSentences;
  }, [ttsToDisplay, displayToTts, ttsSentences]);

  const beginListeningSession = useCallback(() => {
    if (!listenSessionStartedAtRef.current) {
      listenSessionStartedAtRef.current = Date.now();
      listenSessionWordsRef.current = 0;
    }
  }, []);

  const flushListeningSession = useCallback(() => {
    const startedAt = listenSessionStartedAtRef.current;
    if (!startedAt) return;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const words = Math.max(0, listenSessionWordsRef.current || 0);
    listenSessionStartedAtRef.current = null;
    listenSessionWordsRef.current = 0;
    recordListening(name, size, { seconds: elapsedSeconds, words });
  }, [name, size]);

  // Save position when leaving the reader — only if book was actually loaded
  useEffect(() => {
    return () => {
      if (name && size && bookLoadedRef.current) {
        try {
          updateReadingPosition(name, size, { page: currentPageRef.current, sentence: currentSentenceRef.current });
          if (totalPagesRef.current > 0) {
            updateLibraryProgress(name, size, currentPageRef.current, totalPagesRef.current);
          }
        } catch { /* localStorage may be full */ }
      }
    };
  }, [name, size]);

  // Load text settings from localStorage
  useEffect(() => {
    const saved = loadSettings();
    if (saved.fontSize) setFontSize(saved.fontSize);
    if (saved.fontFamily) setFontFamily(saved.fontFamily);
    if (saved.lineSpacing) setLineSpacing(saved.lineSpacing);
    if (saved.theme) setTheme(saved.theme);
    if (saved.dyslexiaMode) setDyslexiaMode(Boolean(saved.dyslexiaMode));
    if (saved.largeControls) setLargeControls(Boolean(saved.largeControls));
    setVoiceFavorites(getVoiceFavorites());
  }, []);

  // When Piper is ready, switch to Piper voices (including on mount if already loaded)
  useEffect(() => {
    if (isPiperReady()) {
      const list = getPiperVoices();
      const profile = getBookVoiceProfile(name, size);
      const savedVoice = profile?.voice;
      const valid = list.some((v) => v.id === savedVoice) ? savedVoice : FIXED_PIPER_VOICE_ID;
      setVoices(list);
      setVoice(valid);
      TTS().setVoice(valid);
    } else if (modelStatus?.status === 'failed') {
      const list = getBrowserVoicesSorted();
      const settings = loadSettings();
      const savedVoice = settings.edgeVoice || '';
      const preferred = getPreferredNaturalVoice(list);
      const defaultURI = preferred?.voiceURI || list[0]?.voiceURI || '';
      const validVoice = list.some((v) => v.voiceURI === savedVoice) ? savedVoice : defaultURI;
      setVoices(list);
      setVoice(validVoice);
      TTS().setVoice(validVoice);
    }
  }, [modelStatus?.status, name, size]);

  // Keep browser voice list up-to-date when not using Piper
  useEffect(() => {
    if (isPiperReady()) return;
    const refresh = () => {
      const list = getBrowserVoicesSorted();
      setVoices(list);
      if (list.length > 0) {
        setVoice((prev) => {
          const inList = list.some((v) => v.voiceURI === prev);
          if (inList) {
            TTS().setVoice(prev);
            return prev;
          }
          const preferred = getPreferredNaturalVoice(list);
          const uri = preferred?.voiceURI || list[0]?.voiceURI || '';
          TTS().setVoice(uri);
          return uri;
        });
      }
    };
    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', refresh);
      refresh();
    }
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refresh);
  }, [modelStatus?.status]);

  // Sleep timer countdown
  useEffect(() => {
    if (!sleepTimer) return;
    sleepTimerRef.current = setInterval(() => {
      setSleepTimeRemaining(prev => {
        if (prev && prev > 1000) {
          return prev - 1000;
        } else {
          TTS().pause();
          setPlaying(false);
          setPaused(false);
          setSleepTimer(null);
          setSleepTimeRemaining(null);
          return null;
        }
      });
    }, 1000);
    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, [sleepTimer]);

  const nextPageTextCacheRef = useRef(null);
  const nextPageBufferedRef = useRef(null);

  const loadBookContent = useCallback(async () => {
    if (!bookInstance || currentPage < 1) return;
    try {
      const cached = nextPageTextCacheRef.current;
      let text;
      if (cached?.page === currentPage) {
        text = cached.text;
      } else {
        const offlineCached = await getCachedPageText(name, size, currentPage);
        if (typeof offlineCached === 'string' && offlineCached.length > 0) {
          text = offlineCached;
        } else {
          text = await bookInstance.pageText(currentPage);
          setCachedPageText(name, size, currentPage, text).catch(() => {});
        }
      }
      if (cached?.page === currentPage) nextPageTextCacheRef.current = null;
      loadedPageForContentRef.current = currentPage;
      setPageText(text);
      const { sentences: s, paragraphBreaks: pb } = splitIntoParagraphs(text);
      setSentences(s);
      setParagraphBreaks(pb);
      
      // Detect if page has visual content (tables, images, diagrams)
      const hasVisualContent = /\b(table|figure|image|diagram|chart|graph|illustration|photo|picture|matrix|grid|layout)\b/i.test(text) ||
                                /^(\|.*\|.*\||\+-+\+|[\-=]{3,})/m.test(text) ||
                                /\[\s*[A-Za-z\s]*(?:figure|image|table|diagram|chart)\s*\]/i.test(text);
      setPageHasVisualContent(hasVisualContent);
      
      const saved = loadBook(name, size);
      const idx = saved.page === currentPage ? Math.min(saved.sentence ?? 0, Math.max(0, s.length - 1)) : 0;
      setCurrentSentenceIdx(idx);
    } catch {
      loadedPageForContentRef.current = currentPage;
      setPageText('');
      setSentences([]);
      setParagraphBreaks(new Set());
      setCurrentSentenceIdx(0);
      setPageHasVisualContent(false);
    }
  }, [bookInstance, currentPage, name, size]);

  useEffect(() => {
    if (!bookInstance) return;
    loadBookContent();
  }, [bookInstance, currentPage, loadBookContent]);

  useEffect(() => {
    if (!bookInstance || currentPage < 1 || currentPage >= totalPages) return;
    const nextPage = currentPage + 1;
    bookInstance.pageText(nextPage).then((text) => {
      nextPageTextCacheRef.current = { page: nextPage, text };
      setCachedPageText(name, size, nextPage, text).catch(() => {});
      if (!isPiperReady()) return;
      const { sentences: s } = splitIntoParagraphs(text);
      const filtered = s.filter((sent) => !isFigureOrTableCaption(sent));
      const ttsList = filtered.length > 0 ? filtered : s;
      if (ttsList.length > 0) {
        const voiceId = voice && typeof voice === 'string' ? voice : FIXED_PIPER_VOICE_ID;
        const rate = typeof speed === 'number' && speed > 0 ? speed : 1;
        const promise = prebufferStreamChunks(ttsList, voiceId, rate);
        nextPageBufferedRef.current = { page: nextPage, promise };
      }
    }).catch(() => {});
  }, [bookInstance, currentPage, totalPages, voice, speed]);

  useEffect(() => {
    let alive = true;
    if (!isPiperReady() || ttsSentences.length === 0) {
      setOfflineAudioReady(false);
      return () => { alive = false; };
    }
    const activeVoice = voice && typeof voice === 'string' ? voice : FIXED_PIPER_VOICE_ID;
    const activeRate = typeof speed === 'number' && speed > 0 ? speed : 1;
    hasOfflineAudioForPage(ttsSentences, activeVoice, activeRate)
      .then((ok) => { if (alive) setOfflineAudioReady(Boolean(ok)); })
      .catch(() => { if (alive) setOfflineAudioReady(false); });
    return () => { alive = false; };
  }, [ttsSentences, voice, speed]);

  const renderPdfPage = useCallback(async (pageNum) => {
    try {
      const cacheKey = `${name}__${size}`;
      const pdfDoc = globalThis._pdfDocCache?.[cacheKey];
      if (!pdfDoc) return null;
      
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL();
    } catch (e) {
      console.warn(`Failed to render PDF page ${pageNum}:`, e);
      return null;
    }
  }, [name, size]);

  const pdfRightRef = useRef(null);
  const renderingRef = useRef(new Set());
  const listenSessionStartedAtRef = useRef(null);
  const listenSessionWordsRef = useRef(0);

  // Render visible PDF pages in batches for the right-side viewer
  const renderPdfBatch = useCallback(async (startPage, count) => {
    if (!totalPages) return;
    const cacheKey = `${name}__${size}`;
    const pdfDoc = globalThis._pdfDocCache?.[cacheKey];
    if (!pdfDoc) return;

    for (let i = startPage; i < Math.min(startPage + count, totalPages + 1); i++) {
      if (renderingRef.current.has(i)) continue;
      renderingRef.current.add(i);
      
      const imgData = await renderPdfPage(i);
      if (imgData) {
        setPdfPages((prev) => ({ ...prev, [i]: imgData }));
      }
    }
  }, [name, size, totalPages, renderPdfPage]);

  // When split screen opens or current page changes, render that PDF page + nearby
  useEffect(() => {
    if (!splitScreen || !name.toLowerCase().endsWith('.pdf') || !totalPages) return;
    const start = Math.max(1, currentPage - 1);
    renderPdfBatch(start, 5);
  }, [splitScreen, name, totalPages, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps


  // Load book from IndexedDB and open with parser
  useEffect(() => {
    let mounted = true;
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const buffer = await getFile(name, size);
        if (!mounted) return;
        if (!buffer) {
          setError('Book file not found. Re-add it from your library.');
          setLoading(false);
          return;
        }
        // Clone the buffer before pdf.js consumes/detaches it
        const bufferForSplitScreen = name.toLowerCase().endsWith('.pdf') ? buffer.slice(0) : null;

        const instance = createBook(name);
        await instance.open(buffer);
        if (!mounted) return;
        const pages = instance.pages || 0;
        
        // Validate book has content
        if (!pages || pages < 1) {
          setError('Book appears to be corrupted or empty. Please re-add it.');
          setLoading(false);
          return;
        }
        
        setBookInstance(instance);
        setTotalPages(pages);
        if (instance.pageLabels) setPageLabels(instance.pageLabels);
        setChapters(Array.isArray(instance.chapters) ? instance.chapters : []);
        
        // Store PDF document for on-demand split-screen page rendering
        if (bufferForSplitScreen) {
          try {
            const pdfDoc = await pdfjsLib.getDocument({ data: bufferForSplitScreen }).promise;
            if (!globalThis._pdfDocCache) globalThis._pdfDocCache = {};
            globalThis._pdfDocCache[`${name}__${size}`] = pdfDoc;
          } catch (e) { console.warn('PDF split-screen cache failed:', e.message); }
        }
        
        const saved = loadBook(name, size);
        // Use saved position, or fall back to library currentPage (e.g. from sync or another device)
        const savedPage = saved.page >= 1 ? saved.page : (book?.currentPage >= 1 ? book.currentPage : 1);
        const page = Math.max(1, Math.min(savedPage, pages || 1));
        setCurrentPage(page);
        bookLoadedRef.current = true;
        if (saved.page < 1 && page > 1) {
          updateReadingPosition(name, size, { page, sentence: 0 });
        }
        updateLibraryProgress(name, size, page, pages);
        setBookmarks(getBookmarks(name, size));
        setHighlights(getHighlights(name, size));
        setSummaries(getSummaries(name, size));
        const settings = loadSettings();
        const bookSpeed = settings.bookSpeeds?.[name] ?? settings.rate ?? 1;
        setSpeed(bookSpeed);
        TTS().setRate(bookSpeed);
        TTS().setVolume(settings.volume ?? 1);
        if (isPiperReady()) {
          const list = getPiperVoices();
          const profile = getBookVoiceProfile(name, size);
          const preferred = profile?.voice;
          const validVoice = list.some((v) => v.id === preferred) ? preferred : FIXED_PIPER_VOICE_ID;
          const profileRate = typeof profile?.rate === 'number' ? profile.rate : null;
          setVoices(list);
          setVoice(validVoice);
          TTS().setVoice(validVoice);
          if (profileRate && profileRate >= 0.5 && profileRate <= 2) {
            setSpeed(profileRate);
            TTS().setRate(profileRate);
          }
        } else {
          const savedVoice = settings.edgeVoice || '';
          const browserVoices = getBrowserVoices();
          const preferred = getPreferredNaturalVoice(browserVoices);
          const defaultURI = preferred?.voiceURI || browserVoices[0]?.voiceURI || '';
          const validVoice = browserVoices.some((v) => v.voiceURI === savedVoice) ? savedVoice : defaultURI;
          setVoices(getBrowserVoicesSorted());
          setVoice(validVoice);
          TTS().setVoice(validVoice);
        }
      } catch (e) {
        if (mounted) setError(e?.message || 'Failed to open book. It may be corrupted.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      flushListeningSession();
      TTS().stop();
    };
  }, [name, size, flushListeningSession]);

  // TTS callbacks: highlight sync + persist position
  const sentencesLenRef = useRef(0);
  useEffect(() => { sentencesLenRef.current = sentences.length; }, [sentences.length]);

  useEffect(() => {
    // Set callbacks FIRST so model progress updates reach React state.
    // All callbacks are wrapped in try/catch and mountedRef so they never throw or setState after unmount.
    setCallbacks({
      start: (ttsIdx) => {
        if (!mountedRef.current) return;
        try {
          beginListeningSession();
          const displayIdx = ttsToDisplayRef.current[ttsIdx] ?? ttsIdx;
          setCurrentSentenceIdx(displayIdx);
          setPlaying(true);
          setPaused(false);
          setGenerating(false);
        } catch (e) {
          console.warn('[Reader] TTS start callback:', e?.message || e);
        }
      },
      end: (ttsIdx) => {
        if (!mountedRef.current) return;
        try {
          const spoken = ttsSentencesRef.current[ttsIdx] || '';
          listenSessionWordsRef.current += spoken ? spoken.trim().split(/\s+/).length : 0;
          const displayIdx = ttsToDisplayRef.current[ttsIdx] ?? ttsIdx;
          updateReadingPosition(name, size, { page: currentPageRef.current, sentence: displayIdx + 1 });
        } catch (e) {
          console.warn('[Reader] TTS end callback:', e?.message || e);
        }
      },
      done: () => {
        if (!mountedRef.current) return;
        try {
          setPlaying(false);
          setPaused(false);
          setGenerating(false);
          flushListeningSession();
          updateReadingPosition(name, size, { page: currentPageRef.current, sentence: sentencesLenRef.current });
          // Only auto-advance if we had content on this page and user was listening
          if (
            wasManuallyPlaying.current &&
            currentPageRef.current < totalPagesRef.current &&
            sentencesLenRef.current > 0
          ) {
            const nextPage = currentPageRef.current + 1;
            advancingToPageRef.current = nextPage;
            autoAdvanceTriggeredRef.current = false;
            setTimeout(() => {
              if (!mountedRef.current) return;
              try {
                setCurrentPage(nextPage);
                updateReadingPosition(name, size, { page: nextPage, sentence: 0 });
                updateLibraryProgress(name, size, nextPage, totalPagesRef.current);
                setAutoAdvancing(true);
              } catch (e) {
                console.warn('[Reader] Auto-advance:', e?.message || e);
                advancingToPageRef.current = null;
              }
            }, 0);
          }
        } catch (e) {
          console.warn('[Reader] TTS done callback:', e?.message || e);
        }
      },
      error: () => {
        if (!mountedRef.current) return;
        try {
          flushListeningSession();
          setPlaying(false);
          setGenerating(false);
        } catch (e) {
          console.warn('[Reader] TTS error callback:', e?.message || e);
        }
      },
      modelProgress: (info) => {
        if (!mountedRef.current) return;
        try {
          setModelStatus(info);
        } catch (e) {
          console.warn('[Reader] TTS modelProgress:', e?.message || e);
        }
      },
    });

    // THEN start preloading the model
    preloadModel();

    return () => setCallbacks({ start: null, end: null, done: null, error: null, modelProgress: null });
  }, [name, size, beginListeningSession, flushListeningSession]);

  // Search in current page: sentence indices that contain searchQuery
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return sentences
      .map((s, i) => (s.toLowerCase().includes(q) ? i : -1))
      .filter((i) => i >= 0);
  }, [sentences, searchQuery]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const idx = searchMatches.indexOf(currentSentenceIdx);
    if (idx >= 0) setSearchMatchIdx(idx);
  }, [searchMatches, currentSentenceIdx]);

  useEffect(() => {
    if (searchScope !== 'book') return;
    if (!searchQuery.trim()) {
      setBookSearchResults([]);
      return;
    }
    const id = setTimeout(() => { runBookSearch(searchQuery); }, 250);
    return () => clearTimeout(id);
  }, [searchScope, searchQuery, runBookSearch]);

  const goToSearchMatch = useCallback((direction) => {
    if (searchMatches.length === 0) return;
    const next = direction === 'next' ? searchMatchIdx + 1 : searchMatchIdx - 1;
    const i = next < 0 ? searchMatches.length - 1 : next >= searchMatches.length ? 0 : next;
    setSearchMatchIdx(i);
    setCurrentSentenceIdx(searchMatches[i]);
  }, [searchMatches, searchMatchIdx]);

  const runBookSearch = useCallback(async (q) => {
    if (!bookInstance || !q?.trim()) {
      setBookSearchResults([]);
      return;
    }
    setBookSearching(true);
    const needle = q.trim().toLowerCase();
    const results = [];
    try {
      for (let p = 1; p <= totalPages; p++) {
        // eslint-disable-next-line no-await-in-loop
        const text = await bookInstance.pageText(p);
        if (!text) continue;
        const lower = text.toLowerCase();
        const at = lower.indexOf(needle);
        if (at >= 0) {
          const start = Math.max(0, at - 80);
          const end = Math.min(text.length, at + needle.length + 80);
          const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
          results.push({ page: p, snippet });
          if (results.length >= 80) break;
        }
      }
      setBookSearchResults(results);
    } finally {
      setBookSearching(false);
    }
  }, [bookInstance, totalPages]);

  // Scroll active sentence into view
  useEffect(() => {
    const idx = currentSentenceIdx;
    const raf = requestAnimationFrame(() => {
      const el = sentenceRefs.current[idx];
      if (el && contentRef.current) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [currentSentenceIdx]);

  // Periodic position save when autoSaveIntervalSeconds > 0 (defer so setInterval callback returns quickly)
  useEffect(() => {
    const intervalSec = loadSettings().autoSaveIntervalSeconds ?? 0;
    if (intervalSec <= 0) return;
    const id = setInterval(() => {
      const page = currentPageRef.current;
      const sentence = currentSentenceRef.current;
      setTimeout(() => {
        updateReadingPosition(name, size, { page, sentence });
      }, 0);
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [name, size]);

  // Auto-play when opened from "Play" button (once when book is ready)
  const autoPlayDone = useRef(false);
  useEffect(() => {
    if (!autoPlay || loading || error || ttsSentences.length === 0 || autoPlayDone.current) return;
    autoPlayDone.current = true;
    const displayIdx = Math.min(currentSentenceIdx, sentences.length - 1);
    const startTts = (displayToTts[displayIdx] ?? 0);
    if (displayIdx >= 0) {
      beginListeningSession();
      wasManuallyPlaying.current = true;
      setPlaying(true);
      setGenerating(true);
      TTS().play(ttsSentences, startTts);
    }
  }, [autoPlay, loading, error, sentences.length, beginListeningSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play next page after advancing (wait for new page content to load before playing)
  useEffect(() => {
    if (!autoAdvancing || loading || error) return;
    const targetPage = advancingToPageRef.current;
    if (targetPage != null && currentPage !== targetPage) return;
    // Wait until the current page content has actually been loaded.
    if (loadedPageForContentRef.current !== currentPage) return;

    if (ttsSentences.length === 0) {
      // Empty/no-readable-text page: continue advancing automatically.
      if (currentPage < totalPages) {
        const nextPage = currentPage + 1;
        advancingToPageRef.current = nextPage;
        setCurrentPage(nextPage);
        updateReadingPosition(name, size, { page: nextPage, sentence: 0 });
        updateLibraryProgress(name, size, nextPage, totalPages);
        return;
      }
      // End of book.
      setAutoAdvancing(false);
      setPlaying(false);
      setGenerating(false);
      return;
    }

    if (autoAdvanceTriggeredRef.current) return;
    autoAdvanceTriggeredRef.current = true;
    if (targetPage != null) advancingToPageRef.current = null;
    setAutoAdvancing(false);
    setPlaying(true);
    setGenerating(true);
    beginListeningSession();
    wasManuallyPlaying.current = true;
    const preloaded = nextPageBufferedRef.current?.page === currentPage ? nextPageBufferedRef.current.promise : null;
    nextPageBufferedRef.current = null;
    try {
      TTS().play(ttsSentences, 0, preloaded || undefined);
    } catch (e) {
      console.warn('[Reader] Auto-advance play:', e?.message || e);
      setPlaying(false);
      setGenerating(false);
    }
  }, [autoAdvancing, loading, error, currentPage, ttsSentences, totalPages, name, size, beginListeningSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayPause = useCallback(() => {
    if (ttsSentences.length === 0) {
      if (currentPage < totalPages) {
        wasManuallyPlaying.current = true;
        autoAdvanceTriggeredRef.current = false;
        const nextPage = currentPage + 1;
        advancingToPageRef.current = nextPage;
        setAutoAdvancing(true);
        setCurrentPage(nextPage);
        updateReadingPosition(name, size, { page: nextPage, sentence: 0 });
        updateLibraryProgress(name, size, nextPage, totalPages);
      }
      return;
    }
    if (playing || generating) {
      // Currently playing or generating → stop everything
      flushListeningSession();
      try { TTS().stop(); } catch (e) { console.warn('[Reader] TTS().stop:', e); }
      setPlaying(false);
      setPaused(true);
      setGenerating(false);
      wasManuallyPlaying.current = false;
    } else if (paused) {
      // Currently paused → resume from current sentence
      const displayIdx = Math.max(0, Math.min(currentSentenceIdx, sentences.length - 1));
      const startTts = Math.max(0, Math.min(displayToTts[displayIdx] ?? 0, ttsSentences.length - 1));
      wasManuallyPlaying.current = true;
      beginListeningSession();
      setPlaying(true);
      setPaused(false);
      setGenerating(true);
      try {
        TTS().play(ttsSentences, startTts);
      } catch (e) {
        console.warn('[Reader] TTS().play resume:', e);
        setPlaying(false);
        setGenerating(false);
      }
    } else {
      // Not playing at all → start fresh from selected or current sentence
      const startDisplay = selectedSentenceIdx !== null ? selectedSentenceIdx : currentSentenceIdx;
      const displayIdx = Math.max(0, Math.min(startDisplay, sentences.length - 1));
      const startTts = Math.max(0, Math.min(displayToTts[displayIdx] ?? 0, ttsSentences.length - 1));
      wasManuallyPlaying.current = true;
      beginListeningSession();
      setPlaying(true);
      setPaused(false);
      setGenerating(true);
      try {
        TTS().play(ttsSentences, startTts);
        setSelectedSentenceIdx(null);
      } catch (e) {
        console.warn('[Reader] TTS().play start:', e);
        setPlaying(false);
        setGenerating(false);
      }
    }
  }, [sentences, ttsSentences, displayToTts, currentSentenceIdx, selectedSentenceIdx, playing, paused, generating, currentPage, totalPages, name, size, beginListeningSession, flushListeningSession]);

  const handlePrevPage = useCallback(() => {
    if (currentPage <= 1) return;
    flushListeningSession();
    TTS().stop();
    setPlaying(false);
    setPaused(false);
    setGenerating(false);
    wasManuallyPlaying.current = false;
    setSelectedSentenceIdx(null);
    const next = currentPage - 1;
    setCurrentPage(next);
    updateReadingPosition(name, size, { page: next, sentence: 0 });
    updateLibraryProgress(name, size, next, totalPages);
  }, [currentPage, totalPages, name, size, flushListeningSession]);

  const handleNextPage = useCallback(() => {
    if (currentPage >= totalPages) return;
    flushListeningSession();
    TTS().stop();
    setPlaying(false);
    setPaused(false);
    setGenerating(false);
    wasManuallyPlaying.current = false;
    setSelectedSentenceIdx(null);
    const next = currentPage + 1;
    setCurrentPage(next);
    updateReadingPosition(name, size, { page: next, sentence: 0 });
    updateLibraryProgress(name, size, next, totalPages);
  }, [currentPage, totalPages, name, size, flushListeningSession]);

  const handleGoToPage = useCallback(() => {
    const num = parseInt(goToPageInput, 10);
    if (Number.isNaN(num) || totalPages < 1) return;
    const page = Math.max(1, Math.min(num, totalPages));
    setGoToPageInput('');
    flushListeningSession();
    TTS().stop();
    setPlaying(false);
    setPaused(false);
    setGenerating(false);
    wasManuallyPlaying.current = false;
    setSelectedSentenceIdx(null);
    setCurrentPage(page);
    updateReadingPosition(name, size, { page, sentence: 0 });
    updateLibraryProgress(name, size, page, totalPages);
  }, [goToPageInput, totalPages, name, size, flushListeningSession]);

  const handleSkipForward = useCallback(() => {
    if (sentences.length === 0) return;
    const currentIdx = Math.min(currentSentenceIdx, sentences.length - 1);
    const wordsPerSecond = 140 / 60;
    const skipWords = Math.round(30 * wordsPerSecond);
    let wordCount = 0;
    let targetIdx = currentIdx;
    for (let i = currentIdx; i < sentences.length && wordCount < skipWords; i++) {
      wordCount += sentences[i].split(/\s+/).length;
      targetIdx = i;
    }
    const newIdx = Math.min(targetIdx, sentences.length - 1);
    setCurrentSentenceIdx(newIdx);
    if (playing && ttsSentences.length > 0) {
      try {
        TTS().stop();
        const startTts = Math.max(0, Math.min(displayToTts[newIdx] ?? 0, ttsSentences.length - 1));
        TTS().play(ttsSentences, startTts);
      } catch (e) {
        console.warn('[Reader] Skip forward TTS:', e);
      }
    }
  }, [sentences, ttsSentences, displayToTts, currentSentenceIdx, playing]);

  const handleSkipBackward = useCallback(() => {
    if (sentences.length === 0) return;
    const currentIdx = Math.min(currentSentenceIdx, sentences.length - 1);
    const wordsPerSecond = 140 / 60;
    const skipWords = Math.round(10 * wordsPerSecond);
    let wordCount = 0;
    let targetIdx = currentIdx;
    for (let i = currentIdx; i >= 0 && wordCount < skipWords; i--) {
      wordCount += sentences[i].split(/\s+/).length;
      targetIdx = i;
    }
    const newIdx = Math.max(targetIdx, 0);
    setCurrentSentenceIdx(newIdx);
    if (playing && ttsSentences.length > 0) {
      try {
        TTS().stop();
        const startTts = Math.max(0, Math.min(displayToTts[newIdx] ?? 0, ttsSentences.length - 1));
        TTS().play(ttsSentences, startTts);
      } catch (e) {
        console.warn('[Reader] Skip backward TTS:', e);
      }
    }
  }, [sentences, ttsSentences, displayToTts, currentSentenceIdx, playing]);

  // Keyboard shortcuts (reader only; ignore when typing in inputs)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowSettings(false);
        setShowBookmarks(false);
        setShowHighlights(false);
        setShowSummaries(false);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        handlePlayPause();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSkipBackward();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSkipForward();
        return;
      }
      if (showSearch && e.key === 'Enter') {
        e.preventDefault();
        if (searchMatches.length > 0) goToSearchMatch(e.shiftKey ? 'prev' : 'next');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSkipBackward, handleSkipForward, showSearch, searchMatches.length, searchMatchIdx, goToSearchMatch]);

  const handleProgressBarClick = useCallback((e) => {
    if (sentences.length === 0 || !progressBarRef.current) return;
    const clientX = e.clientX;
    const sentLen = sentences.length;
    const ttsLen = ttsSentences.length;
    const isPlaying = playing;
    const dispToTts = displayToTts;
    const ttsSents = ttsSentences;
    requestAnimationFrame(() => {
      const el = progressBarRef.current;
      if (!el || sentLen === 0) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, x / rect.width));
      const displayIdx = Math.min(Math.floor(fraction * sentLen), sentLen - 1);
      const idx = Math.max(0, displayIdx);
      setCurrentSentenceIdx(idx);
      if (isPlaying && ttsLen > 0) {
        try {
          TTS().stop();
          const startTts = Math.max(0, Math.min(dispToTts[idx] ?? 0, ttsLen - 1));
          TTS().play(ttsSents, startTts);
        } catch (err) {
          console.warn('[Reader] Progress bar seek TTS:', err);
        }
      }
    });
  }, [sentences, ttsSentences, displayToTts, playing]);

  const handleSpeedChange = (e) => {
    const v = parseFloat(e.target.value);
    setSpeed(v);
    TTS().setRate(v);
    // Clear prebuffer generated with the old rate.
    nextPageBufferedRef.current = null;

    // Piper stream rate is fixed at stream creation time. Restart playback at the
    // current sentence so speed changes apply immediately.
    if ((playing || generating) && ttsSentences.length > 0) {
      const displayIdx = Math.max(0, Math.min(currentSentenceIdx, sentences.length - 1));
      const startTts = Math.max(0, Math.min(displayToTts[displayIdx] ?? 0, ttsSentences.length - 1));
      try {
        TTS().stop();
        setPlaying(true);
        setPaused(false);
        setGenerating(true);
        TTS().play(ttsSentences, startTts);
      } catch (err) {
        console.warn('[Reader] Speed change TTS restart:', err);
        setPlaying(false);
        setGenerating(false);
      }
    }

    const settings = loadSettings();
    const bookSpeeds = settings.bookSpeeds || {};
    bookSpeeds[name] = v;
    saveSettings({ ...settings, rate: v, bookSpeeds });
    setBookVoiceProfile(name, size, { voice: isPiperReady() ? voice : '', rate: v });
  };

  const handlePreviewVoice = useCallback(() => {
    if (!ttsSentences.length) return;
    const previewText = ttsSentences.slice(0, 2);
    try {
      TTS().stop();
      TTS().play(previewText, 0);
    } catch (e) {
      console.warn('[Reader] Voice preview failed:', e);
    }
  }, [ttsSentences]);

  const handlePrepareOffline = useCallback(async () => {
    if (!bookInstance || !isPiperReady() || offlinePreparing) return;
    setOfflinePreparing(true);
    try {
      const voiceId = voice && typeof voice === 'string' ? voice : FIXED_PIPER_VOICE_ID;
      const rate = typeof speed === 'number' && speed > 0 ? speed : 1;
      const pages = [];
      for (let p = currentPage; p <= Math.min(totalPages, currentPage + 3); p++) pages.push(p);
      for (const p of pages) {
        // eslint-disable-next-line no-await-in-loop
        const text = await bookInstance.pageText(p);
        // eslint-disable-next-line no-await-in-loop
        await setCachedPageText(name, size, p, text);
        const { sentences: s } = splitIntoParagraphs(text || '');
        const filtered = s.filter((sent) => !isFigureOrTableCaption(sent));
        const ttsList = filtered.length > 0 ? filtered : s;
        if (ttsList.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await prebufferStreamChunks(ttsList, voiceId, rate);
        }
      }
      const nowReady = await hasOfflineAudioForPage(ttsSentences, voiceId, rate);
      setOfflineAudioReady(Boolean(nowReady));
    } catch (e) {
      console.warn('[Reader] Prepare offline failed:', e?.message || e);
    } finally {
      setOfflinePreparing(false);
    }
  }, [bookInstance, currentPage, totalPages, name, size, voice, speed, ttsSentences, offlinePreparing]);

  const handleAddBookmark = () => {
    const text = sentences[currentSentenceIdx]?.slice(0, 80) || '';
    addBookmark(name, size, { page: currentPage, sentence: currentSentenceIdx, text });
    setBookmarks(getBookmarks(name, size));
  };

  const handleRemoveBookmark = (index) => {
    removeBookmark(name, size, index);
    setBookmarks(getBookmarks(name, size));
  };

  const goToBookmark = (bm) => {
    setCurrentPage(bm.page);
    setCurrentSentenceIdx(bm.sentence || 0);
    setShowBookmarks(false);
  };

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString()?.trim();
    if (!text || sel.isCollapsed) {
      setSelectionToolbar(null);
      return;
    }
    let startIdx = sentences.length;
    let endIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
      const el = sentenceRefs.current[i];
      if (el && sel.containsNode(el, true)) {
        startIdx = Math.min(startIdx, i);
        endIdx = Math.max(endIdx, i);
      }
    }
    if (startIdx > endIdx) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelectionToolbar({ start: startIdx, end: endIdx, text: text.slice(0, 300), rect });
  }, [sentences.length]);

  const handleSentenceClick = useCallback((e, sentenceIdx) => {
    // Ignore if we're selecting text
    if (window.getSelection().toString().length > 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    setSelectedSentenceIdx(sentenceIdx);
    setSelectionToolbar(null); // Clear any selection toolbar
    
    // Scroll to the sentence
    const sidx = sentenceIdx;
    requestAnimationFrame(() => {
      const el = sentenceRefs.current[sidx];
      if (el && contentRef.current) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, []);

  const handleAddHighlight = (color) => {
    if (!selectionToolbar) return;
    const { start, end, text } = selectionToolbar;
    addHighlight(name, size, {
      page: currentPage,
      sentence_start: start,
      sentence_end: end,
      text,
      color,
    });
    setHighlights(getHighlights(name, size));
    setSelectionToolbar(null);
    window.getSelection()?.removeAllRanges?.();
  };

  const handleAddNote = () => {
    if (!selectionToolbar) return;
    const { start, end, text } = selectionToolbar;
    addHighlight(name, size, {
      page: currentPage,
      sentence_start: start,
      sentence_end: end,
      text,
      color: 'yellow',
      note: '[Add your note]',
    });
    setHighlights(getHighlights(name, size));
    setSelectionToolbar(null);
    setEditingNoteId(null);
    window.getSelection()?.removeAllRanges?.();
  };

  const handleAddToSummary = () => {
    if (!selectionToolbar) return;
    const { text } = selectionToolbar;
    addSummary(name, size, { text, page: currentPage });
    setSummaries(getSummaries(name, size));
    setSelectionToolbar(null);
    setShowSummaries(true);
    window.getSelection()?.removeAllRanges?.();
  };

  const runHelper = (mode) => {
    const txt = (selectionToolbar?.text || '').trim();
    if (!txt) return;
    if (mode === 'translate') {
      const url = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(txt)}&op=translate`;
      window.open(url, '_blank', 'noopener,noreferrer');
      setHelperResult({ mode: 'translate', text: txt, output: 'Opened translation in a new tab.' });
      return;
    }
    if (mode === 'define') {
      const words = Array.from(new Set((txt.match(/[A-Za-z]{6,}/g) || []).map((w) => w.toLowerCase()))).slice(0, 6);
      const output = words.length
        ? `Key terms: ${words.join(', ')}`
        : 'No long terms found. Select a larger sentence.';
      setHelperResult({ mode, text: txt, output });
      return;
    }
    if (mode === 'simplify') {
      const short = txt
        .replace(/;/g, '.')
        .replace(/,\s*/g, ', ')
        .split(/(?<=[.!?])\s+/)
        .slice(0, 3)
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ');
      setHelperResult({ mode, text: txt, output: short || txt });
      return;
    }
    // explain
    const lines = txt
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .map((s) => `- ${s.trim()}`)
      .join('\n');
    setHelperResult({ mode: 'explain', text: txt, output: lines || `- ${txt}` });
  };

  const handleRemoveSummary = (summaryId) => {
    removeSummary(name, size, summaryId);
    setSummaries(getSummaries(name, size));
    setExpandedFormat(null);
  };

  const handleCopyFormat = (summary, formatId) => {
    const fmt = FORMATS.find((f) => f.id === formatId);
    if (!fmt) return;
    const { content } = fmt.fn(summary.text);
    navigator.clipboard.writeText(content).catch(() => {});
  };

  const buildHighlightsExportText = useCallback(() => {
    const all = getHighlights(name, size);
    if (all.length === 0) return '';
    const exportTitle = title || name || 'Highlights';
    const lines = [`# ${exportTitle}\n`, `Exported ${new Date().toLocaleDateString()}\n`];
    const byPage = {};
    all.forEach((h) => {
      if (!byPage[h.page]) byPage[h.page] = [];
      byPage[h.page].push(h);
    });
    Object.keys(byPage)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((page) => {
        lines.push(`\n## Page ${page}\n`);
        byPage[page].forEach((h) => {
          lines.push(`> ${(h.text || '').replace(/\n/g, ' ')}\n`);
          if (h.note && h.note.trim()) lines.push(`Note: ${h.note.trim()}\n`);
        });
      });
    return lines.join('\n');
  }, [name, size, title]);

  const getHighlightForSentence = (i) => {
    return highlights.find((h) => h.page === currentPage && h.sentence_start <= i && i <= h.sentence_end);
  };

  const highlightColorClass = (color) => {
    if (color === 'green') return 'bg-green-400/35';
    if (color === 'purple') return 'bg-secondary-purple/35';
    return 'bg-yellow-400/40';
  };

  const displayPageLabel = useCallback((pageNum) => {
    if (pageLabels && pageNum >= 1 && pageNum <= pageLabels.length) {
      return pageLabels[pageNum - 1] || String(pageNum);
    }
    return String(pageNum);
  }, [pageLabels]);

  const handleSaveSettings = (updatedSettings) => {
    const settings = loadSettings();
    saveSettings({ ...settings, ...updatedSettings });
  };

  const handleSetSleepTimer = (minutes) => {
    if (minutes === 0) {
      setSleepTimer(null);
      setSleepTimeRemaining(null);
    } else {
      setSleepTimer(minutes);
      setSleepTimeRemaining(minutes * 60 * 1000);
    }
  };

  const formatSleepTime = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.floor((ms % 60000) / 1000);
    const minutes = Math.floor(ms / 60000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background-dark text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-primary animate-pulse block mb-4">menu_book</span>
          <p className="text-slate-400">Opening book…</p>
        </div>
      </div>
    );
  }

  if (error) {
    const handleRemoveAndBack = () => {
      removeFromLibrary(name, size);
      onBack();
    };
    return (
      <div className="min-h-screen bg-background-dark text-slate-100 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <span className="material-symbols-outlined text-5xl text-red-400/80 block mb-4">error</span>
          <p className="text-slate-300 mb-2">{error}</p>
          <p className="text-slate-500 text-sm mb-6">
            Remove this book from your library, then re-add the file if you want to read it again.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleRemoveAndBack}
              className="w-full sm:w-auto sm:min-w-[200px] mx-auto px-6 py-3 rounded-xl font-semibold bg-red-600 hover:bg-red-500 text-white border border-red-500/50 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">delete_outline</span>
              Remove from library
            </button>
            <button type="button" onClick={onBack} className="w-full sm:w-auto sm:min-w-[200px] mx-auto px-6 py-2.5 rounded-xl font-semibold bg-primary text-white hover:bg-primary/90">
              Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  const themeClass = {
    dark: 'bg-background-dark text-slate-100',
    light: 'bg-white text-slate-900',
    sepia: 'bg-amber-50 text-amber-950',
  }[theme] || 'bg-background-dark text-slate-100';

  const contentThemeClass = {
    dark: 'font-serif text-slate-200',
    light: 'font-serif text-slate-800',
    sepia: 'font-serif text-amber-900',
  }[theme] || 'font-serif text-slate-200';

  const textFontFamily = dyslexiaMode
    ? '"OpenDyslexic", "Comic Sans MS", "Trebuchet MS", sans-serif'
    : (fontFamily === 'sans'
      ? 'system-ui, -apple-system, sans-serif'
      : fontFamily === 'reading'
        ? 'Georgia, Charter, "Bitstream Charter", serif'
        : 'Georgia, "Times New Roman", serif');

  const controlButtonSizeClass = largeControls ? 'text-2xl' : 'text-xl';
  const mainPlayButtonClass = largeControls ? 'w-14 h-14' : 'w-12 h-12';

  return (
    <div className={`min-h-screen flex flex-col ${themeClass}`}>
      <header className={`sticky top-0 z-40 border-b safe-area-top ${theme === 'dark' ? 'border-border-dark bg-background-dark/95' : theme === 'light' ? 'border-slate-200 bg-white/95' : 'border-amber-200 bg-amber-50/95'} backdrop-blur-md px-4 py-3`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <button type="button" onClick={onBack} className={`flex items-center gap-2 transition-colors shrink-0 min-h-[44px] min-w-[44px] sm:min-w-0 justify-center sm:justify-start rounded-lg ${theme === 'dark' ? 'text-slate-400 hover:text-secondary-purple' : 'text-slate-600 hover:text-primary'}`}>
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="hidden sm:inline">Library</span>
          </button>
          <h1 className={`text-base sm:text-lg font-semibold truncate flex-1 min-w-0 text-center px-1 ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>{title}</h1>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap justify-end">
            <button type="button" onClick={() => setShowSearch((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${showSearch ? (theme === 'dark' ? 'text-primary bg-white/10' : 'text-primary bg-primary/10') : (theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}`} aria-label="Search in page">
              <span className="material-symbols-outlined">search</span>
            </button>
            <button type="button" onClick={() => setShowBookmarks((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Bookmarks">
              <span className="material-symbols-outlined">bookmark</span>
            </button>
            <button type="button" onClick={() => setShowHighlights((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Highlights">
              <span className="material-symbols-outlined">highlight</span>
            </button>
            <button type="button" onClick={() => setShowSummaries((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Summaries" title="Summaries — turn into article, blog, posts">
              <span className="material-symbols-outlined">summarize</span>
            </button>
            <button type="button" onClick={() => setSplitScreen((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${splitScreen ? (theme === 'dark' ? 'text-primary bg-white/10' : 'text-primary bg-primary/10') : (theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}`} aria-label="Split screen" title="View original book and text side-by-side">
              <span className="material-symbols-outlined">unfold_more</span>
            </button>
            <button type="button" onClick={() => setShowSettings((v) => !v)} className={`p-2.5 min-h-[44px] min-w-[44px] rounded-lg transition-colors flex items-center justify-center ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`} aria-label="Settings">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>
        {showSearch && (
          <div className={`max-w-4xl mx-auto mt-2 pb-2 flex flex-wrap items-center gap-2 ${theme === 'dark' ? 'border-b border-border-dark' : 'border-b border-slate-200'}`}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchScope === 'book' ? 'Search in this book…' : 'Search in this page…'}
              className={`flex-1 min-w-[120px] rounded-lg px-3 py-2 text-sm border ${theme === 'dark' ? 'bg-surface border-border-dark text-white placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setSearchScope((v) => (v === 'page' ? 'book' : 'page'))}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold ${searchScope === 'book' ? 'bg-primary text-white' : theme === 'dark' ? 'bg-surface text-slate-300' : 'bg-slate-200 text-slate-700'}`}
            >
              {searchScope === 'book' ? 'Book' : 'Page'}
            </button>
            {searchQuery.trim() && (
              <>
                {searchScope === 'page' ? (
                  <>
                    <span className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>
                      {searchMatches.length === 0 ? 'No matches' : `${searchMatchIdx + 1} of ${searchMatches.length}`}
                    </span>
                    <button type="button" onClick={() => goToSearchMatch('prev')} disabled={searchMatches.length === 0} className={`p-1.5 rounded-lg disabled:opacity-30 ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} aria-label="Previous match">
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button type="button" onClick={() => goToSearchMatch('next')} disabled={searchMatches.length === 0} className={`p-1.5 rounded-lg disabled:opacity-30 ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`} aria-label="Next match">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                  </>
                ) : (
                  <span className={`text-xs whitespace-nowrap ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>
                    {bookSearching ? 'Searching book…' : `${bookSearchResults.length} matches`}
                  </span>
                )}
              </>
            )}
            {searchScope === 'book' && searchQuery.trim() && !bookSearching && (
              <div className={`w-full mt-2 rounded-lg border max-h-40 overflow-y-auto ${theme === 'dark' ? 'border-border-dark bg-surface' : 'border-slate-200 bg-white'}`}>
                {bookSearchResults.length === 0 ? (
                  <p className={`px-3 py-2 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>No book-level matches yet.</p>
                ) : (
                  bookSearchResults.map((m, idx) => (
                    <button
                      key={`${m.page}-${idx}`}
                      type="button"
                      onClick={() => {
                        setCurrentPage(m.page);
                        setCurrentSentenceIdx(0);
                        updateReadingPosition(name, size, { page: m.page, sentence: 0 });
                      }}
                      className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 ${theme === 'dark' ? 'border-border-dark hover:bg-white/5 text-slate-300' : 'border-slate-100 hover:bg-slate-50 text-slate-700'}`}
                    >
                      <span className="font-semibold mr-2">Page {displayPageLabel(m.page)}</span>
                      <span>{m.snippet}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {modelStatus && (modelStatus.status === 'loading' || modelStatus.status === 'downloading') && (
        <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'bg-indigo-950/40 border-indigo-900' : theme === 'light' ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-100/40 border-amber-200'}`}>
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <span className={`material-symbols-outlined text-lg animate-pulse ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`}>download</span>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>
                  {modelStatus.message || 'Loading voice model…'}
                </span>
                <span className={`text-xs ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-500'}`}>
                  {modelStatus.loaded ? `${(modelStatus.loaded / 1024 / 1024).toFixed(0)}MB / ${(modelStatus.total / 1024 / 1024).toFixed(0)}MB` : ''}
                </span>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-indigo-900/50' : 'bg-indigo-200'}`}>
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${modelStatus.progress || 0}%` }} />
              </div>
              <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-indigo-400/70' : 'text-indigo-500'}`}>
                One-time download (~86MB). Cached for future visits.
              </p>
            </div>
          </div>
        </div>
      )}

      {modelStatus && modelStatus.status === 'failed' && (
        <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'bg-red-950/40 border-red-900' : theme === 'light' ? 'bg-red-50 border-red-200' : 'bg-red-100/40 border-red-200'}`}>
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <span className={`material-symbols-outlined text-lg ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>error</span>
            <span className={`text-xs ${theme === 'dark' ? 'text-red-300' : 'text-red-700'}`}>{modelStatus.message}</span>
            <button type="button" onClick={() => checkBackend().then((ok) => ok && setModelStatus({ status: 'ready', progress: 100, message: 'Voice ready!' }))} className="text-xs underline ml-2">Retry</button>
          </div>
        </div>
      )}

      {pageHasVisualContent && (
        <div className={`px-4 py-2 border-b ${theme === 'dark' ? 'bg-blue-950/40 border-blue-900 text-blue-300' : theme === 'light' ? 'bg-blue-100/50 border-blue-200 text-blue-700' : 'bg-amber-100/40 border-amber-200 text-amber-700'}`}>
          <div className="max-w-4xl mx-auto text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">image</span>
            <span>This page contains images, tables, or diagrams. Visit the original file for the full visual experience.</span>
          </div>
        </div>
      )}

      {showBookmarks && (
        <div className={`border-b px-4 py-3 max-h-48 overflow-y-auto ${theme === 'dark' ? 'border-border-dark bg-card-dark' : theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-100/30'}`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between mb-2">
            <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Bookmarks</span>
            <button type="button" onClick={handleAddBookmark} className="text-xs text-primary font-semibold">+ Add current</button>
          </div>
          <ul className={`space-y-1 text-sm ${theme === 'dark' ? 'text-slate-300' : theme === 'light' ? 'text-slate-700' : 'text-amber-800'}`}>
            {bookmarks.length === 0 && <li className={theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}>No bookmarks yet.</li>}
            {bookmarks.map((bm, i) => (
              <li key={i} className="flex items-center justify-between gap-2 group">
                <button type="button" onClick={() => goToBookmark(bm)} className={`text-left truncate flex-1 ${theme === 'dark' ? 'hover:text-white' : 'hover:text-slate-900'}`}>
                  Page {displayPageLabel(bm.page)}{bm.text ? ` · ${bm.text.slice(0, 40)}…` : ''}
                </button>
                <button type="button" onClick={() => handleRemoveBookmark(i)} className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSummaries && (
        <div className={`border-b px-4 py-4 max-h-[70vh] overflow-y-auto ${theme === 'dark' ? 'border-border-dark bg-card-dark' : theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-100/30'}`}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Summaries</span>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>Select text while reading → Summary. Then turn into posts.</p>
            </div>
            {summaries.length === 0 ? (
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>No summaries yet. Select text and click &quot;Summary&quot; in the toolbar to add one.</p>
            ) : (
              <ul className="space-y-4">
                {summaries.map((sum) => (
                  <li key={sum.id} className={`rounded-lg border p-3 ${theme === 'dark' ? 'border-border-dark bg-surface' : theme === 'light' ? 'border-slate-200 bg-slate-100' : 'border-amber-200 bg-amber-50'}`}>
                    <p className={`text-sm line-clamp-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{sum.text}</p>
                    <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}`}>{sum.page ? `Page ${displayPageLabel(sum.page)}` : ''}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Turn into:</span>
                        {FORMATS.map((f) => {
                          const key = `${sum.id}-${f.id}`;
                          const isExpanded = expandedFormat === key;
                          const { content, label } = f.fn(sum.text);
                          return (
                            <div key={f.id} className="relative">
                              <button
                                type="button"
                                onClick={() => setExpandedFormat(isExpanded ? null : key)}
                                className={`px-2 py-1 rounded text-xs font-medium ${theme === 'dark' ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                              >
                                {label}
                              </button>
                              {isExpanded && (
                                <div className={`absolute left-0 top-full mt-1 z-50 min-w-[280px] max-w-md rounded-lg border shadow-xl p-3 ${theme === 'dark' ? 'bg-card-dark border-border-dark' : 'bg-white border-slate-200'}`}>
                                  <pre className={`text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>{content}</pre>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyFormat(sum, f.id)}
                                    className={`w-full py-1.5 rounded text-xs font-semibold ${theme === 'sepia' ? 'bg-amber-600 text-white' : 'bg-primary text-white'}`}
                                  >
                                    Copy
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button type="button" onClick={() => handleRemoveSummary(sum.id)} className="text-slate-500 hover:text-red-400" title="Remove summary">
                          <span className="material-symbols-outlined text-lg">delete_outline</span>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className={`border-b px-4 py-4 max-h-64 overflow-y-auto ${theme === 'dark' ? 'border-border-dark bg-card-dark' : theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-100/30'}`}>
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Theme Switcher */}
            <div>
              <label className={`text-sm font-semibold block mb-2 ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Theme</label>
              <div className="flex gap-2">
                {['dark', 'light', 'sepia'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTheme(t);
                      handleSaveSettings({ theme: t });
                    }}
                    className={`px-4 py-2 rounded-lg capitalize font-medium transition-colors ${theme === t ? 'bg-primary text-white' : theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Font family */}
            <div>
              <label className={`text-sm font-semibold block mb-2 ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Font</label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'serif', label: 'Serif' },
                  { id: 'sans', label: 'Sans-serif' },
                  { id: 'reading', label: 'Reading' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFontFamily(f.id);
                      handleSaveSettings({ fontFamily: f.id });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${fontFamily === f.id ? 'bg-primary text-white' : theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Font size: {fontSize}px</label>
              </div>
              <input
                type="range"
                min="14"
                max="28"
                value={fontSize}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setFontSize(v);
                  handleSaveSettings({ fontSize: v });
                }}
                className="w-full"
              />
            </div>

            {/* Line Spacing */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Line spacing: {lineSpacing.toFixed(1)}×</label>
              </div>
              <input
                type="range"
                min="1.2"
                max="2"
                step="0.1"
                value={lineSpacing}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setLineSpacing(v);
                  handleSaveSettings({ lineSpacing: v });
                }}
                className="w-full"
              />
            </div>

            <div>
              <label className={`text-sm font-semibold block mb-2 ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>Accessibility</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !dyslexiaMode;
                    setDyslexiaMode(next);
                    handleSaveSettings({ dyslexiaMode: next });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${dyslexiaMode ? 'bg-primary text-white' : theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                >
                  Dyslexia mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !largeControls;
                    setLargeControls(next);
                    handleSaveSettings({ largeControls: next });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${largeControls ? 'bg-primary text-white' : theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                >
                  Larger controls
                </button>
              </div>
            </div>

            {/* Sleep Timer */}
            <div>
              <label className={`text-sm font-semibold block mb-2 ${theme === 'dark' ? 'text-white' : theme === 'light' ? 'text-slate-900' : 'text-amber-900'}`}>
                Sleep timer {sleepTimeRemaining ? `(${formatSleepTime(sleepTimeRemaining)})` : ''}
              </label>
              <div className="flex gap-2 flex-wrap">
                {[0, 30, 60, 90].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => handleSetSleepTimer(minutes)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      sleepTimer === minutes
                        ? 'bg-primary text-white'
                        : theme === 'dark'
                          ? 'bg-surface text-slate-300 hover:text-white'
                          : 'bg-slate-200 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {minutes === 0 ? 'Off' : `${minutes}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-hidden min-h-0 ${splitScreen ? 'flex flex-col lg:flex-row' : ''}`}>
        {/* Left side: text content (scrollable) */}
        <div className={`${splitScreen ? 'w-full lg:w-1/2 flex flex-col min-h-0 border-r' : 'flex flex-col w-full'} ${splitScreen ? (theme === 'dark' ? 'border-border-dark' : theme === 'light' ? 'border-slate-200' : 'border-amber-200') : ''}`}>
          <main ref={contentRef} className={`flex-1 overflow-y-auto px-4 py-6 ${themeClass}`} onMouseUp={handleTextSelection}>
            <div className="max-w-3xl mx-auto w-full">
              {author && <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-slate-500' : theme === 'light' ? 'text-slate-600' : 'text-amber-700'}`}>{author}</p>}
              <div
                className={`${contentThemeClass} leading-relaxed`}
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: lineSpacing,
                  fontFamily: textFontFamily,
                }}
              >
                {sentences.map((sent, i) => {
                  const hl = getHighlightForSentence(i);
                  const isCurrent = i === currentSentenceIdx;
                  const isSelected = i === selectedSentenceIdx;
                  const baseClass = isCurrent ? (theme === 'dark' ? 'bg-primary/50 shadow-lg shadow-primary/30' : theme === 'light' ? 'bg-yellow-300/60' : 'bg-amber-400/50') : '';
                  const selectedClass = isSelected ? (theme === 'dark' ? 'ring-2 ring-blue-500' : theme === 'light' ? 'ring-2 ring-blue-400' : 'ring-2 ring-blue-600') : '';
                  const hlClass = hl ? highlightColorClass(hl.color) : '';
                  const isParaStart = paragraphBreaks.has(i) && i > 0;
                  
                  return (
                    <span key={i}>
                      {isParaStart && <span className="block mt-5" />}
                      <span
                        ref={(el) => { sentenceRefs.current[i] = el; }}
                        onClick={(e) => handleSentenceClick(e, i)}
                        className={`rounded px-0.5 -mx-0.5 cursor-pointer transition-colors ${baseClass} ${selectedClass} ${hlClass} hover:opacity-75`}
                        data-sentence-idx={i}
                        title="Click to select start position"
                      >
                        {searchQuery.trim() && sent.toLowerCase().includes(searchQuery.trim().toLowerCase())
                          ? (() => {
                              const q = searchQuery.trim();
                              const parts = [];
                              let rest = sent;
                              const lower = rest.toLowerCase();
                              const qLower = q.toLowerCase();
                              let idx = lower.indexOf(qLower);
                              while (idx !== -1) {
                                parts.push(rest.slice(0, idx));
                                parts.push({ match: true, text: rest.slice(idx, idx + q.length) });
                                rest = rest.slice(idx + q.length);
                                idx = rest.toLowerCase().indexOf(qLower);
                              }
                              parts.push(rest);
                              return parts.map((p, k) => (typeof p === 'object' ? <mark key={k} className={`${theme === 'dark' ? 'bg-primary/40 text-white' : 'bg-yellow-300/70 text-slate-900'} rounded px-0.5`}>{p.text}</mark> : p));
                            })()
                          : sent}{' '}
                      </span>
                    </span>
                  );
                })}
              </div>
              {sentences.length === 0 && pageText === '' && currentPage <= totalPages && (
                <p className={theme === 'dark' ? 'text-slate-500' : 'text-slate-500'}>
                  This page has no extractable text.
                  {name.toLowerCase().endsWith('.pdf') && (
                    <span className="block mt-1 text-sm">Turn on split view to see the PDF while you listen to other pages.</span>
                  )}
                </p>
              )}
              {sentences.length > 0 && !playing && !paused && modelStatus?.status === 'ready' && (
                <p className={`mt-4 text-sm ${theme === 'dark' ? 'text-slate-500' : theme === 'light' ? 'text-slate-500' : 'text-amber-700'}`}>
                  Press <kbd className="px-1.5 py-0.5 rounded bg-black/10 font-mono text-xs">Space</kbd> or the Play button below to hear this page read aloud.
                </p>
              )}
            </div>

            {/* Selection toolbar */}
            {selectionToolbar && (
              <div
                className="fixed z-50 flex items-center gap-1 p-1 rounded-lg shadow-lg border bg-card-dark border-border-dark"
                style={{ left: selectionToolbar.rect.left, top: selectionToolbar.rect.top - 44 }}
              >
                <button type="button" onClick={() => handleAddHighlight('yellow')} className="p-2 rounded bg-yellow-400/30 hover:bg-yellow-400/50" title="Highlight yellow">
                  <span className="material-symbols-outlined text-lg text-yellow-600">highlight</span>
                </button>
                <button type="button" onClick={() => handleAddHighlight('green')} className="p-2 rounded bg-green-400/30 hover:bg-green-400/50" title="Highlight green">
                  <span className="material-symbols-outlined text-lg text-green-600">highlight</span>
                </button>
                <button type="button" onClick={() => handleAddHighlight('purple')} className="p-2 rounded bg-purple-400/30 hover:bg-purple-400/50" title="Highlight purple">
                  <span className="material-symbols-outlined text-lg text-purple-400">highlight</span>
                </button>
                <button type="button" onClick={handleAddNote} className="p-2 rounded bg-slate-600/50 hover:bg-slate-500 text-white text-xs font-medium" title="Add note">
                  Note
                </button>
                <button type="button" onClick={handleAddToSummary} className="p-2 rounded bg-primary/60 hover:bg-primary text-white text-xs font-medium flex items-center gap-1" title="Add to summary — turn into article, blog, posts">
                  <span className="material-symbols-outlined text-base">summarize</span>
                  Summary
                </button>
                <button type="button" onClick={() => runHelper('explain')} className="p-2 rounded bg-slate-600/50 hover:bg-slate-500 text-white text-xs font-medium" title="Explain selection">
                  Explain
                </button>
                <button type="button" onClick={() => runHelper('simplify')} className="p-2 rounded bg-slate-600/50 hover:bg-slate-500 text-white text-xs font-medium" title="Simplify selection">
                  Simplify
                </button>
                <button type="button" onClick={() => runHelper('define')} className="p-2 rounded bg-slate-600/50 hover:bg-slate-500 text-white text-xs font-medium" title="Define terms">
                  Define
                </button>
                <button type="button" onClick={() => runHelper('translate')} className="p-2 rounded bg-slate-600/50 hover:bg-slate-500 text-white text-xs font-medium" title="Translate selection">
                  Translate
                </button>
              </div>
            )}
            {helperResult && (
              <div className={`fixed z-40 right-4 bottom-28 max-w-sm rounded-lg border p-3 shadow-xl ${theme === 'dark' ? 'bg-card-dark border-border-dark text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    {helperResult.mode}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHelperResult(null)}
                    className="text-xs opacity-70 hover:opacity-100"
                  >
                    Close
                  </button>
                </div>
                <pre className="text-xs whitespace-pre-wrap">{helperResult.output}</pre>
              </div>
            )}
          </main>

          {/* Footer controls - only on the left/text side */}
          <footer className={`shrink-0 z-40 border-t ${theme === 'dark' ? 'border-border-dark bg-background-dark/95' : theme === 'light' ? 'border-slate-200 bg-white/95' : 'border-amber-200 bg-amber-50/95'} backdrop-blur-md px-4 py-3`}>
            <div className="max-w-4xl mx-auto space-y-2">
              {/* Progress bar — click to seek */}
              <div
                ref={progressBarRef}
                role="slider"
                aria-label="Reading position"
                aria-valuemin={0}
                aria-valuemax={Math.max(0, sentences.length - 1)}
                aria-valuenow={currentSentenceIdx}
                tabIndex={0}
                onClick={handleProgressBarClick}
                onKeyDown={(e) => {
                  if (!progressBarRef.current || sentences.length === 0) return;
                  const rect = progressBarRef.current.getBoundingClientRect();
                  if (e.key === 'Home') { e.preventDefault(); handleProgressBarClick({ clientX: rect.left }); }
                  if (e.key === 'End') { e.preventDefault(); handleProgressBarClick({ clientX: rect.right }); }
                }}
                className={`h-2 rounded-full overflow-hidden cursor-pointer ${theme === 'dark' ? 'bg-slate-800' : theme === 'light' ? 'bg-slate-200' : 'bg-amber-200'}`}
              >
                <div
                  className={`h-full transition-all ${theme === 'sepia' ? 'bg-amber-600' : 'bg-primary'}`}
                  style={{ width: `${sentences.length > 0 ? (currentSentenceIdx / sentences.length) * 100 : 0}%` }}
                />
              </div>

              {/* Playback controls */}
              <div className="flex items-center justify-center gap-6">
                <button type="button" onClick={handlePrevPage} disabled={currentPage <= 1} className={`p-1.5 rounded-lg disabled:opacity-30 transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white' : theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-amber-600 hover:text-amber-900'}`} aria-label="Previous page">
                  <span className={`material-symbols-outlined ${controlButtonSizeClass}`}>skip_previous</span>
                </button>
                <button type="button" onClick={handleSkipBackward} disabled={sentences.length === 0} className={`p-1.5 rounded-lg disabled:opacity-30 transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white' : theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-amber-600 hover:text-amber-900'}`} aria-label="Skip backward 10s">
                  <span className={`material-symbols-outlined ${controlButtonSizeClass}`}>replay_10</span>
                </button>
                <button
                  type="button"
                  onClick={handlePlayPause}
                  disabled={!(playing || paused) && (!modelStatus || modelStatus.status !== 'ready')}
                  className={`${mainPlayButtonClass} rounded-full flex items-center justify-center shadow-lg transition-transform ${
                    !(playing || paused) && (!modelStatus || modelStatus.status !== 'ready')
                      ? 'bg-slate-500 text-slate-300 cursor-not-allowed opacity-60'
                      : `hover:scale-105 ${theme === 'sepia' ? 'bg-amber-700 text-white shadow-amber-700/30' : 'bg-primary text-white shadow-primary/30'}`
                  }`}
                  aria-label={
                    !(playing || paused) && (!modelStatus || modelStatus.status !== 'ready') ? 'Loading voice…'
                    : generating ? 'Generating… (click to cancel)'
                    : playing && !paused ? 'Pause' : 'Play'
                  }
                >
                  <span className={`material-symbols-outlined ${largeControls ? 'text-3xl' : 'text-2xl'} ${generating ? 'animate-spin' : ''}`}>
                    {!(playing || paused) && (!modelStatus || modelStatus.status !== 'ready') ? 'hourglass_top'
                      : generating ? 'progress_activity'
                      : playing && !paused ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button type="button" onClick={handleSkipForward} disabled={sentences.length === 0} className={`p-1.5 rounded-lg disabled:opacity-30 transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white' : theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-amber-600 hover:text-amber-900'}`} aria-label="Skip forward 30s">
                  <span className={`material-symbols-outlined ${controlButtonSizeClass}`}>forward_30</span>
                </button>
                <button type="button" onClick={handleNextPage} disabled={currentPage >= totalPages} className={`p-1.5 rounded-lg disabled:opacity-30 transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white' : theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-amber-600 hover:text-amber-900'}`} aria-label="Next page">
                  <span className={`material-symbols-outlined ${controlButtonSizeClass}`}>skip_next</span>
                </button>
              </div>

              {/* Settings row */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                <label className={`flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : theme === 'light' ? 'text-slate-500' : 'text-amber-700'}`}>
                  <span className="material-symbols-outlined text-base">speed</span>
                  <select value={speed} onChange={handleSpeedChange} className={`border rounded-lg px-2 py-1 text-xs ${theme === 'dark' ? 'bg-card-dark border-border-dark text-white' : theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-amber-100 border-amber-300 text-amber-900'}`}>
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                      <option key={`speed-${r}`} value={r}>{r}×</option>
                    ))}
                  </select>
                </label>
                <label className={`flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : theme === 'light' ? 'text-slate-500' : 'text-amber-700'}`}>
                  <span className="material-symbols-outlined text-base">record_voice_over</span>
                  {isPiperReady() ? (
                    <>
                      <select
                        value={voice}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVoice(v);
                          TTS().setVoice(v);
                          setBookVoiceProfile(name, size, { voice: v, rate: speed });
                        }}
                        className={`border rounded-lg px-2 py-1 text-xs max-w-[140px] ${theme === 'dark' ? 'bg-card-dark border-border-dark text-white' : theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-amber-100 border-amber-300 text-amber-900'}`}
                        aria-label="Select voice"
                      >
                        {voices
                          .slice()
                          .sort((a, b) => {
                            const aFav = voiceFavorites.includes(a.id) ? 1 : 0;
                            const bFav = voiceFavorites.includes(b.id) ? 1 : 0;
                            if (bFav !== aFav) return bFav - aFav;
                            return (a.name || '').localeCompare(b.name || '');
                          })
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {voiceFavorites.includes(v.id) ? '★ ' : ''}{v.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setVoiceFavorites(toggleVoiceFavorite(voice))}
                        className={`text-[10px] font-medium px-2 py-1 rounded-md ${voiceFavorites.includes(voice) ? 'bg-amber-500/70 text-white' : theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                        title="Toggle favorite voice"
                      >
                        {voiceFavorites.includes(voice) ? 'Favorited' : 'Favorite'}
                      </button>
                      <span className="text-[10px] font-medium text-emerald-500 whitespace-nowrap" title="Piper natural voice">Natural</span>
                    </>
                  ) : (
                    <span className={`border rounded-lg px-2 py-1 text-xs ${theme === 'dark' ? 'bg-card-dark border-border-dark text-white' : theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-amber-100 border-amber-300 text-amber-900'}`}>
                      Browser voice
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handlePreviewVoice}
                    disabled={ttsSentences.length === 0}
                    className={`text-[10px] font-medium px-2 py-1 rounded-md disabled:opacity-40 ${theme === 'dark' ? 'bg-surface text-slate-300 hover:text-white' : 'bg-slate-200 text-slate-700 hover:text-slate-900'}`}
                  >
                    Preview
                  </button>
                </label>
                {isPiperReady() && (
                  <>
                    <span
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md border ${
                        offlineAudioReady
                          ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                          : theme === 'dark'
                            ? 'text-slate-400 border-border-dark bg-surface'
                            : 'text-slate-600 border-slate-300 bg-slate-100'
                      }`}
                      title={offlineAudioReady ? 'Offline audio is cached for this page' : 'Offline audio not cached yet'}
                    >
                      {offlineAudioReady ? 'Offline audio ready' : 'Offline audio not ready'}
                    </span>
                    <button
                      type="button"
                      onClick={handlePrepareOffline}
                      disabled={offlinePreparing}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md border disabled:opacity-60 ${
                        theme === 'dark'
                          ? 'text-slate-300 border-border-dark bg-surface hover:text-white'
                          : 'text-slate-700 border-slate-300 bg-slate-100 hover:text-slate-900'
                      }`}
                      title="Cache audio for this page + next 3 pages"
                    >
                      {offlinePreparing ? 'Preparing...' : 'Prepare offline +3'}
                    </button>
                  </>
                )}
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-500' : theme === 'light' ? 'text-slate-400' : 'text-amber-600'}`}>
                  Page {displayPageLabel(currentPage)}{pageLabels ? ` (${currentPage}/${totalPages})` : ` of ${totalPages || 1}`}
                </span>
                {chapters.length > 0 && (
                  <label className={`flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-400' : theme === 'light' ? 'text-slate-500' : 'text-amber-700'}`}>
                    <span className="material-symbols-outlined text-base">list</span>
                    <select
                      value=""
                      onChange={(e) => {
                        const page = Number(e.target.value);
                        if (!page) return;
                        TTS().stop();
                        setPlaying(false);
                        setPaused(false);
                        setGenerating(false);
                        wasManuallyPlaying.current = false;
                        setSelectedSentenceIdx(null);
                        setCurrentPage(page);
                        updateReadingPosition(name, size, { page, sentence: 0 });
                        updateLibraryProgress(name, size, page, totalPages);
                        e.target.value = '';
                      }}
                      className={`max-w-[200px] border rounded-lg px-2 py-1 text-xs ${theme === 'dark' ? 'bg-card-dark border-border-dark text-white' : theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-amber-100 border-amber-300 text-amber-900'}`}
                      aria-label="Jump to chapter"
                    >
                      <option value="">Jump to chapter</option>
                      {chapters.map((ch, idx) => (
                        <option key={`${ch.page}-${idx}`} value={ch.page}>
                          {ch.title || `Chapter ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 1}
                    value={goToPageInput}
                    onChange={(e) => setGoToPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleGoToPage();
                      }
                    }}
                    placeholder="Go to"
                    className={`w-14 rounded-lg px-2 py-1 text-center text-xs border ${theme === 'dark' ? 'bg-card-dark border-border-dark text-white placeholder:text-slate-600' : theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-amber-100 border-amber-300 text-amber-900 placeholder:text-amber-500'}`}
                    aria-label="Go to page number"
                  />
                  <button
                    type="button"
                    onClick={handleGoToPage}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold ${theme === 'sepia' ? 'bg-amber-700 text-white hover:bg-amber-800' : 'bg-primary text-white hover:bg-primary-hover'}`}
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </div>

        {/* Right side: original PDF - independently scrollable with page nav */}
        {splitScreen && (
          <PdfRightPanel
            pdfRightRef={pdfRightRef}
            pdfPages={pdfPages}
            totalPages={totalPages}
            currentPage={currentPage}
            theme={theme}
            displayPageLabel={displayPageLabel}
          />
        )}
      </div>

      {showHighlights && (
        <div className={`border-b px-4 py-3 max-h-48 overflow-y-auto ${theme === 'dark' ? 'border-border-dark bg-card-dark' : theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-100/30'}`}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Highlights & notes</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const md = buildHighlightsExportText();
                    if (!md) return;
                    navigator.clipboard.writeText(md).catch(() => {});
                  }}
                  disabled={highlights.length === 0}
                  className={`text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40 ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const md = buildHighlightsExportText();
                    if (!md) return;
                    const subject = encodeURIComponent(`${title || name || 'Book'} highlights`);
                    const body = encodeURIComponent(md.slice(0, 1800));
                    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                  }}
                  disabled={highlights.length === 0}
                  className={`text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40 ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const md = buildHighlightsExportText();
                    if (!md) return;
                    const exportTitle = title || name || 'Highlights';
                    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${exportTitle.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60)}-highlights.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={highlights.length === 0}
                  className={`text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-40 ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
                >
                  Export
                </button>
              </div>
            </div>
            <ul className="mt-2 space-y-2 text-sm">
              {highlights.filter((h) => h.page === currentPage).length === 0 && <li className="text-slate-500">No highlights on this page. Select text and use the toolbar.</li>}
              {highlights.filter((h) => h.page === currentPage).map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>{h.text || '(no text)'}</p>
                    {editingNoteId === h.id ? (
                      <input
                        type="text"
                        defaultValue={h.note}
                        onBlur={(e) => { updateHighlightNote(name, size, h.id, e.target.value); setHighlights(getHighlights(name, size)); setEditingNoteId(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                        className="mt-1 w-full bg-surface border border-border-dark rounded px-2 py-1 text-white text-xs"
                        autoFocus
                      />
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">{h.note || '—'}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setEditingNoteId(h.id)} className="text-slate-500 hover:text-primary" title="Edit note">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button type="button" onClick={() => { setCurrentSentenceIdx(h.sentence_start); setShowHighlights(false); }} className="text-slate-500 hover:text-primary" title="Go to">
                      <span className="material-symbols-outlined text-lg">arrow_upward</span>
                    </button>
                    <button type="button" onClick={() => { removeHighlight(name, size, h.id); setHighlights(getHighlights(name, size)); }} className="text-slate-500 hover:text-red-400" title="Remove">
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
