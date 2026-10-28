import { DEFAULT_ENGINE_ORDER, ENGINE_EDGE, ENGINE_KOKORO, normalizeEngineOrder } from './voices/engines';

const STORAGE_KEY = 'audire-settings';

const DEFAULTS = {
  engineOrder: DEFAULT_ENGINE_ORDER, // First choice first; the rest are backups in order
  edgeTtsVoice: 'en-US-AvaMultilingualNeural',
  kokoroVoice: 'af_heart',
  webSpeechVoice: '', // voiceURI; empty = the device's default English voice
  kokoroAutoDownload: false, // Let playback start the on-device voice download in the background
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
    // Older versions stored a single engine and, from the mini player, an Edge voice
    // under `voice`. Fold both into the current keys.
    if (merged.ttsEngine && !stored?.includes('"engineOrder"')) {
      const first = merged.ttsEngine === ENGINE_KOKORO ? ENGINE_KOKORO : ENGINE_EDGE;
      merged.engineOrder = [first, ...DEFAULT_ENGINE_ORDER.filter((e) => e !== first)];
    }
    if (typeof merged.voice === 'string' && merged.voice.includes('Neural')) {
      merged.edgeTtsVoice = merged.voice;
    }
    delete merged.ttsEngine;
    delete merged.ttsVoice;
    delete merged.voice;
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
