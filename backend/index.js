import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import booksRouter from './routes/books.js';
import aiRouter from './routes/ai.js';
import ttsRouter from './routes/tts.js';
import librarySyncRouter from './routes/librarySync.js';
import authRouter from './routes/auth.js';
import statsRouter from './routes/stats.js';
import importRouter from './routes/import.js';
import { ensureSchema } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRouter);
app.use('/api/books', booksRouter);
app.use('/api/library-sync', librarySyncRouter);
app.use('/api/ai', aiRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/import', importRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Audire backend running on port ${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set - books API will fail');
  } else {
    ensureSchema()
      .then(() => console.log('Database schema ready'))
      .catch((err) => console.error('Schema setup failed:', err.message));
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY not set - AI features will fail');
  }
});
