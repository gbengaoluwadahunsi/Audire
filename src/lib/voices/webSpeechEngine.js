// Built-in browser voices (Web Speech API). Plays directly; produces no audio blob.

export function isWebSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** English voices first, then everything else. Resolves once the browser has loaded its list. */
export function getWebSpeechVoices(timeoutMs = 1500) {
  if (!isWebSpeechSupported()) return Promise.resolve([]);
  const sortVoices = (list) =>
    [...list].sort((a, b) => {
      const ae = a.lang?.startsWith('en') ? 0 : 1;
      const be = b.lang?.startsWith('en') ? 0 : 1;
      return ae - be || a.name.localeCompare(b.name);
    });
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(sortVoices(now));
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', done);
      resolve(sortVoices(window.speechSynthesis.getVoices()));
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}

/** Pick the saved voice if it still exists, else a sensible English default. */
export function resolveWebSpeechVoice(voices, voiceURI) {
  if (!voices?.length) return null;
  return (
    voices.find((v) => v.voiceURI === voiceURI) ||
    voices.find((v) => v.default && v.lang?.startsWith('en')) ||
    voices.find((v) => v.lang?.startsWith('en')) ||
    voices[0]
  );
}

/**
 * Speak one chunk. Resolves true when it finished, false if it errored or was cancelled.
 * `onWord(charIndex)` fires on word boundaries where the browser reports them.
 */
export function speakWithWebSpeech(text, { voice, rate = 1, pitch = 0, volume = 1, onStart, onWord } = {}) {
  if (!isWebSpeechSupported()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = Math.max(0.5, Math.min(rate, 2));
    // Audire stores pitch in Hz-style steps (-100..100); Web Speech wants 0..2.
    u.pitch = Math.max(0, Math.min(2, 1 + pitch / 100));
    u.volume = Math.max(0, Math.min(volume, 1));
    let started = false;
    u.onstart = () => { started = true; onStart?.(); };
    u.onboundary = (e) => { if (e.name === 'word') onWord?.(e.charIndex); };
    u.onend = () => resolve(started);
    u.onerror = (e) => resolve(e?.error === 'interrupted' || e?.error === 'canceled' ? started : false);
    window.speechSynthesis.speak(u);
  });
}

export function pauseWebSpeech() {
  if (isWebSpeechSupported()) window.speechSynthesis.pause();
}

export function resumeWebSpeech() {
  if (isWebSpeechSupported()) window.speechSynthesis.resume();
}

export function cancelWebSpeech() {
  if (isWebSpeechSupported()) window.speechSynthesis.cancel();
}

export function isWebSpeechSpeaking() {
  return isWebSpeechSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
}
