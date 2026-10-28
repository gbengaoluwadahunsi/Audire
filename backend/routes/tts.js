import { Router } from 'express';
import { EdgeTTS } from 'node-edge-tts';
import drm from 'node-edge-tts/dist/drm.js';
import WebSocket from 'ws';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const router = Router();
const VOICE_DEFAULT = 'en-US-AvaMultilingualNeural';

// node-edge-tts 1.2.12 connects to api.msedgeservices.com, which now answers the
// WebSocket upgrade with a plain 200. The original speech.platform.bing.com
// endpoint still handshakes when given the v2 Sec-MS-GEC token, so connect there.
class BingEdgeTTS extends EdgeTTS {
  _connectWebSocket() {
    const major = drm.CHROMIUM_FULL_VERSION.split('.')[0];
    const url =
      'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
      `?TrustedClientToken=${drm.TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${drm.generateSecMsGecToken_V2()}` +
      `&Sec-MS-GEC-Version=${drm.SEC_MS_GEC_VERSION_V2}`;
    const ws = new WebSocket(url, {
      origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Timed out while connecting to Edge TTS'));
      }, this.timeout);
      ws.once('open', () => { clearTimeout(timer); resolve(ws); });
      ws.once('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }
}

function toEdgeRate(rate) {
  const r = Number.isFinite(rate) ? Math.max(0.5, Math.min(rate, 3)) : 1;
  if (r === 1) return 'default';
  const pct = Math.round((r - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function toEdgePitch(pitch) {
  const p = Number.isFinite(pitch) ? Math.max(-100, Math.min(pitch, 100)) : 0;
  if (p === 0) return 'default';
  return `${p >= 0 ? '+' : ''}${p}Hz`;
}

/**
 * Attach each spoken word's position in `text`, so the client can highlight it.
 * Edge reports words in order, so a forward-only search is enough.
 */
export function locateWords(text, boundaries) {
  let cursor = 0;
  const out = [];
  for (const b of boundaries) {
    const word = b.part || '';
    if (!word) continue;
    const at = text.indexOf(word, cursor);
    if (at === -1) continue;
    out.push({ text: word, offset: at, start: b.start, end: b.end });
    cursor = at + word.length;
  }
  return out;
}

/** Audio + word timings as JSON. Used when the client asks for `words: true`. */
async function synthesizeWithWords(engine, text) {
  const audio = [];
  const boundaries = [];
  for await (const chunk of engine.streamAudio(text)) {
    if (Buffer.isBuffer(chunk)) audio.push(chunk);
    else boundaries.push(chunk);
  }
  return { audio: Buffer.concat(audio), words: locateWords(text, boundaries) };
}

router.post('/', async (req, res) => {
  const { text, voice, rate, pitch, words } = req.body || {};
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
      const engine = new BingEdgeTTS({
        voice: chosenVoice,
        outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
        rate: toEdgeRate(typeof rate === 'number' ? rate : 1),
        pitch: toEdgePitch(typeof pitch === 'number' ? pitch : 0),
        timeout: 30000,
        // Word boundaries are only sent by Edge when subtitles are requested.
        saveSubtitles: words === true,
      });

      if (words === true) {
        const result = await synthesizeWithWords(engine, trimmed);
        if (result.audio.length < 100) throw new Error('Empty audio');
        res.set('Cache-Control', 'no-store');
        return res.json({ audio: result.audio.toString('base64'), words: result.words });
      }

      await engine.ttsPromise(trimmed, outPath);
      const stat = await fs.stat(outPath);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      });
      const { createReadStream } = await import('fs');
      const stream = createReadStream(outPath);
      stream.on('end', () => fs.unlink(outPath).catch(() => {}));
      stream.on('error', () => fs.unlink(outPath).catch(() => {}));
      return stream.pipe(res);
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
