/** Voice engines Audire can read with, in the default fallback order. */
export const ENGINE_EDGE = 'edge-tts';
export const ENGINE_KOKORO = 'kokoro';
export const ENGINE_WEB_SPEECH = 'web-speech';

export const DEFAULT_ENGINE_ORDER = [ENGINE_EDGE, ENGINE_KOKORO, ENGINE_WEB_SPEECH];

export const ENGINE_INFO = {
  [ENGINE_EDGE]: {
    label: 'Online neural voices',
    short: 'Edge',
    description: 'The most natural voices. Needs an internet connection.',
  },
  [ENGINE_KOKORO]: {
    label: 'On-device natural voices',
    short: 'Kokoro',
    description: 'Natural open-source voices that run on this device and work offline after a one-time download.',
  },
  [ENGINE_WEB_SPEECH]: {
    label: 'Built-in device voices',
    short: 'Device',
    description: 'The voices that come with your browser or operating system. Always free, quality varies.',
  },
};

/** Keep only known engines, without duplicates, and make sure every engine appears once. */
export function normalizeEngineOrder(order) {
  const known = new Set(DEFAULT_ENGINE_ORDER);
  const out = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (known.has(id) && !out.includes(id)) out.push(id);
  }
  for (const id of DEFAULT_ENGINE_ORDER) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
