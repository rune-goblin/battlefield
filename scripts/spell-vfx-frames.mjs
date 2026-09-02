#!/usr/bin/env node
// Splits the spell VFX atlases into per-frame PNGs for hand editing and rebuilds
// an atlas from a frame folder. Round-trips pixel-exactly.
//
//   node scripts/spell-vfx-frames.mjs split [--set 16f] [--out DIR]
//   node scripts/spell-vfx-frames.mjs join  [--set 16f] [--in DIR] [--only NAME,NAME]
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
} else {
  console.error('usage: spell-vfx-frames.mjs split|join [--set 16f] [--in/--out DIR] [--only name,name]');
  process.exit(1);
}
