// TTS Manager: Kokoro neural voice running entirely in the browser.
import { kokoroSpeak, loadKokoro, isKokoroReady } from './voices/kokoroEngine';
import { KOKORO_DEFAULT_VOICE } from './kokoroVoices';
import { ENGINE_KOKORO, ENGINE_INFO } from './voices/engines';

// How long to wait for a chunk before giving up.
export const CHUNK_BUDGET_MS = 15000;
export const FIRST_CHUNK_BUDGET_MS = 30000;

/** Resolve with the promise's value, or null if it takes longer than `ms`. */
export function withBudget(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** Character offset → word at that position. */
export function wordAt(text, charIndex) {
  const m = text.slice(charIndex).match(/^[^\s]+/);
  return m ? { offset: charIndex, text: m[0] } : null;
}

export function prewarmFirstChunk() {}

export class TTSManager {
  constructor() {
    this.kokoroVoice = KOKORO_DEFAULT_VOICE;
    this.speed = 1.0;
    this.volume = 1.0;
    this.isPaused = false;
    this._stopped = false;
    this._audioCtx = null;
    this._gainNode = null;
    this._currentSource = null;
    this._audioCache = new Map();
    this._abortedOnFailure = false;
    this._hasPlayedThisSession = false;
    this.isLoaded = false;
    this.isLoading = false;
    this.wantWordTimings = false;
    this.onWordBoundary = null;
    this.currentSessionId = null;
    this.status = {
      engine: ENGINE_KOKORO,
      engineLabel: ENGINE_INFO[ENGINE_KOKORO].short,
      voice: KOKORO_DEFAULT_VOICE,
      isBackup: false,
      reason: '',
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('audire-kokoro-ready', () => {
        this.isLoaded = true;
        this.isLoading = false;
        this._dispatch('audire-tts-status', { ...this.status });
      });
      window.addEventListener('audire-kokoro-error', () => {
        this.isLoading = false;
      });
      this.isLoading = true;
      loadKokoro().then(() => {
        this.isLoaded = true;
        this.isLoading = false;
      }).catch(() => {
        this.isLoading = false;
      });
    }
  }

  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      const Cls = window.AudioContext || window.webkitAudioContext;
      this._audioCtx = new Cls();
      this._gainNode = this._audioCtx.createGain();
      this._gainNode.gain.value = this.volume ?? 1;
      this._gainNode.connect(this._audioCtx.destination);
    }
    return this._audioCtx;
  }

  _dispatch(name, detail) {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
      }
    } catch {}
  }

  _cacheKey(text) {
    return `${text}|${this.kokoroVoice}|${this.speed}`;
  }

  voiceLabel() {
    return this.kokoroVoice;
  }

  isEngineAvailable() {
    return isKokoroReady();
  }

  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      this.resume();
      this._dispatch('audire-tts-resume');
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
      this._dispatch('audire-tts-pause');
    });
  }

  setMediaMetadata({ title, author, cover }) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Audire',
      artist: author || 'Unknown',
      album: 'Audire Library',
      artwork: cover ? [{ src: cover, sizes: '512x512', type: 'image/png' }] : [],
    });
    this._setupMediaSession();
  }

  clearMediaMetadata() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
  }

  pause() {
    this.isPaused = true;
    this._audioCtx?.suspend().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  resume() {
    this.isPaused = false;
    this._audioCtx?.resume().catch(() => {});
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  unlockAudioContext() {
    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  async _waitIfPaused(sessionId) {
    while (
      this.isPaused &&
      !this._stopped &&
      (sessionId === undefined || sessionId === this.currentSessionId)
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async init() {
    this.isLoaded = isKokoroReady();
    return Promise.resolve();
  }

  // ─── Prefetch ─────────────────────────────────────────────────────────────

  _prefetch(textChunks, index) {
    if (index >= textChunks.length) return null;
    const text = (textChunks[index] || '').trim();
    if (!text || !/[a-zA-ZÀ-ÿ0-9]/.test(text)) return null;
    const key = this._cacheKey(text);
    if (this._audioCache.has(key)) return this._audioCache.get(key);
    const promise = kokoroSpeak(text, this.kokoroVoice, this.speed).catch((err) => {
      console.error('[TTS] Kokoro synthesis failed:', err?.message || err);
      this._lastError = err?.message || String(err);
      this._audioCache.delete(key);
      return null;
    });
    this._audioCache.set(key, promise);
    return promise;
  }

  // ─── Single utterance (voice preview) ────────────────────────────────────

  async speak(text) {
    this.stop();
    this._stopped = false;
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    const result = await kokoroSpeak(clean, this.kokoroVoice, this.speed);
    if (!result || this._stopped) return;

    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    const buf = ctx.createBuffer(1, result.audio.length, result.samplingRate);
    buf.copyToChannel(result.audio, 0);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this._gainNode);
    this._currentSource = source;

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    return new Promise((resolve) => {
      source.onended = () => { this._currentSource = null; resolve(); };
      source.start(0);
    });
  }

  async prepareFirstChunk(textChunks, count = 3) {
    if (!textChunks || textChunks.length === 0) return;
    for (let i = 0; i < Math.min(textChunks.length, count); i++) {
      this._prefetch(textChunks, i);
    }
  }

  async _playChunk(ctx, result, chunkIndex, total, onChunkComplete, timing) {
    const buf = ctx.createBuffer(1, result.audio.length, result.samplingRate);
    buf.copyToChannel(result.audio, 0);

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this._gainNode);
    this._currentSource = source;

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    const now = ctx.currentTime;
    const startAt =
      timing.nextStartTime === null || timing.nextStartTime < now + 0.05
        ? now + 0.05
        : timing.nextStartTime;
    source.start(startAt);
    // Speed is applied during synthesis, so the buffer duration is already correct.
    timing.nextStartTime = startAt + buf.duration;
    this._hasPlayedThisSession = true;

    onChunkComplete?.(chunkIndex + 1, total);

    await new Promise((r) => { source.onended = r; });
    this._currentSource = null;
    return true;
  }

  // ─── Continuous playback ─────────────────────────────────────────────────

  async speakContinuous(textChunks, onChunkComplete, sessionId, metadata = {}) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._abortedOnFailure = false;

    if (metadata.title || metadata.author || metadata.cover) {
      this.setMediaMetadata(metadata);
    }

    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    const total = textChunks.length;
    const timing = { nextStartTime: null };
    let currentIndex = 0;

    const alive = () =>
      !this._stopped && !(sessionId && this.currentSessionId !== sessionId);

    for (let i = 0; i < Math.min(3, total); i++) this._prefetch(textChunks, i);

    const runLoop = async () => {
      if (currentIndex >= total || this._stopped) {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        this.clearMediaMetadata();
        return;
      }

      for (let i = currentIndex + 1; i < Math.min(currentIndex + 4, total); i++) {
        this._prefetch(textChunks, i);
      }

      await this._waitIfPaused(sessionId);
      if (!alive()) return;

      const chunk = (textChunks[currentIndex] || '').trim();
      if (!chunk) { currentIndex++; return runLoop(); }

      const promise = this._prefetch(textChunks, currentIndex);
      const budget = this._hasPlayedThisSession ? CHUNK_BUDGET_MS : FIRST_CHUNK_BUDGET_MS;
      const result = promise ? await withBudget(promise, budget) : null;

      if (!alive()) return;

      if (!result) {
        console.error(
          `[TTS] Kokoro could not generate chunk ${currentIndex}:`,
          this._lastError || 'timed out',
        );
        this._abortedOnFailure = true;
        return;
      }

      this._audioCache.delete(this._cacheKey(chunk));
      await this._playChunk(ctx, result, currentIndex, total, onChunkComplete, timing);
      if (!alive()) return;

      currentIndex++;
      return runLoop();
    };

    return runLoop();
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
    this._abortedOnFailure = false;
    this._hasPlayedThisSession = false;
    this._audioCache.clear();
  }

  stop() {
    this._stopped = true;
    this.isPaused = false;
    try { this._currentSource?.stop(0); } catch {}
    this._currentSource = null;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    this.clearMediaMetadata();
    this._audioCache.clear();
  }

  /** No-op: Kokoro is local, nothing to pre-download. */
  async downloadChunks() { return 0; }

  applySettings(s = {}) {
    if (s.kokoroVoice) this.kokoroVoice = s.kokoroVoice;
    if (typeof s.speed === 'number') this.speed = s.speed;
    if (s.karaokeHighlight !== undefined) this.wantWordTimings = !!s.karaokeHighlight;
  }

  setKokoroVoice(voice) {
    this.kokoroVoice = voice || KOKORO_DEFAULT_VOICE;
  }

  setSpeed(speed) { this.speed = speed; }
  setPitch() {}
  setVolume(vol) {
    this.volume = vol ?? 1;
    if (this._gainNode) this._gainNode.gain.value = this.volume;
  }

  get hasActivePlayback() {
    return !!this._currentSource;
  }
}

export const ttsManager = new TTSManager();
