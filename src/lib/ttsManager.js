// TTS Manager: Web Speech API + Kokoro TTS (backend only)

const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

// #region agent log
function _dbg(msg, data) {
  fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4110de'},body:JSON.stringify({sessionId:'4110de',location:'ttsManager.js',message:msg,data:data||{},timestamp:Date.now()})}).catch(()=>{});
}
// #endregion

async function fetchTtsAudio(text, voice = 'af_heart', speed = 1.0) {
  const base = API_BASE || '';
  const url = `${base}/api/tts`;
  console.log('[TTS] Fetching from', url, 'text len=', text?.length, 'voice=', voice);
  // #region agent log
  _dbg('fetch start', { url, textLen: text?.length });
  // #endregion
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, speed }),
    });
    // #region agent log
    _dbg('fetch response', { status: res.status, ok: res.ok, contentType: res.headers.get('Content-Type') });
    // #endregion
    console.log('[TTS] Response status=', res.status, res.statusText);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[TTS] Backend error:', res.status, err);
      throw new Error(err.error || res.statusText);
    }
    const blob = await res.blob();
    // #region agent log
    _dbg('fetch blob', { blobSize: blob?.size, blobType: blob?.type });
    // #endregion
    console.log('[TTS] Got blob size=', blob?.size, 'bytes');
    return blob;
  } catch (err) {
    // #region agent log
    _dbg('fetch error', { err: String(err?.message || err) });
    // #endregion
    console.error('[TTS] Fetch failed:', err);
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
    this.voiceId = null;
    this.engine = 'web-speech'; // 'web-speech' | 'kokoro'
    this.kokoroVoice = 'af_heart';
    this.kokoroBackend = false; // Use backend (faster CPU) instead of browser WASM
    this.isLoaded = true;
    this.isLoading = false;
    this.currentUtterance = null;
    this._currentAudio = null;
    this._stopped = false;
    this.isPaused = false;
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

  async _waitIfPaused() {
    while (this.isPaused && !this._stopped) {
      await new Promise((r) => setTimeout(r, 100));
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
    u.volume = 1;
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

  async _speakKokoroChunk(text) {
    let blob;
    try {
      blob = await fetchTtsAudio(text, this.kokoroVoice, this.speed);
    } catch (err) {
      console.warn('[TTS] Kokoro fetch failed, falling back to Web Speech:', err?.message);
      return this._speakWebSpeechChunk(text);
    }
    if (!blob || blob.size < 100) {
      // #region agent log
      _dbg('blob invalid', { blobSize: blob?.size });
      // #endregion
      console.warn('[TTS] Blob invalid or empty, falling back to Web Speech');
      return this._speakWebSpeechChunk(text);
    }
    return new Promise((resolve, reject) => {
      if (this._stopped) return resolve();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this._currentAudio = audio;
      audio.volume = 1;
      audio.onended = () => {
        // #region agent log
        _dbg('audio ended', {});
        // #endregion
        console.log('[TTS] Playback ended');
        URL.revokeObjectURL(url);
        this._currentAudio = null;
        resolve();
      };
      audio.onerror = (e) => {
        // #region agent log
        _dbg('audio error', { err: String(e?.message || e), code: audio?.error?.code });
        // #endregion
        console.error('[TTS] Audio playback error:', e);
        URL.revokeObjectURL(url);
        this._currentAudio = null;
        reject(new Error('Audio playback failed'));
      };
      audio.onpause = () => { if (!this.isPaused) audio.play(); };
      // #region agent log
      _dbg('play start', { blobSize: blob.size });
      // #endregion
      console.log('[TTS] Starting playback, blob size=', blob.size);
      if (this.isPaused) audio.pause();
      else {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise.then(() => {
            // #region agent log
            _dbg('play resolved', {});
            // #endregion
          }).catch((err) => {
            // #region agent log
            _dbg('play rejected', { err: String(err?.message || err) });
            // #endregion
            console.error('[TTS] audio.play() rejected:', err);
            reject(err);
          });
        }
      }
    });
  }

  async speakContinuous(textChunks, onChunkComplete) {
    this._stopped = false;

    if (this.engine === 'kokoro') {
      for (let i = 0; i < textChunks.length && !this._stopped; i++) {
        await this._waitIfPaused();
        if (this._stopped) break;
        let chunk = textChunks[i].trim();
        if (!chunk || chunk.length < 10) continue;
        if (chunk.length > 200) chunk = chunk.substring(0, 200);
        await this._speakKokoroChunk(chunk);
        onChunkComplete?.(i + 1, textChunks.length);
      }
      return;
    }

    if (!window.speechSynthesis) {
      console.error('Speech synthesis not supported.');
      return;
    }

    for (let i = 0; i < textChunks.length && !this._stopped; i++) {
      await this._waitIfPaused();
      if (this._stopped) break;

      let chunk = textChunks[i].trim();
      if (!chunk) continue;
      if (chunk.length > 2000) chunk = chunk.substring(0, 2000);

      await new Promise((resolve) => {
        const u = this._createUtterance(chunk);
        this.currentUtterance = u;

        u.onend = () => {
          this.currentUtterance = null;
          onChunkComplete?.(i + 1, textChunks.length);
          resolve();
        };
        u.onerror = () => {
          this.currentUtterance = null;
          resolve();
        };

        if (this._stopped) return resolve();

        if (this.isPaused) {
          const checkPause = async () => {
            await this._waitIfPaused();
            if (!this._stopped) window.speechSynthesis.speak(u);
          };
          checkPause();
        } else {
          window.speechSynthesis.speak(u);
        }
      });
    }
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
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
  }

  setVoice(voice) {
    this.voiceId = voice || null;
  }

  setEngine(engine) {
    this.engine = engine === 'kokoro' ? 'kokoro' : 'web-speech';
  }

  setKokoroVoice(voice) {
    this.kokoroVoice = voice || 'af_heart';
  }

  setSpeed(speed) {
    this.speed = speed;
  }

  setVolume() {
    if (this.currentUtterance) this.currentUtterance.volume = 1;
  }

  get hasActivePlayback() {
    return !!(this.currentUtterance || this._currentAudio);
  }
}

export const ttsManager = new TTSManager();
export { getVoices, sortVoicesNaturalFirst, getDefaultNaturalVoice };
