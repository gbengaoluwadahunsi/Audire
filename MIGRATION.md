# Migrating from Supabase to Neon + Backend

## Overview

Audire now uses:
- **Neon** – PostgreSQL database (free tier)
- **Backend** – Node.js API on Render (books + AI)
- **No Supabase** – Remove Supabase after migration

## 1. Create Neon Database

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string (Connection → Node.js)

## 2. Run Neon Schema

1. In Neon Dashboard → SQL Editor
2. Paste and run the contents of `backend/neon-schema.sql`

## 3. Deploy Backend to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Configure:
   - **Root Directory:** leave empty (or `backend` if you prefer)
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node index.js`
   - **Environment:** Add `DATABASE_URL` = your Neon connection string

5. (Optional) Add a Persistent Disk for file storage:
   - Service → Disks → Add Disk
   - Mount path: `/opt/render/project/src/uploads`
   - Add env: `UPLOAD_DIR=/opt/render/project/src/uploads`

## 4. Update Frontend

1. Create `.env` in the project root:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```

2. For local dev with backend:
   ```
   VITE_API_URL=http://localhost:3001
   ```

## 5. Migrate Data from Supabase

Export books from Supabase and re-upload via the app, or write a one-off script:

- Export books metadata from Supabase `books` table
- Download files from Supabase Storage
- Insert into Neon (run schema first)
- Upload files to your backend (or copy to Render disk)

## 6. Remove Supabase

1. **Delete the Supabase project** – In Supabase Dashboard → Project Settings → General → Delete project
2. ~~Remove `@supabase/supabase-js` from `package.json`~~ ✓ Done
3. ~~Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`~~ ✓ Done (use `VITE_API_URL` instead)

## Local Development

```bash
# Terminal 1: Backend
cd backend && npm install && node index.js

# Terminal 2: Frontend
cd .. && npm run dev
```

Set `VITE_API_URL=http://localhost:3001` in `.env`
