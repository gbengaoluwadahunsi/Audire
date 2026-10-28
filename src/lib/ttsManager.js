// TTS Manager: an ordered chain of voice engines (Edge → Kokoro → device voices by default).
// Every sentence is tried on the page's current engine; if that engine fails or is too slow,
// the same sentence moves to the next engine so nothing is skipped.
import { cacheKey, getCachedAudio, putCachedAudio } from './ttsCache';
import {
  DEFAULT_ENGINE_ORDER,
  ENGINE_EDGE,
  ENGINE_INFO,
  ENGINE_KOKORO,
  ENGINE_WEB_SPEECH,
  normalizeEngineOrder,
} from './voices/engines';
import {
  downloadKokoro,
  getKokoroStatus,
  isKokoroReady,
  KOKORO_VOICES,
  refreshKokoroStatus,
  synthesizeKokoro,
} from './voices/kokoroEngine';
import {
  cancelWebSpeech,
  getWebSpeechVoices,
  isWebSpeechSpeaking,
  isWebSpeechSupported,
  pauseWebSpeech,
  resolveWebSpeechVoice,
  resumeWebSpeech,
  speakWithWebSpeech,
} from './voices/webSpeechEngine';
import { EDGE_TTS_VOICES } from './edgeTtsVoices';

// A sentence that has no audio this long after it is needed counts as failed (spec FR-004).
export const CHUNK_BUDGET_MS = 8000;
// The very first sentence of a session gets longer: a sleeping Render server needs ~10-15s.
export const FIRST_CHUNK_BUDGET_MS = 20000;
// After this long on the first sentence, tell the reader the server is waking up.
const WAKING_NOTICE_MS = 4000;

// ─── Server Edge TTS ───────────────────────────────────────────────────────
// Fetches audio from /api/tts (Edge TTS backend). Fast, no browser model needed.
const _BASE = import.meta.env.VITE_API_URL || '';
function _apiUrl(path) { return `${_BASE.replace(/\/$/, '')}${path}`; }
let _edgeBackendUnavailableUntil = 0;

function _isAbortError(err) {
  return err?.name === 'AbortError' || /aborted|abort/i.test(String(err?.message || ''));
}

/** Milliseconds left on the backend cooldown, or 0 when it is clear. */
function _cooldownRemaining() {
  return Math.max(0, _edgeBackendUnavailableUntil - Date.now());
}

function _base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function _getCachedWords(key) {
  const blob = await getCachedAudio(`${key}_w`);
  if (!blob) return null;
  try { return JSON.parse(await blob.text()); } catch { return null; }
}

/**
 * Fetch MP3 audio for a text chunk from the Edge TTS backend.
 * Returns { blob, words } or null on failure. `words` (per-word timings) is only
 * requested when `withWords` is set, i.e. when word highlighting is on.
 */
async function _fetchEdgeTTS(text, voice = 'en-US-AvaMultilingualNeural', rate = 1.0, pitch = 0, { retries = 2, withWords = false } = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  // Serve from the offline cache first (instant + works with no network).
  const key = cacheKey(trimmed, voice, rate, pitch);
  const cached = await getCachedAudio(key);
  if (cached) return { blob: cached, words: withWords ? await _getCachedWords(key) : null };

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (Date.now() < _edgeBackendUnavailableUntil) return null;
    let timer;
    try {
      const controller = new AbortController();
      // A cold Render instance can take well over 10s for its first synthesis; timing
      // out that early turned a slow start into a run of "failed" chunks.
      timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(_apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, voice, rate, pitch, words: withWords }),
        signal: controller.signal,
      });

      if (res.ok) {
        let blob;
        let words = null;
        // Servers that know about word timings answer JSON; older ones send plain MP3.
        if ((res.headers.get('content-type') || '').includes('application/json')) {
          const data = await res.json();
          blob = data?.audio ? _base64ToBlob(data.audio, 'audio/mpeg') : null;
          words = Array.isArray(data?.words) ? data.words : null;
        } else {
          blob = await res.blob();
        }
        if (blob && blob.size > 100) {
          putCachedAudio(key, blob);
          if (words?.length) putCachedAudio(`${key}_w`, new Blob([JSON.stringify(words)], { type: 'application/json' }));
          return { blob, words };
        }
      }

      if (res.status >= 500) {
        _edgeBackendUnavailableUntil = Date.now() + 5000; // brief cooldown
      }
    } catch (err) {
      if (_isAbortError(err)) {
        console.warn(`[TTS] Timeout on attempt ${attempt + 1}, ${attempt < retries ? 'retrying...' : 'giving up'}`);
      } else {
        console.warn('[TTS] Fetch error:', err?.message);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }

    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

/** On-device Kokoro synthesis, sharing the offline audio cache with Edge. */
async function _fetchKokoro(text, voice, rate) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const key = cacheKey(trimmed, `kokoro:${voice}`, rate, 0);
  const cached = await getCachedAudio(key);
  if (cached) return { blob: cached, words: null };
  try {
    const blob = await synthesizeKokoro(trimmed, voice, rate);
    if (blob && blob.size > 100) {
      putCachedAudio(key, blob);
      return { blob, words: null };
    }
  } catch (err) {
    console.warn('[TTS] Kokoro synthesis failed:', err?.message);
  }
  return null;
}

/** Resolve with the promise's value, or null if it takes longer than `ms`. */
export function withBudget(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** Character offset → word, for engines that report boundaries as char indexes. */
export function wordAt(text, charIndex) {
  const m = text.slice(charIndex).match(/^[^\s]+/);
  return m ? { offset: charIndex, text: m[0] } : null;
}

export function prewarmFirstChunk() { }

export class TTSManager {
  constructor() {
    this.engine = ENGINE_EDGE; // engine of the sentence currently playing
    this.engineOrder = [...DEFAULT_ENGINE_ORDER];
    this.speed = 1.0;
    this.pitch = 0;
    this.volume = 1.0;
    this.edgeTtsVoice = 'en-US-AvaMultilingualNeural';
    this.kokoroVoice = 'af_heart';
    this.webSpeechVoice = '';
    this.kokoroAutoDownload = false;
    this.wantWordTimings = false;
    /** Called with (chunkIndex, { offset, text }) as each word starts, when timings exist. */
    this.onWordBoundary = null;
    this.isLoaded = true;
    this.isLoading = false;
    this._currentAudio = null;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
    this._abortedOnFailure = false;
    this._audioCtx = null;
    this._gainNode = null;
    this._currentSource = null;
    this._webSpeechActive = false;
    this._blobCache = new Map();
    this._pageEngineIdx = 0;
    this._hasPlayedThisSession = false;
    this._webVoices = [];
    this._wordRaf = null;
    this.status = { engine: ENGINE_EDGE, engineLabel: ENGINE_INFO[ENGINE_EDGE].short, voice: '', isBackup: false, reason: '' };

    if (typeof window !== 'undefined') {
      getWebSpeechVoices().then((v) => { this._webVoices = v; }).catch(() => {});
      refreshKokoroStatus().catch(() => {});
    }
  }

  /** Lazily create (or reuse) the AudioContext + GainNode for blob playback. */
  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this._audioCtx = new AudioCtxClass();
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
    } catch {
      /* ignore */
    }
  }

  // ─── Engines ─────────────────────────────────────────────────────────────

  voiceLabel(engine) {
    if (engine === ENGINE_EDGE) {
      return EDGE_TTS_VOICES.find((v) => v.id === this.edgeTtsVoice)?.name.split(' (')[0] || this.edgeTtsVoice;
    }
    if (engine === ENGINE_KOKORO) {
      return KOKORO_VOICES.find((v) => v.id === this.kokoroVoice)?.name.split(' (')[0] || this.kokoroVoice;
    }
    return this._resolveWebVoice()?.name || 'Default voice';
  }

  _resolveWebVoice() {
    return resolveWebSpeechVoice(this._webVoices, this.webSpeechVoice);
  }

  isEngineAvailable(engine) {
    if (engine === ENGINE_EDGE) return true;
    if (engine === ENGINE_KOKORO) return isKokoroReady();
    if (engine === ENGINE_WEB_SPEECH) return isWebSpeechSupported() && this._webVoices.length > 0;
    return false;
  }

  _firstAvailableIdx(from = 0) {
    for (let i = from; i < this.engineOrder.length; i++) {
      if (this.isEngineAvailable(this.engineOrder[i])) return i;
    }
    return -1;
  }

  /**
   * Update what the player shows. `notice` is a one-off message for the Reader to toast:
   * 'switched' (moved to a backup), 'restored' (back on first choice), 'waking' (slow server).
   */
  _setStatus(engine, { reason = '', notice = '' } = {}) {
    const preferred = this.engineOrder[this._firstAvailableIdx(0)] ?? this.engineOrder[0];
    const changed = this.status.engine !== engine;
    this.status = {
      engine,
      engineLabel: ENGINE_INFO[engine]?.short || engine,
      voice: this.voiceLabel(engine),
      isBackup: engine !== preferred,
      reason,
    };
    this.engine = engine;
    if (changed || notice) this._dispatch('audire-tts-status', { ...this.status, notice });
  }

  /** Ask for the first-choice engine again from the next sentence ("retry preferred voice"). */
  retryPreferred() {
    _edgeBackendUnavailableUntil = 0;
    const idx = this._firstAvailableIdx(0);
    if (idx >= 0) this._pageEngineIdx = idx;
  }

  _maybeStartKokoroDownload() {
    if (!this.kokoroAutoDownload || !this.engineOrder.includes(ENGINE_KOKORO)) return;
    if (getKokoroStatus().status !== 'not-downloaded') return;
    downloadKokoro(this.kokoroVoice).catch(() => {});
  }

  // ─── Media session ───────────────────────────────────────────────────────

  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    // Only own play/pause here. next/prev/seek are owned by PlaybackContext so
    // lock-screen chapter skipping keeps working — don't overwrite them.
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
    this._audioCtx?.suspend().catch(() => { });
    if (this._webSpeechActive) pauseWebSpeech();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  resume() {
    this.isPaused = false;
    this._audioCtx?.resume().catch(() => { });
    if (this._webSpeechActive) resumeWebSpeech();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  unlockAudioContext() {
    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }
  }

  async _waitIfPaused(sessionId) {
    while (this.isPaused && !this._stopped && (sessionId === undefined || sessionId === this.currentSessionId)) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async init() {
    this.isLoaded = true;
    return Promise.resolve();
  }

  // ─── Single utterance (voice preview) ────────────────────────────────────

  /** Speak one short text with a specific engine (defaults to the first choice). */
  async speak(text, engine = this.engineOrder[0]) {
    this.stop();
    this._stopped = false;
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    if (engine === ENGINE_WEB_SPEECH) {
      if (!this._webVoices.length) this._webVoices = await getWebSpeechVoices();
      this._webSpeechActive = true;
      const ok = await speakWithWebSpeech(clean, {
        voice: this._resolveWebVoice(), rate: this.speed, pitch: this.pitch, volume: this.volume,
      });
      this._webSpeechActive = false;
      if (!ok && !this._stopped) throw new Error('This device voice could not speak');
      return null;
    }
    const result = engine === ENGINE_KOKORO
      ? await _fetchKokoro(clean, this.kokoroVoice, this.speed)
      : await _fetchEdgeTTS(clean, this.edgeTtsVoice, this.speed, this.pitch);
    if (!result?.blob || result.blob.size < 100) {
      throw new Error(`${ENGINE_INFO[engine]?.label || 'Voice'} is not available right now`);
    }
    if (this._stopped) return null;
    const url = URL.createObjectURL(result.blob);
    const audio = new Audio(url);
    audio.volume = this.volume ?? 1;

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    return new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      this._currentAudio = audio;
      audio.play().catch(() => resolve());
    });
  }

  // ─── Continuous playback ─────────────────────────────────────────────────

  /** Pre-warm the first few chunks of a page for instant playback */
  async prepareFirstChunk(textChunks, count = 3) {
    if (!textChunks || textChunks.length === 0) return;
    const engine = this.engineOrder[Math.max(0, this._firstAvailableIdx(0))];
    for (let i = 0; i < Math.min(textChunks.length, count); i++) {
      this._getBlobForChunk(textChunks, i, undefined, engine);
    }
  }

  _isBlobEngine(engine) {
    return engine === ENGINE_EDGE || engine === ENGINE_KOKORO;
  }

  _getBlobForChunk(textChunks, index, sessionId, engine = ENGINE_EDGE) {
    if (index >= textChunks.length || !this._isBlobEngine(engine)) return null;
    const chunk = (textChunks[index] || '').trim();
    // Must agree with the ghost test in runLoop. When this was stricter, chunks like
    // "42" or a lone letter passed there but were rejected here, and the resulting
    // null counted as a synthesis failure even though the backend handles them fine.
    if (!chunk || !/[a-zA-ZÀ-ÿ0-9]/.test(chunk)) return null;

    const voice = engine === ENGINE_KOKORO ? this.kokoroVoice : this.edgeTtsVoice;
    const key = `${engine}|${chunk}|${voice}|${this.speed}|${this.pitch}|${this.wantWordTimings}`;
    const slot = `${index}|${engine}`;
    const cached = this._blobCache.get(slot);
    if (cached?.key === key) return cached.promise;

    let entry;
    const promise = (async () => {
      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;
      return engine === ENGINE_KOKORO
        ? _fetchKokoro(chunk, this.kokoroVoice, this.speed)
        : _fetchEdgeTTS(chunk, this.edgeTtsVoice, this.speed, this.pitch, { withWords: this.wantWordTimings });
    })().then((result) => {
      // Never memoise a failure. Prefetch runs three chunks ahead, so a momentary
      // backend hiccup used to poison all three and they would stay silent for the
      // rest of the session even after it recovered.
      if (!result?.blob || result.blob.size < 100) {
        if (this._blobCache.get(slot) === entry) this._blobCache.delete(slot);
        return null;
      }
      return result;
    });
    entry = { key, promise };
    this._blobCache.set(slot, entry);
    return promise;
  }

  _dropChunk(index) {
    for (const slot of [...this._blobCache.keys()]) {
      if (slot.startsWith(`${index}|`)) this._blobCache.delete(slot);
    }
  }

  /**
   * Re-attempt an Edge chunk after its cooldown. Only used once every other engine has
   * failed too, so a brief backend blip doesn't end playback outright.
   */
  async _retryEdgeChunk(textChunks, index, sessionId, attempts = 2) {
    for (let i = 0; i < attempts; i++) {
      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;
      const wait = _cooldownRemaining();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait + 100));
      await this._waitIfPaused(sessionId);
      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;

      this._dropChunk(index);
      const promise = this._getBlobForChunk(textChunks, index, sessionId, ENGINE_EDGE);
      const result = promise ? await promise : null;
      if (result?.blob?.size >= 100) return result;
    }
    return null;
  }

  /** Drive word callbacks from the audio clock, so pausing freezes them naturally. */
  _trackWords(ctx, startAt, words, chunkIndex) {
    if (this._wordRaf) cancelAnimationFrame(this._wordRaf);
    this._wordRaf = null;
    if (!words?.length || !this.onWordBoundary) return;
    let last = -1;
    const tick = () => {
      if (this._stopped) return;
      const ms = (ctx.currentTime - startAt) * 1000;
      let i = last;
      while (i + 1 < words.length && words[i + 1].start <= ms) i++;
      if (i !== last && i >= 0) {
        last = i;
        this.onWordBoundary?.(chunkIndex, { offset: words[i].offset, text: words[i].text });
      }
      if (last < words.length - 1) this._wordRaf = requestAnimationFrame(tick);
    };
    this._wordRaf = requestAnimationFrame(tick);
  }

  async _playBlob(ctx, result, chunkIndex, total, onChunkComplete, sessionId, timing) {
    let audioBuffer;
    try {
      const ab = await result.blob.arrayBuffer();
      audioBuffer = await ctx.decodeAudioData(ab);
    } catch (err) {
      console.error('[TTS] Audio decode failed for chunk', chunkIndex, err);
      return false;
    }
    if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return true;

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this._gainNode);
    this._currentSource = source;

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

    const now = ctx.currentTime;
    const startAt = (timing.nextStartTime === null || timing.nextStartTime < now + 0.05)
      ? now + 0.05
      : timing.nextStartTime;
    source.start(startAt);
    timing.nextStartTime = startAt + audioBuffer.duration;
    this._hasPlayedThisSession = true;

    onChunkComplete?.(chunkIndex + 1, total);
    this._trackWords(ctx, startAt, result.words, chunkIndex);

    await new Promise(r => { source.onended = r; });
    return true;
  }

  async _playWebSpeech(chunk, chunkIndex, total, onChunkComplete) {
    if (!this._webVoices.length) this._webVoices = await getWebSpeechVoices();
    this._webSpeechActive = true;
    const ok = await speakWithWebSpeech(chunk, {
      voice: this._resolveWebVoice(),
      rate: this.speed,
      pitch: this.pitch,
      volume: this.volume,
      onStart: () => {
        this._hasPlayedThisSession = true;
        onChunkComplete?.(chunkIndex + 1, total);
      },
      onWord: (charIndex) => {
        const w = wordAt(chunk, charIndex);
        if (w) this.onWordBoundary?.(chunkIndex, w);
      },
    });
    this._webSpeechActive = false;
    return ok;
  }

  async speakContinuous(textChunks, onChunkComplete, sessionId, metadata = {}) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
    this._abortedOnFailure = false;

    if (metadata.title || metadata.author || metadata.cover) {
      this.setMediaMetadata(metadata);
    }

    if (!this._webVoices.length) this._webVoices = await getWebSpeechVoices().catch(() => []);
    if (getKokoroStatus().status === 'unknown') await refreshKokoroStatus().catch(() => {});

    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => { });

    // Each page starts again from the first-choice engine, so a recovered service is
    // picked back up at a page boundary rather than mid-sentence (spec FR-008).
    const wasBackup = this.status.isBackup;
    this._pageEngineIdx = Math.max(0, this._firstAvailableIdx(0));
    const pageEngine = this.engineOrder[this._pageEngineIdx];
    this._setStatus(pageEngine, { notice: wasBackup && this._hasPlayedThisSession ? 'restored' : '' });

    let currentIndex = 0;
    const timing = { nextStartTime: null };
    const total = textChunks.length;

    const prefetch = (from, count) => {
      const engine = this.engineOrder[this._pageEngineIdx];
      for (let i = from; i < Math.min(total, from + count); i++) {
        this._getBlobForChunk(textChunks, i, sessionId, engine);
      }
    };
    prefetch(0, 3);

    const alive = () => !this._stopped && !(sessionId && this.currentSessionId !== sessionId);

    const runLoop = async () => {
      if (currentIndex >= total || this._stopped) {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        this.clearMediaMetadata();
        return;
      }

      prefetch(currentIndex + 1, 3);

      await this._waitIfPaused(sessionId);
      if (!alive()) return;

      const chunk = textChunks[currentIndex]?.trim();
      // Skip only if chunk is completely empty or whitespace.
      if (!chunk) {
        currentIndex++;
        return runLoop();
      }

      let played = false;
      let triedEdge = false;
      for (let idx = this._pageEngineIdx; idx < this.engineOrder.length && !played; idx++) {
        const engine = this.engineOrder[idx];
        if (!this.isEngineAvailable(engine)) continue;
        if (!alive()) return;

        if (this.engine !== engine) {
          const from = this.engine;
          // Moving up the order only happens after "retry preferred voice".
          const goingBack = this.engineOrder.indexOf(from) > idx;
          this._pageEngineIdx = idx;
          this._setStatus(engine, goingBack
            ? { notice: 'restored' }
            : { reason: `${ENGINE_INFO[from]?.label || 'The voice'} did not respond`, notice: 'switched' });
          if (from === ENGINE_EDGE && !goingBack) this._maybeStartKokoroDownload();
        }

        if (engine === ENGINE_WEB_SPEECH) {
          played = await this._playWebSpeech(chunk, currentIndex, total, onChunkComplete);
          if (!alive()) return;
          continue;
        }

        triedEdge = triedEdge || engine === ENGINE_EDGE;
        const firstOfSession = !this._hasPlayedThisSession;
        const promise = this._getBlobForChunk(textChunks, currentIndex, sessionId, engine);
        let wakingTimer;
        if (firstOfSession && engine === ENGINE_EDGE) {
          wakingTimer = setTimeout(() => this._setStatus(engine, { notice: 'waking' }), WAKING_NOTICE_MS);
        }
        const result = promise
          ? await withBudget(promise, firstOfSession ? FIRST_CHUNK_BUDGET_MS : CHUNK_BUDGET_MS)
          : null;
        clearTimeout(wakingTimer);
        if (!alive()) return;

        if (result?.blob?.size >= 100) {
          played = await this._playBlob(ctx, result, currentIndex, total, onChunkComplete, sessionId, timing);
          if (!alive()) return;
        }
      }

      // Every engine failed. Give Edge one more go after its cooldown before giving up,
      // so a brief blip doesn't end the session when there is no backup on this device.
      if (!played && triedEdge) {
        const result = await this._retryEdgeChunk(textChunks, currentIndex, sessionId);
        if (!alive()) return;
        if (result) {
          this._pageEngineIdx = this.engineOrder.indexOf(ENGINE_EDGE);
          this._setStatus(ENGINE_EDGE);
          played = await this._playBlob(ctx, result, currentIndex, total, onChunkComplete, sessionId, timing);
          if (!alive()) return;
        }
      }

      if (!played) {
        console.error('[TTS] No voice engine could read chunk', currentIndex);
        this._abortedOnFailure = true;
        return;
      }

      this._failureCount = 0;
      this._dropChunk(currentIndex);
      currentIndex++;
      return runLoop();
    };

    return runLoop();
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
    this._abortedOnFailure = false;
    this._hasPlayedThisSession = false;
    this._cleanupCache();
  }

  _cleanupCache() {
    this._blobCache.clear();
  }

  stop() {
    this._stopped = true;
    this.isPaused = false;
    try { this._currentSource?.stop(0); } catch { /* ignore */ }
    this._currentSource = null;
    if (this._wordRaf) cancelAnimationFrame(this._wordRaf);
    this._wordRaf = null;
    if (this._webSpeechActive || isWebSpeechSpeaking()) cancelWebSpeech();
    this._webSpeechActive = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    this.clearMediaMetadata();
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio.src = '';
      this._currentAudio = null;
    }
    this._cleanupCache();
  }

  /**
   * Pre-generate (and cache) audio for a list of chunks so they can be played
   * later without a network connection. Reports progress via onProgress(done, total).
   * Returns the number of chunks successfully cached.
   */
  async downloadChunks(textChunks, onProgress, shouldCancel) {
    if (!Array.isArray(textChunks) || textChunks.length === 0) return 0;
    const speakable = textChunks
      .map((c) => (c || '').trim())
      // Same speakable test as playback, so offline caching cannot miss a chunk that
      // playback will later ask for.
      .filter((c) => /[a-zA-ZÀ-ÿ0-9]/.test(c));
    const total = speakable.length;
    let done = 0;
    let ok = 0;
    const CONCURRENCY = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < speakable.length) {
        if (shouldCancel?.()) return;
        const idx = cursor++;
        try {
          const result = await _fetchEdgeTTS(speakable[idx], this.edgeTtsVoice, this.speed, this.pitch);
          if (result) ok += 1;
        } catch {
          /* skip failed chunk */
        }
        done += 1;
        onProgress?.(done, total);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    return ok;
  }

  /** Apply the voice-related settings in one go. */
  applySettings(s = {}) {
    if (s.engineOrder) this.engineOrder = normalizeEngineOrder(s.engineOrder);
    if (s.edgeTtsVoice) this.edgeTtsVoice = s.edgeTtsVoice;
    if (s.kokoroVoice) this.kokoroVoice = s.kokoroVoice;
    if (s.webSpeechVoice !== undefined) this.webSpeechVoice = s.webSpeechVoice;
    if (s.kokoroAutoDownload !== undefined) this.kokoroAutoDownload = !!s.kokoroAutoDownload;
    if (s.karaokeHighlight !== undefined) this.wantWordTimings = !!s.karaokeHighlight;
    if (typeof s.speed === 'number') this.speed = s.speed;
  }

  setEdgeTtsVoice(voice) {
    this.edgeTtsVoice = voice || 'en-US-AvaMultilingualNeural';
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setPitch(pitch) {
    this.pitch = pitch;
  }

  setVolume(vol) {
    this.volume = vol ?? 1;
    if (this._currentAudio) this._currentAudio.volume = this.volume;
    if (this._gainNode) this._gainNode.gain.value = this.volume;
  }

  get hasActivePlayback() {
    return !!(this._currentAudio || this._currentSource || this._webSpeechActive);
  }
}

export const ttsManager = new TTSManager();
