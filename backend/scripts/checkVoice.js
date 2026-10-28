// Checks that read-aloud still works. Exits 1 on failure so CI can alert.
//   node scripts/checkVoice.js            → synthesize directly with node-edge-tts
//   AUDIRE_API_URL=https://… node …       → call the deployed /api/tts endpoint instead
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const SENTENCE = 'Audire voice check. If you can hear this, reading aloud works.';
const MIN_BYTES = 2000;

async function checkLibrary() {
  // Imported here so checking the deployed backend needs no npm install.
  const { EdgeTTS } = await import('node-edge-tts');
  const out = path.join(os.tmpdir(), `voice-check-${Date.now()}.mp3`);
  const engine = new EdgeTTS({ voice: 'en-US-AvaMultilingualNeural', timeout: 30000 });
  await engine.ttsPromise(SENTENCE, out);
  const { size } = await fs.stat(out);
  await fs.unlink(out).catch(() => {});
  return size;
}

async function checkDeployed(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tts`;
  // A sleeping free-tier server can take a minute to wake, so allow a few tries.
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SENTENCE }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.arrayBuffer()).byteLength;
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
  throw lastError;
}

const target = process.env.AUDIRE_API_URL;
try {
  const size = target ? await checkDeployed(target) : await checkLibrary();
  if (size < MIN_BYTES) throw new Error(`Audio too small (${size} bytes)`);
  console.log(`OK: ${target ? 'deployed backend' : 'node-edge-tts'} returned ${size} bytes of audio`);
} catch (err) {
  console.error(`FAILED: ${target ? 'deployed backend' : 'node-edge-tts'} could not synthesize speech: ${err.message}`);
  process.exit(1);
}
