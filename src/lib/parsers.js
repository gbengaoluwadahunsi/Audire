/**
 * PDF parser with OCR fallback, multi-signal header/footer removal,
 * auto chapter detection + EPUB parser.
 */

import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// ── helpers ──

function normalize(text) {
  return text.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isPageNumber(text) {
  const s = text.trim();
  return /^\d{1,5}$/.test(s) || /^[-–—]\s*\d{1,5}\s*[-–—]$/.test(s) || /^page\s+\d+$/i.test(s);
}

function findRepeating(arr, threshold) {
  const counts = {};
  for (const s of arr) counts[s] = (counts[s] || 0) + 1;
  const result = new Set();
  for (const [s, c] of Object.entries(counts)) { if (c >= threshold) result.add(s); }
  return result;
}

const CHAPTER_RE = /^(chapter|part|section|prologue|epilogue|introduction|conclusion|appendix|preface|foreword)\b/i;
const CHAPTER_NUM_RE = /^(chapter|part|section)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)/i;
const ROMAN_RE = /^[IVXLCDM]+\.?\s*$/;

function cleanForSpeech(text) {
  return text
    // arrows → "to"
    .replace(/\s*[→⟶➔➜➝➞⇒=>]{1,2}\s*/g, ' to ')
    // bullets / middle dots → comma pause
    .replace(/\s*[•·◦▪▸►‣∙]\s*/g, ', ')
    // pipes and vertical bars
    .replace(/\s*[|¦]\s*/g, ', ')
    // em/en dashes → comma
    .replace(/\s*[—–]\s*/g, ', ')
    // slashes between words (e.g. "Twitter/X") → "or"
    .replace(/(\w)\s*\/\s*(\w)/g, '$1 or $2')
    // remaining slashes
    .replace(/\//g, ' ')
    // ampersand
    .replace(/&/g, ' and ')
    // copyright, trademark symbols
    .replace(/[©®™§¶]/g, '')
    // hashtags → just the word
    .replace(/#(\w)/g, '$1')
    // dollar amounts stay, but clean stray $
    .replace(/\$(?!\d)/g, '')
    // URLs → "link"
    .replace(/https?:\/\/\S+/gi, 'link')
    // email → "email"
    .replace(/\S+@\S+\.\S+/g, 'email')
    // repeated punctuation
    .replace(/([.!?,;:]){2,}/g, '$1')
    // ellipsis normalization
    .replace(/\.{3,}/g, '...')
    // stray special chars that TTS reads literally
    .replace(/[~`^*_{}[\]<>\\]+/g, ' ')
    // collapse multiple spaces/commas
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function splitSentences(text) {
  text = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  text = cleanForSpeech(text);

  const parts = text.split(/(?<=[.!?…""])\s+(?=[A-Z"'"(\[])/);
  const sentences = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (sentences.length && sentences[sentences.length - 1].length < 15 &&
        !/[.!?…]$/.test(sentences[sentences.length - 1])) {
      sentences[sentences.length - 1] += ' ' + t;
    } else {
      sentences.push(t);
    }
  }
  return sentences;
}

export function splitIntoParagraphs(text) {
  if (!text?.trim()) return { sentences: [], paragraphBreaks: new Set() };
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  if (paragraphs.length <= 1) {
    return { sentences: splitSentences(text), paragraphBreaks: new Set([0]) };
  }
  const sentences = [];
  const paragraphBreaks = new Set();
  for (const para of paragraphs) {
    paragraphBreaks.add(sentences.length);
    sentences.push(...splitSentences(para));
  }
  return { sentences, paragraphBreaks };
}

/** Returns true if the sentence looks like a figure/table/image caption so we can skip it from TTS and keep voice in sync with body text. */
export function isFigureOrTableCaption(sentence) {
  if (!sentence || typeof sentence !== 'string') return false;
  const s = sentence.trim();
  if (s.length > 120) return false; // long text is likely body
  const lower = s.toLowerCase();
  // "Figure 1.2", "Table 3", "Exhibit A", "Image 2", "See Figure 4", "Chart 1"
  if (/^(figure|table|exhibit|image|chart|diagram|graph|photo|picture|illustration|fig\.?)\s*[\d.a-z]+/i.test(lower)) return true;
  if (/^see\s+(figure|table|fig\.?|appendix)\s+/i.test(lower)) return true;
  // "Table 2 below", "Figure 3 above", "Source: ..."
  if (/^(figure|table|source|caption)\s*[\d.]*( below| above)?\.?$/i.test(lower)) return true;
  if (/^\(?(figure|table|fig\.?)\s*[\d.]+\s*\)?\.?$/i.test(lower)) return true;
  // Short lines that are mostly "Figure X" or "Table X"
  if (/^[^.!?]*\b(figure|table|fig\.?)\s*[\d.]+\b[^.!?]*\.?$/i.test(s) && s.length < 80) return true;
  return false;
}

// ══════════════════════════════════════════
// PDF PARSER — with OCR + smart filtering + chapter detection
// ══════════════════════════════════════════

const MARGIN = 0.10;
const SAMPLE_N = 20;

export class PDFBook {
  constructor() {
    this._doc = null;
    this._buf = null;
    this._headers = new Set();
    this._footers = new Set();
    this._headerFontSizes = new Set();
    this._footerFontSizes = new Set();
    this._bodyFontSize = 12;
    this._chapters = [];
    this._pageLabels = null;
    this._ocrWorker = null;
    this._scannedPageCache = {};
  }

  async open(buffer) {
    this._buf = buffer;
    this._doc = await pdfjsLib.getDocument({ data: buffer }).promise;
    try {
      const labels = await this._doc.getPageLabels();
      if (labels && labels.length === this._doc.numPages) {
        this._pageLabels = labels;
      }
    } catch { /* page labels not available */ }
    await this._learnPatterns();
    await this._detectChapters();
    return this._doc.numPages;
  }

  close() {
    if (this._doc) { this._doc.destroy(); this._doc = null; }
    if (this._ocrWorker) { this._ocrWorker.terminate(); this._ocrWorker = null; }
    this._scannedPageCache = {};
  }

  get pages() { return this._doc ? this._doc.numPages : 0; }
  get chapters() { return this._chapters; }
  get pageLabels() { return this._pageLabels; }
  pageLabel(num) {
    if (this._pageLabels && num >= 1 && num <= this._pageLabels.length) {
      return this._pageLabels[num - 1];
    }
    return String(num);
  }

  async metadata() {
    if (!this._doc) return {};
    try {
      const m = await this._doc.getMetadata();
      return { title: m.info?.Title || '', author: m.info?.Author || '' };
    } catch { return {}; }
  }

  async coverImage() {
    if (!this._doc) return null;
    try {
      const page = await this._doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const targetWidth = 240;
      const scale = targetWidth / viewport.width;
      const scaled = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(scaled.width);
      canvas.height = Math.round(scaled.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: scaled }).promise;
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }

  async pageText(num) {
    if (!this._doc) return '';
    const page = await this._doc.getPage(num);
    const content = await page.getTextContent();

    const rawText = content.items.map(i => i.str || '').join('');
    const textLen = rawText.trim().length;

    if (textLen < 30) {
      const ocrText = await this._ocrPage(page, num);
      return ocrText || '';
    }

    const extracted = this._extractFilteredText(page, content);

    if (this._isGarbledText(rawText) && textLen < 200) {
      const ocrText = await this._ocrPage(page, num);
      if (ocrText && ocrText.trim().length > extracted.trim().length * 0.5) {
        return ocrText;
      }
    }

    return extracted;
  }

  /**
   * Detects garbled text: font-encoding issues produce streams of
   * special characters or single letters with no spaces.
   * Returns true if the text looks like garbage and OCR should be used instead.
   */
  _isGarbledText(text) {
    const t = text.trim();
    if (t.length < 20) return false;
    const tokens = t.split(/\s+/);
    if (tokens.length < 5) return false;
    const singleChars = tokens.filter(w => w.length === 1).length;
    const avgLen = tokens.reduce((sum, w) => sum + w.length, 0) / tokens.length;
    const alphaRatio = (t.match(/[a-zA-Z]/g) || []).length / t.length;
    const singleCharRatio = singleChars / tokens.length;
    const hasRealWords = tokens.filter(w => w.length >= 3 && /^[a-zA-Z]+$/.test(w)).length;
    const realWordRatio = hasRealWords / tokens.length;
    if (realWordRatio > 0.2) return false;
    return alphaRatio < 0.25 || (singleCharRatio > 0.5 && avgLen < 2.0);
  }

  _extractFilteredText(page, content) {
    const vp = page.getViewport({ scale: 1 });
    const h = vp.height;
    const topCut = h * (1 - MARGIN), botCut = h * MARGIN;
    const kept = [];

    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = item.transform[5];
      const fontSize = Math.abs(item.transform[0]) || 12;
      const norm = normalize(item.str);

      const inTop = y >= topCut;
      const inBot = y <= botCut;
      if (inTop && this._headers.has(norm)) continue;
      if (inBot && this._footers.has(norm)) continue;

      if ((inTop || inBot) && this._isMarginFontSize(fontSize)) {
        if (isPageNumber(item.str)) continue;
        if (item.str.trim().length < 60 && this._looksLikeMarginText(item.str)) continue;
      }

      if (isPageNumber(item.str)) continue;

      kept.push({ str: item.str, y, fontSize });
    }

    if (kept.length === 0) return '';

    // Group by Y position into lines (tolerance: half the most common font size)
    kept.sort((a, b) => b.y - a.y);
    const tolerance = (kept.reduce((s, k) => s + k.fontSize, 0) / kept.length) * 0.3;
    const lines = [];
    let curLine = [kept[0]];
    for (let i = 1; i < kept.length; i++) {
      if (Math.abs(kept[i].y - curLine[0].y) < tolerance) {
        curLine.push(kept[i]);
      } else {
        lines.push(curLine);
        curLine = [kept[i]];
      }
    }
    lines.push(curLine);

    // Calculate typical line spacing
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      gaps.push(Math.abs(lines[i][0].y - lines[i - 1][0].y));
    }
    const medianGap = gaps.length > 0 ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;

    // Build text with paragraph breaks where gap is significantly larger than typical
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i].map(k => k.str).join(' ').trim();
      if (!lineText) continue;
      if (i > 0 && medianGap > 0) {
        const gap = Math.abs(lines[i][0].y - lines[i - 1][0].y);
        if (gap > medianGap * 1.6) {
          result.push('\n\n');
        }
      }
      result.push(lineText);
    }

    return result.join(' ')
      .replace(/\s*\n\n\s*/g, '\n\n')
      .replace(/(\w)-\s+(\w)/g, '$1$2')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  _isMarginFontSize(size) {
    return this._headerFontSizes.has(Math.round(size)) || this._footerFontSizes.has(Math.round(size));
  }

  _looksLikeMarginText(text) {
    const t = text.trim();
    if (/^\d+$/.test(t)) return true;
    if (/^[-–—|•]/.test(t) && t.length < 40) return true;
    if (/©|copyright|all rights reserved/i.test(t)) return true;
    if (/isbn|doi:/i.test(t)) return true;
    return false;
  }

  async _ocrPage(page, num) {
    if (this._scannedPageCache[num]) return this._scannedPageCache[num];

    try {
      // Tesseract requires min width 3px and fails on tiny images; use a high minimum so no "Image too small" / "Line cannot be recognized"
      const MIN_OCR_PX = 120;
      let scale = 2.0;
      let vp = page.getViewport({ scale });
      if (vp.width < MIN_OCR_PX || vp.height < MIN_OCR_PX) {
        const minDim = Math.min(vp.width, vp.height);
        if (minDim <= 0) return '';
        scale = (scale * MIN_OCR_PX) / minDim;
        vp = page.getViewport({ scale });
      }
      const canvas = new OffscreenCanvas(vp.width, vp.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      // Skip OCR if canvas is still too small (safety net)
      if (canvas.width < 10 || canvas.height < 10) return '';
      const blob = await canvas.convertToBlob({ type: 'image/png' });

      if (!this._ocrWorker) {
        this._ocrWorker = await Tesseract.createWorker('eng');
      }

      let data;
      try {
        const result = await this._ocrWorker.recognize(blob);
        data = result.data;
      } catch (ocrErr) {
        // Tesseract "Image too small" / "Line cannot be recognized" — avoid leaking to console
        if (ocrErr?.message?.includes('too small') || ocrErr?.message?.includes('cannot be recognized')) return '';
        throw ocrErr;
      }
      let text = data.text || '';

      if (data.lines && data.lines.length > 0) {
        const pageH = vp.height;
        const topCut = pageH * MARGIN;
        const botCut = pageH * (1 - MARGIN);
        const bodyLines = data.lines.filter(line => {
          const midY = (line.bbox.y0 + line.bbox.y1) / 2;
          return midY > topCut && midY < botCut;
        });
        text = bodyLines.map(l => l.text).join(' ');
      }

      text = text.replace(/\s{2,}/g, ' ').trim();
      this._scannedPageCache[num] = text;
      return text;
    } catch (e) {
      console.warn(`OCR failed for page ${num}:`, e);
      return '';
    }
  }

  async _learnPatterns() {
    const n = this._doc.numPages;
    const start = Math.min(4, n), end = Math.min(start + SAMPLE_N, n + 1);
    const hc = [], fc = [];
    const hFonts = [], fFonts = [], bodyFonts = [];

    for (let i = start; i < end; i++) {
      const page = await this._doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const h = vp.height;
      const topCut = h * (1 - MARGIN), botCut = h * MARGIN;

      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const y = item.transform[5];
        const fontSize = Math.round(Math.abs(item.transform[0]) || 12);
        const norm = normalize(item.str);
        if (!norm) continue;

        if (y >= topCut) {
          hc.push(norm);
          hFonts.push(fontSize);
        } else if (y <= botCut) {
          fc.push(norm);
          fFonts.push(fontSize);
        } else {
          bodyFonts.push(fontSize);
        }
      }
    }

    const threshold = Math.max(2, (end - start) * 0.4);
    this._headers = findRepeating(hc, threshold);
    this._footers = findRepeating(fc, threshold);

    this._headerFontSizes = new Set(findMostCommon(hFonts, 2));
    this._footerFontSizes = new Set(findMostCommon(fFonts, 2));
    this._bodyFontSize = mostCommonValue(bodyFonts) || 12;
  }

  async _detectChapters() {
    this._chapters = [];
    const n = this._doc.numPages;

    for (let i = 1; i <= Math.min(n, 200); i++) {
      const page = await this._doc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const h = vp.height;

      const topItems = content.items
        .filter(item => item.str?.trim() && item.transform[5] > h * 0.5)
        .slice(0, 5);

      for (const item of topItems) {
        const text = item.str.trim();
        const fontSize = Math.round(Math.abs(item.transform[0]) || 12);

        const isLarger = fontSize > this._bodyFontSize * 1.2;
        const matchesPattern = CHAPTER_RE.test(text) || CHAPTER_NUM_RE.test(text) || ROMAN_RE.test(text);

        if (matchesPattern || (isLarger && text.length > 2 && text.length < 80)) {
          const title = text.length > 60 ? text.substring(0, 57) + '...' : text;
          if (!this._chapters.length || this._chapters[this._chapters.length - 1].page !== i) {
            this._chapters.push({ page: i, title });
          }
          break;
        }
      }
    }
  }
}

function findMostCommon(arr, topN) {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN).map(e => parseInt(e[0]));
}

function mostCommonValue(arr) {
  if (!arr.length) return null;
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}


// ══════════════════════════════════════════
// EPUB PARSER
// ══════════════════════════════════════════

export class EPUBBook {
  constructor() { this._chapters = []; this._meta = {}; this._toc = []; this._zip = null; this._opfDir = ''; this._manifest = {}; }

  async open(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    this._zip = zip;
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) throw new Error('Invalid EPUB');

    const parser = new DOMParser();
    const cDoc = parser.parseFromString(containerXml, 'application/xml');
    const rootPath = cDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!rootPath) throw new Error('Invalid EPUB: no rootfile');

    const opfXml = await zip.file(rootPath)?.async('text');
    if (!opfXml) throw new Error('Invalid EPUB: missing OPF');
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');
    const opfDir = rootPath.includes('/') ? rootPath.substring(0, rootPath.lastIndexOf('/') + 1) : '';
    this._opfDir = opfDir;

    this._meta = {
      title: opfDoc.querySelector('metadata title')?.textContent || '',
      author: opfDoc.querySelector('metadata creator')?.textContent || '',
    };

    // Store cover item id from <meta name="cover"> for later extraction
    const coverMeta = opfDoc.querySelector('metadata meta[name="cover"]');
    this._coverItemId = coverMeta?.getAttribute('content') || null;

    const manifest = {};
    for (const el of opfDoc.querySelectorAll('manifest item'))
      manifest[el.getAttribute('id')] = { href: el.getAttribute('href'), type: el.getAttribute('media-type'), properties: el.getAttribute('properties') };
    this._manifest = manifest;

    const spine = [];
    for (const ref of opfDoc.querySelectorAll('spine itemref')) {
      const id = ref.getAttribute('idref');
      if (manifest[id]) spine.push(manifest[id]);
    }

    this._chapters = [];
    this._toc = [];
    let chapterIdx = 0;
    for (const entry of spine) {
      if (!entry.type?.includes('html')) continue;
      const html = await zip.file(opfDir + entry.href)?.async('text');
      if (!html) continue;
      const doc = parser.parseFromString(html, 'text/html');
      const text = doc.body?.textContent?.trim() || '';
      if (text.length > 30) {
        this._chapters.push(text.replace(/\s+/g, ' '));
        chapterIdx++;
        const heading = doc.querySelector('h1, h2, h3');
        const title = heading?.textContent?.trim() || `Chapter ${chapterIdx}`;
        this._toc.push({ page: chapterIdx, title });
      }
    }
    return this._chapters.length;
  }

  async coverImage() {
    if (!this._zip) return null;
    try {
      // Strategy 1: <meta name="cover" content="item-id">
      let coverItem = this._coverItemId ? this._manifest[this._coverItemId] : null;

      // Strategy 2: manifest item with properties="cover-image"
      if (!coverItem) {
        coverItem = Object.values(this._manifest).find(v => v.properties === 'cover-image');
      }

      // Strategy 3: manifest item whose id or href contains "cover"
      if (!coverItem) {
        coverItem = Object.entries(this._manifest).find(
          ([id, v]) => (id.toLowerCase().includes('cover') || (v.href || '').toLowerCase().includes('cover'))
            && v.type?.startsWith('image/')
        )?.[1];
      }

      if (!coverItem) return null;

      const imgBytes = await this._zip.file(this._opfDir + coverItem.href)?.async('arraybuffer');
      if (!imgBytes) return null;

      const blob = new Blob([imgBytes], { type: coverItem.type || 'image/jpeg' });
      return new Promise((resolve) => {
        // Resize to thumbnail via canvas
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const targetW = 240;
          const scale = targetW / img.naturalWidth;
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    } catch {
      return null;
    }
  }

  close() { this._chapters = []; this._zip = null; }
  get pages() { return this._chapters.length; }
  get chapters() { return this._toc; }
  get pageLabels() { return null; }
  pageLabel(num) { return String(num); }
  async metadata() { return this._meta; }
  async pageText(num) { return this._chapters[num - 1] || ''; }
}

// ══════════════════════════════════════════
// PLAIN TEXT (TXT) — Librera-style
// ══════════════════════════════════════════

const TXT_PAGE_SIZE = 4000;

export class TXTBook {
  constructor() {
    this._pages = [];
  }

  async open(buffer) {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(buffer);
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    this._pages = [];
    const blocks = normalized.split(/\n{3,}/);
    let current = '';
    for (const block of blocks) {
      if ((current + block).length > TXT_PAGE_SIZE && current.length > 0) {
        this._pages.push(current.trim());
        current = block + '\n\n';
      } else {
        current += (current ? '\n\n' : '') + block;
      }
    }
    if (current.trim()) this._pages.push(current.trim());
    if (this._pages.length === 0 && normalized) this._pages.push(normalized);
    return this._pages.length;
  }

  close() { this._pages = []; }
  get pages() { return this._pages.length; }
  get chapters() { return this._pages.map((_, i) => ({ page: i + 1, title: `Section ${i + 1}` })); }
  get pageLabels() { return null; }
  pageLabel(num) { return String(num); }
  async metadata() { return { title: '', author: '' }; }
  async coverImage() { return null; }
  async pageText(num) { return this._pages[num - 1] || ''; }
}

// ══════════════════════════════════════════
// DOCX (Office Open XML) — word/document.xml
// ══════════════════════════════════════════

const DOCX_PAGE_SIZE = 3500;

export class DOCXBook {
  constructor() {
    this._pages = [];
    this._zip = null;
    this._meta = {};
  }

  async open(buffer) {
    this._zip = await JSZip.loadAsync(buffer);
    const xml = await this._zip.file('word/document.xml')?.async('text');
    if (!xml) throw new Error('Invalid DOCX: missing word/document.xml');

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const textNodes = doc.getElementsByTagNameNS(ns, 't');
    let full = '';
    for (const n of textNodes) {
      if (n.textContent) full += n.textContent;
    }
    full = full.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();

    this._pages = [];
    for (let i = 0; i < full.length; i += DOCX_PAGE_SIZE) {
      this._pages.push(full.slice(i, i + DOCX_PAGE_SIZE));
    }
    if (this._pages.length === 0 && full) this._pages.push(full);

    const coreProps = await this._zip.file('docProps/core.xml')?.async('text');
    if (coreProps) {
      const coreDoc = parser.parseFromString(coreProps, 'application/xml');
      const cpNs = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
      this._meta = {
        title: coreDoc.getElementsByTagNameNS(cpNs, 'title')[0]?.textContent?.trim() || '',
        author: coreDoc.getElementsByTagNameNS(cpNs, 'creator')[0]?.textContent?.trim() || '',
      };
    }
    return this._pages.length;
  }

  close() { this._pages = []; this._zip = null; }
  get pages() { return this._pages.length; }
  get chapters() { return this._pages.map((_, i) => ({ page: i + 1, title: `Page ${i + 1}` })); }
  get pageLabels() { return null; }
  pageLabel(num) { return String(num); }
  async metadata() { return this._meta; }
  async coverImage() { return null; }
  async pageText(num) { return this._pages[num - 1] || ''; }
}

export function createBook(filename) {
  let ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'epub3') ext = 'epub';
  if (ext === 'pdf') return new PDFBook();
  if (ext === 'epub') return new EPUBBook();
  if (ext === 'txt') return new TXTBook();
  if (ext === 'docx') return new DOCXBook();
  throw new Error(`Unsupported format: .${ext}`);
}
