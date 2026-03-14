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
  'No\\.': 'Number',
  'pp\\.': 'pages',
  'p\\.': 'page',
};

/**
 * Normalizes text, expands abbreviations, and joins hard-wrapped lines.
 * Optimized for natural TTS flow.
 */
export const sanitizeTextForTTS = (text) => {
  if (!text) return '';

  let sanitized = text;

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
    .replace(/\s+/g, ' ');

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

  // 6. Fix initials (e.g., "E. B. White" -> "E B White")
  // Prevents "E dot B dot"
  sanitized = sanitized.replace(/([A-Z])\.\s*(?=[A-Z])/g, '$1 ');

  // 7. Cleanup remaining artifacts
  sanitized = sanitized
    .replace(/\[\d+\]/g, '') // Remove citations [1], [2]
    .replace(/\s+/g, ' ')    // Collapse whitespace one last time
    .trim();

  return sanitized;
};

/**
 * Splits text into high-quality sentence chunks for TTS.
 * Now with sharding for longer sentences to ensure fast backend generation.
 */
export const splitIntoSentenceChunks = (text) => {
  if (!text) return [];
  
  // 1. Initial split by major sentence endings (. ! ?)
  const initialChunks = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!initialChunks) return [text.trim()].filter(t => t.length > 0);

  const finalChunks = [];
  initialChunks.forEach(chunk => {
    const trimmed = chunk.trim();
    if (!trimmed) return;

    // 2. If chunk is very long (> 300 chars), sub-split it at natural pauses (comma, etc.)
    // This allows the backend to return the first piece faster.
    if (trimmed.length > 300) {
      // Split at , ; : or -- but keep the delimiter attached to the previous chunk
      const subChunks = trimmed.split(/(?<=[,;:—])\s+/);
      subChunks.forEach(s => {
        const sTrim = s.trim();
        if (sTrim.length > 0) finalChunks.push(sTrim);
      });
    } else {
      finalChunks.push(trimmed);
    }
  });

  // 3. Smart Merge: Join short chunks to reduce total request count.
  // Fewer, larger chunks = fewer backend round-trips = smoother playback.
  const optimized = [];
  for (let i = 0; i < finalChunks.length; i++) {
    let chunk = finalChunks[i];
    // If chunk is short and there is a next chunk, merge them
    if (chunk.length < 40 && i + 1 < finalChunks.length) {
      optimized.push(chunk + ' ' + finalChunks[i + 1]);
      i++; // Skip the next one we just merged
    } else {
      optimized.push(chunk);
    }
  }

  return optimized.filter(c => c.length > 1);
};
