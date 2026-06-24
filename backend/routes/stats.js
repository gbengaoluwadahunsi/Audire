import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/session/start', async (req, res) => {
  try {
    const { bookId } = req.body || {};
    if (bookId && !UUID.test(bookId)) return res.status(400).json({ error: 'Invalid bookId' });
    const { rows } = await query(
      `INSERT INTO reading_sessions (book_id) VALUES ($1) RETURNING id, started_at`,
      [bookId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Start session error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/session/:id/end', async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid session id' });
    const { pagesRead } = req.body || {};
    const { rows } = await query(
      `UPDATE reading_sessions SET ended_at = now(),
       duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))::int
       WHERE id = $1
       RETURNING id, started_at, ended_at, duration_seconds`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (typeof pagesRead === 'number' && pagesRead >= 0) {
      await query('UPDATE reading_sessions SET pages_read = $1 WHERE id = $2', [pagesRead, id]);
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - Number(days) * 86400000).toISOString();

    const { rows: totalStats } = await query(
      `SELECT
         COALESCE(SUM(duration_seconds), 0) as total_seconds,
         COALESCE(SUM(pages_read), 0) as total_pages,
         COUNT(*) as total_sessions,
         COUNT(DISTINCT date(started_at)) as active_days
       FROM reading_sessions
       WHERE started_at >= $1`,
      [since]
    );

    const { rows: dailyStats } = await query(
      `SELECT
         date(started_at) as day,
         COALESCE(SUM(duration_seconds), 0) as seconds,
         COALESCE(SUM(pages_read), 0) as pages,
         COUNT(*) as sessions
       FROM reading_sessions
       WHERE started_at >= $1
       GROUP BY date(started_at)
       ORDER BY day DESC`,
      [since]
    );

    const { rows: streakData } = await query(
      `SELECT DISTINCT date(started_at) as day
       FROM reading_sessions
       WHERE started_at >= $1
       ORDER BY day DESC`,
      [since]
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const row of streakData) {
      const day = new Date(row.day);
      day.setHours(0, 0, 0, 0);
      const diff = Math.round((today - day) / 86400000);
      if (diff === streak) {
        streak++;
      } else {
        break;
      }
    }

    res.json({
      total: totalStats[0],
      daily: dailyStats,
      streak,
    });
  } catch (err) {
    console.error('Stats summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
