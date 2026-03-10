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
const LOG_PATH = path.join(__dirname, '../../debug-4110de.log');

function dbg(msg, data) {
  const line = JSON.stringify({ sessionId: '4110de', location: 'tts.js', message: msg, data: data || {}, timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync(LOG_PATH, line); } catch (_) {}
}

const router = express.Router();
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let kokoroInstance = null;
let kokoroLoadPromise = null;

async function loadKokoro() {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoadPromise) return kokoroLoadPromise;
  kokoroLoadPromise = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    kokoroInstance = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: 'q8',
      device: 'cpu', // Native ONNX Runtime - much faster than browser WASM
    });
    return kokoroInstance;
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

router.post('/', async (req, res) => {
  const ts = () => new Date().toISOString();
  try {
    dbg('request received', {});
    console.log(`[TTS ${ts()}] Request received`);
    const { text, voice = 'af_heart', speed = 1.0 } = req.body || {};
    const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    console.log(`[TTS ${ts()}] text length=${clean.length}, voice=${voice}, speed=${speed}, preview="${clean.slice(0, 50)}..."`);
    if (!clean || clean.length < 3) {
      console.log(`[TTS ${ts()}] Rejected: text too short`);
      return res.status(400).json({ error: 'text required (min 3 chars)' });
    }
    if (clean.length > 2000) {
      console.log(`[TTS ${ts()}] Rejected: text too long`);
      return res.status(400).json({ error: 'text too long (max 2000 chars)' });
    }

    const MAX_CHARS = 200;
    const textToSpeak = clean.length > MAX_CHARS ? clean.slice(0, MAX_CHARS) : clean;
    if (textToSpeak.length < clean.length) {
      console.log(`[TTS ${ts()}] Truncated ${clean.length} -> ${textToSpeak.length} chars (model limit ~500 tokens)`);
    }

    console.log(`[TTS ${ts()}] Loading Kokoro model...`);
    const tts = await loadKokoro();
    console.log(`[TTS ${ts()}] Model ready, generating speech...`);
    const audio = await tts.generate(textToSpeak, { voice, speed });
    let wav;
    if (typeof audio?.save === 'function') {
      const tmpPath = path.join(os.tmpdir(), `tts-${Date.now()}.wav`);
      try {
        await audio.save(tmpPath);
        wav = fs.readFileSync(tmpPath);
        fs.unlinkSync(tmpPath);
      } catch (saveErr) {
        console.error(`[TTS ${ts()}] audio.save failed:`, saveErr);
        throw saveErr;
      }
    } else {
      let samples = audio?.data ?? audio;
      if (samples?.data) samples = samples.data;
      if (Array.isArray(samples)) samples = new Float32Array(samples);
      else if (!(samples instanceof Float32Array)) samples = new Float32Array(samples || []);
      const sampleRate = audio?.sampling_rate ?? 24000;
      console.log(`[TTS ${ts()}] Generated: ${samples.length} samples, ${sampleRate}Hz`);
      if (samples.length === 0) {
        console.warn(`[TTS ${ts()}] Empty audio - raw audio keys:`, audio ? Object.keys(audio) : 'null');
      }
      wav = float32ToWavBuffer(samples, sampleRate);
    }
    dbg('wav ready', { wavSize: wav.length });
    console.log(`[TTS ${ts()}] WAV size=${wav.length} bytes, sending response`);
    if (wav.length <= 44) {
      console.warn(`[TTS ${ts()}] WAV is header-only (no audio data) - generation may have failed`);
    }

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wav.length,
    });
    res.send(wav);
    console.log(`[TTS ${ts()}] Response sent OK`);
  } catch (e) {
    dbg('error', { err: String(e?.message || e) });
    console.error(`[TTS ${ts()}] Error:`, e);
    res.status(500).json({ error: e.message || 'TTS failed' });
  }
});

export default router;
