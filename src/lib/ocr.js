// OCR utility for scanned PDF pages using Tesseract.js
import { createWorker } from 'tesseract.js';

let worker = null;
let workerReady = false;
let workerPromise = null;

async function getWorker() {
  if (workerReady && worker) return worker;
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    try {
      worker = await createWorker('eng');
      workerReady = true;
      return worker;
    } catch (e) {
      workerPromise = null;
      throw e;
    }
  })();

  return workerPromise;
}

/**
 * Render a PDF page to an image and run OCR on it.
 * @param {PDFDocumentProxy} pdfDoc - loaded pdfjs document
 * @param {number} pageNum - 1-based page number
 * @returns {Promise<string>} extracted text
 */
export async function ocrPdfPage(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  // Render at 2x scale for better OCR accuracy
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = new OffscreenCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const w = await getWorker();
  const { data: { text } } = await w.recognize(blob);
  return (text || '').trim();
}

/**
 * Run OCR on an image URL or Blob.
 * @param {string|Blob} urlOrBlob
 * @returns {Promise<string>}
 */
export async function ocrImageUrl(urlOrBlob) {
  if (!urlOrBlob) return '';
  try {
    const w = await getWorker();
    const { data: { text } } = await w.recognize(urlOrBlob);
    return (text || '').trim();
  } catch (err) {
    console.warn('ocrImageUrl error:', err?.message);
    return '';
  }
}

/**
 * Run OCR on image/figure elements within an EPUB section HTML document.
 * @param {Object} book - loaded epubjs book instance
 * @param {string} href - section href
 * @returns {Promise<string>} extracted text from section images
 */
export async function ocrEpubSection(book, href) {
  if (!book || !href) return '';
  try {
    const section = book.spine?.get?.(href);
    if (!section) return '';

    await section.load(book.load.bind(book));
    const doc = section.document;
    if (!doc || !doc.body) return '';

    const imgs = Array.from(doc.body.querySelectorAll('img, image, svg'));
    if (!imgs.length) return '';

    const ocrResults = [];
    for (const img of imgs) {
      // First check alt/title/aria-label attributes
      const alt = img.getAttribute?.('alt') || img.getAttribute?.('title') || img.getAttribute?.('aria-label');
      if (alt && alt.trim().length > 2) {
        ocrResults.push(alt.trim());
      }

      let src = img.getAttribute?.('src') || img.getAttribute?.('xlink:href') || img.src;
      if (!src && img.tagName?.toLowerCase() === 'svg') {
        try {
          const svgData = new XMLSerializer().serializeToString(img);
          const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          const text = await ocrImageUrl(url);
          URL.revokeObjectURL(url);
          if (text && text.trim().length > 2) ocrResults.push(text.trim());
        } catch { }
        continue;
      }

      if (!src) continue;

      let blobUrl = src;
      let createdUrl = false;

      // If relative path inside EPUB, resolve via ePub.js archive
      if (!src.startsWith('blob:') && !src.startsWith('data:') && !src.startsWith('http')) {
        try {
          let blob = null;
          if (book.archive?.getBlob) {
            const relPath = section.url ? new URL(src, section.url).pathname.replace(/^\//, '') : src;
            blob = await book.archive.getBlob(relPath);
          }
          if (!blob && book.load) {
            blob = await book.load(src);
          }
          if (blob && blob instanceof Blob) {
            blobUrl = URL.createObjectURL(blob);
            createdUrl = true;
          }
        } catch (e) {
          console.warn('ocrEpubSection: Could not resolve blob for', src, e?.message);
        }
      }

      try {
        const text = await ocrImageUrl(blobUrl);
        if (text && text.trim().length > 2) {
          ocrResults.push(text.trim());
        }
      } finally {
        if (createdUrl) URL.revokeObjectURL(blobUrl);
      }
    }

    return ocrResults.join('\n');
  } catch (err) {
    console.error('ocrEpubSection error:', err);
    return '';
  }
}

/**
 * Merges OCR text into existing page text without duplicating sentences.
 * @param {string} existingText
 * @param {string} ocrText
 * @returns {string}
 */
export function mergeOcrText(existingText = '', ocrText = '') {
  const cleanExisting = (existingText || '').trim();
  const cleanOcr = (ocrText || '').trim();
  if (!cleanOcr) return cleanExisting;
  if (!cleanExisting) return cleanOcr;

  const existingLower = cleanExisting.toLowerCase();
  const ocrLines = cleanOcr.split(/[\r\n]+/);
  const newLines = [];

  for (const line of ocrLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;
    if (!existingLower.includes(trimmed.toLowerCase())) {
      newLines.push(trimmed);
    }
  }

  if (newLines.length === 0) return cleanExisting;
  return `${cleanExisting}\n\n[Figure Text]: ${newLines.join(' ')}`;
}

/** Terminate the OCR worker to free memory */
export async function terminateOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) {
    try {
      const w = await pending;
      await w.terminate();
    } catch { /* init may have failed */ }
  } else if (worker) {
    await worker.terminate();
  }
  worker = null;
  workerReady = false;
}

