import { DEFAULT_ENGINE_ORDER, normalizeEngineOrder } from './voices/engines';

const STORAGE_KEY = 'audire-settings';

const DEFAULTS = {
  engineOrder: DEFAULT_ENGINE_ORDER, // First choice first; the rest are backups in order
  edgeTtsVoice: 'en-US-AvaMultilingualNeural',
  webSpeechVoice: '', // voiceURI; empty = the device's default English voice
  speed: 1.0,
  fontSize: 15,
  fontFamily: 'System',
  lineHeight: 1.6,
  margin: 1.0,
  layout: 'single',
  theme: 'dark',
  librarySort: 'last_read',
  librarySortOrder: 'desc',
  pronunciationDict: {}, // Object map: { word: pronunciation }
  skipJunk: true, // Skip page numbers / footers / bare URLs while reading aloud
  dailyGoalMinutes: 20, // Daily listening goal
  remindersEnabled: false, // Fire a notification when the daily goal is reached
  karaokeHighlight: false, // Experimental: highlight text as it's read aloud
};

export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const merged = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    // Older versions stored an Edge voice from the mini player under `voice`.
    if (typeof merged.voice === 'string' && merged.voice.includes('Neural')) {
      merged.edgeTtsVoice = merged.voice;
    }
    // Drop keys from older versions, including the removed Kokoro engine.
    delete merged.ttsEngine;
    delete merged.ttsVoice;
    delete merged.voice;
    delete merged.kokoroVoice;
    delete merged.kokoroAutoDownload;
    merged.engineOrder = normalizeEngineOrder(merged.engineOrder);
    return merged;
  } catch {
    // Ignore malformed local settings and fall back to defaults.
  }
  return { ...DEFAULTS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

const PDF_OFFSET_KEY = 'audire-pdf-offset';

export function getPdfOffset(bookId) {
  try {
    const stored = localStorage.getItem(`${PDF_OFFSET_KEY}-${bookId}`);
    if (stored) return Math.max(0, parseInt(stored, 10) || 0);
  } catch {
    // Ignore missing/inaccessible local storage.
  }
  return 0;
}

export function setPdfOffset(bookId, offset) {
  try {
    localStorage.setItem(`${PDF_OFFSET_KEY}-${bookId}`, String(Math.max(0, offset)));
  } catch {
    // Ignore storage write failures (private mode/quota/etc.).
  }
}

// Web Speech API voices are loaded dynamically in the Dashboard
