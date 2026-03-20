import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapBookmark(row) {
  return {
    id: row.id,
    cfi: row.cfi,
    text: row.snippet || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

function mapHighlight(row) {
  return {
    id: row.id,
    cfi: row.cfi,
    text: row.body || '',
    color: row.color || 'yellow',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

/** GET /bookmarks/:bookId */
router.get('/bookmarks/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!UUID.test(bookId)) return res.status(400).json({ error: 'Invalid book id' });
    const { rows } = await query(
      'SELECT id, cfi, snippet, created_at FROM user_bookmarks WHERE book_id = $1 ORDER BY created_at ASC',
      [bookId]
    );
    res.json(rows.map(mapBookmark));
  } catch (err) {
    console.error('librarySync bookmarks GET:', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /bookmarks/:bookId { cfi, text } */
router.post('/bookmarks/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!UUID.test(bookId)) return res.status(400).json({ error: 'Invalid book id' });
    const { cfi, text } = req.body || {};
    if (!cfi || typeof cfi !== 'string') return res.status(400).json({ error: 'cfi required' });
    const snippet = typeof text === 'string' ? text.slice(0, 500) : '';
    const { rows } = await query(
      `INSERT INTO user_bookmarks (book_id, cfi, snippet) VALUES ($1, $2, $3)
       RETURNING id, cfi, snippet, created_at`,
      [bookId, cfi, snippet]
    );
    res.status(201).json(mapBookmark(rows[0]));
  } catch (err) {
    console.error('librarySync bookmarks POST:', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /bookmarks/:id */
router.delete('/bookmarks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    await query('DELETE FROM user_bookmarks WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('librarySync bookmarks DELETE:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /highlights/:bookId */
router.get('/highlights/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!UUID.test(bookId)) return res.status(400).json({ error: 'Invalid book id' });
    const { rows } = await query(
      'SELECT id, cfi, body, color, created_at FROM user_highlights WHERE book_id = $1 ORDER BY created_at ASC',
      [bookId]
    );
    res.json(rows.map(mapHighlight));
  } catch (err) {
    console.error('librarySync highlights GET:', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /highlights/:bookId { cfi, text, color } */
router.post('/highlights/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!UUID.test(bookId)) return res.status(400).json({ error: 'Invalid book id' });
    const { cfi, text, color = 'yellow' } = req.body || {};
    if (!cfi || typeof cfi !== 'string') return res.status(400).json({ error: 'cfi required' });
    const body = typeof text === 'string' ? text.slice(0, 2000) : '';
    const { rows } = await query(
      `INSERT INTO user_highlights (book_id, cfi, body, color) VALUES ($1, $2, $3, $4)
       RETURNING id, cfi, body, color, created_at`,
      [bookId, cfi, body, String(color).slice(0, 32)]
    );
    res.status(201).json(mapHighlight(rows[0]));
  } catch (err) {
    console.error('librarySync highlights POST:', err);
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /highlights/:id { color } */
router.patch('/highlights/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const { color } = req.body || {};
    if (!color) return res.status(400).json({ error: 'color required' });
    const { rows } = await query(
      'UPDATE user_highlights SET color = $2 WHERE id = $1 RETURNING id, cfi, body, color, created_at',
      [id, String(color).slice(0, 32)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(mapHighlight(rows[0]));
  } catch (err) {
    console.error('librarySync highlights PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /highlights/:id */
router.delete('/highlights/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    await query('DELETE FROM user_highlights WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('librarySync highlights DELETE:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /collections */
router.get('/collections', async (req, res) => {
  try {
    const { rows: cols } = await query(
      'SELECT id, name, sort_order, created_at FROM user_collections ORDER BY sort_order ASC, created_at ASC'
    );
    const out = [];
    for (const c of cols) {
      const { rows: books } = await query(
        'SELECT book_id FROM user_collection_books WHERE collection_id = $1 ORDER BY position ASC',
        [c.id]
      );
      out.push({
        id: c.id,
        name: c.name,
        bookIds: books.map((b) => b.book_id),
      });
    }
    res.json(out);
  } catch (err) {
    console.error('librarySync collections GET:', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /collections { name } */
router.post('/collections', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    const { rows: mx } = await query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM user_collections');
    const nextOrder = (mx[0]?.m ?? -1) + 1;
    const { rows } = await query(
      'INSERT INTO user_collections (name, sort_order) VALUES ($1, $2) RETURNING id, name, sort_order, created_at',
      [name.trim().slice(0, 200), nextOrder]
    );
    res.status(201).json({ id: rows[0].id, name: rows[0].name, bookIds: [] });
  } catch (err) {
    console.error('librarySync collections POST:', err);
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /collections/:id { name } */
router.patch('/collections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const { name } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      'UPDATE user_collections SET name = $2 WHERE id = $1 RETURNING id, name',
      [id, name.trim().slice(0, 200)]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const { rows: books } = await query(
      'SELECT book_id FROM user_collection_books WHERE collection_id = $1 ORDER BY position ASC',
      [id]
    );
    res.json({ id: rows[0].id, name: rows[0].name, bookIds: books.map((b) => b.book_id) });
  } catch (err) {
    console.error('librarySync collections PATCH:', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /collections/:id */
router.delete('/collections/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    await query('DELETE FROM user_collections WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('librarySync collections DELETE:', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /collections/:id/books { bookId } */
router.post('/collections/:id/books', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid collection id' });
    const { bookId } = req.body || {};
    if (!bookId || typeof bookId !== 'string' || !UUID.test(bookId)) {
      return res.status(400).json({ error: 'bookId required' });
    }
    const { rows: maxRow } = await query(
      'SELECT COALESCE(MAX(position), -1) AS m FROM user_collection_books WHERE collection_id = $1',
      [id]
    );
    const pos = (maxRow[0]?.m ?? -1) + 1;
    await query(
      `INSERT INTO user_collection_books (collection_id, book_id, position) VALUES ($1, $2, $3)
       ON CONFLICT (collection_id, book_id) DO NOTHING`,
      [id, bookId, pos]
    );
    const { rows: books } = await query(
      'SELECT book_id FROM user_collection_books WHERE collection_id = $1 ORDER BY position ASC',
      [id]
    );
    res.json({ bookIds: books.map((b) => b.book_id) });
  } catch (err) {
    console.error('librarySync collection add book:', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /collections/:collectionId/books/:bookId */
router.delete('/collections/:collectionId/books/:bookId', async (req, res) => {
  try {
    const { collectionId, bookId } = req.params;
    if (!UUID.test(collectionId) || !UUID.test(bookId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    await query(
      'DELETE FROM user_collection_books WHERE collection_id = $1 AND book_id = $2',
      [collectionId, bookId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('librarySync collection remove book:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
