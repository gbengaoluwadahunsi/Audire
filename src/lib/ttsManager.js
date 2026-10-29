// TTS Manager: reads text aloud with the device's built-in voices (Web Speech API),
// preferring the natural/neural ones (e.g. Edge's "Ava Online (Natural)").
//
// Pause is implemented as cancel + replay of the current sentence part on resume.
// Real speechSynthesis.pause() is unreliable: Chrome can go permanently silent after
// ~15s paused, and Android ignores pause() entirely.
import {
  cancelWebSpeech,
  getWebSpeechVoices,
  isWebSpeechSpeaking,
  isWebSpeechSupported,
  naturalVoices,
  onVoicesChanged,
  resolveWebSpeechVoice,
  speakWithWebSpeech,
  splitForSpeech,
} from './voices/webSpeechEngine';

const SPEAKABLE = /[\p{L}\p{N}]/u;
const MAX_ATTEMPTS = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Character offset → word at that position. */
export function wordAt(text, charIndex) {
  const m = text.slice(charIndex).match(/^[^\s]+/);
  return m ? { offset: charIndex, text: m[0] } : null;
}

export class TTSManager {
  constructor() {
    this.webSpeechVoice = ''; // voiceURI; empty = best natural voice available
    this.speed = 1.0;
    this.volume = 1.0;
    this.isPaused = false;
    this._stopped = false;
    this._speaking = false;
    this._sessionActive = false;
    this._abortedOnFailure = false;
    this.wantWordTimings = false;
    this.onWordBoundary = null;
    this.currentSessionId = null;
    this.isLoaded = true;
    this.isLoading = false;
    this._voices = [];
    this.status = { engine: 'web-speech', engineLabel: 'Device', voice: '', isBackup: false, reason: '' };

    if (typeof window !== 'undefined') {
      getWebSpeechVoices().then((v) => { this._voices = v; }).catch(() => {});
      onVoicesChanged((v) => { if (v.length) this._voices = v; });
    }
  }

  /** The voice that will actually be used: from the natural voices whenever the device has any. */
  get voice() {
    const natural = naturalVoices(this._voices);
    return resolveWebSpeechVoice(natural.length ? natural : this._voices, this.webSpeechVoice);
  }

  async _ensureVoices() {
    if (!this._voices.length) this._voices = await getWebSpeechVoices();
    return this._voices;
  }

  _alive(sessionId) {
    return !this._stopped && !(sessionId && this.currentSessionId !== sessionId);
  }

  _dispatch(name, detail) {
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
      }
    } catch {
      /* ignore */
    }
  }

  // ─── Media session ───────────────────────────────────────────────────────

  _setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      this.resume();
      this._dispatch('audire-tts-resume');
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.pause();
      this._dispatch('audire-tts-pause');
    });
  }

  setMediaMetadata({ title, author, cover }) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Audire',
      artist: author || 'Unknown',
      album: 'Audire Library',
      artwork: cover ? [{ src: cover, sizes: '512x512', type: 'image/png' }] : [],
    });
    this._setupMediaSession();
  }

  clearMediaMetadata() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
  }

  // ─── Controls ────────────────────────────────────────────────────────────

  pause() {
    this.isPaused = true;
    if (this._speaking) cancelWebSpeech();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }

  resume() {
    this.isPaused = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  /** Kept for the Reader's play handler; speechSynthesis has no audio context to unlock. */
  unlockAudioContext() {}

  async init() {}

  async _waitIfPaused(sessionId) {
    while (this.isPaused && this._alive(sessionId)) await sleep(50);
  }

  // ─── Speaking ────────────────────────────────────────────────────────────

  /**
   * Speak one chunk (a sentence or two), part by part. A part interrupted by pause is
   * replayed from its start on resume. Returns false only if the voice kept failing.
   */
  async _speakChunk(chunk, chunkIndex, sessionId, onFirstStart) {
    let started = false;
    for (const part of splitForSpeech(chunk)) {
      for (let attempt = 0; ; ) {
        await this._waitIfPaused(sessionId);
        if (!this._alive(sessionId)) return true;

        this._speaking = true;
        const result = await speakWithWebSpeech(part.text, {
          voice: this.voice,
          rate: this.speed,
          volume: this.volume,
          onStart: () => {
            if (!started) { started = true; onFirstStart?.(); }
          },
          onWord: (charIndex) => {
            const w = wordAt(chunk, part.offset + charIndex);
            if (w) this.onWordBoundary?.(chunkIndex, w);
          },
        });
        this._speaking = false;

        if (!this._alive(sessionId)) return true;
        if (this.isPaused) continue;
        if (result === 'ended') break;
        if (++attempt >= MAX_ATTEMPTS) return false;
        // Chrome sometimes leaves a stuck utterance in the queue; clear it before retrying.
        cancelWebSpeech();
        await sleep(300);
      }
    }
    return true;
  }

  /** Speak one short text (voice preview). */
  async speak(text) {
    this.stop();
    this._stopped = false;
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (!isWebSpeechSupported()) throw new Error('This browser cannot read aloud.');
    await this._ensureVoices();
    this._sessionActive = true;
    try {
      const ok = await this._speakChunk(clean, 0, undefined);
      if (!ok && !this._stopped) throw new Error('This voice could not speak. Try another one.');
    } finally {
      this._sessionActive = false;
    }
  }

  async speakContinuous(textChunks, onChunkComplete, sessionId, metadata = {}) {
    if (sessionId) this.currentSessionId = sessionId;
    this._stopped = false;
    this.isPaused = false;
    this._abortedOnFailure = false;

    if (!isWebSpeechSupported()) {
      this._abortedOnFailure = true;
      return;
    }
    if (metadata.title || metadata.author || metadata.cover) this.setMediaMetadata(metadata);

    await this._ensureVoices();
    const voice = this.voice;
    this.status = { ...this.status, voice: voice?.name || 'Default voice' };

    const total = textChunks.length;
    this._sessionActive = true;
    try {
      for (let i = 0; i < total; i++) {
        if (!this._alive(sessionId)) return;
        const chunk = (textChunks[i] || '').trim();
        if (!chunk || !SPEAKABLE.test(chunk)) continue;

        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        const ok = await this._speakChunk(chunk, i, sessionId, () => onChunkComplete?.(i + 1, total));
        if (!this._alive(sessionId)) return;
        if (!ok) {
          console.error(`[TTS] ${voice?.name || 'The voice'} could not read chunk ${i}`);
          this._abortedOnFailure = true;
          return;
        }
      }
    } finally {
      this._sessionActive = false;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    }
  }

  startSession() {
    this._stopped = false;
    this.isPaused = false;
    this._abortedOnFailure = false;
  }

  stop() {
    this._stopped = true;
    this.isPaused = false;
    if (this._speaking || isWebSpeechSpeaking()) cancelWebSpeech();
    this._speaking = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
    this.clearMediaMetadata();
  }

  // ─── Settings ────────────────────────────────────────────────────────────

  applySettings(s = {}) {
    if (s.webSpeechVoice !== undefined) this.webSpeechVoice = s.webSpeechVoice;
    if (typeof s.speed === 'number') this.speed = s.speed;
    if (s.karaokeHighlight !== undefined) this.wantWordTimings = !!s.karaokeHighlight;
  }

  setVoice(voiceURI) { this.webSpeechVoice = voiceURI || ''; }
  setSpeed(speed) { this.speed = speed; }
  setPitch() {}
  setVolume(vol) { this.volume = vol ?? 1; }

  get hasActivePlayback() {
    return this._sessionActive || this._speaking;
  }
}

export const ttsManager = new TTSManager();
