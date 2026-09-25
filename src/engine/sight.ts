import { wallsFor } from './walls.js';
import { at, gridOf, notation, sameCell, type Board, type Cell, type Grid } from './board.js';
import { blocksSight, FOREST_BLOCKS_AT, TERRAIN } from './terrain.js';

// Cache geometry only: painting and battle mutations must read current terrain each time.
const rays = new WeakMap<Grid, Map<string, Cell[]>>();

/** A centre-to-centre line lands exactly on a shared edge or a corner for whole families of
 * hex pairs — every line straight up the board, for one — and there the clip below has no
 * answer: the segment is on the boundary of both hexes meeting there. Red Blob's remedy for
 * the same degeneracy in `cube_linedraw`: shift the whole segment by a hair, so it falls on
 * one definite side. Translating both ends together keeps the reading reciprocal.
 *
 * The three tolerances have to stay ordered. `PARALLEL` only has to clear float noise in the
 * cross products (~1e-16). `NUDGE` sits well above it, so a segment displaced off a shared
 * edge reads as outside the hex it left. `CROSSES` sits well above the sliver that same
 * displacement cuts off a corner, so a corner touch still screens nothing. */
const PARALLEL = 1e-12;
const NUDGE = 1e-9;
const CROSSES = 1e-6;

/** Every hex crossed by the centre-to-centre sight line. A line along an edge reads the one
 * hex the nudge puts it inside; touching a corner alone screens nothing. Reciprocal. */
export function sightCells(board: Board, from: Cell, to: Cell): Cell[] {
  const grid = gridOf(board);
  let cache = rays.get(grid);
  if (!cache) { cache = new Map(); rays.set(grid, cache); }
  const key = [notation(from), notation(to)].sort().join('|');
  const saved = cache.get(key);
  if (saved) return saved;
  const start = grid.center(from, 1), end = grid.center(to, 1);
  const a = { x: start.x + NUDGE, y: start.y + 2 * NUDGE };
  const b = { x: end.x + NUDGE, y: end.y + 2 * NUDGE };
  const crossed = grid.cells().filter(cell => {
    if (sameCell(cell, from) || sameCell(cell, to)) return false;
    const vertices = grid.vertices(cell, 1);
    let low = 0, high = 1;
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i], q = vertices[(i + 1) % vertices.length];
      const dx = q.x - p.x, dy = q.y - p.y;
      const start = dx * (a.y - p.y) - dy * (a.x - p.x);
      const delta = dx * (b.y - a.y) - dy * (b.x - a.x);
      if (Math.abs(delta) < PARALLEL) { if (start < 0) return false; }
      else if (delta > 0) low = Math.max(low, -start / delta);
      else high = Math.min(high, -start / delta);
    }
    return high - low > CROSSES;
  });
  cache.set(key, crossed);
  return crossed;
}

export const isMountain = (board: Board, cell: Cell): boolean => at(board, cell).elevation >= 2;

/** What blinds the line from `from` to `to`, in words, or null when the line is clear. */
export function sightBlock(board: Board, from: Cell, to: Cell): string | null {
  const a = at(board, from).elevation, b = at(board, to).elevation, cells = sightCells(board, from, to);
  const high = cells.find(cell => blocksSight(at(board, cell).elevation, a, b));
  if (high) return `${isMountain(board, high) ? 'A mountain' : 'High ground'} at ${notation(high)} blocks sight.`;
  const forests = cells.filter(cell => at(board, cell).terrain === 'forest');
  if (forests.length >= FOREST_BLOCKS_AT) return `Too much forest in the way: ${forests.map(notation).join(', ')}.`;
  return null;
}

export const hasSight = (board: Board, from: Cell, to: Cell): boolean => !sightBlock(board, from, to);

export const coverBetween = (board: Board, from: Cell, to: Cell): number =>
  TERRAIN[at(board, to).terrain].cover || sightCells(board, from, to).some(cell => TERRAIN[at(board, cell).terrain].cover) ? 1 : 0;

/** The walls service handles both enclosed courtyards and freestanding segments. */
export const wallCoverBetween = (board: Board, from: Cell, to: Cell): number => wallsFor(board).coverBetween(from, to);
