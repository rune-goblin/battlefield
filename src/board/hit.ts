import type { Cell, Grid, Point } from '../engine/index.js';

export type Hit =
  | { kind: 'token'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'cell'; id: string };

/** Where a piece stands. A click is answered by the hex it lands in and what that hex holds,
 * never by the art: the miniature is drawn taller than its own cell and overhangs the one
 * behind it, so hit-testing its pixels puts part of every piece out of reach and part of the
 * ground behind it inside a piece. Wave 4's TokenLayer supplies these. */
export interface TokenPlacement { id: string; cell: string }
export type TokenPlacementProvider = () => readonly TokenPlacement[];

/** An edge is live within this fraction of a cell of the segment. No handles. */
export const EDGE_BAND = 0.18;

export interface HitOptions {
  grid: Grid;
  size: number;
  /** Which edges compete for the hit at all. Unset, none do: an edge is only ever a target
   * for the gesture that asked for one — a wall brush, or an armed action that can hit a wall. */
  edges?: (key: string) => boolean;
  tokens?: TokenPlacementProvider;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export interface EdgeCandidate {
  key: string;
  distance: number;
  /** Within `EDGE_BAND × size` of the segment *and* closer to it than to the cell centre. */
  inBand: boolean;
  /** Unit vector along the segment, so a stroke can prefer edges it is travelling down. */
  direction: Point;
}

/** Every shared edge of `cell`, nearest first. */
export function edgeCandidates(point: Point, cell: Cell, grid: Grid, size: number): EdgeCandidate[] {
  const centre = grid.center(cell, size);
  const toCentre = Math.hypot(point.x - centre.x, point.y - centre.y);
  return grid.neighbours(cell)
    .map((n) => {
      const [a, b] = grid.edgeSegment(cell, n, size);
      const distance = segmentDistance(point, a, b);
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return {
        key: grid.edgeKey(cell, n),
        distance,
        inBand: distance <= EDGE_BAND * size && distance < toCentre,
        direction: { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
      };
    })
    .sort((a, b) => a.distance - b.distance);
}

export function nearestEdge(point: Point, cell: Cell, grid: Grid, size: number): EdgeCandidate | null {
  return edgeCandidates(point, cell, grid, size)[0] ?? null;
}

/** Hit priority: token, then edge (only those `edges` admits), then cell. A cell holding both a
 * unit and an engine left on the ground answers with whichever the layer lists first, which is
 * the unit — `setTokens` takes them in that order. */
export function hitTest(point: Point, { grid, size, edges, tokens }: HitOptions): Hit | null {
  const cell = grid.fromPoint(point, size);
  if (!cell) return null;
  const key = grid.key(cell);

  const token = tokens?.().find((t) => t.cell === key);
  if (token) return { kind: 'token', id: token.id };

  if (edges) {
    const edge = nearestEdge(point, cell, grid, size);
    if (edge?.inBand && edges(edge.key)) return { kind: 'edge', id: edge.key };
  }
  return { kind: 'cell', id: key };
}
