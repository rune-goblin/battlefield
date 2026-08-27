export type GridKind = 'square' | 'hex';

export interface Cell { file: number; rank: number; }
export type Square = Cell;
export interface Point { x: number; y: number; }

export const SIZE = 9;
export const FILES = 'abcdefghi';
export const RADIUS = (SIZE - 1) / 2;

export function notation(c: Cell): string { return `${FILES[c.file]}${c.rank + 1}`; }
export function parse(text: string): Cell { return { file: FILES.indexOf(text[0]), rank: Number(text.slice(1)) - 1 }; }
export function inBounds(c: Cell): boolean { return c.file >= 0 && c.file < SIZE && c.rank >= 0 && c.rank < SIZE; }

/** The hexagon of hexes: rows of 5·6·7·8·9·8·7·6·5, centred on e5. Every cell of it fits the
 * SIZE × SIZE store, so `at()` never sees a hole — the trimmed corners simply go unused. */
export function inHexagon(c: Cell): boolean {
  if (!inBounds(c)) return false;
  return cubeDistance(offsetToCube(c), offsetToCube({ file: RADIUS, rank: RADIUS })) <= RADIUS;
}
export function sameCell(a: Cell, b: Cell): boolean { return a.file === b.file && a.rank === b.rank; }

export function edgeKey(a: Cell, b: Cell): string {
  const [x, y] = [notation(a), notation(b)].sort();
  return `${x}|${y}`;
}

export function allSquares(): Cell[] {
  const out: Cell[] = [];
  for (let rank = 0; rank < SIZE; rank++) for (let file = 0; file < SIZE; file++) out.push({ file, rank });
  return out;
}

// The attacker's home edge is rank 0, the defender's rank SIZE − 1; retreat runs that way.
const homewardStep = (side: 'attacker' | 'defender') => (side === 'attacker' ? -1 : 1);

export interface Cube { q: number; r: number; s: number; }

// Pointy-top odd-r: odd rows sit half a hex to the right. Reignmaker's coordinates.ts is the
// odd-q transpose of this pair (Foundry's default column layout).
export function offsetToCube(c: Cell): Cube {
  const q = c.file - (c.rank - (c.rank & 1)) / 2;
  const r = c.rank;
  return { q, r, s: -q - r };
}

export function cubeToOffset(cube: Cube): Cell {
  return { file: cube.q + (cube.r - (cube.r & 1)) / 2, rank: cube.r };
}

export function cubeDistance(a: Cube, b: Cube): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

function cubeRound(q: number, r: number, s: number): Cube {
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  else rs = -rq - rr;
  return { q: rq, r: rr, s: rs };
}

const CUBE_DIRECTIONS: Cube[] = [
  { q: 1, r: 0, s: -1 }, { q: -1, r: 0, s: 1 },
  { q: 0, r: 1, s: -1 }, { q: 1, r: -1, s: 0 },
  { q: -1, r: 1, s: 0 }, { q: 0, r: -1, s: 1 },
];

const EPSILON = 1e-6;

function sharedEdge(a: Point[], b: Point[]): [Point, Point] {
  const shared = a.filter((p) => b.some((q) => Math.abs(p.x - q.x) < EPSILON && Math.abs(p.y - q.y) < EPSILON));
  return [shared[0], shared[1] ?? shared[0]];
}

abstract class BaseGrid {
  abstract kind: GridKind;
  abstract neighbours(c: Cell): Cell[];
  abstract distance(a: Cell, b: Cell): number;
  abstract vertices(c: Cell, size: number): Point[];
  cells(): Cell[] { return allSquares(); }
  key(c: Cell): string { return notation(c); }
  parse(text: string): Cell { return parse(text); }
  inBounds(c: Cell): boolean { return inBounds(c); }
  edgeKey(a: Cell, b: Cell): string { return edgeKey(a, b); }
  rank(c: Cell): number { return c.rank; }
  homeward(c: Cell, side: 'attacker' | 'defender'): Cell[] {
    const step = homewardStep(side);
    return this.neighbours(c).filter((n) => (n.rank - c.rank) * step > 0);
  }
  edgeSegment(a: Cell, b: Cell, size: number): [Point, Point] {
    return sharedEdge(this.vertices(a, size), this.vertices(b, size));
  }
}

class SquareGrid extends BaseGrid {
  kind = 'square' as const;
  neighbours(c: Cell): Cell[] {
    return [
      { file: c.file + 1, rank: c.rank }, { file: c.file - 1, rank: c.rank },
      { file: c.file, rank: c.rank + 1 }, { file: c.file, rank: c.rank - 1 },
    ].filter((n) => this.inBounds(n));
  }
  distance(a: Cell, b: Cell): number { return Math.abs(a.file - b.file) + Math.abs(a.rank - b.rank); }
  beyond(from: Cell, through: Cell): Cell | null {
    const c = { file: through.file + (through.file - from.file), rank: through.rank + (through.rank - from.rank) };
    return this.inBounds(c) ? c : null;
  }
  center(c: Cell, size: number): Point {
    return { x: size * (c.file + 0.5), y: size * (SIZE - c.rank - 0.5) };
  }
  vertices(c: Cell, size: number): Point[] {
    const { x, y } = this.center(c, size);
    const h = size / 2;
    return [{ x: x - h, y: y - h }, { x: x + h, y: y - h }, { x: x + h, y: y + h }, { x: x - h, y: y + h }];
  }
  fromPoint(p: Point, size: number): Cell | null {
    const c = { file: Math.floor(p.x / size), rank: SIZE - 1 - Math.floor(p.y / size) };
    return this.inBounds(c) ? c : null;
  }
  bounds(size: number) { return { width: size * SIZE, height: size * SIZE }; }
}

// `size` is the cell pitch: the distance between the centres of two neighbours in the same
// row, which is the hex width. Rank 0 sits at the bottom, as the text preview prints it.
const circumradius = (size: number) => size / Math.sqrt(3);

class HexGrid extends BaseGrid {
  kind = 'hex' as const;
  inBounds(c: Cell): boolean { return inHexagon(c); }
  cells(): Cell[] { return allSquares().filter(inHexagon); }
  neighbours(c: Cell): Cell[] {
    const cube = offsetToCube(c);
    return CUBE_DIRECTIONS
      .map((d) => cubeToOffset({ q: cube.q + d.q, r: cube.r + d.r, s: cube.s + d.s }))
      .filter(inHexagon);
  }
  distance(a: Cell, b: Cell): number { return cubeDistance(offsetToCube(a), offsetToCube(b)); }
  beyond(from: Cell, through: Cell): Cell | null {
    const a = offsetToCube(from), b = offsetToCube(through);
    const c = cubeToOffset({ q: 2 * b.q - a.q, r: 2 * b.r - a.r, s: 2 * b.s - a.s });
    return inHexagon(c) ? c : null;
  }
  center(c: Cell, size: number): Point {
    const r = circumradius(size);
    return { x: size * (c.file + 0.5 + 0.5 * (c.rank & 1)), y: this.bounds(size).height - r * (1 + 1.5 * c.rank) };
  }
  vertices(c: Cell, size: number): Point[] {
    const { x, y } = this.center(c, size);
    const r = circumradius(size);
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 180) * (60 * i - 30);
      return { x: x + r * Math.cos(angle), y: y + r * Math.sin(angle) };
    });
  }
  fromPoint(p: Point, size: number): Cell | null {
    const r = circumradius(size);
    const dx = p.x - size * 0.5;
    const dy = this.bounds(size).height - r - p.y;
    const q = (Math.sqrt(3) / 3 * dx - dy / 3) / r;
    const row = (2 / 3 * dy) / r;
    const c = cubeToOffset(cubeRound(q, row, -q - row));
    return inHexagon(c) ? c : null;
  }
  // The widest rank runs file 0 to SIZE − 1 with no indent, so the hexagon spans exactly
  // SIZE cell pitches — half a pitch narrower than the rectangle of hexes it is cut from.
  bounds(size: number) {
    const r = circumradius(size);
    return { width: size * SIZE, height: r * (1.5 * SIZE + 0.5) };
  }
}

export interface Grid {
  kind: GridKind;
  cells(): Cell[];
  key(c: Cell): string;
  parse(text: string): Cell;
  inBounds(c: Cell): boolean;
  neighbours(c: Cell): Cell[];
  distance(a: Cell, b: Cell): number;
  edgeKey(a: Cell, b: Cell): string;
  rank(c: Cell): number;
  homeward(c: Cell, side: 'attacker' | 'defender'): Cell[];
  /** The cell one step past `through`, continuing the same direction — Pace's second square. */
  beyond(from: Cell, through: Cell): Cell | null;
  center(c: Cell, size: number): Point;
  vertices(c: Cell, size: number): Point[];
  fromPoint(p: Point, size: number): Cell | null;
  edgeSegment(a: Cell, b: Cell, size: number): [Point, Point];
  bounds(size: number): { width: number; height: number };
}

export const squareGrid: Grid = new SquareGrid();
export const hexGrid: Grid = new HexGrid();

export const gridFor = (kind: GridKind | undefined): Grid => (kind === 'square' ? squareGrid : hexGrid);
