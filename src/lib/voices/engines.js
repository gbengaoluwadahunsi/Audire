export const ENGINE_KOKORO = 'kokoro';

export const DEFAULT_ENGINE_ORDER = [ENGINE_KOKORO];

export const ENGINE_INFO = {
  [ENGINE_KOKORO]: {
    label: 'Kokoro neural voice',
    short: 'Kokoro',
    description: 'A natural neural voice that runs entirely in your browser. Downloads once (~82 MB), then works offline.',
  },
};

/** Always returns ['kokoro'] — kept for backwards-compat call sites. */
export function normalizeEngineOrder() {
  return [ENGINE_KOKORO];
}
