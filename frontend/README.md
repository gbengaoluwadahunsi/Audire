# ClearRead (frontend)

Open-source reader with TTS, offline-first caching, and no auth.

This repo root has two deployable apps:
- `frontend/`
- `backend/`

## Quick start

### 1. Backend (Piper TTS)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_TTS_API_URL=http://localhost:8000` in `frontend/.env` if needed.

## Verify

- Header shows **Natural voice** when backend is reachable.
- Reader supports:
  - batch upload
  - URL/Drive/Dropbox import link normalization
  - whole-book search + chapter jump
  - voice preview, favorites, per-book voice profile
  - offline cache badge + "Prepare offline +3"

## Test and build

```bash
cd frontend
npm run test
npm run build
```

## Open-source release checklist

- Remove secrets from `.env` before publishing.
- Confirm OSS license file exists (MIT/Apache-2.0/etc).
- Run backend + frontend tests locally and in CI.
- Configure production backend CORS (`ALLOWED_ORIGINS`).
- Enable HTTPS on both frontend and backend hosts.
