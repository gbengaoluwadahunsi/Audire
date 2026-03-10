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
  added_at timestamptz DEFAULT now(),
  last_cfi text,
  last_read timestamptz,
  progress_percent numeric DEFAULT 0,
  total_pages integer
);

CREATE INDEX IF NOT EXISTS idx_books_added_at ON books(added_at DESC);
