/**
 * pdf-lib and jszip are only pulled in when a file actually exceeds the limit —
 * they are ~620kB together and most uploads never reach the compression path.
 */

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Attempts to compress a file to under the size limit.
 * Returns a Blob - either compressed or original if already under limit / compression failed.
 * @param {File} file - The file to potentially compress
 * @returns {{ blob: Blob, wasCompressed: boolean, originalSize: number, finalSize: number }}
 */
export async function compressIfNeeded(file) {
    const originalSize = file.size;
    if (originalSize <= MAX_SIZE) {
        return { blob: file, wasCompressed: false, originalSize, finalSize: originalSize };
    }

    const ext = file.name.split('.').pop().toLowerCase();
    let blob = file;

    try {
        if (ext === 'epub') {
            blob = await compressEpub(file);
        } else if (ext === 'pdf') {
            blob = await compressPdf(file);
        }
    } catch (err) {
        console.warn('Compression failed, using original:', err);
    }

    return {
        blob,
        wasCompressed: blob !== file,
        originalSize,
        finalSize: blob.size,
    };
}

async function compressEpub(file) {
    const { default: JSZip } = await import('jszip');
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const newZip = new JSZip();

    for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) {
            newZip.folder(path);
        } else {
            const content = await entry.async('arraybuffer');
            newZip.file(path, content, { compression: 'DEFLATE', compressionOptions: { level: 9 } });
        }
    }

    const compressed = await newZip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    });

    return compressed.size < arrayBuffer.byteLength ? compressed : file;
}

async function compressPdf(file) {
    const { PDFDocument } = await import('pdf-lib');
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    const compressed = new Blob([pdfBytes], { type: 'application/pdf' });

    return compressed.size < arrayBuffer.byteLength ? compressed : file;
}

export { MAX_SIZE };
