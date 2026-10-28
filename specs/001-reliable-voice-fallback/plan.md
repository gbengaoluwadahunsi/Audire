# Implementation Plan: Reliable Read-Aloud Voice

**Branch**: `001-reliable-voice-fallback` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

## Summary

Turn the single-engine `ttsManager` into an ordered engine chain (Edge → Kokoro → Web Speech).
Each sentence is tried on the page's current engine; on failure or an 8-second wait, the same
sentence moves to the next engine and the rest of the page stays there. Each new page starts
again from the reader's first-choice engine. Kokoro runs in a Web Worker in the browser.

## Technical Context

- **Frontend**: React 19 + Vite 7. New dependency: `kokoro-js@1.2.1` (pulls in
  `@huggingface/transformers`), loaded only inside a worker when Kokoro is used.
- **Backend**: Express on Render. `/api/tts` can also return per-word timings (used by
  word highlighting); the plain MP3 response stays the default.
- **Storage**: IndexedDB audio cache (existing, now also used for Kokoro audio); browser
  Cache Storage for Kokoro model files (`transformers-cache`, `kokoro-voices`).
- **Testing**: Vitest unit tests for engine ordering, timeouts and settings migration.

## Constitution Check

| Principle | How this plan meets it |
|---|---|
| I. Listening never silently stops | Core of the plan: per-sentence fallback, notice on switch, clear final message |
| II. Free to use | All three engines are free; no keys |
| III. Professional UI | Voice settings regrouped per engine with status badges |
| IV. Accessibility | Status text uses `aria-live="polite"`; all new controls are labelled buttons/selects |
| V. Performance | Kokoro is lazy, worker-based, opt-in download; zero cost if never used |
| VI. Verify | Lint + build + unit tests; manual listen test listed in tasks |
| Constraint: unofficial services wrapped | Edge stays isolated in `_fetchEdgeTTS`; Kokoro in `voices/kokoroEngine.js` |

## Design

```
ttsManager.speakContinuous(chunks)
  page engine index = 0 (first choice)
  for each chunk:
    blob engines (edge, kokoro): await audio with 8s budget (20s for very first chunk,
      so a sleeping Render server can wake) → play through AudioContext
    web-speech: speechSynthesis.speak(chunk) and await end
    failure → next available engine, same chunk; emit 'audire-tts-engine' event
  none left → _abortedOnFailure (Reader shows the "all voices failed" message)
```

- **Availability**: Edge always tried; Kokoro only if its model is downloaded and the device
  supports WebAssembly; Web Speech only if `speechSynthesis` exists and has voices.
- **Kokoro not downloaded**: skipped. If "download in the background" is on, the download
  starts so the next page can use it (FR-014).
- **Status**: `ttsManager.status = { engine, voice, isBackup, reason }`, broadcast via
  a window event; Reader and MiniPlayer show it.
- **Settings keys**: `engineOrder`, `edgeTtsVoice`, `kokoroVoice` (`af_heart`),
  `webSpeechVoice` (voiceURI), `kokoroAutoDownload` (false).

## Source Changes

```
src/lib/voices/engines.js        engine ids, labels, default order, capability checks
src/lib/voices/kokoroEngine.js   worker client: status, download, synthesize, remove
src/lib/voices/kokoro.worker.js  loads KokoroTTS, returns WAV blobs
src/lib/voices/webSpeechEngine.js speak/pause/resume/cancel + voice list
src/lib/ttsManager.js            engine chain, timeouts, status events
src/lib/settings.js              new defaults + migration
src/components/VoiceSettings.jsx engine order, per-engine voice + preview, Kokoro download
src/components/VoiceStatus.jsx   "Edge · Ava" / "Backup: Kokoro · Heart" badge + retry
src/context/PlaybackContext.jsx  save mini-player voice to edgeTtsVoice (bug fix)
README.md                        describe real fallback behaviour
```

## Risks

- Kokoro on low-memory phones: may fail to load → marked unavailable with the reason.
- ONNX runtime WASM files come from a CDN on first load; offline use relies on the browser
  HTTP cache keeping them.
- Web Speech voices vary by OS; some Linux browsers have none (engine marked unavailable).
