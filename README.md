# Audire

**Audire** is a free, open-source ebook reader with podcast-quality text-to-speech, AI-powered reading tools, and a clean modern UI. Supports EPUB and PDF — including scanned PDFs via built-in OCR.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Highlights

- **Podcast-quality TTS** — Read any book aloud with [Kokoro](https://github.com/hexgrad/kokoro) (backend) or browser Web Speech. Gapless playback across pages.
- **EPUB & PDF** — Upload and read your library. EPUBs are converted to PDF on-the-fly via Calibre for a unified experience.
- **Scanned PDF OCR** — Pages without selectable text are automatically scanned with Tesseract.js.
- **AI Assistant** — Explain, define, summarize, and visualize scenes using Groq (bring your own API key).
- **Highlights, Bookmarks & Flashcards** — Color-coded annotations, flashcards auto-generated from chapters.
- **Collections** — Organize books into custom shelves.
- **PWA** — Installable on desktop and mobile. Works offline for cached content.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, CSS |
| Backend | Node.js, Express, PostgreSQL ([Neon](https://neon.tech)) |
| TTS | Kokoro-js (backend) / Web Speech API (browser) |
| EPUB→PDF | Calibre `ebook-convert` |
| OCR | Tesseract.js |
| AI | Groq API |

## Prerequisites

- **Node.js** v18+
- **PostgreSQL** — [Neon](https://neon.tech) free tier or any PostgreSQL instance
- **Calibre** — For EPUB→PDF conversion ([download](https://calibre-ebook.com/download))
- **Groq API key** *(optional)* — For AI features ([get one](https://console.groq.com))

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/gbengaoluwadahunsi/Audire.git
cd Audire
npm install
cd backend && npm install && cd ..
```

### 2. Set up the database

1. Create a free project at [neon.tech](https://neon.tech)
2. Run the schema from `backend/neon-schema.sql` in the SQL Editor

### 3. Configure environment

**Root `.env`** (frontend):

```env
VITE_API_URL=http://localhost:3001
```

**`backend/.env`**:

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full
GROQ_API_KEY=your-groq-api-key
# Optional: EBOOK_CONVERT_PATH=C:\Program Files\Calibre2\ebook-convert.exe
```

### 4. Run

```bash
npm run dev:all
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |

Or run them separately: `npm run dev` (frontend) / `npm run dev:backend` (backend).

## Calibre Setup

EPUBs are converted to PDF for display. Install [Calibre](https://calibre-ebook.com/download) and ensure `ebook-convert` is in your PATH:

| OS | Default path |
|----|-------------|
| Windows | `C:\Program Files\Calibre2\ebook-convert.exe` |
| macOS | `/Applications/calibre.app/Contents/MacOS/ebook-convert` |
| Linux | `ebook-convert` (in PATH after install) |

Set `EBOOK_CONVERT_PATH` in `backend/.env` if Calibre is installed to a non-default location.

## Project Structure

```
Audire/
├── src/                 # React frontend
│   ├── components/      # Reader, Dashboard, AIPanel, etc.
│   ├── context/         # PlaybackContext, AIContext
│   └── lib/             # API, TTS manager, file processing, bookmarks
├── backend/             # Express API server
│   ├── routes/          # books, ai, tts endpoints
│   ├── epubToPdf.js     # Calibre EPUB→PDF conversion
│   └── neon-schema.sql  # Database schema
├── public/
│   ├── manifest.json    # PWA manifest
│   └── sw.js            # Service worker
└── package.json
```

## Build & Deploy

```bash
npm run build
```

Output goes to `dist/`. Deploy the frontend to Vercel, Netlify, or any static host. The backend can run on Render, Railway, or your own server.

## Self-Hosting Notes

- Designed for **single-user / personal-library** use out of the box.
- For multi-user deployment, add authentication, restrictive CORS, and rate limiting.
- `GROQ_API_KEY` is optional — without it, AI features are disabled but reading and TTS work fine.
- If the Kokoro backend is unavailable, TTS falls back to browser Web Speech automatically.

## Known Limitations

- OCR quality depends on scan resolution and may be slower on low-powered devices.
- EPUB rendering is constrained by `epubjs` internals and browser iframe policies.

## Contributing

Contributions are welcome!

1. Fork the repo
2. Create a branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Open a Pull Request

## License

[MIT](LICENSE) — free for personal and commercial use.
