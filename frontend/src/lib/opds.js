/**
 * OPDS (Open Publication Distribution System) — Librera-style catalog support.
 * Parse OPDS 1.x (XML) and 2.0 (JSON) feeds. No UI change; use from library/catalog logic.
 * @see https://specs.opds.io/
 */

/**
 * Parse OPDS 2.0 JSON feed.
 * @param {string} text - JSON string
 * @returns {{ title: string, entries: { title: string, author: string, link: string, type: string }[] }}
 */
export function parseOPDS2(text) {
  try {
    const feed = JSON.parse(text);
    const title = feed.metadata?.title || feed.title || 'Catalog';
    const entries = [];
    const pubs = feed.publications || feed['@graph']?.filter?.((x) => x['@type'] === 'Publication') || [];
    for (const pub of pubs) {
      const name = pub.metadata?.title || pub.name || '';
      const author = [].concat(pub.metadata?.author || pub.author || [])
        .map((a) => (typeof a === 'string' ? a : a.name))
        .filter(Boolean)
        .join(', ');
      let link = '';
      const links = pub.links || pub.resources || [];
      const acq = links.find((l) => l.rel === 'http://opds-spec.org/acquisition' || l.type?.includes('epub') || l.type?.includes('pdf'));
      if (acq) link = acq.href || acq.url || '';
      if (!link && links[0]) link = links[0].href || links[0].url || '';
      entries.push({ title: name, author, link, type: acq?.type || '' });
    }
    return { title, entries };
  } catch {
    return { title: '', entries: [] };
  }
}

/**
 * Parse OPDS 1.x XML feed.
 * @param {string} xml
 * @returns {{ title: string, entries: { title: string, author: string, link: string, type: string }[] }}
 */
export function parseOPDS1(xml) {
  const entries = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const feed = doc.querySelector('feed');
    const feedTitle = feed?.querySelector('title')?.textContent?.trim() || 'Catalog';

    for (const entry of doc.querySelectorAll('entry')) {
      const titleEl = entry.querySelector('title');
      const name = titleEl?.textContent?.trim() || '';
      const creator = entry.querySelector('author name, creator');
      const author = creator?.textContent?.trim() || '';
      let link = '';
      let type = '';
      for (const l of entry.querySelectorAll('link')) {
        const rel = (l.getAttribute('rel') || '').toLowerCase();
        const href = l.getAttribute('href') || '';
        const mt = (l.getAttribute('type') || '').toLowerCase();
        if (rel.includes('acquisition') || mt.includes('epub') || mt.includes('pdf')) {
          link = href;
          type = mt;
          break;
        }
        if (!link) link = href;
      }
      entries.push({ title: name, author, link, type });
    }
    return { title: feedTitle, entries };
  } catch {
    return { title: '', entries: [] };
  }
}

/**
 * Detect and parse OPDS feed (JSON or XML).
 * @param {string} text
 * @returns {{ title: string, entries: { title: string, author: string, link: string, type: string }[] }}
 */
export function parseOPDSFeed(text) {
  const t = (text || '').trim();
  if (t.startsWith('{')) return parseOPDS2(t);
  return parseOPDS1(t);
}

/**
 * Fetch OPDS feed from URL (caller must handle CORS/proxy if needed).
 * @param {string} url
 * @returns {Promise<{ title: string, entries: { title: string, author: string, link: string, type: string }[] }>}
 */
export async function fetchOPDSFeed(url) {
  const res = await fetch(url, { mode: 'cors' });
  const text = await res.text();
  return parseOPDSFeed(text);
}
