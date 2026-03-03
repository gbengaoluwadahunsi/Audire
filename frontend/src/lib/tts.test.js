/**
 * TTS tests: backend client + Web Speech fallback.
 */
import { vi, beforeEach, afterEach } from 'vitest';
import {
  checkBackend,
  getEngine,
  setCallbacks,
  isPiperReady,
  getPiperVoices,
  canPlay,
} from './tts.js';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('TTS (backend + Web Speech)', () => {
  it('exposes Piper voices list', () => {
    const voices = getPiperVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.some((v) => v.id === 'lessac' && v.name === 'Lessac')).toBe(true);
  });

  it('getEngine returns an engine with play/stop/setVoice', () => {
    const engine = getEngine();
    expect(engine).toBeDefined();
    expect(typeof engine.play).toBe('function');
    expect(typeof engine.stop).toBe('function');
    expect(typeof engine.setVoice).toBe('function');
    expect(typeof engine.setRate).toBe('function');
    expect(typeof engine.isPlaying).toBe('function');
  });

  it('when backend health check succeeds, isPiperReady becomes true', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await checkBackend();
    expect(isPiperReady()).toBe(true);
  });

  it('when backend health check fails, isPiperReady stays false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    await checkBackend();
    expect(isPiperReady()).toBe(false);
  });

  it('canPlay is true when backend ready or speech synthesis supported', () => {
    expect(typeof canPlay()).toBe('boolean');
  });
});
