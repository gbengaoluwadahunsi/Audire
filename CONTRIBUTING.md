# Contributing

Thanks for your interest in contributing to ClearRead.

## Development setup

1. Fork and clone the repository.
2. Create a feature branch from `main`.
3. Start backend:

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Start frontend in a second terminal:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Create `frontend/.env` with:

   ```env
   VITE_TTS_API_URL=http://localhost:8000
   ```

## Code quality checks

Please run checks before opening a PR:

```bash
cd frontend
npm run test
npm run build
```

```bash
cd backend
python -m pytest
```

## Pull request guidelines

- Keep PRs focused and small when possible.
- Include a clear problem statement and approach.
- Add or update tests for behavior changes.
- Include screenshots/GIFs for visible UI changes.
- Ensure no secrets are committed (`.env`, private keys, tokens).

## Commit style

Use clear, imperative commit messages, for example:

- `feat: add chapter-level playback speed setting`
- `fix: handle empty OCR page content`
- `docs: update local setup instructions`
