import type { Cell, Grid, Point } from '../engine/grid.js';

export interface TerrainRegion { outline: Point[]; holes: Point[][] }
interface BoundaryEdge { a: Point; b: Point }
const key = (p: Point) => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
export const polygonArea = (points: Point[]): number => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - q.x * p.y;
}, 0) / 2;

/** `cells` split into edge-connected patches — one wood, one lake, one town apiece. */
export function connectedCells(grid: Grid, cells: Cell[]): Cell[][] {
  const remaining = new Map(cells.map(c => [grid.key(c), c]));
  const patches: Cell[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(grid.key(first));
    const patch = [first];
    for (let i = 0; i < patch.length; i++) {
      for (const n of grid.neighbours(patch[i])) {
        if (remaining.delete(grid.key(n))) patch.push(n);
      }
    }
    patches.push(patch);
  }
  return patches;
}

/** Cancel shared edges, then walk the remaining boundaries. Interior hex edges never enter
 * the mask geometry. Each connected region retains its holes and a common board origin. */
export function terrainRegions(grid: Grid, cells: Cell[], size: number): TerrainRegion[] {
  const regions: TerrainRegion[] = [];
  for (const component of connectedCells(grid, cells)) {
    const edges = new Map<string, BoundaryEdge>();
    for (const cell of component) {
      const vertices = grid.vertices(cell, size);
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const reverse = `${key(b)}|${key(a)}`;
        if (!edges.delete(reverse)) edges.set(`${key(a)}|${key(b)}`, { a, b });
      }
    }
    const outgoing = new Map<string, BoundaryEdge[]>();
    for (const edge of edges.values()) {
      const list = outgoing.get(key(edge.a)) ?? [];
      list.push(edge);
      outgoing.set(key(edge.a), list);
    }
    const loops: Point[][] = [];
    while (outgoing.size) {
      const start = outgoing.values().next().value![0].a;
      const loop: Point[] = [];
      let cursor = start;
      do {
        loop.push(cursor);
        const list = outgoing.get(key(cursor))!;
        const edge = list.pop()!;
        if (!list.length) outgoing.delete(key(cursor));
        cursor = edge.b;
      } while (key(cursor) !== key(start));
      loops.push(loop);
    }
    const outlines = loops.filter(loop => polygonArea(loop) > 0);
    const holes = loops.filter(loop => polygonArea(loop) < 0);
    for (const outline of outlines) regions.push({ outline, holes: holes.filter(hole => contains(outline, hole[0])) });
  }
  return regions;
}

function contains(polygon: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
