import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings } from './settings';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const saveRaw = (obj) => store.set('audire-settings', JSON.stringify(obj));

beforeEach(() => store.clear());

describe('getSettings', () => {
  it('defaults to letting the app pick the best device voice', () => {
    expect(getSettings().webSpeechVoice).toBe('');
  });

  it('drops keys from the removed Edge and Kokoro voices', () => {
    saveRaw({
      edgeTtsVoice: 'en-US-AvaMultilingualNeural',
      engineOrder: ['edge-tts', 'web-speech'],
      ttsEngine: 'edge-tts',
      kokoroVoice: 'af_heart',
      kokoroAutoDownload: true,
    });
    const s = getSettings();
    for (const key of ['edgeTtsVoice', 'engineOrder', 'ttsEngine', 'kokoroVoice', 'kokoroAutoDownload']) {
      expect(s[key]).toBeUndefined();
    }
  });

  it('keeps the chosen device voice', () => {
    saveRaw({ webSpeechVoice: 'Microsoft Ava Online (Natural) - English (United States)' });
    expect(getSettings().webSpeechVoice).toBe('Microsoft Ava Online (Natural) - English (United States)');
  });

  it('falls back to defaults when storage holds junk', () => {
    store.set('audire-settings', '{not json');
    expect(getSettings().webSpeechVoice).toBe('');
  });
});
