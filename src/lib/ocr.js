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
