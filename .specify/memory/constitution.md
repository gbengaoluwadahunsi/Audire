<!--
Sync Impact Report
- Version change: (copied from specProject 1.1.0) → 1.0.0 for Audire
- Modified principles: rewritten for a React + Express app (specProject was static-only)
- Added sections: Listening Reliability, Data & Privacy
- Removed sections: Static-First (Audire has a backend by design)
- Templates requiring updates: none (plan/spec/tasks templates remain compatible)
- Follow-up TODOs: none
-->

# Audire Constitution

## Core Principles

### I. Listening Never Silently Stops
Read-aloud is the core of Audire. Playback MUST NOT stop, skip, or swallow text without
telling the reader. If a voice provider fails, the app MUST retry, then fall back to another
voice where one is available, and otherwise show a clear, actionable message. Sentence and
paragraph order MUST be preserved.

### II. Free To Use
Every core feature (reading, listening, highlights, library) MUST work without the reader
paying or supplying an API key. Paid or keyed services (e.g. AI features) are optional
add-ons and MUST degrade gracefully when absent.

### III. Professional, Consistent UI
The interface MUST use the shared design tokens (colours, spacing, type scale, radii) instead
of one-off values. Every screen MUST have designed empty, loading, and error states. Copy is
short, plain, and consistent in tone.

### IV. Accessibility
Use semantic HTML, label every control, keep everything keyboard reachable with a visible
focus ring, respect `prefers-reduced-motion`, and meet WCAG 2.1 AA colour contrast in both
light and dark themes.

### V. Performance
The reader MUST stay responsive on mid-range phones. Heavy libraries (pdf.js, Tesseract,
epub.js) load lazily. Audio is prefetched ahead of the current sentence and cached for
offline replay.

### VI. Verify Before Done
Every change MUST be checked in a Chromium-based browser and Firefox, at phone and desktop
widths, with no console errors, and `npm run lint` and `npm run build` MUST pass. Changes to
playback MUST be tested by listening across at least one page turn.

## Technical Constraints

- Frontend: React 19 + Vite, deployed as static files (Vercel). Backend: Node.js + Express
  (Render), PostgreSQL (Neon), book files in Cloudflare R2.
- New dependencies MUST be justified in the feature plan; prefer what is already installed.
- No secrets in frontend code or in git. Configuration goes through `.env` files.
- External services that are unofficial or may change (e.g. Edge read-aloud voices) MUST be
  wrapped behind a single module so they can be swapped or updated in one place.

## Data & Privacy

- A reader's books, highlights, and progress belong to them; never send book text to third
  parties except the voice/AI provider needed for the feature the reader triggered.
- Destructive actions (deleting books or collections) require confirmation.

## Design Tooling

- OpenDesign is the default tool for all UI/UX design work (mockups, layouts, components,
  design assets).
- Claude Design MUST NOT be used by default; it may be used only when explicitly requested
  for a specific task.

## Development Workflow

- Each feature starts with a spec, then a plan, then tasks (`/speckit-specify`,
  `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`).
- Keep commits small and descriptive (`feat:`, `fix:`, `style:`, `ux:` prefixes).
- A change is complete only when it satisfies the principles above.

## Governance

This constitution supersedes other project practices. Amendments require updating this
file, bumping the version (MAJOR for removed/redefined principles, MINOR for additions,
PATCH for clarifications), and noting the change in the Sync Impact Report. All specs and
plans MUST be checked against these principles; any added complexity MUST be justified.

**Version**: 1.0.0 | **Ratified**: 2026-10-28 | **Last Amended**: 2026-10-28
