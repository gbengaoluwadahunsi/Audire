// Runs Kokoro in a worker so synthesis never blocks the reader UI.
import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsPromise = null;

function load() {
  if (!ttsPromise) {
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
        }
      },
    }).catch((err) => {
      ttsPromise = null;
      throw err;
    });
  }
  return ttsPromise;
}

self.onmessage = async (e) => {
  const { id, type, text, voice, speed } = e.data || {};
  try {
    if (type === 'load') {
      const tts = await load();
      // Fetch (and cache) the chosen voice's style file now, so it is there offline.
      if (voice) await tts.generate('Ready.', { voice });
      self.postMessage({ id, type: 'loaded' });
    } else if (type === 'generate') {
      const tts = await load();
      const audio = await tts.generate(text, { voice, speed });
      const blob = audio.toBlob();
      self.postMessage({ id, type: 'audio', blob });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
};
