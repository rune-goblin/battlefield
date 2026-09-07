import { seededRandom, type Cell, type Grid, type Point } from '../engine/index.js';

import { connectedCells } from './terrain-regions.js';

export interface ForestTree {
  position: Point; size: number; rotation: number;
  /** Which frame of the sheet this tree wears. */
  variant: number;
  /** Two more stable draws, 0–1, for whoever colours the tree: where in the hue spread it
   * sits, and how much of the wash it takes. Kept here so a tree keeps its colour while the
   * tint settings move. */
  hue: number; shade: number;
}
export interface TreeRange { min: number; max: number; size?: number; variation?: number }
/** The spread of crown sizes when nothing says otherwise — what the wood had before the
 * variation slider existed. */
const DEFAULT_SIZE_VARIATION = 0.1;
const ATTEMPTS = 8;

function seedOf(text: string): number {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
function bounds(range: TreeRange): { min: number; max: number } {
  const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(20, Math.round(n))) : 0;
  const min = clamp(range.min);
  return { min, max: Math.max(min, clamp(range.max)) };
}

/** Plants `count` trees across `cells`, taking each from whichever of `ATTEMPTS` candidates
 * falls furthest from everything already standing. Every hex is the same area, so drawing a
 * cell and then a point inside it is uniform over the whole patch. */
function scatter(
  grid: Grid, cells: readonly Cell[], size: number, range: TreeRange,
  random: () => number, count: number, standing: readonly ForestTree[],
): ForestTree[] {
  const variation = Math.max(0, Math.min(1, range.variation ?? DEFAULT_SIZE_VARIATION));
  const trees: ForestTree[] = [];
  const sample = (): Point => {
    const cell = cells[Math.floor(random() * cells.length)];
    const centre = grid.center(cell, size);
    const vertices = grid.vertices(cell, size);
    // Uniform sampling over the whole polygon reaches corners and shared edges. Crowns
    // remain unmasked, so a tree rooted near an edge can lean into the next hex.
    const edge = Math.floor(random() * vertices.length);
    const a = vertices[edge], b = vertices[(edge + 1) % vertices.length];
    const radius = Math.sqrt(random()), along = random();
    return {
      x: centre.x + radius * ((1 - along) * a.x + along * b.x - centre.x),
      y: centre.y + radius * ((1 - along) * a.y + along * b.y - centre.y),
    };
  };
  for (let i = 0; i < count; i++) {
    let position: Point | null = null, bestSpacing = -Infinity;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const candidate = sample();
      let spacing = Infinity;
      for (const tree of [...standing, ...trees]) {
        spacing = Math.min(spacing, Math.hypot(candidate.x - tree.position.x, candidate.y - tree.position.y));
      }
      if (spacing > bestSpacing) { bestSpacing = spacing; position = candidate; }
    }
    trees.push({
      position: position!,
      size: size * 0.31 * (range.size ?? 1) * (1 + (random() * 2 - 1) * variation),
      rotation: random() * Math.PI * 2, variant: random(), hue: random(), shade: random(),
    });
  }
  return trees;
}

/** Stable per-cell randomness keeps trees still while textures change or the board resizes. */
export function forestTrees(
  grid: Grid, cell: Cell, size: number, range: TreeRange,
  neighbours: readonly ForestTree[] = [],
): ForestTree[] {
  const random = seededRandom(seedOf(`forest:${grid.key(cell)}`));
  const { min, max } = bounds(range);
  const count = min + Math.floor(random() * (max - min + 1));
  return scatter(grid, [cell], size, range, random, count, neighbours);
}

/** One draw over each connected patch rather than one per hex, so the hexes stop showing
 * through as a grid of little clumps. The per-hex counts still set the total, so a wood holds
 * the same number of trees either way and the switch changes only their arrangement. */
export function areaTrees(grid: Grid, cells: Cell[], size: number, range: TreeRange): ForestTree[] {
  const { min, max } = bounds(range);
  const trees: ForestTree[] = [];
  for (const patch of connectedCells(grid, cells)) {
    // Sorted so the patch is sampled the same way however it was walked. Its lowest key is
    // then also the seed, which no other patch can hold.
    const ordered = [...patch].sort((a, b) => grid.key(a) < grid.key(b) ? -1 : 1);
    const random = seededRandom(seedOf(`forest-area:${grid.key(ordered[0])}`));
    let count = 0;
    for (let i = 0; i < ordered.length; i++) count += min + Math.floor(random() * (max - min + 1));
    trees.push(...scatter(grid, ordered, size, range, random, count, trees));
  }
  return trees;
}
