import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./voices/kokoroEngine', () => ({
  isKokoroReady: () => true,
  isKokoroLoading: () => false,
  getKokoroError: () => null,
  loadKokoro: async () => {},
  kokoroSpeak: vi.fn(async () => ({
    audio: new Float32Array(500).fill(0.1),
    samplingRate: 22050,
  })),
}));

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBuffer(_ch, length, rate) {
    return { length, sampleRate: rate, duration: length / rate, copyToChannel() {} };
  }
  createBufferSource() {
    const src = {
      buffer: null,
      connect() {},
      stop() {},
      playbackRate: { value: 1 },
      start() { setTimeout(() => src.onended?.(), 0); },
    };
    return src;
  }
  async resume() {}
  async suspend() {}
}

globalThis.window = new EventTarget();
window.AudioContext = FakeAudioContext;

const { TTSManager, withBudget, wordAt } = await import('./ttsManager');
const { kokoroSpeak } = await import('./voices/kokoroEngine');

const CHUNKS = ['First sentence.', 'Second sentence.', 'Third sentence.'];

beforeEach(() => {
  vi.mocked(kokoroSpeak).mockResolvedValue({
    audio: new Float32Array(500).fill(0.1),
    samplingRate: 22050,
  });
});

describe('TTSManager', () => {
  it('reads every sentence when Kokoro works', async () => {
    const manager = new TTSManager();
    const started = [];
    manager.startSession();
    await manager.speakContinuous(CHUNKS, (done) => started.push(CHUNKS[done - 1]), 's1');
    expect(started).toEqual(CHUNKS);
    expect(manager._abortedOnFailure).toBe(false);
  });

  it('aborts on the failed sentence when Kokoro throws', async () => {
    vi.mocked(kokoroSpeak).mockRejectedValue(new Error('Model failed'));
    const manager = new TTSManager();
    const started = [];
    manager.startSession();
    await manager.speakContinuous(CHUNKS, (done) => started.push(CHUNKS[done - 1]), 's1');
    expect(started).toEqual([]);
    expect(manager._abortedOnFailure).toBe(true);
  }, 20000);

  it('honours kokoroVoice from applySettings', async () => {
    const manager = new TTSManager();
    manager.applySettings({ kokoroVoice: 'am_echo' });
    expect(manager.kokoroVoice).toBe('am_echo');
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
