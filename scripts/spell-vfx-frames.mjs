#!/usr/bin/env node
// Splits the spell VFX atlases into per-frame PNGs for hand editing and rebuilds
// an atlas from a frame folder. Round-trips pixel-exactly.
//
//   node scripts/spell-vfx-frames.mjs split    [--set 16f] [--out DIR]
//   node scripts/spell-vfx-frames.mjs join     [--set 16f] [--in DIR] [--only NAME,NAME]
//   node scripts/spell-vfx-frames.mjs register [--set 16f] [--only NAME,NAME] [--sym-x] [--dry]
//
// Only 8-bit RGBA, non-interlaced PNGs are handled — everything here is that.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = {
  '16f': { dir: join(ROOT, 'public/art/spell-vfx-spritesheets'), grid: 4, frame: 128 },
};
const SHEETS = ['blast', 'heal', 'control', 'buff-attacks', 'buff-defenses', 'buff-movement'];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`unsupported PNG: depth=${data[8]} color=${data[9]} interlace=${data[12]}`);
      }
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`bad filter ${filter}`);
      out[x] = v & 0xff;
    }
  }
  return { width, height, px };
}

function encodePng({ width, height, px }) {
  const bpp = 4, stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 4;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[x] = (cur[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function cut(img, x0, y0, size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    img.px.copy(px, y * size * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + size) * 4);
  }
  return { width: size, height: size, px };
}

// The registration point of a frame, as pixels from its top-left. Alpha alone tracks the
// smoke and the outermost sparks as readily as the effect itself, so the weight is alpha
// times luminance squared: the hot core outvotes everything hanging off it.
function core(tile) {
  const { width: w, height: h, px } = tile;
  let mass = 0, weight = 0, cx = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const a = px[p + 3];
      const lum = (px[p] * 0.3 + px[p + 1] * 0.59 + px[p + 2] * 0.11) / 255;
      const k = a * lum * lum;
      mass += a;
      weight += k;
      cx += k * x;
      cy += k * y;
    }
  }
  return { mass: mass / (255 * w * h), cx: weight ? cx / weight : w / 2, cy: weight ? cy / weight : h / 2 };
}

// Where a frame's own mirror image best lines up with it, in pixels from the left edge. For
// an effect drawn symmetric — the defense ward is built that way — this finds the middle of
// the drawn object itself, which a centroid does not: the ward's glow is a broad symmetric
// haze that stays put while the shield slides inside it, and it outweighs the shield.
// Resolved to a half pixel, so the axis is searched as 2× its position.
function symmetry(tile) {
  const { width: w, height: h, px } = tile;
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      v[y * w + x] = (px[p + 3] / 255) * (px[p] * 0.3 + px[p + 1] * 0.59 + px[p + 2] * 0.11) / 255;
    }
  }
  let best = { axis: w / 2, score: -2 };
  for (let twice = w - 40; twice <= w + 40; twice++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mx = twice - x;
        if (mx < 0 || mx >= w) continue;
        const a = v[y * w + x], b = v[y * w + mx];
        n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
      }
    }
    if (n < w * h * 0.4) continue;
    const cov = sab - (sa * sb) / n, va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
    const score = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1;
    if (score > best.score) best = { axis: twice / 2, score };
  }
  return best;
}

/** The alpha bounding box, so a shift can be held back from pushing content off the frame. */
function extent(tile) {
  const { width: w, height: h, px } = tile;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

function shifted(tile, dx, dy) {
  const { width: w, height: h, px } = tile;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    const from = Math.max(0, -dx);
    const to = Math.min(w, w - dx);
    if (to <= from) continue;
    px.copy(out, (y * w + from + dx) * 4, (sy * w + from) * 4, (sy * w + to) * 4);
  }
  return { width: w, height: h, px: out };
}

function paste(img, tile, x0, y0) {
  for (let y = 0; y < tile.height; y++) {
    tile.px.copy(img.px, ((y0 + y) * img.width + x0) * 4, y * tile.width * 4, (y + 1) * tile.width * 4);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? fallback : rest[i + 1];
};
const setName = flag('set', '16f');
const set = SETS[setName];
if (!set) throw new Error(`unknown set ${setName}; use 16f`);
const framesDir = flag(cmd === 'join' ? 'in' : 'out', join(ROOT, `art-src/spell-vfx-${setName}`));
const only = flag('only', '')?.split(',').filter(Boolean);
const sheets = only?.length ? only : SHEETS;
const pad = String(set.grid * set.grid - 1).length;

if (cmd === 'split') {
  for (const name of sheets) {
    const img = decodePng(readFileSync(join(set.dir, `${name}.png`)));
    const out = join(framesDir, name);
    mkdirSync(out, { recursive: true });
    for (let i = 0; i < set.grid * set.grid; i++) {
      const tile = cut(img, (i % set.grid) * set.frame, Math.floor(i / set.grid) * set.frame, set.frame);
      writeFileSync(join(out, `${name}_${String(i).padStart(pad, '0')}.png`), encodePng(tile));
    }
    console.log(`split ${name} → ${out} (${set.grid * set.grid} frames)`);
  }
} else if (cmd === 'join') {
  for (const name of sheets) {
    const dir = join(framesDir, name);
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    const count = set.grid * set.grid;
    if (files.length !== count) throw new Error(`${dir}: expected ${count} frames, found ${files.length}`);
    const side = set.grid * set.frame;
    const atlas = { width: side, height: side, px: Buffer.alloc(side * side * 4) };
    files.forEach((f, i) => {
      const tile = decodePng(readFileSync(join(dir, f)));
      if (tile.width !== set.frame || tile.height !== set.frame) {
        throw new Error(`${f}: expected ${set.frame}×${set.frame}, got ${tile.width}×${tile.height}`);
      }
      paste(atlas, tile, (i % set.grid) * set.frame, Math.floor(i / set.grid) * set.frame);
    });
    const dest = join(set.dir, `${name}.png`);
    writeFileSync(dest, encodePng(atlas));
    console.log(`join ${dir} → ${dest}`);
  }
} else if (cmd === 'register') {
  // A frame too faint to measure has no core to find — its centroid rides on a few dozen
  // stray pixels — so it takes the offset of the nearest frame that does, rather than being
  // shoved somewhere arbitrary.
  const FAINT = 0.02;
  // Below this the frame is not symmetric enough to have an axis — the ward's late frames,
  // where it has shattered right-hand-side first — so its x comes from a neighbour instead.
  const ASYMMETRIC = 0.7;
  const dry = rest.includes('--dry');
  const symX = rest.includes('--sym-x');
  for (const name of sheets) {
    const img = decodePng(readFileSync(join(set.dir, `${name}.png`)));
    const count = set.grid * set.grid;
    const at = (i) => [(i % set.grid) * set.frame, Math.floor(i / set.grid) * set.frame];
    const tiles = Array.from({ length: count }, (_, i) => cut(img, ...at(i), set.frame));
    const middle = set.frame / 2;

    // x and y are gated separately: a shattering frame still has a sound centroid height
    // long after it has stopped having an axis.
    const xs = [], ys = [];
    tiles.forEach((tile, i) => {
      const c = core(tile);
      if (c.mass < FAINT) return;
      ys[i] = middle - c.cy;
      if (!symX) { xs[i] = middle - c.cx; return; }
      const s = symmetry(tile);
      if (s.score >= ASYMMETRIC) xs[i] = middle - s.axis;
    });
    const carry = (list, i) => {
      for (let d = 1; d < count; d++) {
        if (list[i - d] !== undefined) return list[i - d];
        if (list[i + d] !== undefined) return list[i + d];
      }
      return undefined;
    };

    const report = [];
    tiles.forEach((tile, i) => {
      const rawX = xs[i] ?? carry(xs, i);
      const rawY = ys[i] ?? carry(ys, i);
      if (rawX === undefined || rawY === undefined) return;
      let dx = Math.round(rawX);
      let dy = Math.round(rawY);
      const box = extent(tile);
      let held = false;
      if (box) {
        const cdx = Math.min(Math.max(dx, -box.minX), set.frame - 1 - box.maxX);
        const cdy = Math.min(Math.max(dy, -box.minY), set.frame - 1 - box.maxY);
        held = cdx !== dx || cdy !== dy;
        dx = cdx;
        dy = cdy;
      }
      if (dx || dy) paste(img, shifted(tile, dx, dy), ...at(i));
      const carried = [xs[i] === undefined ? 'x' : '', ys[i] === undefined ? 'y' : ''].join('');
      report.push(`${String(i).padStart(2)}: ${dx >= 0 ? '+' : ''}${dx},${dy >= 0 ? '+' : ''}${dy}${carried ? ` (${carried} carried)` : ''}${held ? ' (held off the edge)' : ''}`);
    });
    if (!dry) writeFileSync(join(set.dir, `${name}.png`), encodePng(img));
    console.log(`${dry ? 'measure' : 'register'} ${name}${symX ? ' (x on the axis of symmetry)' : ''}\n  ${report.join('\n  ')}`);
  }
} else {
  console.error('usage: spell-vfx-frames.mjs split|join|register [--sym-x] [--set 16f] [--in/--out DIR] [--only name,name]');
  process.exit(1);
}
