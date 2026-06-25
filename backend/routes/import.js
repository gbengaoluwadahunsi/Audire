import { Router } from 'express';

const router = Router();

function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, '\u2019')
    .replace(/&lsquo;/gi, '\u2018')
    .replace(/&ldquo;/gi, '\u201C')
    .replace(/&rdquo;/gi, '\u201D')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&hellip;/gi, '\u2026')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch { return ''; }
    });
}

function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return decodeEntities(og[1]).trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, '')).trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) return decodeEntities(t[1].replace(/<[^>]+>/g, '')).trim();
  return 'Imported Article';
}

function extractByline(html) {
  const m = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]).trim() : 'Web';
}

/** Strip chrome and return the most text-dense block, then split into paragraphs. */
function extractReadableParagraphs(html) {
  let body = html;
  // Remove non-content elements entirely.
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ');

  // Prefer <article> if present.
  const article = body.match(/<article[\s\S]*?<\/article>/i);
  const scope = article ? article[0] : body;

  // Collect paragraph-ish blocks.
  const blocks = [];
  const re = /<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(scope)) !== null) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length >= 40 || /^#/.test(text)) blocks.push(text);
  }

  // Fallback: strip all tags if we found too little.
  if (blocks.join(' ').length < 400) {
    const plain = decodeEntities(scope.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    return plain
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .reduce((acc, s) => {
        const last = acc[acc.length - 1];
        if (last && last.length < 300) acc[acc.length - 1] = `${last} ${s}`;
        else acc.push(s);
        return acc;
      }, [])
      .filter((s) => s.trim().length > 0);
  }

  return blocks;
}

router.post('/url', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'A valid http(s) URL is required' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let html;
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AudireBot/1.0; +https://audire.app)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `Could not fetch page (HTTP ${resp.status})` });
      }
      const ctype = resp.headers.get('content-type') || '';
      if (!/text\/html|xml/i.test(ctype)) {
        return res.status(415).json({ error: 'That link is not a readable web page' });
      }
      html = await resp.text();
    } finally {
      clearTimeout(timer);
    }

    const title = extractTitle(html);
    const author = extractByline(html);
    const paragraphs = extractReadableParagraphs(html);

    const wordCount = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) {
      return res.status(422).json({ error: 'Could not extract readable text from that page' });
    }

    res.json({ title, author, paragraphs, sourceUrl: url });
  } catch (e) {
    console.error('Import URL error:', e);
    const aborted = e?.name === 'AbortError';
    res.status(aborted ? 504 : 500).json({ error: aborted ? 'Fetching the page timed out' : (e.message || 'Import failed') });
  }
});

export default router;
