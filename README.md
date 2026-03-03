# ClearRead (Audire)

ClearRead is an open-source reading app that turns PDFs/EPUBs into natural speech.

The repo contains two apps:

- `frontend/` - Vite + React web app
- `backend/` - FastAPI + Piper TTS API

## Local Setup

### 1) Start backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Optional: pre-download default voices:

```bash
cd backend
python download_voices.py
```

### 2) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Set the API URL in `frontend/.env`:

```env
VITE_TTS_API_URL=http://localhost:8000
```

Open the app at `http://localhost:5173`.

## Run Checks

### Frontend

```bash
cd frontend
npm run test
npm run build
```

### Backend

```bash
cd backend
python -m pytest
```

## Screenshots

Add product screenshots or GIFs in `docs/screenshots/` and reference them here, for example:

- `docs/screenshots/home.png`
- `docs/screenshots/reader.png`
- `docs/screenshots/settings.png`

## Production Notes

- Configure backend `ALLOWED_ORIGINS` for your frontend domain.
- Serve both frontend and backend over HTTPS.

## Community and Security

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- License: `LICENSE`

