// Bakes the chroma-keyed terrain sheets in art-src/terrain/ into public/art/terrain/: one WebP
// per sheet carrying real alpha, plus frames.json giving each sprite's rectangle. The sheets
// ship as opaque RGB on a magenta key, which is what makes them editable, and exactly what a
// lossy codec destroys — so the key comes out here, once, and the shipped file has an alpha
// channel WebP stores losslessly. Doing it offline also spares every page load a chroma-key
// pass and a flood fill over 1.5M pixels.
// Usage: node scripts/bake-terrain.mjs      (needs cwebp: brew install webp)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join } from 'node:path';

// Which quadrant of each sheet is which scenery, reading left to right, top row then bottom.
const SHEETS = {
  'terrain-sheet.png': [['trees', 'swamp'], ['boulders', 'mounds']],
  'terrain-sheet-2.png': [['desert', 'water'], ['plains', 'badlands']],
};
const COLS = 4;
const ROWS = 4;
// How much magenta is in a pixel, as a fraction: 1 is the bare key, 0 is art with none of it.
// The measure is `(r + b) / 2 - g` over the same for the key itself, which is linear in how
// much key a pixel is mixed with — distance to the key colour is not, and keyed on distance
// the sheet came out rimmed in purple, because a half-and-half blend of the near-black outline
// with magenta still lands 160 away from it.
// Both sheets are strongly bimodal on this measure: art sits at or below 0.2, the background
// at 0.94 and up, and only the antialiased fringe falls between. Anything above KEY_FLOOR is
// background; anything below INK_CEILING is art at full strength, which is what keeps the
// badlands' red-brown — the one part of the palette with real magenta in it — opaque.
const KEY_FLOOR = 0.08;
const INK_CEILING = 0.78;
// Compression noise on the key leaves stray specks a few pixels across. Anything smaller is
// not scenery, and letting one into a frame drags the frame's bounds out with it.
const MIN_BLOB = 60;
// A rule counts as a rule when it runs nearly the whole way across. Each sheet draws a cross
// between its quadrants, and left in it flood-fills into one component spanning every frame.
const RULE_SHARE = 0.9;
// Lossy RGB, lossless alpha. The RGB under a transparent pixel still reaches the encoder, so
// the key is bled over before this runs — otherwise the codec smears magenta back out along
// every edge it was just removed from.
const WEBP_QUALITY = 88;
const BLEED_PASSES = 4;

const srcDir = new URL('../art-src/terrain/', import.meta.url);
const outDir = new URL('../public/art/terrain/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function main() {
  const manifest = {};
  for (const [file, quadrants] of Object.entries(SHEETS)) {
    const image = decodePng(readFileSync(new URL(file, srcDir)));
    const key = keyColour(image);
    chromaKey(image, key);
    const frames = findFrames(image, quadrants);
    bleed(image);

    const name = file.replace(/\.png$/, '.webp');
    const temp = join(process.env.TMPDIR ?? '/tmp', `bake-${file}`);
    writeFileSync(temp, encodePng(image));
    execFileSync('cwebp', ['-quiet', '-q', String(WEBP_QUALITY), '-alpha_q', '100', temp, '-o', join(outDir.pathname, name)]);
    rmSync(temp);

    for (const [kind, rects] of Object.entries(frames)) manifest[kind] = { sheet: name, frames: rects };
    const counts = Object.entries(frames).map(([k, r]) => `${k} ${r.length}`).join(', ');
    console.log(`${file} -> ${name} (key ${key.join(',')}; ${counts})`);
  }
  writeFileSync(new URL('frames.json', outDir), `${JSON.stringify(manifest)}\n`);
}

/** The most common colour in the sheet, which is the key by a wide margin — read from the art
 * rather than hardcoded, so a re-export in a different magenta still keys out. */
function keyColour({ width, height, px }) {
  const counts = new Map();
  let best = 0;
  let bestCount = 0;
  for (let i = 0; i < width * height; i += 7) {
    const o = i * 4;
    const rgb = (px[o] << 16) | (px[o + 1] << 8) | px[o + 2];
    const n = (counts.get(rgb) ?? 0) + 1;
    counts.set(rgb, n);
    if (n > bestCount) { bestCount = n; best = rgb; }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

function chromaKey({ width, height, px }, [kr, kg, kb]) {
  const keyMagenta = (kr + kb) / 2 - kg;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // `ink` is how much of the pixel is art rather than key, and `a` is that on a ramp with a
    // knee at each end, so a solid colour that happens to lean magenta still reads as solid.
    const ink = 1 - ((px[o] + px[o + 2]) / 2 - px[o + 1]) / keyMagenta;
    const a = clamp01((ink - KEY_FLOOR) / (INK_CEILING - KEY_FLOOR));
    px[o + 3] = Math.round(a * 255);
    if (a > 0 && a < 1) {
      // Un-mix the key out of the fringe with the mix fraction itself, not the ramped alpha:
      // the pixel is `ink` of the real colour over `1 - ink` of magenta, and leaving it rims
      // every sprite in purple wherever it is scaled up.
      const rest = 1 - ink;
      px[o] = clamp((px[o] - rest * kr) / ink);
      px[o + 1] = clamp((px[o + 1] - rest * kg) / ink);
      px[o + 2] = clamp((px[o + 2] - rest * kb) / ink);
    }
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Each quadrant's sprites, as rectangles. Frames come from the ink, not from the sheet's grid:
 * several tree crowns overrun their cell, and cutting on the pitch clipped them and pulled the
 * neighbour's edge in with them. Every blob of ink is found first, then blobs are gathered by
 * the cell their centre lands in — which keeps a swamp tuft with its pads and pebbles as the
 * one composition it was drawn as, and leaves the discrete quadrants at one blob per frame.
 */
function findFrames({ width: w, height: h, px }, quadrants) {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = px[i * 4 + 3] > 8 ? 1 : 0;
  eraseRules(ink, w, h);

  const pitchX = w / (COLS * 2);
  const pitchY = h / (ROWS * 2);
  const cells = new Map();
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (ink[start] !== 1) continue;
    let top = 0;
    stack[top++] = start;
    ink[start] = 2;
    let minX = w, minY = h, maxX = -1, maxY = -1, area = 0;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (ink[n] === 1) { ink[n] = 2; stack[top++] = n; }
        }
      }
    }
    if (area < MIN_BLOB) continue;
    const col = Math.floor((minX + maxX) / 2 / pitchX);
    const row = Math.floor((minY + maxY) / 2 / pitchY);
    const key = `${col},${row}`;
    const seen = cells.get(key);
    cells.set(key, seen
      ? [Math.min(seen[0], minX), Math.min(seen[1], minY), Math.max(seen[2], maxX), Math.max(seen[3], maxY)]
      : [minX, minY, maxX, maxY]);
  }

  const frames = {};
  for (const [kind] of quadrants.flatMap((r) => r.map((k) => [k]))) frames[kind] = [];
  for (const [key, [x0, y0, x1, y1]] of cells) {
    const [col, row] = key.split(',').map(Number);
    frames[quadrants[Math.floor(row / ROWS)][Math.floor(col / COLS)]].push([x0, y0, x1 - x0 + 1, y1 - y0 + 1]);
  }
  return frames;
}

function eraseRules(ink, w, h) {
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) n += ink[y * w + x];
    if (n > w * RULE_SHARE) ink.fill(0, y * w, (y + 1) * w);
  }
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) n += ink[y * w + x];
    if (n > h * RULE_SHARE) for (let y = 0; y < h; y++) ink[y * w + x] = 0;
  }
}

/** Grows the colour of the art outwards under the transparent pixels. WebP encodes RGB and
 * alpha separately and lossily quantizes RGB everywhere, including where alpha is 0, so a
 * sprite sitting on raw magenta gets a pink halo back at every edge. */
function bleed({ width: w, height: h, px }) {
  let filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < BLEED_PASSES; pass++) {
    const next = filled.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const k = (ny * w + nx) * 4;
            if (!filled[ny * w + nx]) continue;
            r += px[k]; g += px[k + 1]; b += px[k + 2]; n++;
          }
        }
        if (!n) continue;
        px[i * 4] = Math.round(r / n);
        px[i * 4 + 1] = Math.round(g / n);
        px[i * 4 + 2] = Math.round(b / n);
        next[i] = 1;
      }
    }
    filled = next;
  }
  // Whatever the bleed never reached is open background, far from any edge: flat mid-grey
  // compresses to nothing, where the original magenta costs bits for a colour never drawn.
  for (let i = 0; i < w * h; i++) {
    if (filled[i]) continue;
    px[i * 4] = 128; px[i * 4 + 1] = 128; px[i * 4 + 2] = 128;
  }
}

function decodePng(buf) {
  let off = 8, width = 0, height = 0, depth = 0, type = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const tag = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (tag === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9];
      if (depth !== 8 || (type !== 2 && type !== 6) || data[12] !== 0) {
        throw new Error(`unsupported PNG: depth ${depth} type ${type} interlace ${data[12]}`);
      }
    }
    if (tag === 'IDAT') idat.push(data);
    off += len + 12;
  }
  const bpp = type === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = lines.subarray(y * stride, (y + 1) * stride);
    const prev = y ? lines.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const guess = a + b - c;
        const pa = Math.abs(guess - a), pb = Math.abs(guess - b), pc = Math.abs(guess - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
  }
  const px = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = lines[i * bpp];
    px[i * 4 + 1] = lines[i * bpp + 1];
    px[i * 4 + 2] = lines[i * bpp + 2];
    if (bpp === 4) px[i * 4 + 3] = lines[i * bpp + 3];
  }
  return { width, height, px };
}

function encodePng({ width, height, px }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(tag, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(tag, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

main();
