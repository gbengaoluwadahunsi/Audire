import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

/**
 * Build the Audire icon as an SVG string.
 * @param {object} opts
 * @param {boolean} opts.rounded  Round the corners (for in-app/any-purpose icons).
 * @param {number}  opts.padding  Fraction of size kept as empty margin (maskable safe zone).
 */
function iconSvg({ rounded = true, padding = 0 } = {}) {
  const size = 512;
  const radius = rounded ? 112 : 0;
  // Glyph occupies the central (1 - 2*padding) region of the canvas.
  const inset = size * padding;
  const inner = size - inset * 2;
  // "A" path designed on a 0..32 grid, scaled into the inner box.
  const scale = inner / 32;
  const tx = inset;
  const ty = inset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">
    <path d="M16 7L10 25H13L16 17L19 25H22L16 7Z" fill="white"/>
    <path d="M13 17H19" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, svg: iconSvg({ rounded: true }) },
  { file: 'icon-512.png', size: 512, svg: iconSvg({ rounded: true }) },
  { file: 'icon-maskable-512.png', size: 512, svg: iconSvg({ rounded: false, padding: 0.12 }) },
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg({ rounded: false }) },
];

for (const { file, size, svg } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(PUBLIC, file));
  console.log(`generated ${file} (${size}x${size})`);
}

console.log('Icons generated.');
