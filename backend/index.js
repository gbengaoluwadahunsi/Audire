import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import booksRouter from './routes/books.js';
import aiRouter from './routes/ai.js';
import ttsRouter from './routes/tts.js';
import { isSupabaseEnabled } from './supabaseStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/books', booksRouter);
app.use('/api/ai', aiRouter);
app.use('/api/tts', ttsRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Audire backend running on port ${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set - books API will fail');
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY not set - AI features will fail');
  }
  if (isSupabaseEnabled()) {
    console.log('Supabase Storage enabled - books will be stored in the cloud');
  }
});
