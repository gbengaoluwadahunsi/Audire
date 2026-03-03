/**
 * Book format registry — Librera-style.
 * Single source of truth for supported/known formats and display names.
 */

export const FORMATS = [
  { ext: 'pdf',  name: 'PDF',   mime: 'application/pdf',           supported: true },
  { ext: 'epub', name: 'EPUB',  mime: 'application/epub+zip',       supported: true },
  { ext: 'epub3', name: 'EPUB3', mime: 'application/epub+zip',      supported: true },
  { ext: 'txt',  name: 'Plain text',  mime: 'text/plain',           supported: true },
  { ext: 'html', name: 'HTML',  mime: 'text/html',                  supported: false },
  { ext: 'mobi', name: 'MOBI', mime: 'application/x-mobipocket',  supported: false },
  { ext: 'fb2',  name: 'FB2',   mime: 'application/xml',           supported: false },
  { ext: 'rtf',  name: 'RTF',   mime: 'application/rtf',            supported: false },
  { ext: 'doc',  name: 'DOC',  mime: 'application/msword',         supported: false },
  { ext: 'docx', name: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', supported: true },
  { ext: 'cbz',  name: 'CBZ',  mime: 'application/x-cbr',          supported: false },
  { ext: 'cbr',  name: 'CBR',  mime: 'application/x-cbr',         supported: false },
];

const byExt = new Map(FORMATS.map(f => [f.ext.toLowerCase(), f]));

export function normalizeFormat(ext) {
  const e = (ext || '').toLowerCase();
  if (e === 'epub3') return 'epub';
  return e;
}

export function getFormat(ext) {
  return byExt.get((ext || '').toLowerCase()) || byExt.get(normalizeFormat(ext));
}

export function isSupported(ext) {
  const f = getFormat(ext);
  return f?.supported === true;
}

export function supportedExtensions() {
  return FORMATS.filter(f => f.supported).map(f => f.ext);
}

export function acceptAttribute() {
  return FORMATS.map(f => `.${f.ext}`).join(',');
}

export function displayName(ext) {
  const f = getFormat(ext) || getFormat(normalizeFormat(ext));
  return f?.name || (ext ? ext.toUpperCase() : 'Book');
}
