import { edgeKey, gridFor, notation, parse, SIZE, FILES, type Grid, type GridKind, type Square } from './grid.js';
import { seededRandom, type Random } from './rng.js';

export * from './grid.js';

export type HexTerrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'swamp' | 'desert';
export const HEX_TERRAINS: HexTerrain[] = ['plains', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

export type Feature = 'none' | 'river' | 'lakeside';
export const FEATURES: Feature[] = ['none', 'river', 'lakeside'];

export type SquareTerrain = 'open' | 'forest' | 'rough' | 'swamp' | 'shallows' | 'water' | 'settlement' | 'bridge';

export interface Construction { kind: 'fort'; tier: number; }

export type BoardSize = 9 | 11 | 15;

export interface BoardSpec {
  base: HexTerrain;
  size?: BoardSize;
  feature?: Feature;
  construction?: Construction | null;
  grid?: GridKind;
  seed: number;
}

export interface SquareState { terrain: SquareTerrain; elevation: number; bridgeTurns?: number; }

/** Deck directions a bridge can take: three axes through a hex, two through a square. A
 * `bridgeTurns` of 0 is the axis the board infers from the banks, and each turn steps on by
 * one, so a stored turn reads the same however the water around it is later repainted. */
export const BRIDGE_AXES: Record<GridKind, number> = { hex: 3, square: 2 };
export interface Wall {
  tier: number; boxes: number; remaining: number; inside?: string;
  /** Painted gates preserve an explicit facing cell; flipped tracks side B in the brush cycle. */
  gate?: { open: boolean; flipped?: boolean; facing?: string };
}
export interface SiegeField { cells: string[]; kind: 'rough' | 'web'; expires: number; }
export const FORTIFICATIONS = [
  { tier: 1, name: 'Earthworks', boxes: 2, hardness: 0, cover: 1 },
  { tier: 2, name: 'Wood', boxes: 3, hardness: 1, cover: 2 },
  { tier: 3, name: 'Stone', boxes: 4, hardness: 2, cover: 3 },
  { tier: 4, name: 'Fortress', boxes: 5, hardness: 2, cover: 4 },
] as const;
export const fortification = (tier: number) => FORTIFICATIONS[Math.max(1, Math.min(4, Math.floor(tier))) - 1] ?? FORTIFICATIONS[0];
export const wallBlocks = (wall: Wall): boolean => wall.remaining > 0 && !wall.gate?.open;
export const structuralDamage = (wall: Wall, damage: number, penetration = 0): number =>
  Math.max(0, damage - Math.max(0, fortification(wall.tier).hardness - penetration));
export function makeWall(tier: number, inside?: string): Wall {
  const wall = fortification(tier);
  return { tier: wall.tier, boxes: wall.boxes, remaining: wall.boxes, ...(inside ? { inside } : {}) };
}

export interface Board {
  spec: BoardSpec;
  grid: GridKind;
  squares: SquareState[][];
  walls: Record<string, Wall>;
  siegeFields?: SiegeField[];
  /** Explicit courtyard of a generated fort backed by the map edge. */
  fortInterior?: string[];
}

// Boards are JSON in localStorage and in cloned battle states, so they carry the kind, not the
// Grid itself.
export function gridOf(board: Board): Grid { return gridFor(board.grid, board.squares.length); }

export function at(board: Board, sq: Square): SquareState { return board.squares[sq.rank][sq.file]; }

export type Barrier = { kind: 'wall'; wall: Wall } | { kind: 'cliff' } | null;

export function barrierBetween(board: Board, a: Square, b: Square): Barrier {
  if (gridOf(board).distance(a, b) !== 1) return null;
  const wall = board.walls[edgeKey(a, b)];
  if (wall && wallBlocks(wall)) return { kind: 'wall', wall };
  if (Math.abs(at(board, a).elevation - at(board, b).elevation) >= 2) return { kind: 'cliff' };
  return null;
}

type Layout = 'spine' | 'knolls' | 'flank' | 'massif' | 'pass' | 'dunes';

/** One landform: ground moved one way from level 0. High and sunken ground share the shape. */
interface Landform {
  /** Share of the board moved to one level or more. */
  share: [number, number];
  /** Share of that ground moved to two levels. */
  deep: [number, number];
  /** Two-level ground may stand beside ground it makes a cliff with. */
  cliffs: boolean;
  layouts: Layout[];
}

interface Density {
  forestPatches: [number, number];
  swampPatches: [number, number];
  waterPatches: [number, number];
  roughPatches: [number, number];
  patchSize: [number, number];
  /** Patches may touch and grow into one mass; otherwise open ground rings each one. */
  merge: boolean;
  high: Landform | null;
  low: Landform | null;
}

const DENSITY: Record<HexTerrain, Density> = {
  plains: { forestPatches: [0, 3], swampPatches: [0, 1], waterPatches: [0, 1], roughPatches: [0, 2], patchSize: [1, 3], merge: false,
    high: { share: [0, 0.07], deep: [0, 0], cliffs: false, layouts: ['knolls'] },
    low: { share: [0, 0.06], deep: [0, 0], cliffs: false, layouts: ['knolls'] } },
  forest: { forestPatches: [8, 11], swampPatches: [0, 2], waterPatches: [0, 1], roughPatches: [0, 1], patchSize: [2, 7], merge: true,
    high: { share: [0, 0.14], deep: [0, 0], cliffs: false, layouts: ['knolls', 'spine'] },
    low: { share: [0, 0.1], deep: [0, 0], cliffs: false, layouts: ['knolls', 'spine'] } },
  hills: { forestPatches: [2, 4], swampPatches: [0, 1], waterPatches: [0, 1], roughPatches: [3, 5], patchSize: [2, 4], merge: true,
    high: { share: [0.26, 0.4], deep: [0, 0.2], cliffs: false, layouts: ['spine', 'knolls', 'flank', 'massif', 'pass'] },
    low: { share: [0.04, 0.12], deep: [0, 0.2], cliffs: false, layouts: ['knolls', 'spine'] } },
  mountains: { forestPatches: [2, 4], swampPatches: [0, 0], waterPatches: [0, 1], roughPatches: [4, 6], patchSize: [2, 4], merge: true,
    high: { share: [0.32, 0.46], deep: [0.25, 0.4], cliffs: true, layouts: ['spine', 'flank', 'massif', 'pass'] },
    low: { share: [0.05, 0.14], deep: [0.2, 0.5], cliffs: true, layouts: ['spine', 'knolls'] } },
  swamp: { forestPatches: [2, 4], swampPatches: [7, 10], waterPatches: [2, 4], roughPatches: [0, 0], patchSize: [2, 6], merge: true,
    high: { share: [0, 0.08], deep: [0, 0], cliffs: false, layouts: ['knolls'] },
    low: { share: [0.18, 0.32], deep: [0.1, 0.3], cliffs: false, layouts: ['knolls', 'flank', 'massif', 'spine'] } },
  desert: { forestPatches: [0, 0], swampPatches: [0, 0], waterPatches: [0, 1], roughPatches: [5, 7], patchSize: [1, 3], merge: false,
    high: { share: [0.16, 0.28], deep: [0, 0], cliffs: false, layouts: ['dunes', 'dunes', 'knolls'] },
    low: { share: [0, 0.1], deep: [0, 0], cliffs: false, layouts: ['spine'] } },
};

/** Ranks each army deploys on. The 15-hex board takes four, leaving its front ranks eight
 * apart — one hex beyond a Speed-2 unit's charge. The older boards keep three. */
export const deployDepth = (dimension = SIZE) => (dimension >= 15 ? 4 : 3);

export function deployRanks(side: 'attacker' | 'defender', ambush = false, dimension = SIZE): number[] {
  const depth = deployDepth(dimension) + (ambush ? 1 : 0);
  return Array.from({ length: depth }, (_, i) => side === 'attacker' ? i : dimension - 1 - i);
}

const DEPLOY_RANKS = new Set([...deployRanks('attacker'), ...deployRanks('defender')]);
// Ranks neither side deploys on — where a river or a fought-over feature belongs.
export const NEUTRAL_RANKS = Array.from({ length: SIZE }, (_, r) => r).filter(r => !DEPLOY_RANKS.has(r));

function between(rnd: Random, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function pick<T>(rnd: Random, items: T[]): T { return items[Math.floor(rnd() * items.length)]; }

function emptyBoard(spec: BoardSpec): Board {
  const SIZE = spec.size ?? 15;
  const squares = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, (): SquareState => ({ terrain: 'open', elevation: 0 })));
  return { spec, grid: spec.grid ?? 'hex', squares, walls: {} };
}

function growPatch(board: Board, rnd: Random, terrain: SquareTerrain, size: number, merge: boolean, allowed: (sq: Square) => boolean): void {
  const grid = gridOf(board);
  const patchKeys = new Set<string>();
  const eligible = (sq: Square) => at(board, sq).terrain === 'open' && allowed(sq)
    && (merge || grid.neighbours(sq).every(n => patchKeys.has(notation(n)) || !['forest', 'swamp', 'rough'].includes(at(board, n).terrain)));
  const candidates = grid.cells().filter(eligible);
  if (!candidates.length) return;
  const patch: Square[] = [pick(rnd, candidates)];
  at(board, patch[0]).terrain = terrain;
  patchKeys.add(notation(patch[0]));
  while (patch.length < size) {
    const frontier = patch.flatMap(sq => grid.neighbours(sq)).filter(eligible);
    if (!frontier.length) return;
    const next = pick(rnd, frontier);
    at(board, next).terrain = terrain;
    patch.push(next);
    patchKeys.add(notation(next));
  }
}

const span = (rnd: Random, lo: number, hi: number): number => lo + rnd() * (hi - lo);
const bell = (d: number, width: number): number => Math.exp(-((d / width) ** 2));

// Each layout scores a cell at x (flank to flank) and y (attacker edge to defender edge), both
// in -1..1. The highest-scoring cells become the high ground.
function layoutScore(rnd: Random, layout: Layout): (x: number, y: number) => number {
  const phase = span(rnd, 0, Math.PI * 2);
  const knoll = () => ({ cx: span(rnd, -0.8, 0.8), cy: span(rnd, -0.55, 0.55), r: span(rnd, 0.16, 0.32) });
  switch (layout) {
    case 'spine': {
      const y0 = span(rnd, -0.35, 0.35), slope = span(rnd, -0.5, 0.5), width = span(rnd, 0.2, 0.32), saddles = span(rnd, 3, 6);
      return (x, y) => bell(y - y0 - slope * x, width) * (0.65 + 0.35 * Math.cos(x * saddles + phase));
    }
    case 'flank': {
      const side = rnd() < 0.5 ? -1 : 1, reach = span(rnd, 0.6, 0.95);
      return (x, y) => bell(x - side, reach) * (0.7 + 0.3 * Math.cos(y * 5 + phase));
    }
    case 'massif': {
      const big = { cx: span(rnd, -0.3, 0.3), cy: span(rnd, -0.25, 0.25), r: span(rnd, 0.45, 0.6) }, spur = knoll();
      return (x, y) => Math.max(bell(Math.hypot(x - big.cx, y - big.cy), big.r), 0.8 * bell(Math.hypot(x - spur.cx, y - spur.cy), spur.r));
    }
    case 'pass': {
      const gap = span(rnd, -0.4, 0.4), width = span(rnd, 0.22, 0.38), y0 = span(rnd, -0.3, 0.3);
      return (x, y) => (1 - bell(x - gap, width)) * bell(y - y0, 0.6);
    }
    case 'dunes': {
      const slope = span(rnd, -0.6, 0.6), wavelength = span(rnd, 0.5, 0.85);
      return (x, y) => Math.cos((y + slope * x) * Math.PI * 2 / wavelength + phase);
    }
    case 'knolls': {
      const knolls = Array.from({ length: between(rnd, [3, 5]) }, knoll);
      return (x, y) => Math.max(...knolls.map(k => bell(Math.hypot(x - k.cx, y - k.cy), k.r)));
    }
  }
}

// Raises with `sign` 1 and sinks with -1. Moved ground keeps off each side's two home ranks,
// so nobody deploys behind a hill or in a hollow.
function layLandform(board: Board, rnd: Random, form: Landform, sign: 1 | -1): void {
  const SIZE = board.squares.length;
  const grid = gridOf(board);
  const half = (SIZE - 1) / 2;
  const score = layoutScore(rnd, pick(rnd, form.layouts));
  const stagger = board.grid === 'hex' ? 0.5 : 0;
  const depth = (sq: Square) => at(board, sq).elevation * sign;
  const ranked = grid.cells()
    .filter(sq => sq.rank >= 2 && sq.rank <= SIZE - 3 && at(board, sq).elevation === 0)
    .map(sq => ({ sq, score: score((sq.file + (sq.rank % 2) * stagger - half) / half, (sq.rank - half) / half) + rnd() * 0.25 }))
    .sort((a, b) => b.score - a.score);
  const moved = ranked.slice(0, Math.round(span(rnd, ...form.share) * grid.cells().length))
    .filter(({ sq }) => form.cliffs || grid.neighbours(sq).every(n => depth(n) >= 0));
  for (const { sq } of moved) at(board, sq).elevation = sign;
  for (const { sq } of moved.slice(0, Math.round(span(rnd, ...form.deep) * moved.length))) {
    if (form.cliffs || grid.neighbours(sq).every(n => depth(n) >= 1)) at(board, sq).elevation = 2 * sign;
  }
}

function groundConnected(board: Board): boolean {
  const SIZE = board.squares.length;
  const grid = gridOf(board);
  const frontier = grid.cells().filter(sq => sq.rank === 0 && at(board, sq).terrain !== 'water');
  const seen = new Set(frontier.map(notation));
  for (let i = 0; i < frontier.length; i++) {
    if (frontier[i].rank === SIZE - 1) return true;
    for (const n of grid.neighbours(frontier[i])) {
      if (seen.has(notation(n)) || at(board, n).terrain === 'water' || barrierBetween(board, frontier[i], n)?.kind === 'cliff') continue;
      seen.add(notation(n));
      frontier.push(n);
    }
  }
  return false;
}

// A river crosses the attacker's path on the neutral band between the deployment zones. On
// the hexagon a flank file exists on only part of that band, so a cell the shape lacks falls
// back to whichever band rank does hold that file — the river must reach both flanks.
function layRiver(board: Board, rnd: Random): void {
  const SIZE = board.squares.length;
  const grid = gridOf(board);
  const depth = deployDepth(SIZE);
  const band = Array.from({ length: SIZE - 2 * depth }, (_, i) => i + depth);
  let rank = between(rnd, [band[0], band[band.length - 1]]);
  const course: Square[] = [];
  const place = (file: number, r: number): Square => {
    const wanted = { file, rank: r };
    if (grid.inBounds(wanted)) return wanted;
    return { file, rank: band.find(b => grid.inBounds({ file, rank: b })) ?? r };
  };
  for (let file = 0; file < SIZE; file++) {
    course.push(place(file, rank));
    const drift = rnd();
    const next = drift < 0.25 ? rank - 1 : drift < 0.5 ? rank + 1 : rank;
    if (next !== rank && band.includes(next) && file < SIZE - 1) {
      course.push(place(file, next));
      rank = next;
    }
  }
  for (const sq of course) if (grid.inBounds(sq)) { at(board, sq).terrain = 'water'; at(board, sq).elevation = 0; }
  const fords = between(rnd, [1, 2]);
  const candidates = course.filter(sq => grid.inBounds(sq)).filter((sq, i) => {
    const prev = course[i - 1]; const next = course[i + 1];
    return (!prev || prev.rank === sq.rank) && (!next || next.rank === sq.rank);
  });
  const chosen = new Set<string>();
  while (chosen.size < Math.min(fords, candidates.length)) chosen.add(notation(pick(rnd, candidates)));
  for (const n of chosen) at(board, parse(n)).terrain = 'shallows';
}

// The lake hugs one flank of the board, so each of its ranks starts at that rank's own
// outermost cell rather than a fixed file — on the hexagon the flank is a diagonal.
function layLake(board: Board, rnd: Random): void {
  const grid = gridOf(board);
  const west = rnd() < 0.5;
  const size = between(rnd, [8, 12]);
  const rank0 = between(rnd, [2, 3]);
  const lake: Square[] = [];
  const dir = west ? 1 : -1;
  for (let depth = 0; lake.length < size && depth < 3; depth++) {
    const height = Math.min(4 - depth, size - lake.length);
    for (let r = 0; r < height; r++) {
      const rank = rank0 + r;
      const files = grid.cells().filter(c => c.rank === rank).map(c => c.file);
      if (!files.length) continue;
      lake.push({ file: (west ? Math.min(...files) : Math.max(...files)) + dir * depth, rank });
    }
  }
  const wet = lake.filter(sq => grid.inBounds(sq));
  for (const sq of wet) { at(board, sq).terrain = 'water'; at(board, sq).elevation = 0; }
  const shore = wet.flatMap(sq => grid.neighbours(sq)).filter(sq => at(board, sq).terrain === 'open' && at(board, sq).elevation <= 0);
  const marsh = between(rnd, [1, 3]);
  for (let i = 0; i < marsh && shore.length; i++) at(board, pick(rnd, shore)).terrain = 'shallows';
}

export function wallBudget(tier: number): number { return 4 + tier; }

// The fort backs onto the defender's edge so the wall budget covers front and flanks; a
// short budget leaves the gate open on one flank.
function layFort(board: Board, rnd: Random, tier: number): void {
  const SIZE = board.squares.length;
  const budget = wallBudget(tier);
  const width = budget >= 7 ? 3 : 2;
  const depth = budget >= 5 ? 2 : 1;
  const grid = gridOf(board);
  // One file clear of the home rank's own ends, so the block keeps a flank neighbour on each
  // side and the whole budget has somewhere to go.
  const home = grid.cells().filter(c => c.rank === SIZE - 1).map(c => c.file).sort((a, b) => a - b);
  const lo = home[0] + 1;
  const file0 = between(rnd, [lo, Math.max(lo, home[home.length - 1] - width)]);
  const block: Square[] = [];
  for (let d = 0; d < depth; d++) for (let w = 0; w < width; w++) block.push({ file: file0 + w, rank: SIZE - 1 - d });
  const walled = block.filter(sq => grid.inBounds(sq));
  for (const sq of walled) { at(board, sq).terrain = 'settlement'; at(board, sq).elevation = 0; }
  const inside = new Set(walled.map(notation));
  board.fortInterior = [...inside];
  const front = walled.filter(sq => sq.rank === SIZE - depth).map(sq => edgeKey(sq, { file: sq.file, rank: sq.rank - 1 }));
  const flanks = walled.flatMap(sq => grid.neighbours(sq)
    .filter(n => n.rank === sq.rank && !inside.has(notation(n)))
    .map(n => edgeKey(sq, n)));
  const edges = [...front, ...flanks].slice(0, budget);
  for (const key of edges) board.walls[key] = makeWall(tier, key.split('|').find(id => inside.has(id)));
  if (front[0] && board.walls[front[0]]) board.walls[front[0]].gate = { open: false };
}

export function generateBoard(spec: BoardSpec): Board {
  const rnd = seededRandom(spec.seed);
  const board = emptyBoard(spec);
  const d = DENSITY[spec.base];
  const feature = spec.feature ?? 'none';

  if (d.high) layLandform(board, rnd, d.high, 1);
  if (d.low) layLandform(board, rnd, d.low, -1);
  if (feature === 'river') layRiver(board, rnd);
  if (feature === 'lakeside') layLake(board, rnd);
  if (spec.construction) layFort(board, rnd, spec.construction.tier);
  const depth = deployDepth(board.squares.length);
  const middle = (sq: Square) => sq.rank >= depth && sq.rank < board.squares.length - depth;
  const level = (sq: Square) => at(board, sq).elevation === 0;
  const low = (sq: Square) => at(board, sq).elevation <= 0;
  const sunk = (sq: Square) => at(board, sq).elevation < 0;
  const high = (sq: Square) => at(board, sq).elevation > 0;
  const size = () => between(rnd, d.patchSize);
  // Woods favour the valleys, scree the slopes, and bog the hollows. Swamp never climbs above
  // level 0, and a pond sits at level 0 with the river and the lake.
  // Bog and dry broken ground rarely share a field: nine boards in ten keep the commoner one.
  // proto: patch counts were tuned on 91 hexes; scale them so a larger field keeps its density.
  const scale = Math.max(1, gridOf(board).cells().length / 91);
  const patches = (range: [number, number]) => Math.round(between(rnd, range) * scale);
  let swamps = patches(d.swampPatches), roughs = patches(d.roughPatches);
  if (swamps && roughs && rnd() < 0.9) {
    if (swamps > roughs || (swamps === roughs && rnd() < 0.5)) roughs = 0; else swamps = 0;
  }
  for (let i = patches(d.forestPatches); i > 0; i--) growPatch(board, rnd, 'forest', size(), d.merge, rnd() < 0.7 ? low : () => true);
  for (let i = swamps; i > 0; i--) growPatch(board, rnd, 'swamp', size(), d.merge, rnd() < 0.5 ? sunk : low);
  for (let i = patches(d.waterPatches); i > 0; i--) growPatch(board, rnd, 'water', between(rnd, [1, 2]), true, sq => middle(sq) && level(sq));
  for (let i = roughs; i > 0; i--) growPatch(board, rnd, 'rough', size(), d.merge, rnd() < 0.6 ? high : () => true);

  // Cliffs may channel the advance and never seal it; a river's crossings stay the GM's call.
  if (feature !== 'river' && !groundConnected(board)) {
    for (const sq of gridOf(board).cells()) at(board, sq).elevation = Math.min(1, Math.max(0, at(board, sq).elevation));
  }

  return board;
}

export function count(board: Board, terrain: SquareTerrain): number {
  return gridOf(board).cells().filter(sq => at(board, sq).terrain === terrain).length;
}

export function render(board: Board): string {
  const SIZE = board.squares.length;
  const glyph: Record<SquareTerrain, string> = { open: '.', forest: 'T', rough: ':', swamp: '~', shallows: '=', water: 'W', settlement: '#', bridge: 'B' };
  const grid = gridOf(board);
  const rows: string[] = [];
  // Odd rows of an odd-r hex board sit half a cell to the right; the shared edge between two
  // rows lands halfway between the two indents.
  const indent = board.grid === 'hex' ? (rank: number) => (rank % 2 ? '  ' : '') : () => '';
  const underIndent = board.grid === 'hex' ? ' ' : '';
  for (let rank = SIZE - 1; rank >= 0; rank--) {
    let row = `${rank + 1} ` + indent(rank);
    for (let file = 0; file < SIZE; file++) {
      const s = board.squares[rank][file];
      row += grid.inBounds({ file, rank }) ? glyph[s.terrain] + (s.elevation > 0 ? String(s.elevation) : ' -='[-s.elevation]) : '  ';
      const east = { file: file + 1, rank };
      row += grid.inBounds(east) && board.walls[edgeKey({ file, rank }, east)] ? '|' : ' ';
    }
    rows.push(row);
    if (rank > 0) {
      let under = '  ' + underIndent;
      for (let file = 0; file < SIZE; file++) {
        under += board.walls[edgeKey({ file, rank }, { file, rank: rank - 1 })] ? '-- ' : '   ';
      }
      rows.push(under);
    }
  }
  rows.push('  ' + [...FILES.slice(0, SIZE)].join('  '));
  return rows.join('\n');
}
