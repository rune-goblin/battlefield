import { edgeKey, gridFor, notation, parse, SIZE, FILES, type Grid, type GridKind, type Square } from './grid.js';
import { seededRandom, type Random } from './rng.js';

export * from './grid.js';

export type HexTerrain = 'plains' | 'forest' | 'hills' | 'mountains' | 'swamp' | 'desert';
export const HEX_TERRAINS: HexTerrain[] = ['plains', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

export type Feature = 'none' | 'river' | 'lakeside';
export const FEATURES: Feature[] = ['none', 'river', 'lakeside'];

export type SquareTerrain = 'open' | 'forest' | 'swamp' | 'shallows' | 'water' | 'settlement' | 'bridge';

export interface Construction { kind: 'fort'; tier: number; }

export interface BoardSpec {
  base: HexTerrain;
  size?: 9 | 11;
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
export function gridOf(board: Board): Grid { return gridFor(board.grid, board.squares.length); }

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

// Small copses leave open approaches between rough patches.
const DENSITY: Record<HexTerrain, Density> = {
  plains: { forestPatches: [0, 2], swampPatches: [0, 1], waterPatches: [0, 1], ridge: 'none', patchSize: [1, 3] },
  forest: { forestPatches: [9, 12], swampPatches: [0, 2], waterPatches: [0, 1], ridge: 'none', patchSize: [2, 4] },
  hills: { forestPatches: [1, 3], swampPatches: [0, 1], waterPatches: [0, 1], ridge: 'low', patchSize: [1, 3] },
  mountains: { forestPatches: [3, 5], swampPatches: [0, 0], waterPatches: [0, 1], ridge: 'high', patchSize: [2, 4] },
  swamp: { forestPatches: [1, 3], swampPatches: [7, 9], waterPatches: [1, 3], ridge: 'none', patchSize: [2, 4] },
  desert: { forestPatches: [0, 0], swampPatches: [0, 0], waterPatches: [0, 1], ridge: 'low', patchSize: [1, 2] },
};

export const DEPLOY_DEPTH = 3;

export function deployRanks(side: 'attacker' | 'defender', ambush = false, dimension = SIZE): number[] {
  const depth = DEPLOY_DEPTH + (ambush ? 1 : 0);
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
  const SIZE = spec.size ?? 11;
  const squares = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, (): SquareState => ({ terrain: 'open', elevation: 0 })));
  return { spec, grid: spec.grid ?? 'hex', squares, walls: {} };
}

function growPatch(board: Board, rnd: Random, terrain: SquareTerrain, size: number, allowed: (sq: Square) => boolean): void {
  const grid = gridOf(board);
  const patchKeys = new Set<string>();
  const eligible = (sq: Square) => at(board, sq).terrain === 'open' && allowed(sq)
    && grid.neighbours(sq).every(n => patchKeys.has(notation(n)) || !['forest', 'swamp'].includes(at(board, n).terrain));
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

function layRidge(board: Board, rnd: Random, high: boolean): void {
  const SIZE = board.squares.length;
  const grid = gridOf(board);
  const length = between(rnd, [5, 8]);
  const rank = between(rnd, [2, SIZE - 3]);
  const west = grid.cells().filter(c => c.rank === rank).map(c => c.file).sort((a, b) => a - b);
  let sq: Square = { file: west[0] + between(rnd, [0, 1]), rank };
  const ridge: Square[] = [];
  while (ridge.length < length && grid.inBounds(sq)) {
    if (at(board, sq).elevation === 0) ridge.push(sq);
    at(board, sq).elevation = 1;
    const drift = rnd();
    const step: Square = drift < 0.6 ? { file: sq.file + 1, rank: sq.rank }
      : { file: sq.file, rank: Math.min(SIZE - 3, Math.max(2, sq.rank + (drift < 0.8 ? 1 : -1))) };
    sq = step.file === sq.file && step.rank === sq.rank ? { file: sq.file + 1, rank: sq.rank } : step;
  }
  if (high && ridge.length >= 3) {
    const peaks = between(rnd, [1, 2]);
    for (let i = 0; i < peaks; i++) at(board, pick(rnd, ridge.slice(1, -1))).elevation = 2;
  }
}

// A river crosses the attacker's path on the neutral band between the deployment zones. On
// the hexagon a flank file exists on only part of that band, so a cell the shape lacks falls
// back to whichever band rank does hold that file — the river must reach both flanks.
function layRiver(board: Board, rnd: Random): void {
  const SIZE = board.squares.length;
  const grid = gridOf(board);
  const band = Array.from({ length: SIZE - 2 * DEPLOY_DEPTH }, (_, i) => i + DEPLOY_DEPTH);
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
  const shore = wet.flatMap(sq => grid.neighbours(sq)).filter(sq => at(board, sq).terrain === 'open');
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
  const front = walled.filter(sq => sq.rank === SIZE - depth).map(sq => edgeKey(sq, { file: sq.file, rank: sq.rank - 1 }));
  const flanks = walled.flatMap(sq => grid.neighbours(sq)
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

  const notDeploy = (sq: Square) => sq.rank >= DEPLOY_DEPTH && sq.rank < board.squares.length - DEPLOY_DEPTH;
  const anywhere = () => true;
  for (let i = between(rnd, d.forestPatches); i > 0; i--) growPatch(board, rnd, 'forest', between(rnd, d.patchSize), anywhere);
  for (let i = between(rnd, d.swampPatches); i > 0; i--) growPatch(board, rnd, 'swamp', between(rnd, d.patchSize), anywhere);
  for (let i = between(rnd, d.waterPatches); i > 0; i--) growPatch(board, rnd, 'water', between(rnd, [1, 2]), notDeploy);

  return board;
}

export function count(board: Board, terrain: SquareTerrain): number {
  return gridOf(board).cells().filter(sq => at(board, sq).terrain === terrain).length;
}

export function render(board: Board): string {
  const SIZE = board.squares.length;
  const glyph: Record<SquareTerrain, string> = { open: '.', forest: 'T', swamp: '~', shallows: '=', water: 'W', settlement: '#', bridge: 'B' };
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
      row += grid.inBounds({ file, rank }) ? glyph[s.terrain] + (s.elevation > 0 ? String(s.elevation) : ' ') : '  ';
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
