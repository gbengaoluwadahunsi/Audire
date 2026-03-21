-- Run this in Neon SQL Editor (Dashboard → SQL Editor) to create tables
-- https://neon.tech

-- Audire books table for Neon PostgreSQL
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text,
  cover text,
  file_url text NOT NULL,
  format text DEFAULT 'epub',
  file_hash text,
  added_at timestamptz DEFAULT now(),
  last_cfi text,
  last_read timestamptz,
  progress_percent numeric DEFAULT 0,
  total_pages integer
);

CREATE INDEX IF NOT EXISTS idx_books_added_at ON books(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_file_hash ON books(file_hash);

-- Bookmarks, highlights, collections (synced via /api/library-sync)
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cfi text NOT NULL,
  snippet text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_book ON user_bookmarks(book_id);

CREATE TABLE IF NOT EXISTS user_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cfi text NOT NULL,
  body text,
  color text DEFAULT 'yellow',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_highlights_book ON user_highlights(book_id);

CREATE TABLE IF NOT EXISTS user_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_collection_books (
  collection_id uuid NOT NULL REFERENCES user_collections(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, book_id)
);
CREATE INDEX IF NOT EXISTS idx_user_collection_books_order ON user_collection_books(collection_id, position);

-- Optional: backfill so "Last read" sort has a timestamp for books never PATCHed (run once in Neon SQL)
-- UPDATE books SET last_read = added_at WHERE last_read IS NULL;
