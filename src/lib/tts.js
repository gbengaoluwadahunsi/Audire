/**
 * TTS engine: Web Speech API (browser built-in, no download required)
 */

let onSentenceStart = null;
let onSentenceEnd   = null;
let onDone          = null;
let onError         = null;
let onModelProgress = null;

export function setCallbacks({ start, end, done, error, modelProgress }) {
  onSentenceStart = start ?? null;
  onSentenceEnd   = end ?? null;
  onDone          = done ?? null;
  onError         = error ?? null;
  onModelProgress = modelProgress ?? null;
}

const _supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function isKokoroReady()   { return _supported; }
export function isKokoroFailed()  { return !_supported; }
export function isKokoroLoading() { return false; }

export function preloadModel() {
  if (_supported) {
    onModelProgress?.({ status: 'ready', progress: 100, message: 'Voice ready!' });
  } else {
    onModelProgress?.({ status: 'failed', message: 'Speech synthesis is not supported by this browser.' });
  }
}

export function getBrowserVoices() {
  if (!_supported) return [];
  return window.speechSynthesis.getVoices();
}

/** Prefer a free, natural-sounding voice when available (e.g. Microsoft Aria, Google, Apple). */
export function getPreferredNaturalVoice(voices = []) {
  const list = voices.length ? voices : (_supported ? window.speechSynthesis.getVoices() : []);
  if (!list.length) return null;
  const naturalKeywords = /natural|neural|aria|jenny|samantha|daniel|google|premium|online|zira|david|mark|susan|karen/i;
  const preferred = list.find((v) => naturalKeywords.test(v.name));
  if (preferred) return preferred;
  const en = list.find((v) => v.lang.startsWith('en'));
  return en || list[0];
}

/** Sorted list: natural/preferred voices first, then by name. */
export function getBrowserVoicesSorted(voices = []) {
  const list = voices.length ? voices : getBrowserVoices();
  const preferred = getPreferredNaturalVoice(list);
  const preferredURI = preferred?.voiceURI;
  return [...list].sort((a, b) => {
    const aPrefer = a.voiceURI === preferredURI ? 1 : 0;
    const bPrefer = b.voiceURI === preferredURI ? 1 : 0;
    if (bPrefer !== aPrefer) return bPrefer - aPrefer; // preferred first
    return (a.name || '').localeCompare(b.name || '');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEB SPEECH ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export const WebSpeechEngine = (() => {
  let _sentences = [], _idx = 0, _playing = false;
  let _voiceURI = '', _rate = 1.0, _volume = 1.0;
  let _generation = 0;

  function setVoice(v) { _voiceURI = v; }
  function setRate(r)  { _rate = Math.max(0.1, Math.min(10, r)); }
  function setVolume(v) { _volume = Math.max(0, Math.min(1, v)); }
  function isPlaying()    { return _playing; }
  function isPaused()     { return false; }
  function currentIndex() { return _idx; }

  // Delay so highlight doesn't jump to next sentence before the voice actually finishes (browsers often fire onend early)
  const END_DELAY_MS = 220;

  function _speakNext(gen) {
    if (gen !== _generation || !_playing) return;

    if (_idx >= _sentences.length) {
      _playing = false;
      onDone?.();
      return;
    }

    const text = _sentences[_idx];
    const currentIdx = _idx;

    // Highlight this sentence as soon as we're about to speak it (keeps text in sync with voice)
    onSentenceStart?.(currentIdx);

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = _rate;
    utter.volume = _volume;

    if (_voiceURI) {
      const match = window.speechSynthesis.getVoices().find((v) => v.voiceURI === _voiceURI);
      if (match) utter.voice = match;
    }

    utter.onend = () => {
      if (gen !== _generation) return;
      // Delay advancing so the highlight doesn't move ahead of the voice (browser can fire onend early)
      setTimeout(() => {
        if (gen !== _generation || !_playing) return;
        onSentenceEnd?.(currentIdx);
        _idx = currentIdx + 1;
        _speakNext(gen);
      }, END_DELAY_MS);
    };

    utter.onerror = (e) => {
      if (gen !== _generation) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      console.error('[TTS] Speech error:', e.error);
      onSentenceEnd?.(currentIdx);
      _idx = currentIdx + 1;
      _speakNext(gen);
    };

    window.speechSynthesis.speak(utter);
  }

  function play(sentences, startIdx = 0) {
    if (!_supported) {
      console.warn('[TTS] Web Speech not supported');
      onError?.();
      return;
    }
    stop();
    const gen = ++_generation;
    _sentences = sentences;
    _idx = startIdx;
    _playing = true;
    _speakNext(gen);
  }

  function stop() {
    ++_generation;
    _playing = false;
    if (_supported) window.speechSynthesis.cancel();
  }

  function pause() { stop(); }
  function resume() {}

  return { setVoice, setRate, setVolume, play, pause, resume, stop, isPlaying, isPaused, currentIndex };
})();

export function getEngine() {
  return WebSpeechEngine;
}
