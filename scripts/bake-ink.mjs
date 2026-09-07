// Bakes the pencil terrain sheets into alpha stencil atlases under public/art/terrain/ink/:
// the hero drawings in art-src/terrain/ink-sprites/sheets/ become ink.webp + frames.json, and
// the small fill marks in art-src/terrain/ink-fills/sheets/ become fill.webp + fill.json. The
// sheets ship as neutral graphite on opaque white, which multiply-blends correctly and nothing
// else. Turning the graphite into alpha over flat white RGB makes each sprite tintable — the
// ink takes whatever colour the board hands it, at no extra draw call — and it drops the
// frames of a set to one texture, so a whole map of them batches once.
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
// The fill marks, cropped from the same art at the same pixel scale into 96-pixel cells, bar
// the ocean swells, which are too long and keep 160. Every fill cell is a quarter the size of
// a hero's, so the board draws them at a quarter of the hero's width to hold the art's scale.
const FILL_SHEETS = {
  'plains-fill-compact-4x4.png': 'plains',
  'desert-fill-compact-4x4.png': 'desert',
  'forest-fill-compact-4x4.png': 'forest',
  'swamp-fill-compact-4x4.png': 'swamp',
  'ocean-fill-compact-4x4.png': 'water',
  'shallows-fill-compact-4x4.png': 'shallows',
  'hills-fill-compact-4x4.png': 'hills',
  'mountains-fill-compact-4x4.png': 'mountain',
};
const COLS = 4;
const ROWS = 4;
const HERO = {
  srcDir: new URL('../art-src/terrain/ink-sprites/sheets/', import.meta.url),
  sheets: SHEETS,
  srcCell: () => 384,
  // Half size. A hex is rarely wider than 140 screen pixels even zoomed in, so 192 still has
  // headroom, and the atlas costs a quarter of the video memory the full-size art would.
  downscale: 2,
  atlasCols: 12,
  out: 'ink.webp',
  manifest: 'frames.json',
};
const FILL = {
  srcDir: new URL('../art-src/terrain/ink-fills/sheets/', import.meta.url),
  sheets: FILL_SHEETS,
  srcCell: (file) => (file.startsWith('ocean') ? 160 : 96),
  downscale: 1,
  atlasCols: 16,
  out: 'fill.webp',
  manifest: 'fill.json',
};
// One shared gain over every sheet, not one per sheet: the art draws plains faint and
// mountains heavy on purpose, and normalising each sheet to its own darkest pixel would flatten
// that into six equally black drawings. The divisor is the darkest ink found anywhere in the
// library, so the heaviest stroke in the set reaches full alpha and everything else keeps its
// weight relative to it.
const ALPHA_FLOOR = 2;
const outDir = new URL('../public/art/terrain/ink/', import.meta.url);
mkdirSync(outDir, { recursive: true });

function main() {
  const hero = load(HERO);
  const fill = load(FILL);
  // One gain over both sets: the fills are crops of the same drawings, and a pebble must keep
  // its weight against the boulder it was cut from.
  const peak = Math.max(hero.peak, fill.peak);
  console.log(`darkest ink ${peak.toFixed(3)} of 1 — every sprite scaled by ${(1 / peak).toFixed(2)}`);
  bake(HERO, hero.sprites, peak);
  bake(FILL, fill.sprites, peak);
}

function load({ srcDir, sheets, srcCell, downscale }) {
  const sprites = [];
  let peak = 0;
  for (const [file, kind] of Object.entries(sheets)) {
    const image = decodePng(readFileSync(new URL(file, srcDir)));
    const src = srcCell(file);
    if (image.width !== COLS * src || image.height !== ROWS * src) {
      throw new Error(`${file}: expected ${COLS * src}x${ROWS * src}, got ${image.width}x${image.height}`);
    }
    const ink = inkChannel(image, downscale);
    for (let i = 0; i < ink.length; i++) if (ink[i] > peak) peak = ink[i];
    const cell = src / downscale;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) sprites.push({ kind, ink, cell, col, row });
    }
  }
  return { sprites, peak };
}

function bake({ atlasCols, out, manifest }, sprites, peak) {
  // Rows of one cell size each, as wide as `atlasCols` of the smallest: the ocean's 160s then
  // pack nine to a row under the 96s instead of forcing every slot up to their size.
  const width = atlasCols * Math.min(...sprites.map((s) => s.cell));
  const slots = [];
  let y = 0;
  for (const cell of [...new Set(sprites.map((s) => s.cell))].sort((a, b) => a - b)) {
    const perRow = Math.floor(width / cell);
    sprites.filter((s) => s.cell === cell).forEach((sprite, i) => {
      slots.push({ sprite, x: (i % perRow) * cell, y: y + Math.floor(i / perRow) * cell });
    });
    y += Math.ceil(sprites.filter((s) => s.cell === cell).length / perRow) * cell;
  }
  const height = y;
  // White under transparent as well as under ink: the RGB is never read for colour, only
  // multiplied by the sprite's tint, and a white field is what leaves the tint untouched.
  const atlas = { width, height, px: Buffer.alloc(width * height * 4, 255) };
  for (let i = 0; i < width * height; i++) atlas.px[i * 4 + 3] = 0;

  const frames = {};
  const cells = {};
  for (const { sprite, x, y } of slots) {
    (frames[sprite.kind] ??= []).push(blit(atlas, sprite, x, y, peak));
    cells[sprite.kind] = sprite.cell;
  }

  const temp = join(process.env.TMPDIR ?? '/tmp', 'bake-ink.png');
  writeFileSync(temp, encodePng(atlas));
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', temp, '-o', join(outDir.pathname, out)]);
  rmSync(temp);
  writeFileSync(new URL(manifest, outDir), `${JSON.stringify({ sheet: out, cells, frames })}\n`);
  console.log(`${out} ${width}x${height} — ${Object.entries(frames).map(([k, r]) => `${k} ${r.length}`).join(', ')}`);
}

/** How much graphite is on each pixel, 0 for the white page and 1 for black, downscaled by a
 * box filter as it goes. The art is neutral, so any channel would do; the mean is steadier
 * against a stray coloured pixel. */
function inkChannel({ width, height, px }, downscale) {
  const w = width / downscale, h = height / downscale;
  const ink = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const value = 1 - (px[o] + px[o + 1] + px[o + 2]) / 765;
      ink[Math.floor(y / downscale) * w + Math.floor(x / downscale)] += value / (downscale * downscale);
    }
  }
  return ink;
}

/** Copies one sheet cell into its atlas slot, trimmed to the ink's own bounds — the sheets
 * leave wide white margins, and a sprite that carries them cannot be centred on a hex. Returns
 * the rectangle it actually wrote. */
function blit(atlas, { ink, cell, col, row }, slotX, slotY, peak) {
  const sheetWidth = COLS * cell;
  const alpha = (x, y) => Math.round(Math.min(1, ink[(row * cell + y) * sheetWidth + col * cell + x] / peak) * 255);
  let minX = cell, minY = cell, maxX = -1, maxY = -1;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
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
