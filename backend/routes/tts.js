import { Router } from 'express';
import { EdgeTTS } from 'node-edge-tts';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const router = Router();
const VOICE_DEFAULT = 'en-US-AvaMultilingualNeural';

function toEdgeRate(rate) {
  const r = Number.isFinite(rate) ? Math.max(0.5, Math.min(rate, 3)) : 1;
  if (r === 1) return 'default';
  const pct = Math.round((r - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

router.post('/', async (req, res) => {
  const { text, voice, rate } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  const trimmed = text.trim().slice(0, 5000);
  const chosenVoice = (voice && typeof voice === 'string') ? voice : VOICE_DEFAULT;
  const tmpName = `tts-${crypto.randomUUID()}.mp3`;
  const outPath = path.join(os.tmpdir(), tmpName);

  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount < maxRetries) {
    try {
      const engine = new EdgeTTS({
        voice: chosenVoice,
        outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
        rate: toEdgeRate(typeof rate === 'number' ? rate : 1),
        timeout: 30000,
        saveSubtitles: false,
      });

      await engine.ttsPromise(trimmed, outPath);
      const mp3 = await fs.readFile(outPath);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(mp3.length),
        'Cache-Control': 'no-store',
      });
      return res.send(mp3);
    } catch (err) {
      retryCount++;
      const message = err?.message || String(err);
      
      // If this is the last retry or not a timeout, return error
      if (retryCount >= maxRetries || !message.includes('Timed out')) {
        console.error(`[TTS] Edge synthesis error (attempt ${retryCount}/${maxRetries}):`, message);
        return res.status(502).json({ error: 'TTS generation failed: ' + message });
      }
      
      // Log timeout but retry
      console.warn(`[TTS] Timeout on attempt ${retryCount}/${maxRetries}, retrying...`);
      
      // Clean up temp file before retry
      await fs.unlink(outPath).catch(() => {});
    }
  }

  // Final cleanup
  await fs.unlink(outPath).catch(() => {});
});

export default router;
