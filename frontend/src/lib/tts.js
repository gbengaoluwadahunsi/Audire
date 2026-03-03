/**
 * TTS: Backend Piper (POST /api/tts) with Web Speech API fallback.
 * Set VITE_TTS_API_URL in .env (e.g. http://localhost:8000) to use the backend.
 */
import { getCachedTtsChunk, setCachedTtsChunk } from './state';

let onSentenceStart = null;
let onSentenceEnd   = null;
let onDone          = null;
let onError         = null;
let onModelProgress = null;

function safeCall(fn, ...args) {
  if (!fn) return;
  try {
    fn(...args);
  } catch (e) {
    console.warn('[TTS] Callback error:', e?.message || e);
    onError?.();
  }
}

export function setCallbacks({ start, end, done, error, modelProgress }) {
  onSentenceStart = start ?? null;
  onSentenceEnd   = end ?? null;
  onDone          = done ?? null;
  onError         = error ?? null;
  onModelProgress = modelProgress ?? null;
}

const _webSpeechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

const TTS_API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TTS_API_URL) || 'http://localhost:8000';

let _backendReady = false;
let _backendCheckPromise = null;
let _backendChecked = false;

export function isPiperReady()   { return _backendReady; }
export function isPiperFailed()  { return _backendChecked && !_backendReady; }
export function isPiperLoading() { return _backendCheckPromise != null; }

export function canPlay() {
  return _backendReady;
}

/** Check backend health. Call on app load. */
export async function checkBackend() {
  if (_backendCheckPromise) return _backendCheckPromise;
  _backendCheckPromise = (async () => {
    try {
      const r = await fetch(`${TTS_API_URL}/api/health`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      _backendReady = r.ok;
      _backendChecked = true;
      return _backendReady;
    } catch {
      _backendReady = false;
      _backendChecked = true;
      return false;
    } finally {
      _backendCheckPromise = null;
    }
  })();
  return _backendCheckPromise;
}

/** No-op for compatibility (backend is always "ready" when health check passes). */
export function downloadPiperModel() {
  checkBackend().then((ok) => {
    if (ok) onModelProgress?.({ status: 'ready', progress: 100, message: 'Voice ready!' });
    else onModelProgress?.({ status: 'failed', message: 'TTS server unavailable. Start the backend.' });
  });
}

export function preloadModel() {
  if (_backendReady) {
    onModelProgress?.({ status: 'ready', progress: 100, message: 'Voice ready!' });
    return;
  }
  checkBackend().then((ok) => {
    if (ok) onModelProgress?.({ status: 'ready', progress: 100, message: 'Voice ready!' });
    else onModelProgress?.({ status: 'failed', message: 'TTS server unavailable. Start the backend.' });
  });
}

export function getBrowserVoices() {
  if (!_webSpeechSupported) return [];
  return window.speechSynthesis.getVoices();
}

export function getPreferredNaturalVoice(voices = []) {
  const list = voices.length ? voices : getBrowserVoices();
  if (!list.length) return null;
  const naturalKeywords = /natural|neural|aria|jenny|google|premium|zira|david|mark/i;
  const preferred = list.find((v) => naturalKeywords.test(v.name));
  if (preferred) return preferred;
  const en = list.find((v) => v.lang && v.lang.startsWith('en'));
  return en || list[0];
}

export function getBrowserVoicesSorted(voices = []) {
  const list = voices.length ? voices : getBrowserVoices();
  const preferred = getPreferredNaturalVoice(list);
  const preferredURI = preferred?.voiceURI;
  return [...list].sort((a, b) => {
    const aPrefer = a.voiceURI === preferredURI ? 1 : 0;
    const bPrefer = b.voiceURI === preferredURI ? 1 : 0;
    if (bPrefer !== aPrefer) return bPrefer - aPrefer;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export const PIPER_VOICES = [
  { id: 'lessac', name: 'Lessac' },
  { id: 'amy', name: 'Amy' },
  { id: 'ryan', name: 'Ryan' },
  { id: 'joe', name: 'Joe' },
  { id: 'kristin', name: 'Kristin' },
  { id: 'ljspeech', name: 'LJSpeech' },
  { id: 'bryce', name: 'Bryce' },
  { id: 'danny', name: 'Danny' },
  { id: 'kathleen', name: 'Kathleen' },
  { id: 'kusal', name: 'Kusal' },
  { id: 'norman', name: 'Norman' },
];

export const FIXED_PIPER_VOICE_ID = 'lessac';

export function getPiperVoices() {
  return PIPER_VOICES.slice();
}

let _audioContext = null;
function unlockAudioContext() {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  if (!_audioContext) _audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioContext.state === 'suspended') _audioContext.resume();
}
async function ensureAudioContextRunning() {
  if (!_audioContext) return false;
  if (_audioContext.state === 'suspended') await _audioContext.resume();
  return _audioContext.state === 'running';
}

/** Fetch WAV from backend and return ArrayBuffer */
async function fetchTTS(text, voice, speed) {
  const r = await fetch(`${TTS_API_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.trim(), voice, speed }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || `TTS failed: ${r.status}`);
  }
  return r.arrayBuffer();
}

const FIRST_CHUNK_MAX_SENTENCES = 6;
const FIRST_CHUNK_MAX_CHARS = 600;
const PREBUFFER_CHUNKS = 2;

function hashString(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function chunkCacheKey(text, voice, rate) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  const meta = `${voice || FIXED_PIPER_VOICE_ID}__${Number(rate || 1).toFixed(2)}__${normalized.length}`;
  return `tts_${hashString(`${meta}__${normalized}`)}`;
}

function buildChunkPlan(sentences, maxSentences = FIRST_CHUNK_MAX_SENTENCES, maxChars = FIRST_CHUNK_MAX_CHARS) {
  const plan = [];
  let idx = 0;
  while (idx < (sentences?.length ?? 0)) {
    while (idx < sentences.length && !(sentences[idx] || '').trim()) idx += 1;
    if (idx >= sentences.length) break;
    const sentenceIdxs = [];
    let text = '';
    let chars = 0;
    for (let j = idx; j < sentences.length; j++) {
      const t = (sentences[j] || '').trim();
      if (!t) continue;
      const next = text ? `${text} ${t}` : t;
      if (sentenceIdxs.length > 0 && (sentenceIdxs.length >= maxSentences || next.length > maxChars)) break;
      sentenceIdxs.push(j);
      text = next;
      chars = text.length;
      if (sentenceIdxs.length >= maxSentences || chars >= maxChars) break;
    }
    if (!text.trim() || sentenceIdxs.length === 0) break;
    plan.push({ sentenceIdxs, text });
    idx = sentenceIdxs[sentenceIdxs.length - 1] + 1;
  }
  return plan;
}

/** Build first chunk (same logic as engine). For preloading next page's first audio. */
export function buildFirstChunk(sentences) {
  const outIdxs = [];
  let text = '';
  let chars = 0;
  for (let j = 0; j < (sentences?.length ?? 0); j++) {
    const t = (sentences[j] || '').trim();
    outIdxs.push(j);
    if (t) {
      const next = text ? `${text} ${t}` : t;
      if (outIdxs.length > 1 && (outIdxs.length > FIRST_CHUNK_MAX_SENTENCES || next.length > FIRST_CHUNK_MAX_CHARS)) {
        outIdxs.pop();
        break;
      }
      text = next;
      chars = text.length;
    }
    if (outIdxs.length >= FIRST_CHUNK_MAX_SENTENCES || chars >= FIRST_CHUNK_MAX_CHARS) break;
  }
  return { sentenceIdxs: outIdxs, chunkText: text };
}

/** Preload first chunk audio for a sentence list (e.g. next page). Returns a promise of the WAV buffer. */
export function requestFirstChunk(sentences, voiceId, rate) {
  if (!sentences?.length) return Promise.resolve(null);
  const { chunkText } = buildFirstChunk(sentences);
  if (!chunkText.trim()) return Promise.resolve(null);
  return fetchTTS(chunkText, voiceId, rate);
}

export async function prebufferStreamChunks(sentences, voiceId, rate) {
  if (!sentences?.length) return null;
  const chunks = buildChunkPlan(sentences, FIRST_CHUNK_MAX_SENTENCES, FIRST_CHUNK_MAX_CHARS)
    .slice(0, PREBUFFER_CHUNKS)
    .map((x) => x.text)
    .filter((x) => x && x.trim());
  if (!chunks.length) return null;
  const cached = await Promise.all(chunks.map((text) => getCachedTtsChunk(chunkCacheKey(text, voiceId || FIXED_PIPER_VOICE_ID, rate))));
  if (cached.every(Boolean)) return cached;
  try {
    const r = await fetch(`${TTS_API_URL}/api/tts/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'stream',
        voice: voiceId || FIXED_PIPER_VOICE_ID,
        speed: typeof rate === 'number' ? rate : 1,
        max_chunk_chars: FIRST_CHUNK_MAX_CHARS,
        chunks,
      }),
    });
    if (!r.ok || !r.body) {
      const err = await r.text();
      throw new Error(err || `TTS prebuffer failed: ${r.status}`);
    }
    const decoder = new TextDecoder();
    const reader = r.body.getReader();
    let streamBuf = '';
    const out = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) return out.length ? out : (cached.some(Boolean) ? cached : null);
      streamBuf += decoder.decode(value, { stream: true });
      let nl = streamBuf.indexOf('\n');
      while (nl >= 0) {
        const line = streamBuf.slice(0, nl).trim();
        streamBuf = streamBuf.slice(nl + 1);
        if (line) {
          const evt = JSON.parse(line);
          if (evt.type === 'chunk') {
            if (typeof evt.index === 'number' && evt.audio_b64) {
              out[evt.index] = evt.audio_b64;
              const chunkText = chunks[evt.index];
              if (chunkText) {
                setCachedTtsChunk(chunkCacheKey(chunkText, voiceId || FIXED_PIPER_VOICE_ID, rate), evt.audio_b64).catch(() => {});
              }
            }
            if (out.filter(Boolean).length >= chunks.length) return out;
          }
          if (evt.type === 'error') throw new Error(evt.detail || 'Prebuffer stream error');
          if (evt.type === 'done') return out.length ? out : (cached.some(Boolean) ? cached : null);
        }
        nl = streamBuf.indexOf('\n');
      }
    }
  } catch (e) {
    if (cached.some(Boolean)) return cached;
    throw e;
  }
}

export async function hasOfflineAudioForPage(sentences, voiceId, rate) {
  if (!sentences?.length) return false;
  const chunks = buildChunkPlan(sentences, FIRST_CHUNK_MAX_SENTENCES, FIRST_CHUNK_MAX_CHARS)
    .slice(0, PREBUFFER_CHUNKS)
    .map((x) => x.text)
    .filter((x) => x && x.trim());
  if (!chunks.length) return false;
  const cached = await Promise.all(
    chunks.map((text) => getCachedTtsChunk(chunkCacheKey(text, voiceId || FIXED_PIPER_VOICE_ID, rate))),
  );
  return cached.length > 0 && cached.every(Boolean);
}

/** Decode WAV array buffer to Float32Array and sample rate (simple WAV parser). */
function decodeWav(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46464952) throw new Error('Not a WAV file'); // RIFF
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const dataOffset = 44; // standard WAV header
  const numSamples = (buffer.byteLength - dataOffset) / 2; // 16-bit
  const float32 = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const s = view.getInt16(dataOffset + i * 2, true);
    float32[i] = s / 32768;
  }
  return { float32, sampleRate };
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function makeBackendEngine() {
  let _voiceId = FIXED_PIPER_VOICE_ID;
  let _rate = 1.0;
  let _volume = 1.0;
  let _playing = false;
  let _paused = false;
  let _idx = 0;
  let _sentences = [];
  let _generation = 0;
  let _currentSource = null;
  let _timers = [];
  let _streamAbortController = null;
  let _activeSources = new Set();

  function setVoice(v) { _voiceId = PIPER_VOICES.some((x) => x.id === v) ? v : FIXED_PIPER_VOICE_ID; }
  function setRate(r) {
    _rate = Math.max(0.5, Math.min(2, r));
  }
  function setVolume(v) { _volume = Math.max(0, Math.min(1, v)); }
  function isPlaying() { return _playing; }
  function isPaused()  { return _paused; }
  function currentIndex() { return _idx; }

  function clearTimers() {
    _timers.forEach((id) => clearTimeout(id));
    _timers = [];
  }

  function stop() {
    _generation++;
    _playing = false;
    _paused = false;
    clearTimers();
    if (_streamAbortController) {
      try { _streamAbortController.abort(); } catch (_) {}
      _streamAbortController = null;
    }
    _activeSources.forEach((s) => {
      try { s.stop(); } catch (_) {}
    });
    _activeSources.clear();
    if (_currentSource) {
      try { _currentSource.stop(); } catch (_) {}
      _currentSource = null;
    }
  }

  async function play(sentences, startIdx = 0, prebufferedChunksPromise = null) {
    if (!_backendReady || !sentences?.length) {
      safeCall(onError);
      return;
    }
    if (_webSpeechSupported) window.speechSynthesis.cancel();
    stop();
    unlockAudioContext();
    const gen = ++_generation;
    _sentences = sentences;
    _idx = Math.max(0, Math.min(startIdx, sentences.length - 1));
    _playing = true;
    _paused = false;
    let scheduledStartTime = 0;
    let endPromises = [];

    const MAX_SENTENCES_PER_CHUNK = 6;
    const MAX_CHARS = 600;
    try {
      await ensureAudioContextRunning();
      const ctx = _audioContext;
      if (!ctx) throw new Error('Audio context unavailable');
      scheduledStartTime = ctx.currentTime + 0.03;

      // Build deterministic chunk plan so frontend sentence highlighting matches audio.
      const plans = buildChunkPlan(_sentences, MAX_SENTENCES_PER_CHUNK, MAX_CHARS)
        .filter((x) => (x.sentenceIdxs?.[0] ?? -1) >= _idx);

      if (plans.length === 0) {
        _playing = false;
        safeCall(onDone);
        return;
      }

      endPromises = [];
      const scheduledChunkIndexes = new Set();
      const cacheVoice = _voiceId || FIXED_PIPER_VOICE_ID;
      const cacheRate = _rate;

      const scheduleChunk = (chunkIndex, audioB64) => {
        const plan = plans[chunkIndex];
        if (!plan || !audioB64 || gen !== _generation || !_playing) return;
        if (scheduledChunkIndexes.has(chunkIndex)) return;
        scheduledChunkIndexes.add(chunkIndex);
        const wav = base64ToArrayBuffer(audioB64);
        const { float32, sampleRate } = decodeWav(wav);
        if (float32.length === 0) return;

        const audioBuf = ctx.createBuffer(1, float32.length, sampleRate);
        audioBuf.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = audioBuf;
        // Backend synthesis already applies speed; keep browser playback at 1x
        // so sentence highlighting/focus timing stays aligned with spoken audio.
        source.playbackRate.value = 1;
        const gainNode = ctx.createGain();
        gainNode.gain.value = _volume;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        _currentSource = source;
        _activeSources.add(source);

        const wordCounts = plan.sentenceIdxs.map((k) => {
          const s = (_sentences[k] || '').trim();
          return s ? s.split(/\s+/).length : 0;
        });
        const totalWords = Math.max(1, wordCounts.reduce((a, b) => a + b, 0));
        const dur = audioBuf.duration;
        const startAt = Math.max(ctx.currentTime + 0.01, scheduledStartTime);
        scheduledStartTime = startAt + dur;

        safeCall(onSentenceStart, plan.sentenceIdxs[0]);
        let t = 0;
        for (let i = 0; i < plan.sentenceIdxs.length; i++) {
          const idx = plan.sentenceIdxs[i];
          const seg = Math.max(0.12, (dur * (wordCounts[i] || 0)) / totalWords);
          const endAtSec = startAt + t + seg;
          _timers.push(setTimeout(() => {
            if (gen !== _generation || !_playing) return;
            _idx = Math.max(_idx, idx + 1);
            safeCall(onSentenceEnd, idx);
          }, Math.max(0, (endAtSec - ctx.currentTime) * 1000 - 10)));
          if (i + 1 < plan.sentenceIdxs.length) {
            const nextStartSec = startAt + t + seg;
            _timers.push(setTimeout(() => {
              if (gen !== _generation || !_playing) return;
              safeCall(onSentenceStart, plan.sentenceIdxs[i + 1]);
            }, Math.max(0, (nextStartSec - ctx.currentTime) * 1000)));
          }
          t += seg;
        }

        const endPromise = new Promise((resolve, reject) => {
          source.onended = () => {
            _activeSources.delete(source);
            resolve();
          };
          source.onerror = (e) => {
            _activeSources.delete(source);
            reject(e);
          };
        });
        endPromises.push(endPromise);
        source.start(startAt);

        // Persist chunk for offline replays.
        setCachedTtsChunk(chunkCacheKey(plan.text, cacheVoice, cacheRate), audioB64).catch(() => {});
      };

      // Prime scheduler with any offline cached chunks first.
      const cachedPlanChunks = await Promise.all(
        plans.map((p) => getCachedTtsChunk(chunkCacheKey(p.text, cacheVoice, cacheRate))),
      );
      for (let i = 0; i < cachedPlanChunks.length; i++) {
        if (cachedPlanChunks[i]) scheduleChunk(i, cachedPlanChunks[i]);
      }

      let prebufferedChunks = null;
      if (prebufferedChunksPromise) {
        try {
          // Don't block page-to-page playback for long if next-page prebuffer is late.
          prebufferedChunks = await Promise.race([
            prebufferedChunksPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), 260)),
          ]);
        } catch {
          prebufferedChunks = null;
        }
      }

      if (Array.isArray(prebufferedChunks)) {
        for (let i = 0; i < prebufferedChunks.length; i++) {
          if (prebufferedChunks[i]) scheduleChunk(i, prebufferedChunks[i]);
        }
      } else if (prebufferedChunks) {
        // Backward compatibility if a single chunk string is returned.
        scheduleChunk(0, prebufferedChunks);
      }

      _streamAbortController = new AbortController();
      const r = await fetch(`${TTS_API_URL}/api/tts/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'stream',
          voice: _voiceId,
          speed: _rate,
          max_chunk_chars: MAX_CHARS,
          chunks: plans.map((x) => x.text),
        }),
        signal: _streamAbortController.signal,
      });
      if (!r.ok || !r.body) {
        const err = await r.text();
        throw new Error(err || `TTS stream failed: ${r.status}`);
      }

      const decoder = new TextDecoder();
      const reader = r.body.getReader();
      let streamBuf = '';
      while (gen === _generation && _playing) {
        const { done, value } = await reader.read();
        if (done) break;
        streamBuf += decoder.decode(value, { stream: true });
        let nl = streamBuf.indexOf('\n');
        while (nl >= 0) {
          const line = streamBuf.slice(0, nl).trim();
          streamBuf = streamBuf.slice(nl + 1);
          if (line) {
            const evt = JSON.parse(line);
            if (evt.type === 'chunk') scheduleChunk(evt.index, evt.audio_b64);
            if (evt.type === 'error') throw new Error(evt.detail || 'Stream error');
            if (evt.type === 'done') break;
          }
          nl = streamBuf.indexOf('\n');
        }
      }

      await Promise.allSettled(endPromises);
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[TTS] Backend stream failed:', e?.message || e);
      if (gen === _generation) {
        // If we already scheduled cached chunks, keep playing them to completion.
        if (endPromises.length > 0) {
          await Promise.allSettled(endPromises);
          _playing = false;
          _currentSource = null;
          clearTimers();
          safeCall(onDone);
          return;
        }
        _playing = false;
        _currentSource = null;
        clearTimers();
        safeCall(onError);
        return;
      }
    } finally {
      _streamAbortController = null;
    }

    if (gen === _generation) {
      _playing = false;
      _currentSource = null;
      clearTimers();
      safeCall(onDone);
    }
  }

  function pause() {
    _paused = true;
    _playing = false;
    clearTimers();
    if (_currentSource) {
      try { _currentSource.stop(); } catch (_) {}
      _currentSource = null;
    }
  }

  function resume() {
    if (!_paused || !_backendReady) return;
    _paused = false;
    _playing = true;
    play(_sentences, _idx);
  }

  return { setVoice, setRate, setVolume, play, pause, resume, stop, isPlaying, isPaused, currentIndex };
}

let _backendEngine = null;
function getBackendEngine() {
  if (!_backendEngine) _backendEngine = makeBackendEngine();
  return _backendEngine;
}

export const WebSpeechEngine = (() => {
  let _sentences = [], _idx = 0, _playing = false;
  let _voiceURI = '', _rate = 1.0, _volume = 1.0;
  let _generation = 0;

  function setVoice(v) { _voiceURI = v; }
  function setRate(r)  { _rate = Math.max(0.1, Math.min(10, r)); }
  function setVolume(v) { _volume = Math.max(0, Math.min(1, v)); }
  function isPlaying()  { return _playing; }
  function isPaused()   { return false; }
  function currentIndex() { return _idx; }
  const END_DELAY_MS = 220;

  function _speakNext(gen) {
    if (gen !== _generation || !_playing) return;
    if (_idx >= _sentences.length) { _playing = false; safeCall(onDone); return; }
    const text = _sentences[_idx];
    const currentIdx = _idx;
    safeCall(onSentenceStart, currentIdx);
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = _rate;
    utter.volume = _volume;
    if (_voiceURI) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === _voiceURI);
      if (match) utter.voice = match;
    }
    utter.onend = () => {
      if (gen !== _generation) return;
      setTimeout(() => {
        if (gen !== _generation || !_playing) return;
        safeCall(onSentenceEnd, currentIdx);
        _idx = currentIdx + 1;
        _speakNext(gen);
      }, END_DELAY_MS);
    };
    utter.onerror = (e) => {
      if (gen !== _generation) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      safeCall(onSentenceEnd, currentIdx);
      _idx = currentIdx + 1;
      _speakNext(gen);
    };
    window.speechSynthesis.speak(utter);
  }

  function play(sentences, startIdx = 0) {
    if (!_webSpeechSupported) { safeCall(onError); return; }
    stop();
    _generation++;
    _sentences = sentences;
    _idx = startIdx;
    _playing = true;
    setTimeout(() => _speakNext(_generation), 120);
  }

  function stop() {
    _generation++;
    _playing = false;
    if (_webSpeechSupported) window.speechSynthesis.cancel();
  }
  function pause() { stop(); }
  function resume() {}

  return { setVoice, setRate, setVolume, play, pause, resume, stop, isPlaying, isPaused, currentIndex };
})();

export function getEngine() {
  return getBackendEngine();
}
