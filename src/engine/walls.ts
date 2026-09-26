import { at, edgeCells, edgeKey, fortification, gridOf, notation, parse, wallBlocks, type Board, type Cell, type Point } from './board.js';

export interface FortRegion {
  id: string;
  cells: ReadonlySet<string>;
  edges: readonly string[];
}
export interface FortifiedCondition {
  kind: 'fortified';
  label: string;
  tier: number;
  cover: number;
  maxCover: number;
  regions: readonly string[];
}
interface Layout { regions: FortRegion[]; at: Map<string, FortRegion[]> }

// Layouts survive battle-state clones. Gate state, damage and tiers are read live below.
const layouts = new Map<string, Layout>();
const services = new WeakMap<Board, { key: string; service: WallsService }>();
const MAX_LAYOUTS = 32;
const boundary = (board: Board, cell: Cell) => gridOf(board).neighbours(cell).length < (board.grid === 'hex' ? 6 : 4);

function footprint(board: Board): string[] {
  if (board.fortInterior) return board.fortInterior;
  // Older generated maps recorded their courtyard as settlement terrain at the home edge.
  return board.spec.construction ? gridOf(board).cells()
    .filter(c => c.rank >= board.squares.length - 3 && at(board, c).terrain === 'settlement').map(notation) : [];
}

function buildLayout(board: Board, keys: string[], anchored: string[]): Layout {
  const grid = gridOf(board), cells = grid.cells().map(notation);
  const neighbours = new Map(cells.map(id => [id, grid.neighbours(parse(id)).map(notation)]));
  const walls = new Set(keys);
  const unseen = new Set(cells);
  const regions: FortRegion[] = [];
  const boundaryCells = cells.filter(id => boundary(board, parse(id)));
  const add = (inside: Set<string>) => {
    const edges = keys.filter(key => { const [a, b] = edgeCells(key); return inside.has(a) !== inside.has(b); });
    if (!edges.length) return;
    const id = [...inside].sort().join('+');
    if (!regions.some(region => region.id === id)) regions.push({ id, cells: inside, edges });
  };
  while (unseen.size) {
    const queue = [unseen.values().next().value!];
    unseen.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) for (const n of neighbours.get(queue[i])!) {
      if (unseen.has(n) && !walls.has(edgeKey(parse(queue[i]), parse(n)))) { unseen.delete(n); queue.push(n); }
    }
    const component = new Set(queue);
    if (boundaryCells.some(id => component.has(id))) continue;
    // Fill holes so an outer enclosure also contains its inner keep. Partitions remain separate.
    const exterior = new Set(boundaryCells.filter(id => !component.has(id)));
    const flood = [...exterior];
    for (let i = 0; i < flood.length; i++) for (const n of neighbours.get(flood[i])!) {
      if (!component.has(n) && !exterior.has(n)) { exterior.add(n); flood.push(n); }
    }
    add(new Set(cells.filter(id => !exterior.has(id))));
  }
  // A generated fort has an explicit courtyard because its back lies beyond the map.
  if (anchored.length) add(new Set(anchored.filter(id => neighbours.has(id))));
  const byCell = new Map<string, FortRegion[]>();
  for (const region of regions) for (const id of region.cells) {
    const list = byCell.get(id) ?? []; list.push(region); byCell.set(id, list);
  }
  return { regions, at: byCell };
}

/** Intersection uses the same tiny translation as sightCells to resolve corner/edge ties. */
function crosses(source: Point, target: Point, a: Point, b: Point): boolean {
  const p = { x: source.x + 1e-9, y: source.y + 2e-9 };
  const r = { x: target.x - source.x, y: target.y - source.y };
  const s = { x: b.x - a.x, y: b.y - a.y };
  const cross = (u: Point, v: Point) => u.x * v.y - u.y * v.x;
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return false;
  const d = { x: a.x - p.x, y: a.y - p.y };
  const t = cross(d, s) / den, u = cross(d, r) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

/** Shared wall rules for combat, conditions, gate controls and map drawing. */
export class WallsService {
  constructor(private readonly board: Board, private readonly layout: Layout) {}
  get regions(): readonly FortRegion[] { return this.layout.regions; }

  fortifiedAt(cell: Cell): FortifiedCondition | null {
    const regions = this.layout.at.get(notation(cell)) ?? [];
    if (!regions.length) return null;
    const tiers = [...new Set(regions.flatMap(r => r.edges.map(key => fortification(this.board.walls[key].tier).tier)))];
    const tier = Math.min(...tiers), highest = Math.max(...tiers);
    return { kind: 'fortified', label: `Fortified · ${tiers.length > 1 ? 'Mixed walls' : fortification(tier).name}`,
      tier, cover: fortification(tier).cover, maxCover: fortification(highest).cover, regions: regions.map(r => r.id) };
  }

  /** Painted gates keep their chosen facing; other edges infer it from their enclosure. */
  insideOf(key: string): string | null {
    const wall = this.board.walls[key];
    if (!wall) return null;
    const ends = edgeCells(key);
    if (wall.gate?.facing && ends.includes(wall.gate.facing)) return wall.gate.facing;
    const choices = new Set(this.layout.regions.filter(r => r.edges.includes(key))
      .map(r => ends.find(id => r.cells.has(id))!));
    if (choices.size === 1) return [...choices][0];
    return wall.inside ?? ends.sort((a, b) => parse(b).rank - parse(a).rank || parse(b).file - parse(a).file)[0];
  }

  coverBetween(from: Cell, to: Cell): number {
    const grid = gridOf(this.board), fromId = notation(from), toId = notation(to);
    const source = grid.center(from, 1), target = grid.center(to, 1);
    const regions = (this.layout.at.get(toId) ?? []).filter(r => !r.cells.has(fromId));
    const protectedEdges = new Set(regions.flatMap(r => [...r.edges]));
    let cover = 0;
    for (const [key, wall] of Object.entries(this.board.walls)) {
      if (!wallBlocks(wall)) continue;
      // A freestanding wall still protects its adjacent inside hex.
      const enclosing = this.layout.regions.some(r => r.edges.includes(key));
      if (!protectedEdges.has(key) && (enclosing || this.insideOf(key) !== toId)) continue;
      const [a, b] = edgeCells(key).map(parse);
      if (crosses(source, target, ...grid.edgeSegment(a, b, 1))) cover = Math.max(cover, fortification(wall.tier).cover);
    }
    return cover;
  }

  /** A firing position beside an intact wall; a target, when supplied, must be outside it. */
  firingPosition(cell: Cell, target?: Cell): boolean {
    const grid = gridOf(this.board), id = notation(cell);
    return grid.neighbours(cell).some(n => {
      const key = edgeKey(cell, n), wall = this.board.walls[key];
      if (!wall || !wallBlocks(wall) || this.insideOf(key) !== id) return false;
      if (!target) return true;
      if (this.layout.regions.some(r => r.edges.includes(key) && r.cells.has(notation(target)))) return false;
      return crosses(grid.center(cell, 1), grid.center(target, 1), ...grid.edgeSegment(cell, n, 1));
    });
  }
}

export function wallsFor(board: Board): WallsService {
  const keys = Object.keys(board.walls).sort(), anchored = footprint(board);
  const key = `${board.grid}:${board.squares.length}:${keys.join(';')}:${[...anchored].sort().join(',')}`;
  const cached = services.get(board);
  if (cached?.key === key) return cached.service;
  let layout = layouts.get(key);
  if (!layout) {
    layout = buildLayout(board, keys, anchored);
    layouts.set(key, layout);
    if (layouts.size > MAX_LAYOUTS) layouts.delete(layouts.keys().next().value!);
  }
  const service = new WallsService(board, layout);
  services.set(board, { key, service });
  return service;
}
