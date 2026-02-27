# ClearRead / Audire — Design Reference

This document maps the **design subfolders** (`designs/<name>/code.html`) to app screens and components, and summarizes the design system. There are **no PNGs** in the design folders; each screen is defined by **code.html** (Tailwind-based HTML mockups).

---

## Product overview (similar to Speechify)

**ClearRead / Audire** is a **reading and listening app** — an e‑reader that also reads your books aloud. In short: *“Your Modern Reading Sanctuary”* — focused, distraction‑free reading and listening.

| Area | What the app does |
|------|--------------------|
| **Library** | Upload and manage books (PDF and EPUB). Dashboard: drop zone (“Drop your world here”), filters (All / PDF / EPUB), book grid with progress and playback. |
| **Listen with TTS** | Text‑to‑speech with neural voices (e.g. kokoro-js / Edge TTS), playback controls, waveform, speed, mini player (“Now Playing”). |
| **Processing / OCR** | For scanned or image‑based content: “Preparing your book”, “Scan page X of Y” (e.g. tesseract.js), so those can be read aloud too. |
| **Reader experience** | Reader view with light / dark / sepia, serif fonts for reading, max reading width for comfort. |
| **Account & monetization** | Profile, subscription (Free / Pro / Unlimited), upgrade/checkout flow; backend is Supabase. |

So: **Audire is an e‑reader + audiobook‑style app** that lets users read their own PDFs/EPUBs and listen with AI voices, with a design‑system‑driven UI (this doc + `designs/` and `designs/guide2`).

---

## Competitive context: Speechify

**Speechify is the direct competitor.** When designing and building Audire:

- **Differentiate** — Own a distinct position (e.g. “Reading Sanctuary”, focus, calm UI, privacy). Use messaging and UX that feel clearly Audire, not an imitation.
- **Meet or exceed expectations** — Users coming from or comparing to Speechify will expect strong TTS quality, a clear library, reliable playback (speed, skip, progress), and a good reader experience. Match or beat those bar.
- **Own the visual identity** — Follow `designs/` and guide2; don’t copy Speechify’s look. Keep the current design system (primary blue, dark/sepia/light, typography) consistent and recognizable as Audire.

---

## Instructions: Style guide (guide / guide2)

**Use the design tokens and style guide as the source of truth when building the app.**

- **`designs/guide2/code.html`** — **Audire Design System** (Version 1.0.0 — Developer Reference)  
  This is the official **design tokens and style guide**. It defines:
  - **Colors** (brand primary, surfaces, neutrals)
  - **Typography** (sans for UI, serif for reading; scales)
  - **Spacing & layout** (4px scale, reading area max-width)
  - **Components & states** (buttons, form elements, sliders, shadows/radius)

- There is no separate **`guide`** folder in `designs/`; **guide2** is the single style-guide reference. When in doubt, follow **guide2** for tokens and component styling.

---

## Design system (from guide2 + code.html files)

| Token | Value | Usage (from guide2 where noted) |
|-------|--------|--------|
| **Primary** | `#1152d4` | Buttons, links, progress, accents — `brand.primary` (guide2) |
| **Primary hover** | `#0d41aa` | Hover — `brand.primary-hover` (guide2) |
| **Surface light** | `#ffffff` | Day mode background — `surface.light` (guide2) |
| **Surface dark** | `#121212` | Night mode background — `surface.dark` (guide2) |
| **Surface sepia** | `#f4ecd8` | Comfort reading — `surface.sepia` (guide2) |
| **Background dark** | `#101622` or `#0f172a` | App dark (other screens) |
| **Background light** | `#f6f6f8` | Light theme (other screens) |
| **Neutrals** | 50–900 (#f9fafb → #111827) | Text, borders — `neutral.*` (guide2) |
| **Font UI** | Inter, system-ui | Sans for interface (guide2) |
| **Font reading** | Georgia, Palatino (or Lora) | Serif for body/headings (guide2) |
| **Icons** | Material Symbols Outlined | All UIs (other screens) |
| **Radius** | `audire-sm` 4px, `audire-md` 8px, `audire-lg` 12px (guide2) | Buttons, cards, inputs |
| **Reading width** | `700px` max (`max-w-reading-area`) | Reader content (guide2) |
| **Spacing** | 4px increments (xs 4px, md 16px, lg 32px, xl 64px) | Layout (guide2) |
| **Dark mode** | `class` (Tailwind `dark:`) | All designs use `dark` |

**Note:** `designs/processing/code.html` uses **ClearRead** branding and `primary: #ec5b13` — use for processing/OCR screen only if you want that variant.

---

## Design folder → App component mapping

| Design folder | App screen / component | Description |
|---------------|------------------------|-------------|
| **homepage** | `LandingPage` | Marketing landing: hero, “Your Modern Reading Sanctuary”, features (Listen with Intelligence, Designed for Focus, Read Anywhere), pricing (Free / Pro / Unlimited), CTA, footer. Nav: Audire logo, Features / Interface / Library, “Start Reading”. |
| **dashboard** | `Home` (library portal) | Main app shell: sticky nav (logo, search, notifications, settings, profile), **drop zone** (“Drop your world here”, Upload File), “Your Library”, filter tabs (All / PDF / EPUB), **book grid** (cover, title, author, progress bar, play, more). **Mini player** at bottom (cover, “Now Playing”, prev/play/next, progress, volume, expand). |
| **library** | `Home` (alternate layout) | Sidebar layout: nav (All Books, Recent, Favorites, Finished, Collections), header (search, grid/list, Sort), **book grid** with progress and “Finished” state, **bulk action bar** (Selected, Move, Offline, Finish, Delete). |
| **playing** | `Reader` + `Controls` | Now playing: header (Audire, Library/Store/My Notes, search, profile), **book title + author**, **large cover**, **waveform** bars, **progress slider** (time), **playback controls** (prev, play/pause, next), speed, voice label. |
| **detail** | `BookDetail` | Book detail: header (Audire, Browse/Library/Store, search, profile), **cover** (2/3 aspect), **title** (serif), author, rating, **sample audio** (play, 1.0x, waveform), **Start Reading** + **Add to Library**, metadata (Length, Format, etc.). |
| **empty** | `Home` (empty / no results) | Empty state: header (Audire, search, notifications, settings, profile), **illustration** (book + magnifying glass), “No matches found for **query**”, suggest clear filters / upload. |
| **search** | `Header` search + results | Search in header; results page with filters and result cards (same as library cards). |
| **toasts** | `Toast` | Toast notifications (check `designs/toasts/code.html` for variants: success, error, info). |
| **processing** | `OCRProgress` | Full-screen overlay: “Preparing your book…”, “Scanning page X of Y”, **progress bar**, Cancel. Uses ClearRead branding and orange primary in that file. |
| **profile** | `Profile` | Back, “Profile”, **avatar** (verified badge), name, “Premium Member”, **stats** (Time, Books), **subscription card** (plan, next billing, Manage), **Account** (Full Name, Email, etc.), **Settings** list. |
| **VOICE** | `Sidebar` (Voice tab) | Modal/panel: “Voice & Audio Settings”, **Voice Selection** (tabs: Neural Voices), voice list, **Speed** and **Volume** sliders, close. |
| **delete** | `ConfirmModal` | Blurred library behind; **modal**: “Remove [title]?”, description, Cancel + **Remove** (destructive). |
| **checkout** | `Upgrade` | Header (Audire, nav, profile), “Upgrade to Audire Unlimited”, **Selected plan card** (gradient header, features, price), payment form, “Complete purchase”. |
| **help** | Help / support | Help or onboarding (use when you add a help screen). |
| **septiatheme** | Theme (sepia) | Theme variant for reader. |
| **lightmodedashboard** | `Home` light | Dashboard in light mode. |
| **guide2** | **Style guide / instructions** | **Design tokens & style guide** — colors, typography, spacing, buttons, forms, sliders, radius. **Follow this when building components.** |
| **homepageMobile**, **next**, **next2**, **next3**, **four** | Variants | Mobile or alternate layouts; use as needed. |

---

## Key UI patterns (from designs)

1. **Nav bar**  
   Logo (icon + “Audire”) + nav links + search + icon buttons + profile avatar. Sticky, `backdrop-blur`, border-b.

2. **Book card**  
   Aspect 2/3 or 3/4, rounded-xl, cover image, gradient overlay, title + author at bottom, progress bar below card, play + more on hover.

3. **Mini player**  
   Fixed bottom, glass panel: small cover, “Now Playing”, title, prev / play / next, progress, optional volume and expand.

4. **Primary button**  
   `bg-primary` (e.g. `#1152d4`), white text, rounded-lg, bold, shadow with primary tint.

5. **Glass panel**  
   `bg-white/5` or `rgba(16,22,34,0.6)`, `backdrop-filter: blur(…)`, border `white/5` or `white/10`.

6. **Background decoration**  
   Large blurred primary circles (e.g. top-left, bottom-right) for depth.

---

## Fonts (from designs)

- **Google Fonts** (already in `index.html`):  
  Inter, Playfair Display, Lora, Material Symbols Outlined.

---

## Tailwind in the project

Designs use **Tailwind via CDN** in HTML. The app should use:

- **Tailwind** (npm) with the same tokens (e.g. `primary: #1152d4`, `background-dark: #101622`) in `tailwind.config.js`.
- **Same fonts** as in `index.html`.

Then build components to match the **structure and classes** in each `designs/<name>/code.html` so the app matches the designs.

---

## Summary

- **Designs live in** `designs/<folder>/code.html` (no PNGs).
- **Design system:** primary `#1152d4`, dark bg `#101622`, Inter + Material Symbols, Tailwind.
- **Component mapping** above shows which design to use for **LandingPage**, **Home**, **Reader**, **Controls**, **Sidebar**, **BookDetail**, **Profile**, **Upgrade**, **Toast**, **OCRProgress**, **ConfirmModal**, and **AuthModal** (auth can follow checkout/header style).
- Use **designs/processing** for OCR/progress only; optionally keep ClearRead/orange there or align with main primary.

When rebuilding components:
1. **Follow the instructions and tokens in `designs/guide2/code.html`** (Audire Design System) for colors, typography, spacing, and component styles.
2. Open the corresponding screen design `designs/<name>/code.html` and mirror its structure and Tailwind classes in React components.
