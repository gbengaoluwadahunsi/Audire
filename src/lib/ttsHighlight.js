/**
 * Map TTS chunk strings onto the PDF text layer (or EPUB body) for visual highlighting.
 * Chunks come from sanitized text; on-screen text may differ slightly — matching is word-based + fuzzy.
 */

export function buildPdfLayerTextIndex(textLayerEl) {
  if (!textLayerEl) return { full: '', map: [] };
  const spans = Array.from(textLayerEl.querySelectorAll('span'));
  let full = '';
  const map = [];
  for (const el of spans) {
    const t = el.textContent ?? '';
    const start = full.length;
    full += t;
    map.push({ el, start, end: full.length });
  }
  return { full, map };
}

export function clearPdfTtsHighlight(textLayerEl) {
  if (!textLayerEl) return;
  textLayerEl.querySelectorAll('.tts-reading').forEach((el) => {
    el.classList.remove('tts-reading');
  });
}

/**
 * Find [start, end) in fullText for chunk using consecutive word matching (tolerates whitespace gaps).
 */
export function findChunkRangeInText(fullText, chunk, fromIndex = 0) {
  if (!fullText || !chunk) return null;
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let pos = Math.max(0, fromIndex);
  const maxScan = Math.min(fullText.length, fromIndex + 800000);
  while (pos < maxScan) {
    const idx = fullText.indexOf(words[0], pos);
    if (idx === -1) break;
    let end = idx + words[0].length;
    let ok = true;
    for (let w = 1; w < words.length; w++) {
      let p = end;
      while (p < fullText.length && /\s/.test(fullText[p])) p++;
      if (fullText.slice(p, p + words[w].length) !== words[w]) {
        ok = false;
        break;
      }
      end = p + words[w].length;
    }
    if (ok) return { start: idx, end };
    pos = idx + 1;
  }
  if (words.length > 6) {
    return findChunkRangeInText(fullText, words.slice(0, 6).join(' '), fromIndex);
  }
  return null;
}

/**
 * Case-insensitive word sequence match (handles Title vs title; still needs same words as layer).
 */
function findChunkRangeInTextInsensitive(fullText, chunk, fromIndex) {
  if (!fullText || !chunk) return null;
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lowerFull = fullText.toLowerCase();
  const lowerWords = words.map((w) => w.toLowerCase());
  let pos = Math.max(0, fromIndex);
  const maxScan = Math.min(fullText.length, fromIndex + 800000);
  while (pos < maxScan) {
    const idx = lowerFull.indexOf(lowerWords[0], pos);
    if (idx === -1) break;
    let end = idx + words[0].length;
    let ok = true;
    for (let w = 1; w < words.length; w++) {
      let p = end;
      while (p < fullText.length && /\s/.test(fullText[p])) p++;
      const slice = fullText.slice(p, p + words[w].length);
      if (slice.toLowerCase() !== lowerWords[w]) {
        ok = false;
        break;
      }
      end = p + words[w].length;
    }
    if (ok) return { start: idx, end };
    pos = idx + 1;
  }
  if (words.length > 6) {
    return findChunkRangeInTextInsensitive(fullText, words.slice(0, 6).join(' '), fromIndex);
  }
  return null;
}

/** Approximate inverse of sanitizeTextForTTS so layer text (still "Mr.") can match TTS chunk ("Mister"). */
function loosenTtsChunkForLayerMatch(chunk) {
  if (!chunk) return chunk;
  return chunk
    .replace(/\bMister\b/g, 'Mr.')
    .replace(/\bMisses\b/g, 'Mrs.')
    .replace(/\bMiss\b/g, 'Ms.')
    .replace(/\bDoctor\b/g, 'Dr.')
    .replace(/\bProfessor\b/g, 'Prof.')
    .replace(/\bSaint\b/g, 'St.')
    .replace(/\bversus\b/gi, 'vs.')
    .replace(/\betcetera\b/gi, 'etc.');
}

/** Match first N words with regex (case-insensitive); tolerates minor punctuation in layer text. */
function findChunkRangeByLeadingWordsRegex(fullText, chunk, fromIndex) {
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 14); n >= 3; n--) {
    const sub = words.slice(0, n);
    const escaped = sub.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    try {
      const re = new RegExp(escaped, 'gi');
      re.lastIndex = fromIndex;
      const m = re.exec(fullText);
      if (m) return { start: m.index, end: m.index + m[0].length };
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function findChunkRangeInTextFuzzy(fullText, chunk, fromIndex) {
  let r = findChunkRangeInText(fullText, chunk, fromIndex);
  if (r) return r;
  const simplified = chunk.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim();
  r = findChunkRangeInText(fullText, simplified, fromIndex);
  if (r) return r;
  r = findChunkRangeInTextInsensitive(fullText, chunk, fromIndex);
  if (r) return r;
  r = findChunkRangeInTextInsensitive(fullText, simplified, fromIndex);
  if (r) return r;
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 14); n >= 4; n--) {
    r = findChunkRangeInText(fullText, words.slice(0, n).join(' '), fromIndex);
    if (r) return r;
  }
  r = findChunkRangeByLeadingWordsRegex(fullText, chunk, fromIndex);
  if (r) return r;
  const loosened = loosenTtsChunkForLayerMatch(chunk);
  if (loosened !== chunk) {
    r = findChunkRangeInText(fullText, loosened, fromIndex);
    if (r) return r;
    r = findChunkRangeInTextInsensitive(fullText, loosened, fromIndex);
    if (r) return r;
    r = findChunkRangeByLeadingWordsRegex(fullText, loosened, fromIndex);
    if (r) return r;
  }
  return null;
}

export function applyPdfTtsHighlight(textLayerEl, chunkText, fromIndexRef, scrollContainerEl, rawPageTextFallback) {
  if (!textLayerEl || !chunkText) return;
  const savedTop = scrollContainerEl?.scrollTop;
  const savedLeft = scrollContainerEl?.scrollLeft;
  const { full } = buildPdfLayerTextIndex(textLayerEl);
  const from = typeof fromIndexRef?.current === 'number' ? fromIndexRef.current : 0;
  let range = findChunkRangeInTextFuzzy(full, chunkText, from);
  // Layer string order can differ slightly from extractTextFromPdf; try same chunk on raw page text then locate substring in layer.
  if (!range && rawPageTextFallback && typeof rawPageTextFallback === 'string') {
    const r2 = findChunkRangeInTextFuzzy(rawPageTextFallback, chunkText, from);
    if (r2) {
      const snippet = rawPageTextFallback.slice(r2.start, r2.end);
      range =
        findChunkRangeInText(full, snippet, 0) ||
        findChunkRangeInTextFuzzy(full, snippet, 0);
    }
  }
  if (!range) return;
  if (fromIndexRef) fromIndexRef.current = range.end;
  highlightPdfSpansForRange(textLayerEl, range.start, range.end);
  if (scrollContainerEl != null && savedTop != null) {
    const restore = () => {
      scrollContainerEl.scrollTop = savedTop;
      scrollContainerEl.scrollLeft = savedLeft ?? 0;
    };
    requestAnimationFrame(restore);
    requestAnimationFrame(restore);
  }
}

export function highlightPdfSpansForRange(textLayerEl, start, end) {
  clearPdfTtsHighlight(textLayerEl);
  if (!textLayerEl || start >= end) return;
  const { map } = buildPdfLayerTextIndex(textLayerEl);
  for (const { el, start: s, end: e } of map) {
    if (e <= start || s >= end) continue;
    el.classList.add('tts-reading');
  }
  // No scrollIntoView — it fights manual scrolling in .pdf-viewer-content and can jump to the top.
}

/** Collect text nodes under root in document order */
function collectTextNodes(root) {
  const out = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? '';
      if (t.length) out.push(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style') return;
      for (const c of node.childNodes) walk(c);
    }
  };
  walk(root);
  return out;
}

function flattenTextWithNodes(root) {
  const nodes = collectTextNodes(root);
  let full = '';
  const segments = [];
  for (const node of nodes) {
    const t = node.textContent ?? '';
    const start = full.length;
    full += t;
    segments.push({ node, start, end: full.length });
  }
  return { full, segments };
}

function unwrapTtsMarks(root) {
  if (!root) return;
  root.querySelectorAll('mark.tts-reading').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

/** Capture scroll positions in an iframe document (EPUB) before DOM mutations that can reset scroll. */
function captureDocScrollSnapshots(doc) {
  const win = doc.defaultView;
  if (!win) return [];
  const html = doc.documentElement;
  const body = doc.body;
  const snaps = [];
  const seen = new Set();
  const push = (el) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    snaps.push({ el, top: el.scrollTop, left: el.scrollLeft });
  };
  push(html);
  push(body);
  const se = doc.scrollingElement;
  if (se) push(se);
  try {
    for (const el of body?.querySelectorAll('*') ?? []) {
      if (snaps.length > 48) break;
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) push(el);
    }
  } catch {
    /* ignore */
  }
  snaps.push({ win, top: win.scrollY, left: win.scrollX, isWin: true });
  return snaps;
}

function restoreDocScrollSnapshots(snaps) {
  if (!snaps?.length) return;
  const apply = () => {
    for (const s of snaps) {
      if (s.isWin) s.win.scrollTo(s.left, s.top);
      else {
        s.el.scrollTop = s.top;
        s.el.scrollLeft = s.left;
      }
    }
  };
  requestAnimationFrame(apply);
  requestAnimationFrame(apply);
}

/**
 * Highlight a chunk inside EPUB (or any) HTML document body.
 */
export function applyEpubTtsHighlight(doc, chunkText, fromIndexRef) {
  if (!doc?.body || !chunkText) return;
  const scrollSnaps = captureDocScrollSnapshots(doc);
  const body = doc.body;
  unwrapTtsMarks(body);
  const { full, segments } = flattenTextWithNodes(body);
  const from = typeof fromIndexRef?.current === 'number' ? fromIndexRef.current : 0;
  const rangeChars = findChunkRangeInTextFuzzy(full, chunkText, from);
  if (!rangeChars) {
    restoreDocScrollSnapshots(scrollSnaps);
    return;
  }
  if (fromIndexRef) fromIndexRef.current = rangeChars.end;

  const { start, end } = rangeChars;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  for (const seg of segments) {
    if (startNode == null && seg.end > start) {
      startNode = seg.node;
      startOffset = start - seg.start;
    }
    if (seg.end >= end) {
      endNode = seg.node;
      endOffset = end - seg.start;
      break;
    }
  }
  if (!startNode || !endNode) {
    restoreDocScrollSnapshots(scrollSnaps);
    return;
  }

  try {
    const range = doc.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.textContent.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.textContent.length)));
    const mark = doc.createElement('mark');
    mark.className = 'tts-reading';
    mark.style.backgroundColor = 'rgba(250, 204, 21, 0.5)';
    mark.style.color = 'inherit';
    mark.style.borderRadius = '2px';
    try {
      range.surroundContents(mark);
    } catch {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }
  } catch {
    /* ignore */
  } finally {
    restoreDocScrollSnapshots(scrollSnaps);
  }
}

export function clearEpubTtsHighlight(doc) {
  if (!doc?.body) return;
  unwrapTtsMarks(doc.body);
}
