/**
 * textSanitation.js
 * Inspired by patterns from 'pdf-narrator' to improve TTS playback quality.
 */

const ABBREVIATIONS = {
  'Mr\\.': 'Mister',
  'Mrs\\.': 'Misses',
  'Ms\\.': 'Miss',
  'Dr\\.': 'Doctor',
  'Prof\\.': 'Professor',
  'Jr\\.': 'Junior',
  'Sr\\.': 'Senior',
  'vs\\.': 'versus',
  'etc\\.': 'etcetera',
  'i\\.e\\.': 'that is',
  'e\\.g\\.': 'for example',
  'St\\.': 'Saint',
  'Vol\\.': 'Volume',
  'No\\.\\s+(?=\\d)': 'Number ',
  'pp\\.': 'pages',
  'p\\.': 'page',
};

let customPronunciations = {};

export function setCustomPronunciations(dict) {
  customPronunciations = (dict && typeof dict === 'object' && !Array.isArray(dict)) ? dict : {};
}

// When true, strip page numbers / running footers / bare URLs so the voice
// doesn't read "Page 47" or a DOI mid-paragraph. Defaults on.
let skipJunk = true;

export function setSkipJunk(enabled) {
  skipJunk = enabled !== false;
}

/**
 * Drop boilerplate lines ("Page X of Y", running footers, bare URLs/DOIs)
 * before the rest of the pipeline joins wrapped lines. Conservative on purpose:
 * only removes lines that are *entirely* explicit junk so real prose & chapter numbers are safe.
 */
function stripBoilerplate(text) {
  const lines = text.split(/\r?\n/);
  const junk = [
    /^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i,                 // "Page 4" / "Page 4 of 76"
    /^\s*\d+\s*[|/]\s*page\s*$/i,                         // "12 | Page"
    /^\s*(https?:\/\/\S+|www\.\S+|doi:\s*\S+)\s*$/i,      // bare URL / DOI line
  ];
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true; // preserve paragraph breaks
    return !junk.some((re) => re.test(t));
  });
  return kept.join('\n');
}

export function applyCustomPronunciations(text) {
  if (!text || !customPronunciations || typeof customPronunciations !== 'object') return text;
  const entries = Object.entries(customPronunciations);
  if (entries.length === 0) return text;
  let result = text;
  entries.forEach(([word, replacement]) => {
    if (!word || !replacement) return;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, replacement);
  });
  return result;
}

/**
 * Normalizes text, expands abbreviations, and joins hard-wrapped lines.
 * Optimized for natural TTS flow.
 */
export const sanitizeTextForTTS = (text) => {
  if (!text) return '';

  let sanitized = text;

  // 0. Strip page numbers / running footers / bare URLs (before line-joining).
  if (skipJunk) {
    sanitized = stripBoilerplate(sanitized);
  }

  // 1. Unicode Normalization (NFKC decomposes ligatures like 'fi', 'fl', 'Th')
  sanitized = sanitized.normalize('NFKC');

  // 2. Fix Ligatures and common PDF extraction artifacts
  sanitized = sanitized
    .replace(/\uE000/g, 'Th') // Common PRIVATE USE AREA ligature for Th
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/[ \t]+/g, ' ');

  // 3. Natural Pauses: Replace dashes with commas
  // Em Dash and En Dash often cause abrupt stops; commas feel more natural.
  sanitized = sanitized
    .replace(/[—–]/g, ', ')
    .replace(/; /g, ', ');

  // 4. Join hard-wrapped lines (heuristic)
  // If a line doesn't end in sentence punctuation, it's likely wrapped.
  const lines = sanitized.split('\n');
  if (lines.length > 1) {
    sanitized = lines.reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed) return acc;
      // If the last character isn't sentence-ending, join with space
      if (acc && !/[.!?:)"»’]$/.test(acc)) {
        return acc + ' ' + trimmed;
      }
      return acc ? acc + '\n' + trimmed : trimmed;
    }, '');
  }

  // 5. Expand Abbreviations (Mr. -> Mister)
  // This prevents the TTS from saying "M R dot"
  Object.entries(ABBREVIATIONS).forEach(([abbr, expansion]) => {
    const regex = new RegExp(`\\b${abbr}`, 'gi');
    sanitized = sanitized.replace(regex, expansion);
  });

  // 6. Apply Custom Pronunciations
  sanitized = applyCustomPronunciations(sanitized);

  // 7. Fix initials (e.g., "E. B. White" -> "E B White")
  // Prevents "E dot B dot"
  sanitized = sanitized.replace(/([A-Z])\.\s*(?=[A-Z])/g, '$1 ');

  // 8. Cleanup remaining artifacts (preserve newlines)
  sanitized = sanitized
    .replace(/\[\d+\]/g, '') // Remove citations [1], [2]
    .replace(/[ \t]+/g, ' ')  // Collapse horizontal whitespace
    .replace(/\n{3,}/g, '\n\n') // Max double newline for paragraphs
    .trim();

  return sanitized;
};

/**
 * Splits text into high-quality sentence chunks for TTS, respecting paragraph breaks.
 * Uses a robust split strategy that preserves all words including those starting
 * with smart/curly quotes, numbers, and special characters.
 */
export const splitIntoSentenceChunks = (text) => {
  if (!text) return [];

  // 1. Split by explicit paragraph breaks (\n\n) first — never merge across paragraphs
  const paragraphs = text.split(/\r?\n\r?\n+/);
  const finalChunks = [];

  paragraphs.forEach(paragraph => {
    const pTrim = paragraph.trim();
    if (!pTrim) return;

    // 2. Split on sentence-ending punctuation followed by whitespace/end.
    //    Use a simple approach: find positions after [.!?] + optional trailing quote/bracket
    //    that are followed by whitespace or end-of-string, then slice.
    const sentences = [];
    let start = 0;
    const re = /[.!?]+['"'"')\]}]*(?=\s|$)/g;
    let m;
    while ((m = re.exec(pTrim)) !== null) {
      const end = m.index + m[0].length;
      const chunk = pTrim.slice(start, end).trim();
      if (chunk.length > 0) sentences.push(chunk);
      start = end;
    }
    // Capture any trailing text that had no sentence-ending punctuation
    if (start < pTrim.length) {
      const tail = pTrim.slice(start).trim();
      if (tail.length > 0) sentences.push(tail);
    }
    // Fallback: if regex found nothing, treat whole paragraph as one sentence
    if (sentences.length === 0 && pTrim.length > 0) {
      sentences.push(pTrim);
    }

    // 3. Sub-split sentences that are very long (> 450 chars) at natural pauses
    const pFinalChunks = [];
    for (const s of sentences) {
      if (s.length > 450) {
        const subChunks = s.split(/(?<=[,;:—])\s+/);
        for (const sub of subChunks) {
          const sTrim = sub.trim();
          if (sTrim.length > 0) pFinalChunks.push(sTrim);
        }
      } else {
        if (s.length > 0) pFinalChunks.push(s);
      }
    }

    // 4. Smart Merge within paragraph: join short sentences until ~60 chars
    //    Never merge across paragraph boundaries.
    const TARGET_MIN_CHARS = 60;
    let buffer = '';
    for (let i = 0; i < pFinalChunks.length; i++) {
      buffer = buffer ? buffer + ' ' + pFinalChunks[i] : pFinalChunks[i];
      const isLast = i === pFinalChunks.length - 1;
      if (buffer.length >= TARGET_MIN_CHARS || isLast) {
        if (buffer.trim().length > 0) finalChunks.push(buffer.trim());
        buffer = '';
      }
    }
  });

  return finalChunks.filter(c => c.length > 0);
};
