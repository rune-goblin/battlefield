import { allSquares, edgeKey, gridFor, inBounds, notation, parse, SIZE, FILES, type Grid, type GridKind, type Square } from './grid.js';
import { seededRandom, type Random } from './rng.js';

export * from './grid.js';

export type HexTerrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'swamp' | 'desert';
export const HEX_TERRAINS: HexTerrain[] = ['plains', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

export type Feature = 'none' | 'river' | 'lakeside';
export const FEATURES: Feature[] = ['none', 'river', 'lakeside'];

export type SquareTerrain = 'open' | 'forest' | 'swamp' | 'shallows' | 'water' | 'settlement';

export interface Construction { kind: 'fort'; tier: number; }

export interface BoardSpec {
  base: HexTerrain;
  feature?: Feature;
  construction?: Construction | null;
  grid?: GridKind;
  seed: number;
}

export interface SquareState { terrain: SquareTerrain; elevation: number; }
export interface Wall { tier: number; boxes: number; remaining: number; }

export interface Board {
  spec: BoardSpec;
  grid: GridKind;
  squares: SquareState[][];
  walls: Record<string, Wall>;
}

// Boards are JSON in localStorage and in cloned battle states, so they carry the kind, not the
// Grid itself.
export function gridOf(board: Board): Grid { return gridFor(board.grid); }

export function at(board: Board, sq: Square): SquareState { return board.squares[sq.rank][sq.file]; }

export type Barrier = { kind: 'wall'; wall: Wall } | { kind: 'cliff' } | null;

export function barrierBetween(board: Board, a: Square, b: Square): Barrier {
  if (gridOf(board).distance(a, b) !== 1) return null;
  const wall = board.walls[edgeKey(a, b)];
  if (wall && wall.remaining > 0) return { kind: 'wall', wall };
  if (Math.abs(at(board, a).elevation - at(board, b).elevation) >= 2) return { kind: 'cliff' };
  return null;
}

interface Density {
  forestPatches: [number, number];
  swampPatches: [number, number];
  waterPatches: [number, number];
  ridge: 'none' | 'low' | 'high';
  patchSize: [number, number];
}

// Counts are patches, not squares: trees on plains come as one or two copses, never scattered.
const DENSITY: Record<HexTerrain, Density> = {
  plains: { forestPatches: [0, 2], swampPatches: [0, 1], waterPatches: [0, 1], ridge: 'none', patchSize: [1, 3] },
  forest: { forestPatches: [8, 11], swampPatches: [0, 2], waterPatches: [0, 1], ridge: 'none', patchSize: [3, 6] },
  hills: { forestPatches: [1, 3], swampPatches: [0, 1], waterPatches: [0, 1], ridge: 'low', patchSize: [1, 3] },
  mountains: { forestPatches: [4, 7], swampPatches: [0, 0], waterPatches: [0, 1], ridge: 'high', patchSize: [2, 4] },
  swamp: { forestPatches: [1, 3], swampPatches: [8, 12], waterPatches: [1, 3], ridge: 'none', patchSize: [3, 6] },
  desert: { forestPatches: [0, 0], swampPatches: [0, 0], waterPatches: [0, 1], ridge: 'low', patchSize: [1, 2] },
};

export const DEPLOY_DEPTH = 3;
const DEPLOY_RANKS = new Set([0, 1, 2, 5, 6, 7]);

export function deployRanks(side: 'attacker' | 'defender', ambush = false): number[] {
  const depth = DEPLOY_DEPTH + (ambush ? 1 : 0);
  return Array.from({ length: depth }, (_, i) => side === 'attacker' ? i : SIZE - 1 - i);
}

function between(rnd: Random, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function pick<T>(rnd: Random, items: T[]): T { return items[Math.floor(rnd() * items.length)]; }

function emptyBoard(spec: BoardSpec): Board {
  const squares = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, (): SquareState => ({ terrain: 'open', elevation: 0 })));
  return { spec, grid: spec.grid ?? 'square', squares, walls: {} };
}

function growPatch(board: Board, rnd: Random, terrain: SquareTerrain, size: number, allowed: (sq: Square) => boolean): void {
  const grid = gridOf(board);
  const candidates = allSquares().filter(sq => at(board, sq).terrain === 'open' && allowed(sq));
  if (!candidates.length) return;
  const patch: Square[] = [pick(rnd, candidates)];
  at(board, patch[0]).terrain = terrain;
  while (patch.length < size) {
    const frontier = patch.flatMap(sq => grid.neighbours(sq)).filter(sq => at(board, sq).terrain === 'open' && allowed(sq));
    if (!frontier.length) return;
    const next = pick(rnd, frontier);
    at(board, next).terrain = terrain;
    patch.push(next);
  }
}

function layRidge(board: Board, rnd: Random, high: boolean): void {
  const length = between(rnd, [5, 8]);
  const rank = between(rnd, [2, 5]);
  let sq: Square = { file: between(rnd, [0, 1]), rank };
  const ridge: Square[] = [];
  while (ridge.length < length && inBounds(sq)) {
    if (at(board, sq).elevation === 0) ridge.push(sq);
    at(board, sq).elevation = 1;
    const drift = rnd();
    const step: Square = drift < 0.6 ? { file: sq.file + 1, rank: sq.rank }
      : { file: sq.file, rank: Math.min(5, Math.max(2, sq.rank + (drift < 0.8 ? 1 : -1))) };
    sq = step.file === sq.file && step.rank === sq.rank ? { file: sq.file + 1, rank: sq.rank } : step;
  }
  if (high && ridge.length >= 3) {
    const peaks = between(rnd, [1, 2]);
    for (let i = 0; i < peaks; i++) at(board, pick(rnd, ridge.slice(1, -1))).elevation = 2;
  }
}

// A river crosses the attacker's path between the deployment zones, on ranks 4 and 5.
function layRiver(board: Board, rnd: Random): void {
  const start = between(rnd, [3, 4]);
  let rank = start;
  const course: Square[] = [];
  for (let file = 0; file < SIZE; file++) {
    course.push({ file, rank });
    const drift = rnd();
    const next = drift < 0.25 ? rank - 1 : drift < 0.5 ? rank + 1 : rank;
    if (next !== rank && next >= 3 && next <= 4 && file < SIZE - 1) {
      course.push({ file, rank: next });
      rank = next;
    }
  }
  for (const sq of course) { at(board, sq).terrain = 'water'; at(board, sq).elevation = 0; }
  const fords = between(rnd, [1, 2]);
  const candidates = course.filter((sq, i) => {
    const prev = course[i - 1]; const next = course[i + 1];
    return (!prev || prev.rank === sq.rank) && (!next || next.rank === sq.rank);
  });
  const chosen = new Set<string>();
  while (chosen.size < Math.min(fords, candidates.length)) chosen.add(notation(pick(rnd, candidates)));
  for (const n of chosen) at(board, parse(n)).terrain = 'shallows';
}

function layLake(board: Board, rnd: Random): void {
  const side = pick(rnd, ['a', 'h'] as const);
  const size = between(rnd, [8, 12]);
  const rank0 = between(rnd, [2, 3]);
  const lake: Square[] = [];
  const file0 = side === 'a' ? 0 : SIZE - 1;
  const dir = side === 'a' ? 1 : -1;
  for (let depth = 0; lake.length < size && depth < 3; depth++) {
    const height = Math.min(4 - depth, size - lake.length);
    for (let r = 0; r < height; r++) lake.push({ file: file0 + dir * depth, rank: rank0 + r });
  }
  for (const sq of lake) { at(board, sq).terrain = 'water'; at(board, sq).elevation = 0; }
  const shore = lake.flatMap(sq => gridOf(board).neighbours(sq)).filter(sq => at(board, sq).terrain === 'open');
  const marsh = between(rnd, [1, 3]);
  for (let i = 0; i < marsh && shore.length; i++) at(board, pick(rnd, shore)).terrain = 'shallows';
}

export function wallBudget(tier: number): number { return 4 + tier; }

// The fort backs onto the defender's edge so the wall budget covers front and flanks; a
// short budget leaves the gate open on one flank.
function layFort(board: Board, rnd: Random, tier: number): void {
  const budget = wallBudget(tier);
  const width = budget >= 7 ? 3 : 2;
  const depth = budget >= 5 ? 2 : 1;
  const file0 = between(rnd, [1, SIZE - width - 1]);
  const block: Square[] = [];
  for (let d = 0; d < depth; d++) for (let w = 0; w < width; w++) block.push({ file: file0 + w, rank: SIZE - 1 - d });
  for (const sq of block) { at(board, sq).terrain = 'settlement'; at(board, sq).elevation = 0; }
  const inside = new Set(block.map(notation));
  const front = block.filter(sq => sq.rank === SIZE - depth).map(sq => edgeKey(sq, { file: sq.file, rank: sq.rank - 1 }));
  const flanks = block.flatMap(sq => gridOf(board).neighbours(sq)
    .filter(n => n.rank === sq.rank && !inside.has(notation(n)))
    .map(n => edgeKey(sq, n)));
  const edges = [...front, ...flanks].slice(0, budget);
  for (const key of edges) board.walls[key] = { tier, boxes: tier + 1, remaining: tier + 1 };
}

export function generateBoard(spec: BoardSpec): Board {
  const rnd = seededRandom(spec.seed);
  const board = emptyBoard(spec);
  const d = DENSITY[spec.base];
  const feature = spec.feature ?? 'none';

  if (d.ridge !== 'none') layRidge(board, rnd, d.ridge === 'high');
  if (feature === 'river') layRiver(board, rnd);
  if (feature === 'lakeside') layLake(board, rnd);
  if (spec.construction) layFort(board, rnd, spec.construction.tier);

  const notDeploy = (sq: Square) => !DEPLOY_RANKS.has(sq.rank);
  const anywhere = () => true;
  for (let i = between(rnd, d.forestPatches); i > 0; i--) growPatch(board, rnd, 'forest', between(rnd, d.patchSize), anywhere);
  for (let i = between(rnd, d.swampPatches); i > 0; i--) growPatch(board, rnd, 'swamp', between(rnd, d.patchSize), anywhere);
  for (let i = between(rnd, d.waterPatches); i > 0; i--) growPatch(board, rnd, 'water', between(rnd, [1, 2]), notDeploy);

  return board;
}

export function count(board: Board, terrain: SquareTerrain): number {
  return allSquares().filter(sq => at(board, sq).terrain === terrain).length;
}

export function render(board: Board): string {
  const glyph: Record<SquareTerrain, string> = { open: '.', forest: 'T', swamp: '~', shallows: '=', water: 'W', settlement: '#' };
  const rows: string[] = [];
  // Odd rows of an odd-r hex board sit half a cell to the right; the shared edge between two
  // rows lands halfway between the two indents.
  const indent = board.grid === 'hex' ? (rank: number) => (rank % 2 ? '  ' : '') : () => '';
  const underIndent = board.grid === 'hex' ? ' ' : '';
  for (let rank = SIZE - 1; rank >= 0; rank--) {
    let row = `${rank + 1} ` + indent(rank);
    for (let file = 0; file < SIZE; file++) {
      const s = board.squares[rank][file];
      row += glyph[s.terrain] + (s.elevation > 0 ? String(s.elevation) : ' ');
      const east = { file: file + 1, rank };
      row += inBounds(east) && board.walls[edgeKey({ file, rank }, east)] ? '|' : ' ';
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
  rows.push('  ' + [...FILES].join('  '));
  return rows.join('\n');
}
