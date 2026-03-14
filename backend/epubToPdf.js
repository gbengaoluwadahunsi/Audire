/**
 * EPUB to PDF conversion using Calibre's ebook-convert.
 * Requires Calibre to be installed: https://calibre-ebook.com/download
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EBOOK_CONVERT_PATHS = [
  process.env.EBOOK_CONVERT_PATH,
  'ebook-convert',
  process.platform === 'win32' ? 'C:\\Program Files\\Calibre2\\ebook-convert.exe' : null,
  process.platform === 'darwin' ? '/Applications/calibre.app/Contents/MacOS/ebook-convert' : null,
].filter(Boolean);

let cachedEbookConvert = null;

async function findEbookConvert() {
  if (cachedEbookConvert) return cachedEbookConvert;
  for (const p of EBOOK_CONVERT_PATHS) {
    if (!p) continue;
    try {
      if (p.includes(path.sep) || p.endsWith('.exe')) {
        await fs.access(p);
      }
      cachedEbookConvert = p;
      return p;
    } catch (_) {
      continue;
    }
  }
  return null;
}

/**
 * Convert EPUB to PDF using Calibre.
 * @param {string} epubPath - Full path to .epub file
 * @param {string} pdfPath - Full path for output .pdf file
 * @returns {Promise<void>}
 */
export async function convertEpubToPdf(epubPath, pdfPath) {
  const ebookConvert = await findEbookConvert();
  if (!ebookConvert) {
    throw new Error(
      'Calibre not found. Install Calibre from https://calibre-ebook.com/download and ensure ebook-convert is in PATH, or set EBOOK_CONVERT_PATH.'
    );
  }

  await fs.access(epubPath);

  return new Promise((resolve, reject) => {
    const args = [
      path.resolve(epubPath),
      path.resolve(pdfPath),
      '--paper-size', 'a4',
      '--pdf-default-font-size', '12',
      '--pdf-mono-font-size', '12',
    ];
    const proc = spawn(ebookConvert, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ebook-convert failed (${code}): ${stderr.slice(-500)}`));
    });
  });
}
