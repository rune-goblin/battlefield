// Bakes the pencil terrain sheets in art-src/terrain/ink-sprites/sheets/ into one alpha
// stencil atlas, public/art/terrain/ink/ink.webp, plus frames.json giving each sprite's
// rectangle. The sheets ship as neutral graphite on opaque white, which multiply-blends
// correctly and nothing else. Turning the graphite into alpha over flat white RGB makes each
// sprite tintable — the ink takes whatever colour the board hands it, at no extra draw call —
// and it drops the ninety-six frames to one texture, so a whole map of them batches once.
// Usage: node scripts/bake-ink.mjs      (needs cwebp: brew install webp)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { decodePng, encodePng } from './lib/png.mjs';

// Sheet file to the terrain group it draws. The art names forests and swamps in the plural and
// has no water, shallows or settlement; those three carry on the wash alone.
const SHEETS = {
  'plains-16-sprites-4x4.png': 'plains',
  'desert-16-sprites-4x4.png': 'desert',
  'forests-16-sprites-4x4.png': 'forest',
  'swamps-16-sprites-4x4.png': 'swamp',
  'hills-16-sprites-4x4.png': 'hills',
  'mountains-16-sprites-4x4.png': 'mountain',
};
const COLS = 4;
const ROWS = 4;
const SRC_CELL = 384;
// Half size. A hex is rarely wider than 140 screen pixels even zoomed in, so 192 still has
// headroom, and the atlas costs a quarter of the video memory the full-size art would.
const DOWNSCALE = 2;
const CELL = SRC_CELL / DOWNSCALE;
// One shared gain over every sheet, not one per sheet: the art draws plains faint and
// mountains heavy on purpose, and normalising each sheet to its own darkest pixel would flatten
// that into six equally black drawings. The divisor is the darkest ink found anywhere in the
// library, so the heaviest stroke in the set reaches full alpha and everything else keeps its
// weight relative to it.
const ALPHA_FLOOR = 2;
// The atlas grid: ninety-six cells, laid out row-major across every kind.
const ATLAS_COLS = 12;

const srcDir = new URL('../art-src/terrain/ink-sprites/sheets/', import.meta.url);
const outDir = new URL('../public/art/terrain/ink/', import.meta.url);
mkdirSync(outDir, { recursive: true });

function main() {
  const sprites = [];
  let peak = 0;
  for (const [file, kind] of Object.entries(SHEETS)) {
    const image = decodePng(readFileSync(new URL(file, srcDir)));
    if (image.width !== COLS * SRC_CELL || image.height !== ROWS * SRC_CELL) {
      throw new Error(`${file}: expected ${COLS * SRC_CELL}x${ROWS * SRC_CELL}, got ${image.width}x${image.height}`);
    }
    const ink = inkChannel(image);
    for (let i = 0; i < ink.length; i++) if (ink[i] > peak) peak = ink[i];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) sprites.push({ kind, ink, col, row });
    }
  }
  console.log(`darkest ink ${peak.toFixed(3)} of 1 — every sprite scaled by ${(1 / peak).toFixed(2)}`);

  const atlasRows = Math.ceil(sprites.length / ATLAS_COLS);
  const width = ATLAS_COLS * CELL;
  const height = atlasRows * CELL;
  // White under transparent as well as under ink: the RGB is never read for colour, only
  // multiplied by the sprite's tint, and a white field is what leaves the tint untouched.
  const atlas = { width, height, px: Buffer.alloc(width * height * 4, 255) };
  for (let i = 0; i < width * height; i++) atlas.px[i * 4 + 3] = 0;

  const frames = {};
  sprites.forEach((sprite, index) => {
    const slotX = (index % ATLAS_COLS) * CELL;
    const slotY = Math.floor(index / ATLAS_COLS) * CELL;
    const rect = blit(atlas, sprite, slotX, slotY, peak);
    (frames[sprite.kind] ??= []).push(rect);
  });

  const temp = join(process.env.TMPDIR ?? '/tmp', 'bake-ink.png');
  writeFileSync(temp, encodePng(atlas));
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', temp, '-o', join(outDir.pathname, 'ink.webp')]);
  rmSync(temp);
  writeFileSync(new URL('frames.json', outDir), `${JSON.stringify({ sheet: 'ink.webp', frames })}\n`);
  console.log(`ink.webp ${width}x${height} — ${Object.entries(frames).map(([k, r]) => `${k} ${r.length}`).join(', ')}`);
}

/** How much graphite is on each pixel, 0 for the white page and 1 for black, downscaled by a
 * box filter as it goes. The art is neutral, so any channel would do; the mean is steadier
 * against a stray coloured pixel. */
function inkChannel({ width, height, px }) {
  const w = width / DOWNSCALE, h = height / DOWNSCALE;
  const ink = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const value = 1 - (px[o] + px[o + 1] + px[o + 2]) / 765;
      ink[Math.floor(y / DOWNSCALE) * w + Math.floor(x / DOWNSCALE)] += value / (DOWNSCALE * DOWNSCALE);
    }
  }
  return ink;
}

/** Copies one sheet cell into its atlas slot, trimmed to the ink's own bounds — the sheets
 * leave wide white margins, and a sprite that carries them cannot be centred on a hex. Returns
 * the rectangle it actually wrote. */
function blit(atlas, { ink, col, row }, slotX, slotY, peak) {
  const sheetWidth = COLS * CELL;
  const alpha = (x, y) => Math.round(Math.min(1, ink[(row * CELL + y) * sheetWidth + col * CELL + x] / peak) * 255);
  let minX = CELL, minY = CELL, maxX = -1, maxY = -1;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (alpha(x, y) < ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error(`blank sprite at column ${col}, row ${row}`);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      atlas.px[((slotY + y - minY) * atlas.width + slotX + x - minX) * 4 + 3] = alpha(x, y);
    }
  }
  return [slotX, slotY, maxX - minX + 1, maxY - minY + 1];
}

main();
