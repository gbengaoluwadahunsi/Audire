import { beforeEach, describe, expect, it, vi } from 'vitest';

const AVA = { name: 'Microsoft Ava Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'ava', localService: false };
const DAVID = { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david', localService: true };

let voices = [DAVID, AVA];
const spoken = []; // { text, voice }
let speakImpl; // (text) => result | Promise<result>
let cancelPending = null;

vi.mock('./voices/webSpeechEngine', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    isWebSpeechSupported: () => true,
    isWebSpeechSpeaking: () => false,
    getWebSpeechVoices: async () => voices,
    onVoicesChanged: () => () => {},
    cancelWebSpeech: () => { cancelPending?.('interrupted'); cancelPending = null; },
    speakWithWebSpeech: async (text, { voice, onStart }) => {
      spoken.push({ text, voice: voice?.voiceURI });
      onStart?.();
      return speakImpl(text);
    },
  };
});

globalThis.window = new EventTarget();
const { TTSManager, wordAt } = await import('./ttsManager');

const CHUNKS = ['First sentence here.', 'Second sentence here.', 'Third sentence here.'];

async function read(manager, chunks = CHUNKS) {
  const started = [];
  manager.startSession();
  await manager.speakContinuous(chunks, (done) => started.push(chunks[done - 1]), 's1');
  return started;
}

beforeEach(() => {
  voices = [DAVID, AVA];
  spoken.length = 0;
  cancelPending = null;
  speakImpl = () => 'ended';
});

describe('TTSManager', () => {
  it('reads every sentence in order with Ava Online (Natural) by default', async () => {
    const manager = new TTSManager();
    expect(await read(manager)).toEqual(CHUNKS);
    expect(spoken.map((s) => s.text)).toEqual(CHUNKS);
    expect(spoken.every((s) => s.voice === 'ava')).toBe(true);
    expect(manager._abortedOnFailure).toBe(false);
  });

  it('ignores an old saved robotic voice when a natural one exists', async () => {
    const manager = new TTSManager();
    manager.applySettings({ webSpeechVoice: 'david' });
    await read(manager, [CHUNKS[0]]);
    expect(spoken[0].voice).toBe('ava');
  });

  it('uses a robotic voice only when the device has nothing better', async () => {
    voices = [DAVID];
    const manager = new TTSManager();
    await read(manager, [CHUNKS[0]]);
    expect(spoken[0].voice).toBe('david');
  });

  it('replays the interrupted sentence after pause, skipping nothing', async () => {
    const manager = new TTSManager();
    let first = true;
    speakImpl = () => {
      if (!first) return 'ended';
      first = false;
      setTimeout(() => manager.pause(), 5);
      setTimeout(() => manager.resume(), 120);
      return new Promise((resolve) => { cancelPending = resolve; });
    };
    const started = await read(manager);
    expect(spoken.map((s) => s.text)).toEqual([CHUNKS[0], ...CHUNKS]);
    expect(started).toEqual(CHUNKS); // each sentence reported once
    expect(manager._abortedOnFailure).toBe(false);
  });

  it('retries a sentence that errors once, then carries on', async () => {
    let failed = false;
    speakImpl = (text) => {
      if (text === CHUNKS[1] && !failed) { failed = true; return 'error'; }
      return 'ended';
    };
    const manager = new TTSManager();
    await read(manager);
    expect(spoken.map((s) => s.text)).toEqual([CHUNKS[0], CHUNKS[1], CHUNKS[1], CHUNKS[2]]);
    expect(manager._abortedOnFailure).toBe(false);
  });

  it('stops on a sentence that keeps failing instead of skipping it', async () => {
    speakImpl = (text) => (text === CHUNKS[1] ? 'error' : 'ended');
    const manager = new TTSManager();
    await read(manager);
    expect(spoken.map((s) => s.text)).not.toContain(CHUNKS[2]);
    expect(manager._abortedOnFailure).toBe(true);
  });

  it('splits a very long sentence into parts that are all spoken', async () => {
    const long = `${'This clause runs on for a while, '.repeat(10)}and then it finally ends.`;
    const manager = new TTSManager();
    await read(manager, [long]);
    expect(spoken.length).toBeGreaterThan(1);
    expect(spoken.every((s) => s.text.length <= 220)).toBe(true);
    expect(spoken.map((s) => s.text).join(' ')).toBe(long);
  });
});

describe('wordAt', () => {
  it('returns the word starting at a character index', () => {
    expect(wordAt('Hello brave world', 6)).toEqual({ offset: 6, text: 'brave' });
    expect(wordAt('Hello', 5)).toBeNull();
  });
});
