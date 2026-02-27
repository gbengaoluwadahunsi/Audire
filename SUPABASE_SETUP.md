# Supabase setup (cloud backup for your library)

When you clear browser cache, books stored only in the browser are lost. With Supabase, you sign in once and your library (and book files) are stored in the cloud. After clearing cache, sign in again and your books restore.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. In **Settings → API**: copy **Project URL** and **anon public** key.

## 2. Add env vars

In the project root, create or edit `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Restart the dev server after changing `.env`.

## 3. Run the schema

In Supabase **SQL Editor**, run the contents of `supabase-schema.sql` in this repo. That creates the `library` table and RLS policies.

## 4. Create Storage bucket

1. In Supabase go to **Storage** and create a bucket named **books** (private).
2. Add a policy so users can only access their own files:
   - Policy name: e.g. "Users own files in their folder"
   - Allowed operation: All (or separate SELECT, INSERT, UPDATE, DELETE)
   - Target: bucket `books`
   - Policy: `(storage.foldername(name))[1] = auth.uid()::text`

After that, open **Settings** in the app. If Supabase is configured, you’ll see **Cloud backup**: sign up or sign in. New books you add (and existing local books you re-add) will be backed up; if you clear cache and sign in again, your library will load from the cloud.
