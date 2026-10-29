const STORAGE_KEY = 'audire-settings';

const DEFAULTS = {
  webSpeechVoice: '', // voiceURI; empty = the best natural voice on this device
  speed: 1.0,
  fontSize: 15,
  fontFamily: 'System',
  lineHeight: 1.6,
  margin: 1.0,
  layout: 'single',
  theme: 'dark',
  librarySort: 'last_read',
  librarySortOrder: 'desc',
  pronunciationDict: {},
  skipJunk: true,
  dailyGoalMinutes: 20,
  remindersEnabled: false,
  karaokeHighlight: false,
};

export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const merged = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    // Migrate legacy keys from older versions.
    delete merged.ttsEngine;
    delete merged.ttsVoice;
    delete merged.voice;
    delete merged.edgeTtsVoice;
    delete merged.engineOrder;
    delete merged.kokoroVoice;
    delete merged.kokoroAutoDownload;
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
