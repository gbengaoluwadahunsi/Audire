/**
 * Supabase Storage helpers for books and covers.
 * Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env to enable.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_KEY?.trim();

export const supabase = url && key ? createClient(url, key) : null;

const BOOKS_BUCKET = 'Books';
const COVERS_BUCKET = 'Covers';

export function isSupabaseEnabled() {
  return !!supabase;
}

/** Upload a book file to Supabase Storage. Returns public URL or null. */
export async function uploadBookFile(bookId, format, buffer) {
  if (!supabase) return null;
  const ext = format === 'pdf' ? '.pdf' : '.epub';
  const path = `${bookId}${ext}`;
  const { data, error } = await supabase.storage
    .from(BOOKS_BUCKET)
    .upload(path, buffer, { contentType: format === 'pdf' ? 'application/pdf' : 'application/epub+zip', upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BOOKS_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

/** Upload a cover image to Supabase Storage. Returns public URL or null. */
export async function uploadCover(bookId, buffer, ext = '.jpg') {
  if (!supabase) return null;
  const path = `${bookId}${ext}`;
  const contentType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const { data, error } = await supabase.storage
    .from(COVERS_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(COVERS_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

/** Delete a book file from Supabase Storage. */
export async function deleteBookFile(bookId, format) {
  if (!supabase) return;
  const ext = format === 'pdf' ? '.pdf' : '.epub';
  await supabase.storage.from(BOOKS_BUCKET).remove([`${bookId}${ext}`]);
}

/** Delete a cover from Supabase Storage. */
export async function deleteCover(bookId) {
  if (!supabase) return;
  const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const paths = exts.map((e) => `${bookId}${e}`);
  await supabase.storage.from(COVERS_BUCKET).remove(paths);
}

/** Check if a URL is a Supabase Storage URL (external, not our backend). */
export function isSupabaseUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('supabase') && url.includes('storage');
}

/** Get public URL for a book file in Supabase Storage. */
export function getBookFilePublicUrl(bookId, format) {
  if (!supabase) return null;
  const ext = format === 'pdf' ? '.pdf' : '.epub';
  const filePath = `${bookId}${ext}`;
  const { data } = supabase.storage.from(BOOKS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
