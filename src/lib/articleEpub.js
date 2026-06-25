/**
 * articleEpub.js — build a minimal, valid EPUB blob from extracted article text.
 *
 * This lets "Send to Audire" reuse the entire existing upload + reader + TTS
 * pipeline: we turn a web article into a tiny EPUB and upload it like any book.
 */

import JSZip from 'jszip';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * @param {{ title: string, author?: string, paragraphs: string[], sourceUrl?: string }} article
 * @returns {Promise<Blob>}
 */
export async function buildArticleEpub({ title, author = 'Web', paragraphs = [], sourceUrl = '' }) {
  const zip = new JSZip();
  const bookId = uuid();
  const safeTitle = esc(title || 'Imported Article');
  const safeAuthor = esc(author || 'Web');

  // mimetype must be the first entry and stored uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const bodyHtml = paragraphs
    .map((p) => {
      const t = (p || '').trim();
      if (!t) return '';
      if (/^#\s*/.test(t)) return `<h2>${esc(t.replace(/^#\s*/, ''))}</h2>`;
      return `<p>${esc(t)}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  const source = sourceUrl ? `<p class="source">Source: <a href="${esc(sourceUrl)}">${esc(sourceUrl)}</a></p>` : '';

  zip.file(
    'OEBPS/chapter1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${safeTitle}</title><meta charset="utf-8"/></head>
<body>
  <h1>${safeTitle}</h1>
  ${bodyHtml}
  ${source}
</body>
</html>`
  );

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${safeTitle}</title><meta charset="utf-8"/></head>
<body>
  <nav epub:type="toc" id="toc"><h1>Contents</h1>
    <ol><li><a href="chapter1.xhtml">${safeTitle}</a></li></ol>
  </nav>
</body>
</html>`
  );

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    <dc:title>${safeTitle}</dc:title>
    <dc:creator>${safeAuthor}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`
  );

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
}
