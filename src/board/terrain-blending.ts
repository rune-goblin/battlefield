import type { Cell, Grid, Point } from '../engine/grid.js';
import { terrainRegions } from './terrain-regions.js';

export interface EdgeBlending {
  mode: 'hard' | 'soft' | 'natural';
  width: number;
  irregularity: number;
  patchSize: number;
}
export const DEFAULT_EDGE_BLENDING: EdgeBlending = { mode: 'natural', width: 0.15, irregularity: 0.2, patchSize: 0.25 };
export const MASK_PITCH = 64;
export interface BlendField {
  width: number;
  height: number;
  pitch: number;
  owners: Int16Array;
  distances: Float32Array[];
}

/** Distances use hex pitches, so zoom and window resizing preserve the transition. */
export function createBlendField(grid: Grid, groups: Cell[][], pitch = MASK_PITCH): BlendField {
  const bounds = grid.bounds(1);
  const width = Math.ceil(bounds.width * pitch), height = Math.ceil(bounds.height * pitch);
  const owners = new Int16Array(width * height).fill(-1);
  const byCell = new Map(groups.flatMap((cells, group) => cells.map(cell => [grid.key(cell), group] as const)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = grid.fromPoint({ x: (x + 0.5) / pitch, y: (y + 0.5) / pitch }, 1);
    if (cell) owners[y * width + x] = byCell.get(grid.key(cell)) ?? -1;
  }
  const distances = groups.map((cells, group) => {
    const loops = terrainRegions(grid, cells, 1).flatMap(region => [region.outline, ...region.holes]);
    const edges = loops.flatMap(loop => loop.map((a, i) => ({ a, b: loop[(i + 1) % loop.length] })));
    const field = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = { x: (x + 0.5) / pitch, y: (y + 0.5) / pitch };
      let distance = Infinity;
      for (const { a, b } of edges) distance = Math.min(distance, segmentDistanceSquared(p, a, b));
      const index = y * width + x;
      field[index] = Math.sqrt(distance) * (owners[index] === group ? 1 : -1);
    }
    return field;
  });
  return { width, height, pitch, owners, distances };
}

function segmentDistanceSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
};
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Each group's own claim on a texel: its distance to that group's edge, ramped across the blend
 * width. Shared domain distortion makes both sides follow the same irregular boundary. The claims
 * are left unnormalized — every reader divides by its own set's total, and a group's share of the
 * whole board is not the same question as its share of the two surfaces meeting at an edge. */
export function blendWeights(field: BlendField, settings: EdgeBlending): Float32Array[] {
  const { width, height, pitch, distances, owners } = field;
  const weights = distances.map(() => new Float32Array(width * height));
  const hard = settings.mode === 'hard' || settings.width <= 0;
  const halfWidth = Math.max(0.0001, settings.width / 2);
  const patch = Math.max(0.05, settings.patchSize);
  const amplitude = settings.mode === 'natural' ? settings.irregularity * 0.35 * pitch : 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, owner = owners[index];
    if (owner < 0) continue;
    if (hard) { weights[owner][index] = 1; continue; }
    let sx = x, sy = y;
    if (amplitude > 0) {
      const nx = (x + 0.5) / pitch / patch, ny = (y + 0.5) / pitch / patch;
      sx += amplitude * (0.75 * noise(nx, ny) + 0.25 * noise(nx * 2, ny * 2));
      sy += amplitude * (0.75 * noise(nx + 31.7, ny - 19.3) + 0.25 * noise(nx * 2 + 8.1, ny * 2));
    }
    sx = Math.max(0, Math.min(width - 1, sx)); sy = Math.max(0, Math.min(height - 1, sy));
    const ix = Math.floor(sx), iy = Math.floor(sy), jx = Math.min(ix + 1, width - 1), jy = Math.min(iy + 1, height - 1);
    const tx = sx - ix, ty = sy - iy;
    let total = 0;
    for (let group = 0; group < distances.length; group++) {
      const d = distances[group];
      const top = d[iy * width + ix] * (1 - tx) + d[iy * width + jx] * tx;
      const bottom = d[jy * width + ix] * (1 - tx) + d[jy * width + jx] * tx;
      const distance = top * (1 - ty) + bottom * ty;
      const weight = smooth(Math.max(0, Math.min(1, (distance + halfWidth) / (2 * halfWidth))));
      weights[group][index] = weight;
      total += weight;
    }
    if (total <= 0) weights[owner][index] = 1;
  }
  return weights;
}

/** Convert a normalized mixture to source-over opacity. The first surface stays opaque;
 * subsequent surfaces replace exactly their share, including at three-way junctions. */
export function blendMaskPixels(weights: Float32Array[]): Uint8Array[] {
  const total = new Float32Array(weights[0]?.length ?? 0);
  return weights.map(weight => {
    const pixels = new Uint8Array(weight.length * 4);
    for (let i = 0; i < weight.length; i++) {
      total[i] += weight[i];
      const opacity = total[i] > 0 ? weight[i] / total[i] : 0;
      pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = Math.round(opacity * 255);
      pixels[i * 4 + 3] = 255;
    }
    return pixels;
  });
}

/** The claim a set of surfaces holds on each texel, as the mask that stacks them over everything
 * below. The boundary is a ripple along the hex edge: it is cut at the level that leaves the set
 * exactly the ground it started with, so every bite the warp takes out of the set is paid for by
 * a bulge somewhere else and the set neither creeps outwards nor shrinks back. It is stepped
 * rather than ramped: a change in height is a step, and a gradient there reads as one surface
 * dissolving into the other. */
export function coverage(field: BlendField, settings: EdgeBlending, weights: Float32Array[], groups: number[]): Float32Array {
  const { owners } = field;
  const covered = new Float32Array(field.width * field.height);
  for (const group of groups) {
    const weight = weights[group];
    for (let i = 0; i < covered.length; i++) covered[i] += weight[i];
  }
  const own = new Set(groups);
  // An unwarped boundary is already on the edge, and its claim is a clean 0 or 1 either side —
  // there is no level to look for, and looking would find one that cuts the whole board in half.
  const middle = settings.mode === 'natural' && settings.irregularity > 0
    ? balancePoint(covered, owners, own) : 0.5;
  const half = 0.15;
  for (let i = 0; i < covered.length; i++) {
    covered[i] = smooth(Math.max(0, Math.min(1, 0.5 + (covered[i] - middle) / (2 * half))));
  }
  return covered;
}

/** The claim at which the set covers as much ground as it owns. A histogram rather than a sort:
 * the field runs to a few hundred thousand texels and only the crossing is wanted. */
function balancePoint(claim: Float32Array, owners: Int16Array, own: Set<number>): number {
  const BINS = 512;
  const histogram = new Int32Array(BINS + 1);
  let target = 0, board = 0;
  for (let i = 0; i < claim.length; i++) {
    if (owners[i] < 0) continue;
    board++;
    if (own.has(owners[i])) target++;
    histogram[Math.min(BINS, Math.max(0, Math.round(claim[i] * BINS)))]++;
  }
  if (target === 0 || target === board) return 0.5;
  let above = 0;
  for (let bin = BINS; bin > 0; bin--) {
    above += histogram[bin];
    if (above >= target) return bin / BINS;
  }
  return 0.5;
}

/** Coverage as a PIXI mask: opacity rides the colour channels, the way `blendMaskPixels` writes
 * them, since `PIXI.SpriteMaskFilter` reads red. */
export function maskPixels(covered: Float32Array, invert = false): Uint8Array {
  const pixels = new Uint8Array(covered.length * 4);
  for (let i = 0; i < covered.length; i++) {
    const value = Math.round((invert ? 1 - covered[i] : covered[i]) * 255);
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
