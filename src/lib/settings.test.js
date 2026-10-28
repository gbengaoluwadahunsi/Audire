import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings } from './settings';
import { DEFAULT_ENGINE_ORDER, normalizeEngineOrder } from './voices/engines';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const saveRaw = (obj) => store.set('audire-settings', JSON.stringify(obj));

beforeEach(() => store.clear());

describe('getSettings', () => {
  it('defaults to Edge → device voices', () => {
    expect(getSettings().engineOrder).toEqual(['edge-tts', 'web-speech']);
  });

  it('keeps the voice chosen in the mini player (old `voice` key)', () => {
    saveRaw({ voice: 'en-GB-SoniaNeural', edgeTtsVoice: 'en-US-AvaMultilingualNeural' });
    const s = getSettings();
    expect(s.edgeTtsVoice).toBe('en-GB-SoniaNeural');
    expect(s.voice).toBeUndefined();
  });

  it('drops the removed Kokoro engine and its settings', () => {
    saveRaw({ ttsEngine: 'kokoro', engineOrder: ['kokoro', 'web-speech', 'edge-tts'], kokoroVoice: 'bf_emma', kokoroAutoDownload: true });
    const s = getSettings();
    expect(s.engineOrder).toEqual(['web-speech', 'edge-tts']);
    expect(s.kokoroVoice).toBeUndefined();
    expect(s.kokoroAutoDownload).toBeUndefined();
    expect(s.ttsEngine).toBeUndefined();
  });

  it('falls back to defaults when storage holds junk', () => {
    store.set('audire-settings', '{not json');
    expect(getSettings().engineOrder).toEqual(DEFAULT_ENGINE_ORDER);
  });
});

describe('normalizeEngineOrder', () => {
  it('drops unknown and duplicate engines and adds missing ones', () => {
    expect(normalizeEngineOrder(['web-speech', 'nope', 'web-speech'])).toEqual(['web-speech', 'edge-tts']);
    expect(normalizeEngineOrder(undefined)).toEqual(DEFAULT_ENGINE_ORDER);
  });
});
