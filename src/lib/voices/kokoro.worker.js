import { KokoroTTS } from 'kokoro-js';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let tts = null;
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || !tts) return;
  processing = true;
  while (queue.length > 0) {
    const item = queue.shift();
    try {
      const out = await tts.generate(item.text, { voice: item.voice || 'af_heart' });
      const src = out.audio;
      const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
      self.postMessage(
        { type: 'audio', id: item.id, buffer: buf, samplingRate: out.sampling_rate },
        [buf],
      );
    } catch (err) {
      self.postMessage({ type: 'error', id: item.id, message: err.message });
    }
  }
  processing = false;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    if (tts) { self.postMessage({ type: 'ready' }); return; }
    const shared = {
      dtype: 'q8',
      progress_callback: ({ status, loaded, total, file }) => {
        if (status === 'progress') self.postMessage({ type: 'progress', loaded, total, file });
      },
    };
    try {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { ...shared, device: 'webgpu' });
    } catch {
      try {
        tts = await KokoroTTS.from_pretrained(MODEL_ID, { ...shared, device: 'wasm' });
      } catch (err) {
        self.postMessage({ type: 'load-error', message: err.message });
        return;
      }
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
