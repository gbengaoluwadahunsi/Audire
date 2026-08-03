import express from 'express';
import 'dotenv/config';

const router = express.Router();
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.1-8b-instant';

async function groqChat(messages, options = {}) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set in backend .env');
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: options.max_tokens ?? 512,
      temperature: options.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText || 'Groq API error');
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

router.post('/explain', async (req, res) => {
  try {
    const { text, context } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const system = 'You are a helpful reading assistant. Explain the selected text in simple, clear terms. Be concise (2-4 sentences).';
    const user = context
      ? `Context from the book: "${String(context).slice(-300)}"\n\nSelected text: "${text}"\n\nExplain this in simple terms:`
      : `Explain this in simple terms: "${text}"`;
    const content = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }]);
    res.json({ content });
  } catch (e) {
    console.error('AI explain error:', e);
    res.status(500).json({ error: e.message || 'Explain failed' });
  }
});

router.post('/define', async (req, res) => {
  try {
    const { text, context } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const system = 'You are a helpful reading assistant. Define the selected word or phrase in the context of how it\'s used. Give a brief, clear definition (1-2 sentences).';
    const user = context
      ? `Context: "${String(context).slice(-200)}"\n\nWord/phrase: "${text}"\n\nDefine in context:`
      : `Define: "${text}"`;
    const content = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }]);
    res.json({ content });
  } catch (e) {
    console.error('AI define error:', e);
    res.status(500).json({ error: e.message || 'Define failed' });
  }
});

router.post('/summarize', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const system = 'You are a helpful reading assistant. Summarize the following text in 2-4 concise sentences, capturing the main ideas.';
    const user = `Summarize: "${String(text).slice(0, 2000)}"`;
    const content = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }], { max_tokens: 256 });
    res.json({ content });
  } catch (e) {
    console.error('AI summarize error:', e);
    res.status(500).json({ error: e.message || 'Summarize failed' });
  }
});

router.post('/flashcards', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    const system = `You are an expert study assistant. Generate 4-6 high-quality flashcards that test understanding, not just recall.

Rules:
- Mix question types: definitions, "Why...?", "How does...?", "What happens when...?", comparisons, trade-offs
- Avoid trivial "What is X?" unless it's a core concept. Prefer questions that require thinking.
- Each question should have a concise answer (1-3 sentences) that comes directly from the text.
- Focus on key concepts, decisions, and implications the reader should remember.

Return ONLY a JSON array. Each object: {"front": "question", "back": "answer"}. No markdown, no extra text.
Example: [{"front":"Why might teams choose micro-frontends over a monolith?","back":"..."}]`;
    const user = `Generate flashcards from this text:\n\n"${String(text).slice(0, 3000)}"`;
    const raw = await groqChat([{ role: 'system', content: system }, { role: 'user', content: user }], { max_tokens: 768 });
    const match = raw.match(/\[[\s\S]*\]/);
    let cards = [];
    try { cards = match ? JSON.parse(match[0]) : []; } catch { cards = []; }
    if (!Array.isArray(cards)) cards = [];
    cards = cards.filter((c) => c && (String(c.front || '').trim() && String(c.back || '').trim()));
    res.json({ cards });
  } catch (e) {
    console.error('AI flashcards error:', e);
    res.status(500).json({ error: e.message || 'Flashcards failed', cards: [] });
  }
});

router.post('/catchup', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text required' });
    }
    // Use the tail of what was read so the recap reflects the most recent context.
    const recent = String(text).slice(-6000);
    const system = 'You are a reading companion giving a quick "catch me up" recap so the user can resume listening. Recap the key events, ideas, and where things stand in 3-6 short sentences. Be clear and spoiler-free beyond what is provided.';
    const user = `Here is what the reader has covered so far (most recent part):\n"""${recent}"""\n\nGive a quick recap to help them pick back up:`;
    const content = await groqChat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { max_tokens: 400 }
    );
    res.json({ content });
  } catch (e) {
    console.error('AI catchup error:', e);
    res.status(500).json({ error: e.message || 'Catch-up failed' });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const { question, context } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question required' });
    }
    const ctx = String(context || '').slice(0, 6000);
    const system = 'You are a helpful reading assistant answering questions about a book the user is reading. Answer ONLY using the provided context. If the answer is not in the context, say you can\'t find it in this part of the book. Be concise and clear.';
    const user = ctx
      ? `Context from the book:\n"""${ctx}"""\n\nQuestion: ${question}\n\nAnswer:`
      : `Question: ${question}\n\n(No book context was provided.) Answer:`;
    const content = await groqChat(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { max_tokens: 400 }
    );
    res.json({ content });
  } catch (e) {
    console.error('AI ask error:', e);
    res.status(500).json({ error: e.message || 'Ask failed' });
  }
});

export default router;
