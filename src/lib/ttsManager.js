// TTS Manager: Edge TTS (server-side neural voices)
import { cacheKey, getCachedAudio, putCachedAudio } from './ttsCache';

// ─── Server Edge TTS ───────────────────────────────────────────────────────
// Fetches audio from /api/tts (Edge TTS backend). Fast, no browser model needed.
const _BASE = import.meta.env.VITE_API_URL || '';
function _apiUrl(path) { return `${_BASE.replace(/\/$/, '')}${path}`; }
let _edgeBackendUnavailableUntil = 0;

function _isAbortError(err) {
  return err?.name === 'AbortError' || /aborted|abort/i.test(String(err?.message || ''));
}

/**
 * Fetch MP3 audio for a text chunk from the Edge TTS backend.
 * Returns a Blob or null on failure.
 */
async function _fetchEdgeTTS(text, voice = 'en-US-AvaMultilingualNeural', rate = 1.0, retries = 2) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  // Serve from the offline cache first (instant + works with no network).
  const key = cacheKey(trimmed, voice, rate);
  const cached = await getCachedAudio(key);
  if (cached) return cached;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (Date.now() < _edgeBackendUnavailableUntil) return null;
    let timer;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const res = await fetch(_apiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, voice, rate }),
        signal: controller.signal,
      });

      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 100) {
          putCachedAudio(key, blob);
          return blob;
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

export function prewarmFirstChunk() { }

class TTSManager {
  constructor() {
    this.speed = 1.0;
    this.volume = 1.0;
    this.edgeTtsVoice = 'en-US-AvaMultilingualNeural';
    this.isLoaded = true;
    this.isLoading = false;
    this._currentAudio = null;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
    this._audioCtx = null;
    this._gainNode = null;
    this._currentSource = null;
    this._blobCache = new Map();
  }

  /** Lazily create (or reuse) the AudioContext + GainNode for Edge TTS playback. */
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

  _dispatch(name) {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(name));
      }
    } catch {
      /* ignore */
    }
  }

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
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  resume() {
    this.isPaused = false;
    this._audioCtx?.resume().catch(() => { });
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
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

  async speak(text) {
    this.stop();
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return null;
    return this._speakEdgeTTSChunk(clean);
  }

  async _speakEdgeTTSChunk(text, retries = 2) {
    let blob;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        blob = await _fetchEdgeTTS(text, this.edgeTtsVoice, this.speed);
        if (blob && blob.size >= 100) break;
        lastError = new Error('Empty or too small audio response');
      } catch (err) {
        lastError = err;
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!blob || blob.size < 100) {
      console.error('[TTS] Edge TTS failed after retries');
      throw lastError || new Error('Edge TTS failed');
    }
    const url = URL.createObjectURL(blob);
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

  /** Pre-warm the first few chunks of a page for instant playback */
  async prepareFirstChunk(textChunks, count = 3) {
    if (!textChunks || textChunks.length === 0) return;
    for (let i = 0; i < Math.min(textChunks.length, count); i++) {
      this._getBlobForChunk(textChunks, i);
    }
  }

  _getBlobForChunk(textChunks, index, sessionId) {
    if (index >= textChunks.length) return null;
    const chunk = (textChunks[index] || '').trim();
    if (!chunk || chunk.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(chunk)) return null;

    const key = `${chunk}|${this.edgeTtsVoice}|${this.speed}`;
    const cached = this._blobCache.get(index);
    if (cached?.key === key) return cached.promise;

    const promise = (async () => {
      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;
      return _fetchEdgeTTS(chunk, this.edgeTtsVoice, this.speed);
    })();
    this._blobCache.set(index, { key, promise });
    return promise;
  }

  async speakContinuous(textChunks, onChunkComplete, sessionId, metadata = {}) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;

    if (metadata.title || metadata.author || metadata.cover) {
      this.setMediaMetadata(metadata);
    }

    const ctx = this._getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => { });

    let currentIndex = 0;
    let nextStartTime = null;

    const prefetchCount = Math.min(3, textChunks.length);
    for (let i = 0; i < prefetchCount; i++) {
      this._getBlobForChunk(textChunks, i, sessionId);
    }

    const runLoop = async () => {
      if (currentIndex >= textChunks.length || this._stopped) {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        this.clearMediaMetadata();
        return;
      }

      // Prefetch next chunks
      for (let ahead = 1; ahead <= 3; ahead++) {
        if (currentIndex + ahead < textChunks.length) {
          this._getBlobForChunk(textChunks, currentIndex + ahead, sessionId);
        }
      }

      await this._waitIfPaused(sessionId);
      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

      const chunk = textChunks[currentIndex]?.trim();
      // Relaxed ghost check: skip only if there are NO alphanumeric characters at all.
      // This ensures sentences starting with numbers (e.g. "1. Start") are NOT skipped.
      const isGhost = !chunk || chunk.length < 1 || !/[a-zA-ZÀ-ÿ0-9]/.test(chunk);

      if (isGhost) {
        currentIndex++;
        return runLoop();
      }

      const blobPromise = this._getBlobForChunk(textChunks, currentIndex, sessionId);
      let blob = blobPromise ? await blobPromise : null;

      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

      if (!blob || blob.size < 100) {
        this._failureCount++;
        if (this._failureCount >= 3) {
          console.error('[TTS] Custom voice unreachable, stopping.');
          return;
        }
        this._blobCache.delete(currentIndex);
        currentIndex++;
        return runLoop();
      }

      let audioBuffer;
      try {
        const ab = await blob.arrayBuffer();
        audioBuffer = await ctx.decodeAudioData(ab);
      } catch (err) {
        console.warn('[TTS] Decode failed for chunk', currentIndex);
        this._blobCache.delete(currentIndex);
        currentIndex++;
        return runLoop();
      }

      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this._gainNode);
      this._currentSource = source;

      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';

      const now = ctx.currentTime;
      const startAt = (nextStartTime === null || nextStartTime < now + 0.05)
        ? now + 0.05
        : nextStartTime;
      source.start(startAt);
      nextStartTime = startAt + audioBuffer.duration;

      this._failureCount = 0;
      onChunkComplete?.(currentIndex + 1, textChunks.length);

      await new Promise(r => { source.onended = r; });

      if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

      this._blobCache.delete(currentIndex);
      currentIndex++;
      return runLoop();
    };

    return runLoop();
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
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
    this._currentAudio = null;
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
      .filter((c) => c.length >= 2 && /[a-zA-ZÀ-ÿ0-9]/.test(c));
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
          const blob = await _fetchEdgeTTS(speakable[idx], this.edgeTtsVoice, this.speed);
          if (blob) ok += 1;
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

  setEdgeTtsVoice(voice) {
    this.edgeTtsVoice = voice || 'en-US-AvaMultilingualNeural';
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setVolume(vol) {
    this.volume = vol ?? 1;
    if (this._currentAudio) this._currentAudio.volume = this.volume;
    if (this._gainNode) this._gainNode.gain.value = this.volume;
  }

  get hasActivePlayback() {
    return !!(this._currentAudio || this._currentSource);
  }
}

export const ttsManager = new TTSManager();

