import { beforeEach, describe, expect, it } from 'vitest';
import { getSettings } from './settings';
import { KOKORO_DEFAULT_VOICE } from './kokoroVoices';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const saveRaw = (obj) => store.set('audire-settings', JSON.stringify(obj));

beforeEach(() => store.clear());

describe('getSettings', () => {
  it('defaults to Kokoro voice af_heart', () => {
    expect(getSettings().kokoroVoice).toBe(KOKORO_DEFAULT_VOICE);
  });

  it('drops legacy engine/voice keys from older versions', () => {
    saveRaw({
      edgeTtsVoice: 'en-US-AvaMultilingualNeural',
      engineOrder: ['edge-tts', 'web-speech'],
      webSpeechVoice: 'Google US English',
      ttsEngine: 'edge-tts',
      kokoroAutoDownload: true,
    });
    const s = getSettings();
    expect(s.edgeTtsVoice).toBeUndefined();
    expect(s.engineOrder).toBeUndefined();
    expect(s.webSpeechVoice).toBeUndefined();
    expect(s.ttsEngine).toBeUndefined();
    expect(s.kokoroAutoDownload).toBeUndefined();
  });

  it('preserves saved kokoroVoice', () => {
    saveRaw({ kokoroVoice: 'am_echo' });
    expect(getSettings().kokoroVoice).toBe('am_echo');
  });

  it('falls back to defaults when storage holds junk', () => {
    store.set('audire-settings', '{not json');
    expect(getSettings().kokoroVoice).toBe(KOKORO_DEFAULT_VOICE);
  });
});
