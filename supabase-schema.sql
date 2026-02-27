-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) to create the library table and RLS.
-- Then create Storage buckets in Dashboard → Storage: "books" and optionally "covers" (public or private).

-- Library table: one row per book per user
create table if not exists public.library (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  book_key text not null,
  name text not null,
  size bigint not null default 0,
  title text not null default '',
  author text not null default '',
  format text not null default '',
  total_pages int not null default 0,
  current_page int not null default 1,
  progress int not null default 0,
  last_read timestamptz not null default now(),
  cover_hue int not null default 0,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  unique(user_id, book_key)
);

-- RLS: users can only read/write their own rows
alter table public.library enable row level security;

create policy "Users can read own library"
  on public.library for select
  using (auth.uid() = user_id);

create policy "Users can insert own library"
  on public.library for insert
  with check (auth.uid() = user_id);

create policy "Users can update own library"
  on public.library for update
  using (auth.uid() = user_id);

create policy "Users can delete own library"
  on public.library for delete
  using (auth.uid() = user_id);

-- Storage: create bucket "books" in Dashboard → Storage (private).
-- Add policy: "Users can upload/read/delete own files" with (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text)
