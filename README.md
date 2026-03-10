# Audire

**Audire** is an open-source ebook reader with local TTS and AI—all running in your browser. No cloud, no API keys, no subscription.

## Features

- **TTS** – Microsoft Edge TTS via Web Speech API. Natural voices in Edge; works in any modern browser.
- **Explain, Define & Visualize** – AI panel ready for your own AI provider (OpenAI, Groq, etc.).
- **EPUB & PDF** – Securely upload and read your own books via Supabase.
- **Highlights & Bookmarks** – Color-coded highlights and persistence across sections.
- **Flashcards** – Auto-generated learning tools from your book chapters.
- **Collections** – Organize your library into personalized shelves.

## License

Audire is open source under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## How to Run Audire on Your Laptop

Follow these steps to run Audire locally as an open-source project.

### Step 1: Prerequisites

- **Node.js** (v18 or newer) – [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Chrome or Edge** (recommended for WebGPU support – needed for TTS and AI)

### Step 2: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/audire.git
cd audire
```

Or fork the repo on GitHub, then clone your fork.

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Set Up Supabase (Optional)

Audire uses Supabase for storing books and syncing progress. To enable cloud storage:

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. In **Storage**, create a bucket named `books` with public access
4. In **Table Editor**, create a `books` table with columns:
   - `id` (uuid, primary key, default: `gen_random_uuid()`)
   - `title` (text)
   - `author` (text)
   - `cover` (text, nullable)
   - `file_url` (text)
   - `format` (text, default: `'epub'`)
   - `added_at` (timestamptz)
   - `last_cfi` (text, nullable)
   - `last_read` (timestamptz, nullable)
   - `progress_percent` (numeric, default: 0)
   - `total_pages` (integer, nullable)
5. Run the migration in **SQL Editor** (see `supabase-migration.sql`)
6. Copy your project URL and anon key from **Settings → API**
7. Create a `.env` file in the project root (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Replace with your actual Supabase URL and anon key.

> **Note:** Without Supabase, the app will fail when uploading or loading books. You need a Supabase project to use the full library features.

### Step 5: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Step 6: Build for Production (Optional)

```bash
npm run build
npm run preview
```

The built files are in the `dist` folder. Deploy `dist` to any static host (Vercel, Netlify, etc.).

---

## Browser Requirements

- **Browser** – Works in any modern browser (Chrome, Edge, Safari, Firefox).
- **TTS** – Web Speech API (Microsoft Edge TTS in Edge). Free, no API keys.
- **LocalStorage** – Used for local settings and offline UI state.
- **Supabase** – Used for cloud book storage and cross-device sync.

---

## Project Structure

```
audire/
├── src/
│   ├── components/     # React components (Reader, Dashboard, etc.)
│   ├── context/        # PlaybackContext, AIContext
│   ├── lib/            # TTS, Supabase, file processing, bookmarks
│   └── main.jsx
├── public/
├── supabase-migration.sql
└── package.json
```

---

## Troubleshooting

### "Failed to fetch" when uploading books

This usually means the Supabase request failed. Try:

1. **Check `.env`** – Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly. Restart the dev server after changing `.env`.
2. **Verify Supabase setup** – In your Supabase project: Storage → bucket `books` (public), Table Editor → table `books` with the required columns.
3. **Browser console** – Open DevTools (F12) → Console for the full error.
4. **Network** – Disable VPN/proxy; ensure you can reach `*.supabase.co`.

### TTS not working

- **Supabase check** – If books don't load, verify your `VITE_SUPABASE_URL` in `.env`.
- **TTS** – Uses browser speech synthesis. Best quality in Microsoft Edge (neural voices).
- **EPUB Loading** – If a book gets stuck on "Loading," check the console (F12) for Supabase CORS or storage permissions.

### Build warning: "Some chunks are larger than 500 kB"

The main bundle is large due to TTS, AI, and PDF libraries. The app still works. To hide the warning, add `build.chunkSizeWarningLimit` to `vite.config.js`:

```js
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 4000 },
})
```

### Empty library or "Could not connect to your library"

Supabase isn’t configured or reachable. Set up `.env` and the Supabase project (see Step 4 above).

---

## Contributing

Contributions are welcome. Open an issue or submit a pull request.
