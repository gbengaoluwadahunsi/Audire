# Feature Specification: Reliable Read-Aloud Voice

**Feature Branch**: `001-reliable-voice-fallback`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Reliable read-aloud voice: playback must never silently stop. Use Edge neural voices first; if Edge fails, fall back to Kokoro (free open-source natural voice running in the browser); if that is unavailable, fall back to the browser's built-in Web Speech voice; if all fail, show a clear message. Reader can pick a voice per engine and sees which engine is active."

## Background

Today Audire reads aloud with a single online voice service (Edge neural voices). When that
service is unreachable or changes without notice, listening stops with an error toast and
the reader has no way to keep going. The README already promises an automatic fallback,
but none exists. Audire previously offered Kokoro voices generated on the server; that was
replaced, likely because of server memory limits. This feature brings back a natural
offline-capable voice that runs on the reader's own device instead.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep listening when the main voice fails (Priority: P1)

A reader is listening to a book. The main online voice becomes unavailable mid-page. Audire
switches to the next available voice and carries on from the sentence that failed, so the
reader hears every sentence in order with only a short pause. A small, non-blocking notice
says which voice is now reading.

**Why this priority**: This is the failure reported today. It is the core promise of the
app (constitution principle I) and delivers value even if nothing else in this spec ships.

**Independent Test**: Start reading, then make the main voice service unreachable (e.g.
stop the backend or go offline after the page loads). Listening continues from the same
sentence with a backup voice and a notice appears.

**Acceptance Scenarios**:

1. **Given** a reader is listening with the main voice, **When** the main voice fails for a
   sentence, **Then** that same sentence is read by the next available voice and reading
   continues without skipping any text.
2. **Given** playback has switched to a backup voice, **When** the switch happens, **Then**
   the reader sees a short notice naming the voice now in use, and playback does not pause
   to wait for them.
3. **Given** playback is on a backup voice, **When** the main voice becomes reachable again,
   **Then** Audire returns to the main voice at the next page or chapter start, not
   mid-sentence.
4. **Given** every voice is unavailable, **When** playback cannot continue, **Then** reading
   stops on the last spoken sentence and the reader sees a clear message explaining what
   happened and what they can do (check connection, try again, choose another voice).

---

### User Story 2 - See which voice is reading (Priority: P2)

While listening, the reader can see which voice engine and which voice are currently
speaking, in both the reader view and the mini player.

**Why this priority**: Without this, an automatic switch looks like a random change in
sound quality. It builds trust in the fallback from Story 1.

**Independent Test**: Start reading and check the player shows "Edge · Ava"; force a
fallback and check it updates to the backup engine and voice.

**Acceptance Scenarios**:

1. **Given** playback is running, **When** the reader looks at the player, **Then** the
   active engine and voice name are shown.
2. **Given** a fallback has occurred, **When** the reader looks at the player, **Then** it
   indicates the voice is a backup and offers a one-tap way to retry the preferred voice.

---

### User Story 3 - Choose a voice for each engine (Priority: P2)

In settings, the reader chooses a preferred voice for each engine (online neural voices,
on-device natural voices, built-in device voices) and can preview each one. They can also
choose which engine is their first choice.

**Why this priority**: A fallback voice should still be a voice the reader likes. Choosing
in advance avoids a jarring switch to an unfamiliar voice.

**Independent Test**: In settings, pick a voice for each engine, press preview on each, and
reload the app; the choices are kept.

**Acceptance Scenarios**:

1. **Given** the settings page, **When** the reader opens voice settings, **Then** they see
   one voice picker per engine, each with a preview button.
2. **Given** the reader picks a voice for an engine, **When** a fallback to that engine
   happens, **Then** their chosen voice is used.
3. **Given** the reader changes their first-choice engine, **When** they next press play,
   **Then** that engine is tried first and the others remain as backups in order.

---

### User Story 4 - Prepare the on-device voice ahead of time (Priority: P3)

The on-device natural voice needs a one-time download before first use. The reader can
download it in advance from settings, see its size and progress, and remove it later to
free space.

**Why this priority**: Makes the backup ready before it is needed (e.g. before a flight),
but the feature works without it because the download can also start on demand.

**Independent Test**: In settings, start the on-device voice download, watch progress
complete, go offline, and confirm the on-device voice still reads.

**Acceptance Scenarios**:

1. **Given** the on-device voice is not downloaded, **When** the reader opens voice
   settings, **Then** they see its approximate size and a download button.
2. **Given** the download is in progress, **When** the reader watches settings, **Then**
   they see progress and can cancel.
3. **Given** the on-device voice is downloaded, **When** the reader is offline, **Then** it
   can read aloud without any network.
4. **Given** the on-device voice is downloaded, **When** the reader chooses to remove it,
   **Then** the space is freed and the engine shows as not downloaded.

---

### Edge Cases

- The main voice fails while the on-device voice has never been downloaded: Audire skips
  straight to the built-in device voice rather than making the reader wait for a large
  download mid-sentence, and starts the on-device download in the background only if the
  reader has allowed it.
- The device cannot run the on-device voice (too little memory or unsupported browser): that
  engine is marked unavailable in settings with a plain explanation and is skipped in the
  fallback order.
- The device has no built-in voices (some Linux and older browsers): that engine is marked
  unavailable and skipped.
- The reader's chosen voice for an engine no longer exists (e.g. a device voice removed):
  that engine uses its default voice and settings show the change.
- The main voice is slow rather than down: a sentence that takes longer than a set wait
  time to arrive is treated as a failure for that sentence, so the reader is not left in
  silence.
- Repeated flapping (main voice fails, recovers, fails): Audire does not switch back more
  than once per page, to avoid the voice changing every few sentences.
- Reader pauses during a fallback: the pause is respected and resuming continues with the
  voice that was active.
- Speed and volume settings carry across engines; pitch applies where the engine supports
  it and is ignored otherwise.
- Sentences that are only numbers or punctuation are still read or skipped consistently
  across all engines, never dropped by one engine and read by another.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Audire MUST support three voice engines: online neural voices (current
  default), on-device natural voices, and the device's built-in voices.
- **FR-002**: Audire MUST try engines in the reader's preferred order, defaulting to online
  neural → on-device natural → built-in.
- **FR-003**: When an engine fails to produce audio for a sentence, Audire MUST retry that
  same sentence with the next available engine, so no sentence is skipped or reordered.
- **FR-004**: A sentence MUST count as failed if no audio is available within 8 seconds of
  when it is needed, or the engine reports an error.
- **FR-005**: Audire MUST show a short, non-blocking notice whenever the active engine
  changes, naming the new engine and voice.
- **FR-006**: The player (reader view and mini player) MUST display the active engine and
  voice and indicate when a backup is in use.
- **FR-007**: The player MUST offer a "retry preferred voice" action while a backup is in
  use.
- **FR-008**: Audire MUST return to the preferred engine automatically at the next page or
  chapter boundary once it is reachable again, at most once per page.
- **FR-009**: When no engine can produce audio, Audire MUST stop on the last spoken
  sentence and show a message stating the cause in plain words and the actions available.
- **FR-010**: Settings MUST let the reader choose a voice per engine, preview it, and set
  the engine order; these choices MUST persist across sessions and devices where the
  reader's settings already sync.
- **FR-011**: Settings MUST show each engine's status: ready, needs download, downloading
  (with progress), or unavailable on this device (with reason).
- **FR-012**: The reader MUST be able to download, cancel downloading, and remove the
  on-device voice from settings; its approximate size MUST be shown before download.
- **FR-013**: The on-device voice MUST work fully offline once downloaded.
- **FR-014**: Audire MUST NOT start a large voice download mid-playback without the reader
  having allowed background downloads.
- **FR-015**: Speed and volume settings MUST apply to every engine; differences in support
  (e.g. pitch) MUST be shown in settings rather than failing silently.
- **FR-016**: Audio already saved for offline listening MUST continue to play from that
  saved copy before any engine is asked.
- **FR-017**: The on-device engine MUST NOT add to the server's memory or processing load.
- **FR-018**: The README MUST describe the actual fallback behaviour.

### Key Entities

- **Voice Engine**: A source of speech. Attributes: name, status (ready / needs download /
  downloading / unavailable), reason if unavailable, supported controls (speed, pitch).
- **Voice**: A specific speaker within an engine. Attributes: name, accent/language,
  gender label, quality grade.
- **Voice Preferences**: Per-reader settings: engine order, chosen voice per engine,
  whether background downloads are allowed, speed, pitch, volume.
- **Playback Status**: What the player shows: active engine, active voice, whether it is a
  backup, last fallback reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the main voice service switched off mid-page, 100% of sentences on that
  page are still heard in order, with no gap longer than 10 seconds at the switch.
- **SC-002**: In a 30-minute listening test with the main service failing at random, the
  reader never experiences silence without a visible notice.
- **SC-003**: With all network access removed after the on-device voice is downloaded, a
  reader can listen to a full chapter.
- **SC-004**: A first-time reader can find and change the voice for each engine in under
  1 minute without help.
- **SC-005**: Reports of "the voice stopped working" drop to zero for causes other than a
  device with no working engine at all.
- **SC-006**: Server resource use for read-aloud does not increase compared with today.

## Assumptions

- The online neural voices stay the default first choice because they are currently the
  most natural free option.
- The on-device natural voice is a free, open-source model (Kokoro) of roughly 80–100 MB,
  downloaded once and kept on the device. It runs in the reader's browser, not on the
  server, which avoids the server memory limits that led to its earlier removal.
- Background download of the on-device voice is off by default; readers opt in.
- English voices are the priority for this release; other languages follow existing support
  per engine.
- Word-by-word highlighting stays as it is today (off by default) and is out of scope;
  sentence-level progress keeps working on every engine.
- Existing saved settings migrate automatically: a reader's current Edge voice becomes their
  online-engine choice, and defaults fill the rest.
- Supported browsers are the latest two versions of major evergreen browsers, per the
  constitution; the on-device engine may be unavailable on low-memory phones and that is
  acceptable as long as it is reported clearly.
