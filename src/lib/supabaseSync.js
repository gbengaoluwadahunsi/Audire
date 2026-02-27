/**
 * Supabase sync: library list and book files in the cloud.
 * Sign in to back up your library so clearing cache doesn't wipe it.
 */

import { getSupabase, hasSupabase, BUCKET_BOOKS, BUCKET_COVERS } from './supabase.js';

const LIBRARY_TABLE = 'library';

function safeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Fetch library entries for user from Supabase */
export async function fetchLibraryFromSupabase(userId) {
  if (!hasSupabase || !userId) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(LIBRARY_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('last_read', { ascending: false });
  if (error) {
    console.warn('[Supabase] fetchLibrary:', error.message);
    return null;
  }
  return (data || []).map((row) => ({
    key: row.book_key,
    name: row.name,
    size: row.size,
    title: row.title || row.name?.replace(/\.[^.]+$/, '') || '',
    author: row.author || '',
    format: row.format || '',
    totalPages: row.total_pages || 0,
    currentPage: row.current_page || 1,
    progress: row.progress ?? 0,
    lastRead: row.last_read ? new Date(row.last_read).getTime() : Date.now(),
    coverHue: row.cover_hue ?? 0,
    isFavorite: row.is_favorite ?? false,
  }));
}

/** Upload book file to Storage and add library row */
export async function uploadBookToSupabase(userId, bookKey, name, size, buffer, entry) {
  if (!hasSupabase || !userId) return false;
  const supabase = getSupabase();
  const path = `${safeKey(userId)}/${safeKey(bookKey)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_BOOKS)
    .upload(path, buffer, { upsert: true, contentType: 'application/octet-stream' });

  if (uploadError) {
    console.warn('[Supabase] upload file:', uploadError.message);
    return false;
  }

  const { error: insertError } = await supabase.from(LIBRARY_TABLE).upsert(
    {
      user_id: userId,
      book_key: bookKey,
      name: entry.name || name,
      size: entry.size ?? size,
      title: entry.title || name?.replace(/\.[^.]+$/, '') || '',
      author: entry.author || '',
      format: entry.format || '',
      total_pages: entry.totalPages ?? 0,
      current_page: entry.currentPage ?? 1,
      progress: entry.progress ?? 0,
      last_read: new Date().toISOString(),
      cover_hue: entry.coverHue ?? 0,
      is_favorite: entry.isFavorite ?? false,
    },
    { onConflict: 'user_id,book_key' }
  );

  if (insertError) {
    console.warn('[Supabase] insert library:', insertError.message);
    return false;
  }
  return true;
}

/** Download book file from Storage (returns ArrayBuffer or null) */
export async function downloadBookFromSupabase(userId, bookKey) {
  if (!hasSupabase || !userId) return null;
  const supabase = getSupabase();
  const path = `${safeKey(userId)}/${safeKey(bookKey)}`;
  const { data, error } = await supabase.storage.from(BUCKET_BOOKS).download(path);
  if (error || !data) return null;
  return await data.arrayBuffer();
}

/** Update library row progress (e.g. after reading) */
export async function updateLibraryProgressSupabase(userId, bookKey, page, totalPages) {
  if (!hasSupabase || !userId) return;
  const supabase = getSupabase();
  await supabase
    .from(LIBRARY_TABLE)
    .update({
      current_page: page,
      progress: totalPages > 0 ? Math.round((page / totalPages) * 100) : 0,
      last_read: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('book_key', bookKey);
}

/** Remove book from Supabase (Storage + row) */
export async function removeBookFromSupabase(userId, bookKey) {
  if (!hasSupabase || !userId) return;
  const supabase = getSupabase();
  const path = `${safeKey(userId)}/${safeKey(bookKey)}`;
  await supabase.storage.from(BUCKET_BOOKS).remove([path]);
  await supabase.from(LIBRARY_TABLE).delete().eq('user_id', userId).eq('book_key', bookKey);
}
