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

export function findChunkRangeInTextFuzzy(fullText, chunk, fromIndex) {
  let r = findChunkRangeInText(fullText, chunk, fromIndex);
  if (r) return r;
  const simplified = chunk.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim();
  r = findChunkRangeInText(fullText, simplified, fromIndex);
  if (r) return r;
  const words = chunk.trim().split(/\s+/).filter(Boolean);
  for (let n = Math.min(words.length, 14); n >= 4; n--) {
    r = findChunkRangeInText(fullText, words.slice(0, n).join(' '), fromIndex);
    if (r) return r;
  }
  return null;
}

export function applyPdfTtsHighlight(textLayerEl, chunkText, fromIndexRef) {
  if (!textLayerEl || !chunkText) return;
  const { full } = buildPdfLayerTextIndex(textLayerEl);
  const from = typeof fromIndexRef?.current === 'number' ? fromIndexRef.current : 0;
  const range = findChunkRangeInTextFuzzy(full, chunkText, from);
  if (!range) return;
  if (fromIndexRef) fromIndexRef.current = range.end;
  highlightPdfSpansForRange(textLayerEl, range.start, range.end);
}

export function highlightPdfSpansForRange(textLayerEl, start, end) {
  clearPdfTtsHighlight(textLayerEl);
  if (!textLayerEl || start >= end) return;
  const { map } = buildPdfLayerTextIndex(textLayerEl);
  let first = null;
  for (const { el, start: s, end: e } of map) {
    if (e <= start || s >= end) continue;
    el.classList.add('tts-reading');
    if (!first) first = el;
  }
  try {
    first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch {
    first?.scrollIntoView({ block: 'nearest' });
  }
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

/**
 * Highlight a chunk inside EPUB (or any) HTML document body.
 */
export function applyEpubTtsHighlight(doc, chunkText, fromIndexRef) {
  if (!doc?.body || !chunkText) return;
  const body = doc.body;
  unwrapTtsMarks(body);
  const { full, segments } = flattenTextWithNodes(body);
  const from = typeof fromIndexRef?.current === 'number' ? fromIndexRef.current : 0;
  const rangeChars = findChunkRangeInTextFuzzy(full, chunkText, from);
  if (!rangeChars) return;
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
  if (!startNode || !endNode) return;

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
    try {
      mark.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {
      mark.scrollIntoView({ block: 'nearest' });
    }
  } catch {
    /* ignore */
  }
}

export function clearEpubTtsHighlight(doc) {
  if (!doc?.body) return;
  unwrapTtsMarks(doc.body);
}
