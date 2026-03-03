# ClearRead Backend — Piper TTS

Fast, local text-to-speech using [Piper](https://github.com/rhasspy/piper).
Piper is optimized for CPU and synthesizes speech in **under 50ms** per sentence.

## Setup

```bash
cd backend
pip install -r requirements.txt
```

## Download voice models

Voice models auto-download on first use. Or pre-download defaults:

```bash
python download_voices.py
```

This fetches ~6 voices (~60 MB each) into the `voices/` folder.

## Run

```bash
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Production:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

## Available voices

| ID        | Name     |
|-----------|----------|
| lessac    | Lessac   |
| amy       | Amy      |
| ryan      | Ryan     |
| joe       | Joe      |
| kristin   | Kristin  |
| ljspeech  | LJSpeech |
| bryce     | Bryce    |
| danny     | Danny    |
| kathleen  | Kathleen |
| kusal     | Kusal    |
| norman    | Norman   |

## API

- `GET  /api/health` — health check
- `GET  /api/tts/voices` — list voices
- `POST /api/tts` — synthesize (returns WAV)
  ```json
  { "text": "Hello world", "voice": "lessac", "speed": 1.0 }
  ```
- `POST /api/tts/stream` — streaming NDJSON (base64 WAV chunks)
  ```json
  { "text": "stream", "voice": "lessac", "speed": 1.0, "chunks": ["Hello.", "World."] }
  ```

## Verifying frontend–backend connection

1. Start backend: `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Open app — header shows **"Natural voice"** (green) when backend is reachable.
4. Open a book → choose a voice → press Play.

## Production notes

- Set `ALLOWED_ORIGINS` to your frontend origin(s), comma-separated.
  - Example: `ALLOWED_ORIGINS=https://your-frontend.app`
- Keep backend behind HTTPS reverse proxy (Nginx/Caddy/Cloudflare).
- Monitor logs and restarts (systemd, Docker restart policy, or PaaS health checks).
- Run tests before deploy:

```bash
pytest -q
```
