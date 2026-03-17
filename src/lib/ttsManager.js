// TTS Manager: Web Speech API + Edge TTS (server-side neural voices)

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
async function _fetchEdgeTTS(text, voice = 'en-US-AvaMultilingualNeural', rate = 1.0) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (Date.now() < _edgeBackendUnavailableUntil) return null;
  let timer;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(_apiUrl('/api/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, voice, rate }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status >= 500) {
        // Backend TTS appears unavailable; cool down to avoid hammering.
        _edgeBackendUnavailableUntil = Date.now() + 60000;
      }
      return null;
    }
    const blob = await res.blob();
    return (blob && blob.size > 100) ? blob : null;
  } catch (err) {
    // Aborts are expected during stop/pause/seek and should not spam logs.
    if (_isAbortError(err)) return null;
    _edgeBackendUnavailableUntil = Date.now() + 60000;
    console.warn('[TTS] Edge TTS fetch failed:', err?.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function prewarmFirstChunk() {}

async function getVoices() {
  const list = () => window.speechSynthesis?.getVoices?.() ?? [];
  let v = list();
  if (v.length > 0) return v;
  return new Promise((resolve) => {
    window.speechSynthesis.onvoiceschanged = () => resolve(list());
    setTimeout(() => resolve(list()), 200);
  });
}

/** Sort voices: natural/neural first (Microsoft, Online, Neural), then others */
function sortVoicesNaturalFirst(voices) {
  const natural = (v) =>
    /microsoft|online|neural|natural|jenny|guy|aria|sara|zira|davids?|susan|mark/i.test(v.name || '') ||
    /microsoft|online|neural/i.test(v.voiceURI || '');
  return [...voices].sort((a, b) => {
    const aNat = natural(a);
    const bNat = natural(b);
    if (aNat && !bNat) return -1;
    if (!aNat && bNat) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/** Get first natural voice URI, or null */
function getDefaultNaturalVoice(voices) {
  const sorted = sortVoicesNaturalFirst(voices);
  const nat = sorted.find((v) => /microsoft|online|neural|natural|jenny|guy|aria|sara|zira|davids?|susan|mark/i.test(v.name || '') || /microsoft|online|neural/i.test(v.voiceURI || ''));
  return nat?.voiceURI || null;
}

class TTSManager {
  constructor() {
    this.speed = 1.0;
    this.volume = 1.0;
    this.voiceId = null;
    this.engine = 'web-speech'; // 'web-speech' | 'edge-tts'
    this.edgeTtsVoice = 'en-US-AvaMultilingualNeural';
    this.onEdgeFallback = null;
    this.isLoaded = true;
    this.isLoading = false;
    this.currentUtterance = null;
    this._currentAudio = null;
    this._stopped = false;
    this.isPaused = false;
    this._audioCache = new Map();
    this._failureCount = 0;
    // Web Audio API — used for gapless Edge TTS playback
    this._audioCtx = null;
    this._gainNode = null;
    this._currentSource = null;    // AudioBufferSourceNode currently playing
    this._blobCache = new Map();   // index → { key, promise }
  }

  /** Lazily create (or reuse) the AudioContext + GainNode for Edge TTS playback. */
  _getAudioCtx() {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx = new AudioContext();
      this._gainNode = this._audioCtx.createGain();
      this._gainNode.gain.value = this.volume ?? 1;
      this._gainNode.connect(this._audioCtx.destination);
    }
    return this._audioCtx;
  }

  pause() {
    this.isPaused = true;
    if (this.engine === 'edge-tts') {
      this._audioCtx?.suspend().catch(() => {});
    } else {
      window.speechSynthesis?.pause?.();
    }
  }

  resume() {
    this.isPaused = false;
    if (this.engine === 'edge-tts') {
      this._audioCtx?.resume().catch(() => {});
    } else {
      window.speechSynthesis?.resume?.();
    }
  }

  async _waitIfPaused(sessionId) {
    while (this.isPaused && !this._stopped && (sessionId === undefined || sessionId === this.currentSessionId)) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async init() {
    this.isLoaded = !!window.speechSynthesis;
    return Promise.resolve();
  }

  _speakWebSpeechChunk(text) {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean || !window.speechSynthesis) return Promise.resolve();
    return new Promise((resolve) => {
      const u = this._createUtterance(clean);
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  _createUtterance(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.speed;
    u.pitch = 1;
    u.volume = this.volume ?? 1;
    const voices = window.speechSynthesis.getVoices();
    if (this.voiceId) {
      const v = voices.find((x) => x.voiceURI === this.voiceId || x.name === this.voiceId);
      if (v) u.voice = v;
    } else {
      const natural = voices.find((x) =>
        /microsoft|online|neural|jenny|guy|aria|sara|zira|david|susan|mark/i.test(x.name || '') ||
        /microsoft|online|neural/i.test(x.voiceURI || '')
      );
      if (natural) u.voice = natural;
    }
    return u;
  }

  async speak(text) {
    this.stop();

    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return null;

    if (this.engine === 'edge-tts') {
      return this._speakEdgeTTSChunk(clean);
    }

    if (!window.speechSynthesis) {
      throw new Error('Speech synthesis not supported in this browser.');
    }

    return new Promise((resolve) => {
      const u = this._createUtterance(clean);
      this.currentUtterance = u;
      u.onend = () => {
        this.currentUtterance = null;
        resolve();
      };
      u.onerror = () => {
        this.currentUtterance = null;
        resolve();
      };
      window.speechSynthesis.speak(u);
    });
  }

  async _speakEdgeTTSChunk(text) {
    let blob;
    try {
      blob = await _fetchEdgeTTS(text, this.edgeTtsVoice, this.speed);
    } catch (err) {
      console.warn('[TTS] Edge TTS failed, falling back to Web Speech:', err?.message);
      this.onEdgeFallback?.(err?.message);
      return this._speakWebSpeechChunk(text);
    }
    if (!blob || blob.size < 100) {
      return this._speakWebSpeechChunk(text);
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = this.volume ?? 1;
    return new Promise((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      this._currentAudio = audio;
      audio.play().catch(() => resolve());
    });
  }

  /** Pre-warm the first few chunks of a page for instant playback */
  async prepareFirstChunk(textChunks, count = 3) {
    if (this.engine !== 'edge-tts' || !textChunks || textChunks.length === 0) return;
    for (let i = 0; i < Math.min(textChunks.length, count); i++) {
      this._getBlobForChunk(textChunks, i);
    }
  }

  /**
   * Get (or start) the blob fetch for a given chunk index.
   * Caches the promise so multiple callers share the same in-flight request.
   */
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

  async speakContinuous(textChunks, onChunkComplete, sessionId) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;

    console.log(`[TTS] Starting ${this.engine} playback with ${textChunks.length} chunks`);

    if (this.engine === 'edge-tts') {
      // Edge TTS path — gapless Web Audio scheduling
      const ctx = this._getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      let currentIndex = 0;
      let nextStartTime = null;

      // Prefetch the first 3 chunks for near-instant start
      const prefetchCount = Math.min(3, textChunks.length);
      for (let i = 0; i < prefetchCount; i++) {
        this._getBlobForChunk(textChunks, i, sessionId);
      }

      const runLoop = async () => {
        if (currentIndex >= textChunks.length || this._stopped) {
          console.log(`[TTS] Edge TTS loop complete (index=${currentIndex}, stopped=${this._stopped})`);
          return;
        }

        // Prefetch next chunks while current one plays (Edge TTS is fast, safe to prefetch 2-3)
        for (let ahead = 1; ahead <= 3; ahead++) {
          if (currentIndex + ahead < textChunks.length) {
            this._getBlobForChunk(textChunks, currentIndex + ahead, sessionId);
          }
        }

        await this._waitIfPaused(sessionId);
        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

        const chunk = textChunks[currentIndex]?.trim();
        const isGhost = !chunk || chunk.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(chunk);

        if (isGhost) {
          currentIndex++;
          return runLoop();
        }

        console.log(`[TTS] Processing chunk ${currentIndex}/${textChunks.length}: "${chunk.substring(0, 50)}..."`);

        const blobPromise = this._getBlobForChunk(textChunks, currentIndex, sessionId);
        let blob = blobPromise ? await blobPromise : null;

        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

        if (!blob || blob.size < 100) {
          console.log(`[TTS] Edge TTS not ready for chunk ${currentIndex}, using Web Speech`);
          this._failureCount++;
          nextStartTime = null;
          await this._speakWebSpeechChunk(chunk);

          if (this._failureCount >= 1) {
            console.warn('[TTS] Edge TTS unavailable. Switching to Web Speech for remainder.');
            const originalEngine = this.engine;
            this.engine = 'web-speech';
            await this.speakContinuous(textChunks.slice(currentIndex + 1), (done) => {
              onChunkComplete?.(currentIndex + 1 + done, textChunks.length);
            }, sessionId);
            this.engine = originalEngine;
            return;
          }

          this._blobCache.delete(currentIndex);
          currentIndex++;
          return runLoop();
        }

        // Decode MP3 blob into AudioBuffer
        let audioBuffer;
        try {
          const ab = await blob.arrayBuffer();
          audioBuffer = await ctx.decodeAudioData(ab);
        } catch (err) {
          console.warn('[TTS] AudioContext decode failed for chunk', currentIndex, err?.message);
          await this._speakWebSpeechChunk(chunk);
          this._blobCache.delete(currentIndex);
          currentIndex++;
          return runLoop();
        }

        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this._gainNode);
        this._currentSource = source;

        const now = ctx.currentTime;
        const startAt = (nextStartTime === null || nextStartTime < now + 0.02)
          ? now + 0.02
          : nextStartTime;
        source.start(startAt);
        nextStartTime = startAt + audioBuffer.duration;

        this._failureCount = 0;
        console.log(`[TTS] Audio ready for chunk ${currentIndex}, scheduled in ${(startAt - now).toFixed(2)}s (duration=${audioBuffer.duration.toFixed(2)}s)`);
        onChunkComplete?.(currentIndex + 1, textChunks.length);

        await new Promise(r => { source.onended = r; });

        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

        this._blobCache.delete(currentIndex);
        currentIndex++;
        return runLoop();
      };

      return runLoop();
    }

    // ─── Web Speech fallback ─────────────────────────────────────────────
    if (!window.speechSynthesis) {
      console.error('Speech synthesis not supported.');
      return;
    }

    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      let totalQueued = 0;
      let completed = 0;

      const keepAlive = setInterval(() => {
        if (this._stopped || (sessionId && this.currentSessionId !== sessionId) || completed >= totalQueued) {
          clearInterval(keepAlive);
          return;
        }
        if (window.speechSynthesis.speaking && !this.isPaused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      const finish = () => {
        clearInterval(keepAlive);
        this.currentUtterance = null;
        resolve();
      };

      for (let i = 0; i < textChunks.length; i++) {
        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) break;

        let chunk = textChunks[i].trim();
        if (!chunk) continue;
        if (chunk.length > 2000) chunk = chunk.substring(0, 2000);

        const u = this._createUtterance(chunk);
        totalQueued++;

        u.onend = () => {
          completed++;
          onChunkComplete?.(completed, textChunks.length);
          if (completed >= totalQueued) finish();
        };
        u.onerror = () => {
          completed++;
          if (completed >= totalQueued) finish();
        };

        window.speechSynthesis.speak(u);
        this.currentUtterance = u;
      }

      if (totalQueued === 0) finish();
    });
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0;
    this._cleanupCache();
  }

  _cleanupCache() {
    this._blobCache.clear();
    for (const p of this._audioCache.values()) {
      Promise.resolve(p).then((result) => {
        if (result?.audio) {
          result.audio.pause();
          result.audio.removeAttribute('src');
        }
        if (result?.url) setTimeout(() => URL.revokeObjectURL(result.url), 3000);
      }).catch(() => {});
    }
    this._audioCache.clear();
  }

  stop() {
    this._stopped = true;
    this.isPaused = false;
    // Stop any currently-playing Web Audio source
    try { this._currentSource?.stop(0); } catch {
      // Source may already be stopped/disposed.
    }
    this._currentSource = null;
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio.src = '';
      this._currentAudio = null;
    }
    window.speechSynthesis?.cancel?.();
    this.currentUtterance = null;
    this._cleanupCache();
  }

  setVoice(voice) {
    this.voiceId = voice || null;
  }

  setEngine(engine) {
    this.engine = engine === 'edge-tts' ? 'edge-tts' : 'web-speech';
  }

  setEdgeTtsVoice(voice) {
    this.edgeTtsVoice = voice || 'en-US-AvaMultilingualNeural';
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setVolume(vol) {
    this.volume = vol ?? 1;
    if (this.currentUtterance) this.currentUtterance.volume = this.volume;
    if (this._currentAudio) this._currentAudio.volume = this.volume;
    if (this._gainNode) this._gainNode.gain.value = this.volume;
  }

  get hasActivePlayback() {
    return !!(this.currentUtterance || this._currentAudio || this._currentSource);
  }
}

export const ttsManager = new TTSManager();
export { getVoices, sortVoicesNaturalFirst, getDefaultNaturalVoice };
