/**
 * Kokoro TTS backend - faster than browser WASM (uses native CPU)
 * POST /api/tts with { text, voice?, speed? } -> WAV audio
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = express.Router();
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let kokoroInstance = null;

/** GET /api/tts/health - Check if Kokoro TTS is available */
router.get('/health', (_req, res) => {
  res.json({ ok: true, engine: 'kokoro' });
});

/** GET /api/tts/warmup - Preload Kokoro model so first play is fast */
router.get('/warmup', async (_req, res) => {
  try {
    await loadKokoro();
    res.json({ ok: true, warmed: true });
  } catch (e) {
    console.error('[TTS] Warmup failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Start loading Kokoro in background (call on server startup) */
export function preloadKokoro() {
  loadKokoro().then(() => console.log('[TTS] Kokoro preloaded')).catch((e) => console.warn('[TTS] Kokoro preload failed:', e?.message));
}
let kokoroLoadPromise = null;

async function loadKokoro() {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoadPromise) return kokoroLoadPromise;
  kokoroLoadPromise = (async () => {
    try {
      const { KokoroTTS } = await import('kokoro-js');
      kokoroInstance = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
        dtype: 'q4', // Downgraded to 4-bit for 2x faster CPU generation
        device: 'cpu',
      });
      console.log('[TTS] Kokoro model loaded successfully');
      return kokoroInstance;
    } catch (err) {
      kokoroLoadPromise = null;
      console.error('[TTS] Kokoro load failed:', err);
      throw new Error(`Kokoro failed to load: ${err.message}. Ensure Node.js has internet access for model download.`);
    }
  })();
  return kokoroLoadPromise;
}

function float32ToWavBuffer(float32Data, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = float32Data.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < float32Data.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Data[i]));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2);
  }
  return buffer;
}

let activeGenerations = 0;
const MAX_CONCURRENT = 2;
const queue = [];

async function processQueue() {
  if (activeGenerations >= MAX_CONCURRENT || queue.length === 0) return;
  activeGenerations++;
  const { req, res, ts } = queue.shift();

  try {
    const { text, voice = 'af_heart', speed = 1.0 } = req.body || {};
    const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';

    if (!clean) {
      res.status(400).json({ error: 'Text is required' });
      activeGenerations--;
      processQueue();
      return;
    }
    
    const MAX_CHARS = 1000;
    const textToSpeak = clean.length > MAX_CHARS ? clean.slice(0, MAX_CHARS) : clean;

    console.log(`[TTS ${ts()}] Processing: "${textToSpeak.slice(0, 30)}..."`);
    const tts = await loadKokoro();
    const audio = await tts.generate(textToSpeak, { voice, speed });
    
    let wav;
    // Prefer direct Float32 extraction over temp file I/O
    const rawAudio = typeof audio?.toRawAudio === 'function' ? await audio.toRawAudio() : null;
    if (rawAudio) {
      const samples = rawAudio instanceof Float32Array ? rawAudio : new Float32Array(rawAudio);
      const sampleRate = audio?.sampling_rate ?? 24000;
      wav = float32ToWavBuffer(samples, sampleRate);
    } else if (typeof audio?.save === 'function') {
      const tmpPath = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
      await audio.save(tmpPath);
      wav = fs.readFileSync(tmpPath);
      fs.unlinkSync(tmpPath);
    } else {
      let samples = audio?.data ?? audio;
      if (samples?.data) samples = samples.data;
      if (Array.isArray(samples)) samples = new Float32Array(samples);
      else if (!(samples instanceof Float32Array)) samples = new Float32Array(samples || []);
      const sampleRate = audio?.sampling_rate ?? 24000;
      wav = float32ToWavBuffer(samples, sampleRate);
    }

    res.set({ 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
    res.send(wav);
    console.log(`[TTS ${ts()}] Done (${textToSpeak.length} chars)`);
  } catch (e) {
    console.error(`[TTS ${ts()}] Queue error:`, e);
    res.status(500).json({ error: e.message || 'TTS failed' });
  } finally {
    activeGenerations--;
    processQueue();
  }
}

const MAX_QUEUE = 20;

router.post('/', async (req, res) => {
  if (queue.length >= MAX_QUEUE) {
    return res.status(429).json({ error: 'TTS queue full. Try again shortly.' });
  }
  const ts = () => new Date().toISOString();
  queue.push({ req, res, ts });
  processQueue();
  // Kick off a second concurrent slot if available
  processQueue();
});

export default router;
