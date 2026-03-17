import path from 'path';
import fs from 'fs/promises';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { pdf } from 'pdf-to-img';
import { EPub } from 'epub2';

/**
 * Process uploaded book file: extract metadata and optionally cover.
 * filePath: full path to uploaded file (e.g. .../uploads/books/uuid.epub)
 * Returns { bookData: { id, title, author, format }, coverPath or null }
 */
export async function processUpload(filePath, booksDir, coversDir) {
  await fs.mkdir(coversDir, { recursive: true });

  const ext = path.extname(filePath).toLowerCase();
  const id = path.basename(filePath, ext);

  if (ext === '.epub') {
    return processEpub(filePath, id, coversDir);
  }
  if (ext === '.pdf') {
    return processPdf(filePath, id, coversDir);
  }
  throw new Error('Unsupported format. Use EPUB or PDF.');
}

/** Try epub2 library first (handles more EPUB variants), fallback to custom extraction */
async function processEpub(filePath, id, coversDir) {
  let title = path.basename(filePath, '.epub');
  let author = null;
  let coverPath = null;

  // Primary: epub2 library (handles EPUB 2/3 cover metadata, guide, etc.)
  try {
    const epub = await EPub.createAsync(filePath);
    if (epub.metadata?.title) title = epub.metadata.title;
    if (epub.metadata?.creator) author = epub.metadata.creator;

    const coverId = epub.metadata?.cover;
    const coverCandidates = [];
    if (coverId && epub.manifest?.[coverId]) {
      const mt = (epub.manifest[coverId]['media-type'] || epub.manifest[coverId].mediaType || '').toLowerCase();
      if (mt.startsWith('image/')) coverCandidates.push(coverId);
    }
    if (coverCandidates.length === 0 && epub.manifest) {
      for (const [mid, item] of Object.entries(epub.manifest)) {
        const mt = (item['media-type'] || item.mediaType || '').toLowerCase();
        if (mt.startsWith('image/')) coverCandidates.push(mid);
      }
    }

    for (const cid of coverCandidates) {
      try {
        const [buf, mime] = await epub.getImageAsync(cid);
        if (buf && Buffer.isBuffer(buf)) {
          const ext = (mime || '').includes('png') ? '.png' : (mime || '').includes('gif') ? '.gif' : (mime || '').includes('webp') ? '.webp' : '.jpg';
          coverPath = path.join(coversDir, `${id}${ext}`);
          await fs.writeFile(coverPath, buf);
          break;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Fall through to custom extraction
  }

  // Fallback: custom JSZip-based extraction
  if (!coverPath) {
    try {
      const result = await processEpubCustom(filePath, id, coversDir);
      if (result.coverPath) coverPath = result.coverPath;
      if (result.title) title = result.title;
      if (result.author !== undefined) author = result.author;
    } catch {
      // Keep title/author from epub2 or path.basename
    }
  }

  return {
    bookData: { id, title, author, format: 'epub' },
    coverPath,
  };
}

async function processEpubCustom(filePath, id, coversDir) {
  const buf = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buf);

  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('Invalid EPUB: no container.xml');

  const containerXml = await containerEntry.async('string');
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error('Invalid EPUB: no content reference');

  const opfPath = opfMatch[1];
  const opfDir = path.dirname(opfPath).replace(/\\/g, '/');
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error('Invalid EPUB: OPF not found');

  const opfXml = await opfEntry.async('string');
  const title = extractXml(opfXml, 'dc:title') || path.basename(filePath, '.epub');
  const author = extractXml(opfXml, 'dc:creator') || null;

  let coverPath = null;
  let coverItem = null;

  const coverId = opfXml.match(/<meta name="cover" content="([^"]+)"/)?.[1];
  if (coverId) {
    coverItem = opfXml.match(new RegExp(`<item[^>]+id="${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+href="([^"]+)"`))?.[1]
      || opfXml.match(new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))?.[1];
  }
  if (!coverItem) {
    coverItem = opfXml.match(/<item[^>]+href="([^"]+)"[^>]+id="cover"/)?.[1]
      || opfXml.match(/<item[^>]+id="cover"[^>]+href="([^"]+)"/)?.[1];
  }
  if (!coverItem) {
    const coverImageMatch = opfXml.match(/<item[^>]+properties="[^"]*cover-image[^"]*"[^>]+href="([^"]+)"/)
      || opfXml.match(/<item[^>]+href="([^"]+)"[^>]+properties="[^"]*cover-image[^"]*"/);
    coverItem = coverImageMatch?.[1];
  }
  if (!coverItem) {
    const itemMatches = opfXml.matchAll(/<item[^>]+href="([^"]+\.(?:jpg|jpeg|png|gif|webp))"[^>]*>/gi);
    for (const m of itemMatches) {
      const href = m[1];
      const base = path.basename(href, path.extname(href)).toLowerCase();
      if (base === 'cover' || base === 'coverimage') {
        coverItem = href;
        break;
      }
    }
  }
  if (!coverItem) {
    const spineItemRefs = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)?.[1];
    const firstIdRef = spineItemRefs?.match(/<itemref[^>]+idref="([^"]+)"[^>]*>/)?.[1];
    if (firstIdRef) {
      const firstItemMatch = opfXml.match(new RegExp(`<item[^>]+id="${firstIdRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]+href="([^"]+)"`))
        || opfXml.match(new RegExp(`<item[^>]+href="([^"]+)"[^>]+id="${firstIdRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      const firstHref = firstItemMatch?.[1];
      if (firstHref && /\.(x?html?|htm)$/i.test(firstHref)) {
        const firstFullPath = path.join(opfDir, firstHref).replace(/\\/g, '/');
        const firstDir = path.dirname(firstFullPath).replace(/\\/g, '/');
        const firstEntry = zip.file(firstFullPath) || zip.file(firstHref);
        if (firstEntry) {
          const html = await firstEntry.async('string');
          const imgMatch = html.match(/<img[^>]+src="([^"]+)"/i) || html.match(/<image[^>]+xlink:href="([^"]+)"/i);
          if (imgMatch) {
            const imgHref = imgMatch[1].split('#')[0].trim();
            const imgFullPath = (imgHref.startsWith('/') ? imgHref.slice(1) : path.join(firstDir, imgHref)).replace(/\\/g, '/');
            const imgEntry = zip.file(imgFullPath) || zip.file(imgHref) || zip.file(path.join(opfDir, imgHref).replace(/\\/g, '/'));
            if (imgEntry) coverItem = imgFullPath;
          }
        }
      }
    }
  }

  if (coverItem) {
    const coverHref = path.join(opfDir, coverItem).replace(/\\/g, '/');
    const coverEntry = zip.file(coverHref) || zip.file(coverItem) || zip.file(coverItem.replace(/^\.\//, ''));
    if (coverEntry) {
      const isHtml = /\.(x?html?|htm)$/i.test(coverItem);
      if (isHtml) {
        const html = await coverEntry.async('string');
        const imgMatch = html.match(/<img[^>]+src="([^"]+)"/i) || html.match(/<image[^>]+xlink:href="([^"]+)"/i);
        const imgHref = imgMatch?.[1]?.split('#')[0]?.trim();
        if (imgHref) {
          const firstDir = path.dirname(coverHref).replace(/\\/g, '/');
          const imgFullPath = (imgHref.startsWith('/') ? imgHref.slice(1) : path.join(firstDir, imgHref)).replace(/\\/g, '/');
          const imgEntry = zip.file(imgFullPath) || zip.file(imgHref) || zip.file(path.join(opfDir, imgHref).replace(/\\/g, '/'));
          if (imgEntry) {
            const coverBuf = await imgEntry.async('nodebuffer');
            const coverExt = path.extname(imgHref).toLowerCase() || '.jpg';
            const coverFileName = `${id}${coverExt}`;
            coverPath = path.join(coversDir, coverFileName);
            await fs.writeFile(coverPath, coverBuf);
          }
        }
      } else {
        const coverBuf = await coverEntry.async('nodebuffer');
        const coverExt = path.extname(coverItem).toLowerCase() || '.jpg';
        const coverFileName = `${id}${coverExt}`;
        coverPath = path.join(coversDir, coverFileName);
        await fs.writeFile(coverPath, coverBuf);
      }
    }
  }

  return { coverPath, title, author };
}

async function processPdf(filePath, id, coversDir) {
  const buf = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(buf);
  const title = pdfDoc.getTitle() || path.basename(filePath, '.pdf');
  const author = pdfDoc.getAuthor() || null;

  let coverPath = null;
  try {
    const doc = await pdf(filePath, { scale: 2 });
    const firstPage = await doc.getPage(1);
    if (firstPage) {
      const coverFileName = `${id}.png`;
      coverPath = path.join(coversDir, coverFileName);
      await fs.writeFile(coverPath, firstPage);
    }
  } catch (err) {
    console.warn('PDF cover extraction failed:', err?.message || err);
  }

  return {
    bookData: { id, title, author, format: 'pdf' },
    coverPath,
  };
}

function extractXml(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * Extract cover for an existing book file. Used by repair-cover endpoint.
 */
export async function extractCover(filePath, id, format, coversDir) {
  if (format === 'pdf') {
    try {
      const doc = await pdf(filePath, { scale: 2 });
      const firstPage = await doc.getPage(1);
      if (firstPage) {
        const coverPath = path.join(coversDir, `${id}.png`);
        await fs.writeFile(coverPath, firstPage);
        return coverPath;
      }
    } catch (err) {
      console.warn('PDF cover extraction failed:', err?.message || err);
    }
    return null;
  }
  if (format === 'epub') {
    const result = await processEpub(filePath, id, coversDir);
    return result.coverPath;
  }
  return null;
}
