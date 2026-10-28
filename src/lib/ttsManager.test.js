import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Fakes for the browser pieces the manager touches ───────────────────────
const spokenByDevice = [];
let deviceVoices = [{ name: 'Test Voice', lang: 'en-US', voiceURI: 'test' }];

vi.mock('./ttsCache', () => ({
  cacheKey: (text, voice) => `${voice}|${text}`,
  getCachedAudio: async () => null,
  putCachedAudio: async () => {},
}));

vi.mock('./voices/kokoroEngine', () => ({
  KOKORO_VOICES: [{ id: 'af_heart', name: 'Heart (US Female)' }],
  downloadKokoro: vi.fn(async () => {}),
  getKokoroStatus: () => ({ status: 'not-downloaded', reason: '' }),
  isKokoroReady: () => false,
  refreshKokoroStatus: async () => ({ status: 'not-downloaded' }),
  synthesizeKokoro: async () => { throw new Error('not downloaded'); },
}));

vi.mock('./voices/webSpeechEngine', () => ({
  cancelWebSpeech: () => {},
  getWebSpeechVoices: async () => deviceVoices,
  isWebSpeechSpeaking: () => false,
  isWebSpeechSupported: () => true,
  pauseWebSpeech: () => {},
  resolveWebSpeechVoice: (voices) => voices[0] || null,
  resumeWebSpeech: () => {},
  speakWithWebSpeech: async (text, { onStart } = {}) => {
    spokenByDevice.push(text);
    onStart?.();
    return true;
  },
}));

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  async decodeAudioData() { return { duration: 0.001 }; }
  createBufferSource() {
    const source = {
      connect() {},
      stop() {},
      start() { setTimeout(() => source.onended?.(), 0); },
    };
    return source;
  }
  async resume() {}
  async suspend() {}
}

const events = [];
globalThis.window = new EventTarget();
window.AudioContext = FakeAudioContext;
window.addEventListener('audire-tts-status', (e) => events.push(e.detail));

/** Edge backend fake: `failing` is a set of texts (or 'all') that get an error. */
function mockEdge(failing) {
  globalThis.fetch = vi.fn(async (_url, opts) => {
    const { text } = JSON.parse(opts.body);
    if (failing === 'all' || failing.has(text)) throw new Error('network down');
    return new Response(new Blob([new Uint8Array(500)], { type: 'audio/mpeg' }), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  });
}

const { TTSManager, withBudget, wordAt } = await import('./ttsManager');

const CHUNKS = ['First sentence here.', 'Second sentence here.', 'Third sentence here.'];

async function readPage(manager, chunks = CHUNKS) {
  const started = [];
  manager.startSession();
  await manager.speakContinuous(chunks, (done) => started.push(chunks[done - 1]), 's1');
  return started;
}

beforeEach(() => {
  spokenByDevice.length = 0;
  events.length = 0;
  deviceVoices = [{ name: 'Test Voice', lang: 'en-US', voiceURI: 'test' }];
});

describe('engine chain', () => {
  it('reads every sentence with the online voice when it works', async () => {
    mockEdge(new Set());
    const manager = new TTSManager();
    const started = await readPage(manager);
    expect(started).toEqual(CHUNKS);
    expect(spokenByDevice).toEqual([]);
    expect(manager._abortedOnFailure).toBe(false);
  });

  it('carries on with the device voice from the exact sentence that failed', async () => {
    mockEdge(new Set([CHUNKS[1], CHUNKS[2]]));
    const manager = new TTSManager();
    const started = await readPage(manager);

    // Nothing skipped, nothing reordered.
    expect(started).toEqual(CHUNKS);
    expect(spokenByDevice).toEqual([CHUNKS[1], CHUNKS[2]]);
    expect(manager.status).toMatchObject({ engine: 'web-speech', isBackup: true });
    expect(events.filter((e) => e.notice === 'switched')).toHaveLength(1);
  }, 15000);

  it('starts the next page on the first-choice voice again', async () => {
    mockEdge('all');
    const manager = new TTSManager();
    await readPage(manager, [CHUNKS[0]]);
    expect(manager.status.engine).toBe('web-speech');

    mockEdge(new Set());
    events.length = 0;
    await manager.speakContinuous([CHUNKS[1]], () => {}, 's1');
    expect(manager.status).toMatchObject({ engine: 'edge-tts', isBackup: false });
    expect(events.some((e) => e.notice === 'restored')).toBe(true);
  }, 15000);

  it('stops on the failed sentence when no voice can read it', async () => {
    mockEdge('all');
    deviceVoices = []; // device voices unavailable
    const manager = new TTSManager();
    const started = await readPage(manager);
    expect(started).toEqual([]);
    expect(manager._abortedOnFailure).toBe(true);
  }, 20000);

  it('honours a custom engine order', async () => {
    mockEdge(new Set());
    const manager = new TTSManager();
    manager.applySettings({ engineOrder: ['web-speech', 'edge-tts', 'kokoro'] });
    const started = await readPage(manager);
    expect(started).toEqual(CHUNKS);
    expect(spokenByDevice).toEqual(CHUNKS);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('withBudget gives up with null after the time limit', async () => {
    const slow = new Promise((r) => setTimeout(() => r('late'), 200));
    await expect(withBudget(slow, 20)).resolves.toBeNull();
    await expect(withBudget(Promise.resolve('fast'), 200)).resolves.toBe('fast');
  });

  it('wordAt returns the word starting at a character index', () => {
    expect(wordAt('Hello brave world', 6)).toEqual({ offset: 6, text: 'brave' });
    expect(wordAt('Hello', 5)).toBeNull();
  });
});
