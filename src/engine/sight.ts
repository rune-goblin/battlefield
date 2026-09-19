import { at, gridOf, notation, parse, sameCell, fortification, wallBlocks, type Board, type Cell, type Grid } from './board.js';
import { blocksSight, FOREST_BLOCKS_AT, TERRAIN } from './terrain.js';

// Cache geometry only: painting and battle mutations must read current terrain each time.
const rays = new WeakMap<Grid, Map<string, Cell[]>>();

/** Every hex crossed by the centre-to-centre sight line. A line along an edge reads both
 * hexes; touching a corner alone does not screen the shot. This rule is reciprocal. */
export function sightCells(board: Board, from: Cell, to: Cell): Cell[] {
  const grid = gridOf(board);
  let cache = rays.get(grid);
  if (!cache) { cache = new Map(); rays.set(grid, cache); }
  const key = [notation(from), notation(to)].sort().join('|');
  const saved = cache.get(key);
  if (saved) return saved;
  const a = grid.center(from, 1), b = grid.center(to, 1);
  const crossed = grid.cells().filter(cell => {
    if (sameCell(cell, from) || sameCell(cell, to)) return false;
    const vertices = grid.vertices(cell, 1);
    let low = 0, high = 1;
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i], q = vertices[(i + 1) % vertices.length];
      const dx = q.x - p.x, dy = q.y - p.y;
      const start = dx * (a.y - p.y) - dy * (a.x - p.x);
      const delta = dx * (b.y - a.y) - dy * (b.x - a.x);
      if (Math.abs(delta) < 1e-9) { if (start < -1e-9) return false; }
      else if (delta > 0) low = Math.max(low, -start / delta);
      else high = Math.min(high, -start / delta);
    }
    return high - low > 1e-8;
  });
  cache.set(key, crossed);
  return crossed;
}

export const isMountain = (board: Board, cell: Cell): boolean => at(board, cell).elevation >= 2;

const forestsAlong = (board: Board, from: Cell, to: Cell): number =>
  sightCells(board, from, to).filter(cell => at(board, cell).terrain === 'forest').length;

export function hasSight(board: Board, from: Cell, to: Cell): boolean {
  const a = at(board, from).elevation, b = at(board, to).elevation;
  return !sightCells(board, from, to).some(cell => blocksSight(at(board, cell).elevation, a, b))
    && forestsAlong(board, from, to) < FOREST_BLOCKS_AT;
}

export const coverBetween = (board: Board, from: Cell, to: Cell): number =>
  TERRAIN[at(board, to).terrain].cover || sightCells(board, from, to).some(cell => TERRAIN[at(board, cell).terrain].cover) ? 1 : 0;

/** A wall shelters its interior hex only against fire from outside that segment. */
export function wallCoverBetween(board: Board, from: Cell, to: Cell): number {
  const g = gridOf(board), source = g.center(from, 1), target = g.center(to, 1);
  let cover = 0;
  for (const [key, wall] of Object.entries(board.walls)) {
    if (!wallBlocks(wall) || !key.split('|').includes(notation(to))) continue;
    const inside = wall.inside ?? key.split('|').sort((a, b) => parse(b).rank - parse(a).rank)[0];
    if (inside !== notation(to)) continue;
    const outside = g.center(parse(key.split('|').find(id => id !== inside)!), 1);
    const dx = outside.x - target.x, dy = outside.y - target.y;
    if ((source.x - (outside.x + target.x) / 2) * dx + (source.y - (outside.y + target.y) / 2) * dy > 0)
      cover = Math.max(cover, fortification(wall.tier).cover);
  }
  return cover;
}
