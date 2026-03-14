// TTS Manager: Web Speech API + Kokoro TTS (backend only)

function getTtsBaseUrl() {
  const env = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Warm up Kokoro backend so first play starts faster (call when Kokoro is selected) */
export async function warmupKokoro() {
  const base = getTtsBaseUrl();
  try {
    const res = await fetch(`${base}/api/tts/warmup`, { method: 'GET' });
    if (res.ok) return true;
  } catch (_) { }
  return false;
}

async function fetchTtsAudio(text, voice = 'af_heart', speed = 1.0) {
  const base = getTtsBaseUrl();
  const url = `${base}/api/tts`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error || res.statusText;
      throw new Error(msg || `TTS failed (${res.status})`);
    }
    return res.blob();
  } catch (err) {
    if (err.message?.includes('fetch') || err.message?.includes('Failed to fetch')) {
      throw new Error('Kokoro TTS unavailable. Start the backend with: npm run dev:backend');
    }
    throw err;
  }
}

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
    this.engine = 'web-speech'; // 'web-speech' | 'kokoro'
    this.kokoroVoice = 'af_heart';
    this.onKokoroFallback = null;
    this.isLoaded = true;
    this.isLoading = false;
    this.currentUtterance = null;
    this._currentAudio = null;
    this._stopped = false;
    this.isPaused = false;
    this._audioCache = new Map();
    this._failureCount = 0;
  }

  pause() {
    this.isPaused = true;
    if (this.engine === 'kokoro' && this._currentAudio) {
      this._currentAudio.pause();
    } else {
      window.speechSynthesis?.pause?.();
    }
  }

  resume() {
    this.isPaused = false;
    if (this.engine === 'kokoro' && this._currentAudio) {
      this._currentAudio.play();
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

    if (this.engine === 'kokoro') {
      return this._speakKokoroChunk(clean);
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

  async _playAudioElement(audio, url, sessionId) {
    if (!audio) return;
    return new Promise((resolve, reject) => {
      // Immediate abort if session changed
      if (this._stopped || (sessionId !== undefined && sessionId !== this.currentSessionId)) {
        if (url) URL.revokeObjectURL(url);
        return resolve();
      }

      this._currentAudio = audio;
      audio.volume = this.volume ?? 1;
      let resolved = false;

      const stopCheck = setInterval(() => {
        if (this._stopped || (sessionId !== undefined && sessionId !== this.currentSessionId)) {
          audio.pause();
          audio.src = '';
          done();
          return;
        }

        // Bridge: resolve just before end for seamless chunk transition
        // Proportional window: 150ms for long clips, scales down for short ones
        if (audio.duration > 0) {
          const bridge = Math.min(0.15, audio.duration * 0.25);
          if (audio.currentTime >= audio.duration - bridge) {
            done();
          }
        }
      }, 50);

      const done = () => {
        if (resolved) return;
        resolved = true;
        clearInterval(stopCheck);
        // Important: We don't null this._currentAudio immediately if we're bridging
        // to pre-start the next one. But we allow the loop to continue.
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      };

      audio.onended = done;
      audio.onerror = () => {
        // Ignore errors from intentional stops (src cleared or session changed)
        if (!this._stopped) console.warn('[TTS] Audio element error');
        done();
      };

      if (this.isPaused) audio.pause();
      else {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.catch((err) => {
            clearInterval(stopCheck);
            console.error('[TTS] audio.play() failed:', err);
            done();
          });
        }
      }
    });
  }

  async _speakKokoroChunk(text) {
    let blob;
    try {
      blob = await fetchTtsAudio(text, this.kokoroVoice, this.speed);
    } catch (err) {
      console.warn('[TTS] Kokoro fetch failed, falling back to Web Speech:', err?.message);
      this.onKokoroFallback?.(err?.message);
      return this._speakWebSpeechChunk(text);
    }
    if (!blob || blob.size < 100) {
      return this._speakWebSpeechChunk(text);
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return this._playAudioElement(audio, url, this.currentSessionId);
  }

  /** Pre-warm the first few chunks of a page to make playback feel instant */
  async prepareFirstChunk(textChunks, count = 3) {
    if (this.engine !== 'kokoro' || !textChunks || textChunks.length === 0) return;
    for (let i = 0; i < Math.min(textChunks.length, count); i++) {
      this._getAudioForChunk(textChunks, i);
    }
  }

  _getAudioForChunk(textChunks, index, sessionId) {
    if (index >= textChunks.length) return null;
    if (this._audioCache.has(index)) return this._audioCache.get(index);

    const chunk = textChunks[index].trim();
    // Ignore ghost/empty chunks
    if (!chunk || !/[a-zA-Z0-9]/.test(chunk)) return null;

    const promise = (async () => {
      let retryCount = 0;
      const MAX_RETRIES = 1;

      const fetchWithRetry = async () => {
        try {
          if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;

          const blob = await fetchTtsAudio(chunk, this.kokoroVoice, this.speed);
          if (!blob || blob.size < 100 || this._stopped || (sessionId && this.currentSessionId !== sessionId)) return null;

          const url = URL.createObjectURL(blob);
          const audio = new Audio();
          audio.preload = 'auto';

          // Blob URL is already in memory — skip onloadeddata wait
          audio.src = url;
          audio.load();
          return { audio, url };
        } catch (e) {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
            return fetchWithRetry();
          }
          console.warn('[TTS] Prefetch final failure for index', index, e);
          return null;
        }
      };

      return fetchWithRetry();
    })();

    this._audioCache.set(index, promise);
    return promise;
  }

  async speakContinuous(textChunks, onChunkComplete, sessionId) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._failureCount = 0; // Fresh start for setiap page/session

    if (this.engine === 'kokoro') {
      let currentIndex = 0;

      const runLoop = async () => {
        if (currentIndex >= textChunks.length || this._stopped) {
          // Don't cleanup cache here — next page's prefetched entries must survive.
          // Cache entries self-clean as they're consumed; stop()/startSession() handle full cleanup.
          return;
        }

        // SMART PREFETCH: 5 chunks ahead, leveraging concurrent backend processing
        for (let ahead = 1; ahead <= 5 && currentIndex + ahead < textChunks.length; ahead++) {
          this._getAudioForChunk(textChunks, currentIndex + ahead, sessionId);
        }

        await this._waitIfPaused(sessionId);
        if (this._stopped || (sessionId && this.currentSessionId !== sessionId)) return;

        // Peak at the current chunk.
        const audioPromise = this._getAudioForChunk(textChunks, currentIndex, sessionId);
        
        // If the chunk was 'skipped' by our regex, it returns null immediately.
        // We need to know if it was skipped or if it failed.
        const chunk = textChunks[currentIndex]?.trim();
        const isGhost = !chunk || !/[a-zA-Z0-9]/.test(chunk);

        if (isGhost) {
          currentIndex++;
          return runLoop();
        }

        const result = audioPromise ? await audioPromise : null;

        if (result && !this._stopped && (!sessionId || this.currentSessionId === sessionId)) {
          this._failureCount = 0; // Reset on success
          onChunkComplete?.(currentIndex + 1, textChunks.length);
          
          await this._playAudioElement(result.audio, result.url, sessionId);
          
          this._audioCache.delete(currentIndex);
          currentIndex++;
          return runLoop();
        } else {
          // Failure Logic
          this._failureCount = (this._failureCount || 0) + 1;
          
          if (this._failureCount >= 5) {
            console.warn('[TTS] Consistent AI failure (5 chunks). Switching to Web Speech.');
            const originalEngine = this.engine;
            this.engine = 'web-speech';
            await this.speakContinuous(textChunks.slice(currentIndex), (done, total) => {
               onChunkComplete?.(currentIndex + done, textChunks.length);
            }, sessionId);
            this.engine = originalEngine;
            return;
          }

          // Thermal Cooldown: Wait 3 seconds to let CPU recover
          await new Promise(r => setTimeout(r, 3000));
          currentIndex++;
          return runLoop();
        }
      };

      return runLoop();
    }

    if (!window.speechSynthesis) {
      console.error('Speech synthesis not supported.');
      return;
    }

    // Queue ALL chunks at once for gapless browser-native transitions
    // (browser speech queue handles back-to-back playback with no gaps)
    window.speechSynthesis.cancel();

    return new Promise((resolve) => {
      let totalQueued = 0;
      let completed = 0;

      // Chrome bug workaround: speechSynthesis silently stops after ~15s.
      // Periodic pause/resume keeps it alive.
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
    this._cleanupCache(); // Clear old session's cache before new entries are added
  }

  _cleanupCache() {
    for (const p of this._audioCache.values()) {
      Promise.resolve(p).then((result) => {
        if (result?.audio) {
          result.audio.pause();
          result.audio.removeAttribute('src');
        }
        // Delay revocation so in-flight loads don't hit ERR_FILE_NOT_FOUND
        if (result?.url) setTimeout(() => URL.revokeObjectURL(result.url), 3000);
      }).catch(() => {});
    }
    this._audioCache.clear();
  }

  stop() {
    this._stopped = true;
    this.isPaused = false;
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
    this.engine = engine === 'kokoro' ? 'kokoro' : 'web-speech';
    if (this.engine === 'kokoro') warmupKokoro();
  }

  setKokoroVoice(voice) {
    this.kokoroVoice = voice || 'af_heart';
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setVolume(vol) {
    this.volume = vol ?? 1;
    if (this.currentUtterance) this.currentUtterance.volume = this.volume;
    if (this._currentAudio) this._currentAudio.volume = this.volume;
  }

  get hasActivePlayback() {
    return !!(this.currentUtterance || this._currentAudio);
  }
}

export const ttsManager = new TTSManager();
export { getVoices, sortVoicesNaturalFirst, getDefaultNaturalVoice };
