// Client side of the Kokoro worker: download state, synthesis queue, removal.

export const KOKORO_DOWNLOAD_MB = 115; // q8 model (~92 MB) + ONNX runtime (~21 MB) + one voice

export const KOKORO_VOICES = [
  { id: 'af_heart', name: 'Heart (US Female)', grade: 'A' },
  { id: 'af_bella', name: 'Bella (US Female)', grade: 'A-' },
  { id: 'af_nicole', name: 'Nicole (US Female)', grade: 'B-' },
  { id: 'am_michael', name: 'Michael (US Male)', grade: 'C+' },
  { id: 'am_fenrir', name: 'Fenrir (US Male)', grade: 'C+' },
  { id: 'am_puck', name: 'Puck (US Male)', grade: 'C+' },
  { id: 'bf_emma', name: 'Emma (British Female)', grade: 'B-' },
  { id: 'bf_isabella', name: 'Isabella (British Female)', grade: 'C' },
  { id: 'bm_george', name: 'George (British Male)', grade: 'C' },
  { id: 'bm_fable', name: 'Fable (British Male)', grade: 'C' },
];

const MODEL_CACHE = 'transformers-cache';
const VOICE_CACHE = 'kokoro-voices';
const MODEL_MARKER = 'Kokoro-82M';

let worker = null;
let nextId = 1;
const pending = new Map();
let status = 'unknown'; // unknown | not-downloaded | downloading | ready | unavailable
let unavailableReason = '';
let loaded = false;
let progressListener = null;
const fileProgress = new Map();
const listeners = new Set();

function setStatus(next, reason = '') {
  status = next;
  unavailableReason = reason;
  for (const fn of listeners) fn(getKokoroStatus());
}

export function onKokoroStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getKokoroStatus() {
  return { status, reason: unavailableReason };
}

/** Why this device can't run Kokoro, or '' if it can. */
export function kokoroUnsupportedReason() {
  if (typeof window === 'undefined') return 'Not available here.';
  if (typeof WebAssembly !== 'object') return 'This browser does not support WebAssembly.';
  if (typeof Worker !== 'function') return 'This browser does not support background workers.';
  if (!('caches' in window)) return 'This browser cannot store the voice files.';
  const mem = navigator.deviceMemory;
  if (typeof mem === 'number' && mem < 2) return 'This device does not have enough memory.';
  return '';
}

/** Check Cache Storage for the model, without loading it. */
export async function refreshKokoroStatus() {
  const reason = kokoroUnsupportedReason();
  if (reason) {
    setStatus('unavailable', reason);
    return getKokoroStatus();
  }
  if (status === 'downloading') return getKokoroStatus();
  try {
    const cache = await caches.open(MODEL_CACHE);
    const keys = await cache.keys();
    const hasModel = keys.some((r) => r.url.includes(MODEL_MARKER) && r.url.endsWith('.onnx'));
    setStatus(hasModel ? 'ready' : 'not-downloaded');
  } catch {
    setStatus('not-downloaded');
  }
  return getKokoroStatus();
}

export function isKokoroReady() {
  return status === 'ready';
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./kokoro.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'progress') {
      fileProgress.set(msg.file, { loaded: msg.loaded, total: msg.total });
      let loadedBytes = 0;
      let totalBytes = 0;
      for (const p of fileProgress.values()) {
        loadedBytes += p.loaded;
        totalBytes += p.total;
      }
      progressListener?.(totalBytes ? loadedBytes / totalBytes : 0);
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.type === 'error') entry.reject(new Error(msg.message));
    else entry.resolve(msg);
  };
  worker.onerror = (e) => {
    for (const entry of pending.values()) entry.reject(new Error(e.message || 'Kokoro worker failed'));
    pending.clear();
    terminate();
  };
  return worker;
}

function call(message) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id });
  });
}

function terminate() {
  worker?.terminate();
  worker = null;
  loaded = false;
  for (const entry of pending.values()) entry.reject(new Error('Kokoro stopped'));
  pending.clear();
}

/** Download (or load from cache) the model and a voice. `onProgress(0..1)`. */
export async function downloadKokoro(voice = 'af_heart', onProgress) {
  const reason = kokoroUnsupportedReason();
  if (reason) {
    setStatus('unavailable', reason);
    throw new Error(reason);
  }
  setStatus('downloading');
  fileProgress.clear();
  progressListener = onProgress || null;
  try {
    await call({ type: 'load', voice });
    loaded = true;
    setStatus('ready');
  } catch (err) {
    setStatus('not-downloaded');
    throw err;
  } finally {
    progressListener = null;
  }
}

export function cancelKokoroDownload() {
  if (status !== 'downloading') return;
  terminate();
  setStatus('not-downloaded');
}

/** Delete the downloaded model and voices from this device. */
export async function removeKokoro() {
  terminate();
  try {
    const cache = await caches.open(MODEL_CACHE);
    for (const req of await cache.keys()) {
      if (req.url.includes(MODEL_MARKER)) await cache.delete(req);
    }
    await caches.delete(VOICE_CACHE);
    // The service worker keeps the ONNX runtime (~21 MB) for offline use; free that too.
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        if (req.url.includes('/assets/ort-wasm')) await c.delete(req);
      }
    }
  } catch {
    /* nothing to remove */
  }
  setStatus('not-downloaded');
}

/** Synthesize one chunk to a WAV blob. Only call when ready. */
export async function synthesizeKokoro(text, voice = 'af_heart', speed = 1) {
  if (!isKokoroReady()) throw new Error('Kokoro is not downloaded');
  if (!loaded) {
    await call({ type: 'load' });
    loaded = true;
  }
  const res = await call({ type: 'generate', text, voice, speed: Math.max(0.5, Math.min(speed, 2)) });
  return res.blob;
}
