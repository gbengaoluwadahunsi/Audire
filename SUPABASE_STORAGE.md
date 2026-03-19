# Supabase Storage Setup (Free, No Card Required)

Use Supabase Storage to persist book files on Render's free tier (which has ephemeral disk).

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Create a new project
3. Wait for the project to be ready

## 2. Create Storage Buckets

1. In Supabase Dashboard → **Storage**
2. Click **New bucket**
3. Create bucket named **`Books`** → Enable **Public bucket** → Create
4. Create another bucket named **`Covers`** → Enable **Public bucket** → Create

## 3. Get API Credentials

1. Go to **Project Settings** (gear icon) → **API**
2. Copy:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **service_role** key (under "Project API keys" – keep this secret!)

## 4. Add to Backend Environment

Add to your backend `.env` (local) or Render **Environment**:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

## 5. Deploy

Redeploy your backend. New uploads will be stored in Supabase and persist across restarts.

---

**Note:** Existing books with local file URLs will still 404 (their files are gone). Re-upload those books.
