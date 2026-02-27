/**
 * Supabase client for cloud backup of library and book files.
 * When configured and user is signed in, library and files sync to Supabase so clearing cache doesn't lose books.
 */

import { createClient } from '@supabase/supabase-js';

const url = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL;
const anonKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = !!(url && anonKey);

let _client = null;

export function getSupabase() {
  if (!hasSupabase) return null;
  if (!_client) _client = createClient(url, anonKey);
  return _client;
}

export const BUCKET_BOOKS = 'books';
export const BUCKET_COVERS = 'covers';
