import ePub from 'epubjs';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Initialize PDF.js worker from local package (avoids cross-origin issues)
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// WASM URL for JBIG2, OpenJPEG, qcms decoders (fixes "Ensure that the wasmUrl API parameter is provided")
const PDFJS_WASM_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.5.207/wasm/';

export const processFile = async (file) => {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'epub') {
        return processEpub(file);
    } else if (extension === 'pdf') {
        return processPdf(file);
    } else {
        throw new Error('Unsupported file format');
    }
};

const processEpub = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const book = ePub(e.target.result);
                const metadata = await book.loaded.metadata;

                let coverUrl = null;
                let coverBlob = null;

                try {
                    coverBlob = await extractEpubCoverBlob(e.target.result);
                    if (coverBlob) {
                        coverUrl = URL.createObjectURL(coverBlob);
                    }
                } catch (err) {
                    console.warn('Cover extraction failed during upload:', err);
                }

                resolve({
                    title: metadata.title,
                    author: metadata.creator,
                    cover: coverUrl,
                    coverBlob,
                    format: 'epub',
                    data: e.target.result
                });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/** Minimum extractable text (chars) across sampled pages to accept a PDF. Rejects scanned/image-only PDFs. */
const PDF_MIN_TEXT_CHARS = 80;
const PDF_SAMPLE_PAGES = 5; // Sample first N pages to detect scanned PDFs

const processPdf = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const loadingTask = pdfjs.getDocument({ data: e.target.result, wasmUrl: PDFJS_WASM_URL });
                const pdf = await loadingTask.promise;
                const metadata = await pdf.getMetadata();

                // Reject scanned/image-based PDFs: sample pages and check for extractable text
                let totalText = 0;
                const pagesToSample = Math.min(PDF_SAMPLE_PAGES, pdf.numPages);
                for (let p = 1; p <= pagesToSample; p++) {
                    try {
                        const text = await extractTextFromPdfDoc(pdf, p);
                        totalText += (text || '').replace(/\s+/g, ' ').trim().length;
                        if (totalText >= PDF_MIN_TEXT_CHARS) break;
                    } catch (_) { /* skip failed pages */ }
                }
                if (totalText < PDF_MIN_TEXT_CHARS) {
                    reject(new Error('This PDF appears to be scanned images. TTS requires text-based PDFs with selectable text.'));
                    return;
                }

                let coverBlob = null;
                try {
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    coverBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
                } catch (_) { /* ignore cover extraction errors */ }

                resolve({
                    title: metadata?.info?.Title || file.name.replace(/\.pdf$/i, ''),
                    author: metadata?.info?.Author || 'Unknown Author',
                    cover: null,
                    coverBlob,
                    format: 'pdf',
                    data: e.target.result
                });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

export const extractTextFromSection = async (book, href, format = 'epub') => {
    if (format === 'epub') {
        try {
            const section = book?.spine?.get?.(href);
            if (!section) {
                console.warn('extractTextFromSection: Section not found for href:', href);
                return '';
            }

            await section.load(book.load.bind(book));
            const doc = section.document;
            if (!doc || !doc.body) {
                console.warn('extractTextFromSection: Document or body missing for href:', href);
                return '';
            }

            const text = doc.body.textContent || doc.body.innerText || '';
            return text;
        } catch (err) {
            console.error('extractTextFromSection error:', err);
            return '';
        }
    }
    return '';
};

export const extractPdfPageText = async (pdfSource, pageNum) => {
    const loadingTask = pdfjs.getDocument(typeof pdfSource === 'string' ? { url: pdfSource, wasmUrl: PDFJS_WASM_URL } : { data: pdfSource, wasmUrl: PDFJS_WASM_URL });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    return textContent.items.map(item => item.str).join(' ');
};

/** Extract text from a page using an already-loaded PDF document (avoids detached ArrayBuffer) */
export const extractTextFromPdfDoc = async (pdfDoc, pageNum) => {
    // #region agent log
    const _dbg = (msg, data) => { fetch('http://127.0.0.1:7439/ingest/28aa012c-c32b-4c2a-a3b2-51018433fbe2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4110de'},body:JSON.stringify({sessionId:'4110de',location:'fileProcessor.js:extractTextFromPdfDoc',message:msg,data:data||{},timestamp:Date.now()})}).catch(()=>{}); };
    // #endregion
    if (!pdfDoc) {
        // #region agent log
        _dbg('pdfDoc null', { pageNum });
        // #endregion
        return '';
    }
    try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const raw = textContent.items.map(item => item.str).join(' ');
        const len = (raw || '').length;
        // #region agent log
        _dbg('extracted', { pageNum, itemCount: textContent?.items?.length ?? 0, textLen: len, preview: (raw || '').slice(0, 80) });
        // #endregion
        return raw;
    } catch (e) {
        // #region agent log
        _dbg('extract error', { pageNum, err: String(e?.message || e) });
        // #endregion
        throw e;
    }
};

/**
 * Search within a book. Returns matches with location info for navigation.
 * @param {Object} opts - { book, pdfDoc, format, query }
 * @returns {Promise<Array<{ href?: string, page?: number, snippet: string }>>}
 */
export const searchInBook = async ({ book, pdfDoc, format, query }) => {
    const q = (query || '').trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const matches = [];

    if (format === 'epub' && book?.spine) {
        let section = book.spine.first?.();
        while (section) {
            try {
                const text = await extractTextFromSection(book, section.href);
                const lower = text.toLowerCase();
                let idx = lower.indexOf(q);
                while (idx >= 0) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(text.length, idx + q.length + 60);
                    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
                    matches.push({ href: section.href, snippet });
                    idx = lower.indexOf(q, idx + 1);
                }
            } catch (_) { /* skip failed sections */ }
            section = section.next?.();
        }
    } else if (format === 'pdf' && pdfDoc) {
        for (let p = 1; p <= pdfDoc.numPages; p++) {
            try {
                const text = await extractTextFromPdfDoc(pdfDoc, p);
                const lower = text.toLowerCase();
                let idx = lower.indexOf(q);
                while (idx >= 0) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(text.length, idx + q.length + 60);
                    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
                    matches.push({ page: p, snippet });
                    idx = lower.indexOf(q, idx + 1);
                }
            } catch (_) { /* skip failed pages */ }
        }
    }

    return matches;
};

/** Extract text from multiple pages using an already-loaded PDF document */
export const extractTextFromPdfDocRange = async (pdfDoc, fromPage, toPage) => {
    if (!pdfDoc) return '';
    const texts = [];
    for (let p = fromPage; p <= toPage; p++) {
        const page = await pdfDoc.getPage(p);
        const tc = await page.getTextContent();
        texts.push(tc.items.map(item => item.str).join(' '));
    }
    return texts.join('\n\n');
};

export const extractPdfPagesText = async (pdfSource, fromPage, toPage) => {
    const loadingTask = pdfjs.getDocument(typeof pdfSource === 'string' ? { url: pdfSource, wasmUrl: PDFJS_WASM_URL } : { data: pdfSource, wasmUrl: PDFJS_WASM_URL });
    const pdf = await loadingTask.promise;
    const texts = [];
    for (let p = fromPage; p <= toPage; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        texts.push(tc.items.map(item => item.str).join(' '));
    }
    return texts.join('\n\n');
};

export const getEpubToc = async (book) => {
    if (!book) return [];
    try {
        const loaded = book.loaded;
        const nav = loaded?.navigation ? await loaded.navigation : null;
        const toc = nav?.toc || [];
        return toc.map(item => ({
            id: item.id,
            href: item.href,
            label: item.label,
            subitems: (item.subitems || []).map(sub => ({
                id: sub.id,
                href: sub.href,
                label: sub.label,
            })),
        }));
    } catch (e) {
        return [];
    }
};

/**
 * Extract cover blob from an EPUB ArrayBuffer by directly parsing the ZIP.
 * Bypasses epubjs entirely for reliability. Parses container.xml → OPF → manifest
 * to find the cover image, then extracts it from the ZIP.
 * @param {ArrayBuffer} arrayBuffer - The EPUB file data
 * @returns {Promise<Blob|null>} The cover image blob or null
 */
export const extractEpubCoverBlob = async (arrayBuffer) => {
    const JSZip = (await import('jszip')).default;

    try {
        const zip = await JSZip.loadAsync(arrayBuffer);

        // 1. Find the OPF file path from META-INF/container.xml
        const containerFile = zip.file('META-INF/container.xml');
        if (!containerFile) return null;
        const containerXml = await containerFile.async('text');

        const opfPathMatch = containerXml.match(/full-path\s*=\s*"([^"]+\.opf)"/i);
        if (!opfPathMatch) return null;
        const opfPath = opfPathMatch[1];
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

        // 2. Parse the OPF file
        const opfFile = zip.file(opfPath);
        if (!opfFile) return null;
        const opfXml = await opfFile.async('text');

        // 3. Find the cover image href using multiple strategies
        let coverHref = null;

        // Strategy A: <meta name="cover" content="some-id"/>  →  find <item id="some-id" href="..."/>
        const coverMetaMatch = opfXml.match(/<meta[^>]*\bname\s*=\s*"cover"[^>]*\bcontent\s*=\s*"([^"]+)"/i)
            || opfXml.match(/<meta[^>]*\bcontent\s*=\s*"([^"]+)"[^>]*\bname\s*=\s*"cover"/i);
        if (coverMetaMatch) {
            const coverId = coverMetaMatch[1];
            // Escape special regex chars in the ID
            const escaped = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const itemRegex = new RegExp(`<item[^>]*\\bid\\s*=\\s*"${escaped}"[^>]*\\bhref\\s*=\\s*"([^"]+)"`, 'i');
            const itemMatch = opfXml.match(itemRegex);
            if (itemMatch) coverHref = itemMatch[1];

            if (!coverHref) {
                const itemRegex2 = new RegExp(`<item[^>]*\\bhref\\s*=\\s*"([^"]+)"[^>]*\\bid\\s*=\\s*"${escaped}"`, 'i');
                const itemMatch2 = opfXml.match(itemRegex2);
                if (itemMatch2) coverHref = itemMatch2[1];
            }
        }

        // Strategy B: <item properties="cover-image" href="..." />  (EPUB 3)
        if (!coverHref) {
            const propsMatch = opfXml.match(/<item[^>]*\bproperties\s*=\s*"[^"]*cover-image[^"]*"[^>]*\bhref\s*=\s*"([^"]+)"/i)
                || opfXml.match(/<item[^>]*\bhref\s*=\s*"([^"]+)"[^>]*\bproperties\s*=\s*"[^"]*cover-image[^"]*"/i);
            if (propsMatch) coverHref = propsMatch[1];
        }

        // Strategy C: Find any <item> with "cover" in its id or href that is an image
        if (!coverHref) {
            const itemsRegex = /<item\b[^>]+>/gi;
            let match;
            while ((match = itemsRegex.exec(opfXml)) !== null) {
                const tag = match[0];
                const idMatch = tag.match(/\bid\s*=\s*"([^"]+)"/i);
                const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]+)"/i);
                const typeMatch = tag.match(/\bmedia-type\s*=\s*"([^"]+)"/i);

                if (hrefMatch && typeMatch && typeMatch[1].startsWith('image/')) {
                    const id = (idMatch?.[1] || '').toLowerCase();
                    const href = hrefMatch[1].toLowerCase();
                    if (id.includes('cover') || href.includes('cover')) {
                        coverHref = hrefMatch[1];
                        break;
                    }
                }
            }
        }

        // Strategy D: Just find the first/largest image in the manifest
        if (!coverHref) {
            const itemsRegex = /<item\b[^>]+>/gi;
            let match;
            const images = [];
            while ((match = itemsRegex.exec(opfXml)) !== null) {
                const tag = match[0];
                const hrefMatch = tag.match(/\bhref\s*=\s*"([^"]+)"/i);
                const typeMatch = tag.match(/\bmedia-type\s*=\s*"([^"]+)"/i);
                if (hrefMatch && typeMatch && typeMatch[1].startsWith('image/')) {
                    images.push(hrefMatch[1]);
                }
            }
            if (images.length > 0) {
                // Pick the first image as a last resort
                coverHref = images[0];
            }
        }

        if (!coverHref) return null;

        // 4. Resolve the path and extract the image from the ZIP
        const decodedHref = decodeURIComponent(coverHref);
        const candidates = [
            opfDir + decodedHref,
            decodedHref,
            opfDir + coverHref,
            coverHref,
        ];

        let coverFile = null;
        for (const path of candidates) {
            coverFile = zip.file(path);
            if (coverFile) break;
        }

        // Case-insensitive fallback
        if (!coverFile) {
            const allFiles = Object.values(zip.files);
            for (const candidate of candidates) {
                const lower = candidate.toLowerCase();
                coverFile = allFiles.find(f => !f.dir && f.name.toLowerCase() === lower);
                if (coverFile) break;
            }
        }

        if (!coverFile) return null;

        // 5. Read the image data and return as Blob
        const data = await coverFile.async('arraybuffer');
        const name = coverFile.name.toLowerCase();
        let mimeType = 'image/jpeg';
        if (name.endsWith('.png')) mimeType = 'image/png';
        else if (name.endsWith('.gif')) mimeType = 'image/gif';
        else if (name.endsWith('.webp')) mimeType = 'image/webp';
        else if (name.endsWith('.svg')) mimeType = 'image/svg+xml';

        return new Blob([data], { type: mimeType });
    } catch (err) {
        console.warn('EPUB cover extraction failed:', err);
        return null;
    }
};
