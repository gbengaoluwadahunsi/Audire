import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// WASM + q8 is the combination kokoro-js documents and tests. WebGPU creates a
// session with q8 but then fails at inference, and the fp32 weights WebGPU would
// need are ~328 MB instead of ~82 MB.
const DEVICE = 'wasm';
const DTYPE = 'q8';

let tts = null;
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || !tts) return;
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift();
    try {
      const out = await tts.generate(item.text, {
        voice: item.voice || 'af_heart',
        speed: item.speed || 1,
      });
      const src = out.audio;
      const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
      self.postMessage(
        { type: 'audio', id: item.id, buffer: buf, samplingRate: out.sampling_rate },
        [buf],
      );
    } catch (err) {
      self.postMessage({ type: 'error', id: item.id, message: err?.message || String(err) });
    }
  }
  processing = false;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    if (tts) { self.postMessage({ type: 'ready' }); return; }
    try {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: DTYPE,
        device: DEVICE,
        progress_callback: ({ status, loaded, total, file }) => {
          if (status === 'progress') self.postMessage({ type: 'progress', loaded, total, file });
        },
      });
    } catch (err) {
      self.postMessage({ type: 'load-error', message: err?.message || String(err) });
      return;
    }
    self.postMessage({ type: 'ready' });
    processQueue();
    return;
  }

  if (data.type === 'speak') {
    queue.push(data);
    processQueue();
  }
};
