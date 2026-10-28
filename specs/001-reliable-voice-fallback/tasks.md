# Tasks: Reliable Read-Aloud Voice

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Setup

- [x] T001 Add `kokoro-js@1.2.1` to package.json
- [x] T002 Add Vitest and an `npm test` script

## Phase 2: Foundation

- [x] T003 [P] Engine registry and capability checks in src/lib/voices/engines.js
- [x] T004 [P] Web Speech engine in src/lib/voices/webSpeechEngine.js
- [x] T005 [P] Kokoro worker + client in src/lib/voices/kokoro.worker.js and kokoroEngine.js
- [x] T006 New settings keys and migration in src/lib/settings.js

## Phase 3: User Story 1 — Keep listening when the main voice fails (P1)

- [x] T007 [US1] Engine chain with per-sentence fallback and 8s/20s budget in src/lib/ttsManager.js
- [x] T008 [US1] Pause/resume/stop cover Web Speech playback in src/lib/ttsManager.js
- [x] T009 [US1] Switch notice + "all voices failed" message in src/components/Reader.jsx
- [x] T010 [US1] Unit tests for fallback order and timeout in src/lib/ttsManager.test.js

## Phase 4: User Story 2 — See which voice is reading (P2)

- [x] T011 [US2] VoiceStatus badge with retry action in src/components/VoiceStatus.jsx
- [x] T012 [US2] Show VoiceStatus in Reader playback controls and MiniPlayer

## Phase 5: User Story 3 — Choose a voice for each engine (P2)

- [x] T013 [US3] VoiceSettings card (order, voice + preview per engine) in src/components/VoiceSettings.jsx
- [x] T014 [US3] Replace old engine/voice cards in Dashboard settings
- [x] T015 [US3] Mini player saves its voice to `edgeTtsVoice` (src/context/PlaybackContext.jsx)

## Phase 6: User Story 4 — Prepare the on-device voice (P3)

- [x] T016 [US4] Kokoro download/cancel/remove with size and progress in VoiceSettings
- [x] T017 [US4] "Download in the background" toggle honoured by ttsManager

## Phase 7: Polish

- [x] T018 Update README voice section
- [x] T019 `npm run lint`, `npm run build`, `npm test` pass
- [ ] T020 Manual: listen across a page turn on Edge; stop backend mid-page and confirm Kokoro or
      Web Speech continues from the same sentence; go offline with Kokoro downloaded and
      listen to a chapter (Chrome + Firefox, phone + desktop width)
