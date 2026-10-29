// Built-in browser voices (Web Speech API), filtered down to the natural-sounding ones.

export function isWebSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

// macOS/iOS novelty voices: technically English, never what a reader wants.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

/**
 * 3 = natural/neural or premium, 2 = enhanced or a cloud voice, 1 = basic robotic voice.
 * Browsers don't expose quality directly, so this reads the naming conventions:
 * Edge "Online (Natural)", Apple "(Premium)"/"(Enhanced)", Chrome's "Google ..." voices.
 */
export function voiceQuality(v) {
  const name = v?.name || '';
  if (/\b(Natural|Neural)\b/i.test(name) || /\(Premium\)/i.test(name)) return 3;
  if (/\(Enhanced\)/i.test(name) || /^Google\b/.test(name) || v?.localService === false) return 2;
  return 1;
}

// Edge 150 sometimes reports natural voices as "Microsoft undefined Online (Natural) - undefined";
// speaking with one of those silently falls back to Microsoft David.
function isUsable(v) {
  return !!v?.name && !!v?.lang && !/undefined/i.test(v.name) && !NOVELTY.test(v.name);
}

function preferredLang() {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}

function sortVoices(list) {
  const pref = preferredLang().split('-')[0];
  const langRank = (v) => (v.lang?.startsWith(pref) ? 0 : v.lang?.startsWith('en') ? 1 : 2);
  return [...list].sort((a, b) =>
    voiceQuality(b) - voiceQuality(a) || langRank(a) - langRank(b) || a.name.localeCompare(b.name));
}

function readVoices() {
  return sortVoices(window.speechSynthesis.getVoices().filter(isUsable));
}

/** All usable voices, best first. Waits for the browser to load its list (it loads lazily). */
export function getWebSpeechVoices(timeoutMs = 2000) {
  if (!isWebSpeechSupported()) return Promise.resolve([]);
  const now = readVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', done);
      clearTimeout(timer);
      resolve(readVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    window.speechSynthesis.addEventListener?.('voiceschanged', done);
  });
}

/** Call `fn(voices)` whenever the browser's voice list changes (e.g. Edge finishing its online list). */
export function onVoicesChanged(fn) {
  if (!isWebSpeechSupported()) return () => {};
  const handler = () => fn(readVoices());
  window.speechSynthesis.addEventListener?.('voiceschanged', handler);
  return () => window.speechSynthesis.removeEventListener?.('voiceschanged', handler);
}

/** The natural/enhanced voices only. Empty when the device has none. */
export function naturalVoices(voices) {
  return voices.filter((v) => voiceQuality(v) >= 2);
}

/**
 * The saved voice if it still exists; otherwise Ava Online (Natural), then the best
 * voice in the reader's language, then the best English voice.
 */
export function resolveWebSpeechVoice(voices, voiceURI) {
  if (!voices?.length) return null;
  const saved = voiceURI && voices.find((v) => v.voiceURI === voiceURI);
  if (saved) return saved;
  const ava =
    voices.find((v) => /\bAva Online \(Natural\)/i.test(v.name) && v.lang?.startsWith('en')) ||
    voices.find((v) => /\bAva\b/.test(v.name) && voiceQuality(v) >= 2 && v.lang?.startsWith('en'));
  if (ava) return ava;
  const pref = preferredLang().split('-')[0];
  return voices.find((v) => v.lang?.startsWith(pref)) || voices.find((v) => v.lang?.startsWith('en')) || voices[0];
}

// Chrome's cloud voices go silent partway through utterances longer than ~15s (~200+ chars).
const MAX_PART = 220;

/**
 * Split a sentence into parts short enough to speak reliably, breaking at clause
 * punctuation so the intonation still sounds natural. Each part keeps its offset in
 * the original text so word highlighting stays aligned.
 */
export function splitForSpeech(text, max = MAX_PART) {
  const parts = [];
  let pos = 0;
  while (pos < text.length) {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length) break;
    if (text.length - pos <= max) {
      parts.push({ text: text.slice(pos).trimEnd(), offset: pos });
      break;
    }
    const span = text.slice(pos, pos + max);
    let cut = -1;
    for (const re of [/[,;:—–)](?=\s)/g, /\s/g]) {
      let m;
      while ((m = re.exec(span)) !== null) {
        if (m.index >= max * 0.4) cut = m.index + 1;
      }
      if (cut > 0) break;
    }
    if (cut <= 0) cut = max;
    parts.push({ text: text.slice(pos, pos + cut).trim(), offset: pos });
    pos += cut;
  }
  return parts.filter((p) => p.text);
}

// Chrome can garbage-collect an utterance mid-speech, and then `onend` never fires.
// Holding a reference until it finishes prevents that.
const live = new Set();

/**
 * Speak one short piece of text. Resolves 'ended', 'interrupted' (cancelled by us) or 'error'.
 * A watchdog resolves the promise if the browser stops speaking without firing an event.
 */
export function speakWithWebSpeech(text, { voice, rate = 1, volume = 1, onStart, onWord } = {}) {
  if (!isWebSpeechSupported()) return Promise.resolve('error');
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = Math.max(0.5, Math.min(rate, 2));
    u.pitch = 1; // Changing pitch is what makes these voices sound synthetic.
    u.volume = Math.max(0, Math.min(volume, 1));

    let started = false;
    let settled = false;
    let quietSince = 0;
    const begun = Date.now();
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      live.delete(u);
      resolve(result);
    };
    const watchdog = setInterval(() => {
      if (!started) {
        // Online voices need a moment to connect; give up if nothing starts at all.
        if (Date.now() - begun > 15000) finish('error');
        return;
      }
      if (synth.speaking || synth.pending) { quietSince = 0; return; }
      quietSince = quietSince || Date.now();
      if (Date.now() - quietSince > 1500) finish('ended');
    }, 500);

    u.onstart = () => { started = true; onStart?.(); };
    u.onboundary = (e) => { if (e.name === 'word') onWord?.(e.charIndex); };
    u.onend = () => finish('ended');
    u.onerror = (e) => finish(e?.error === 'interrupted' || e?.error === 'canceled' ? 'interrupted' : 'error');

    live.add(u);
    synth.speak(u);
  });
}

export function cancelWebSpeech() {
  if (isWebSpeechSupported()) window.speechSynthesis.cancel();
}

export function isWebSpeechSpeaking() {
  return isWebSpeechSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
}
