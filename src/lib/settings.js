const STORAGE_KEY = 'audire-settings';

const DEFAULTS = {
  ttsEngine: 'web-speech',
  ttsVoice: '',
  kokoroVoice: 'af_heart',
  speed: 1.0,
  fontSize: 16,
  lineHeight: 1.6,
  theme: 'dark',
  librarySort: 'last_read',
  librarySortOrder: 'desc',
};

export function getSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const merged = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    return merged;
  } catch (e) { }
  return { ...DEFAULTS };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) { }
}

const PDF_OFFSET_KEY = 'audire-pdf-offset';

export function getPdfOffset(bookId) {
  try {
    const stored = localStorage.getItem(`${PDF_OFFSET_KEY}-${bookId}`);
    if (stored) return Math.max(0, parseInt(stored, 10) || 0);
  } catch (e) { }
  return 0;
}

export function setPdfOffset(bookId, offset) {
  try {
    localStorage.setItem(`${PDF_OFFSET_KEY}-${bookId}`, String(Math.max(0, offset)));
  } catch (e) { }
}

// Web Speech API voices are loaded dynamically in the Dashboard
