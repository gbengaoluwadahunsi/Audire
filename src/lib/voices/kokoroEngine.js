let worker = null;
let modelReady = false;
let modelLoading = false;
let modelError = null;
const readyWaiters = [];
const errorWaiters = [];
let msgId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./kokoro.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        try { window.dispatchEvent(new CustomEvent('audire-kokoro-progress', { detail: data })); } catch {}
        return;
      }
      if (data.type === 'ready') {
        modelReady = true;
        modelLoading = false;
        modelError = null;
        try { window.dispatchEvent(new CustomEvent('audire-kokoro-ready')); } catch {}
        for (const r of readyWaiters.splice(0)) r.resolve();
        return;
      }
      if (data.type === 'load-error') {
        modelLoading = false;
        modelError = data.message;
        try { window.dispatchEvent(new CustomEvent('audire-kokoro-error', { detail: data.message })); } catch {}
        for (const r of readyWaiters.splice(0)) r.reject(new Error(data.message));
        errorWaiters.splice(0);
        return;
      }
      if (data.id !== undefined) {
        const cb = pending.get(data.id);
        if (cb) {
          pending.delete(data.id);
          if (data.type === 'error') {
            cb.reject(new Error(data.message));
          } else {
            cb.resolve({ audio: new Float32Array(data.buffer), samplingRate: data.samplingRate });
          }
        }
      }
    };
    worker.onerror = (e) => console.error('[Kokoro worker]', e.message);
  }
  return worker;
}

export function isKokoroReady() { return modelReady; }
export function isKokoroLoading() { return modelLoading; }
export function getKokoroError() { return modelError; }

export function loadKokoro() {
  if (modelReady) return Promise.resolve();
  if (modelError) return Promise.reject(new Error(modelError));
  if (!modelLoading) {
    modelLoading = true;
    getWorker().postMessage({ type: 'load' });
  }
  return new Promise((resolve, reject) => {
    readyWaiters.push({ resolve, reject });
  });
}

export async function kokoroSpeak(text, voice = 'af_heart') {
  if (!modelReady) await loadKokoro();
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'speak', id, text, voice });
  });
}
