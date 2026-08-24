import type { Cell, Grid, Point } from '../engine/index.js';

export type Hit =
  | { kind: 'token'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'cell'; id: string };

/** A token's clickable disc, in board-local coordinates. Wave 4's TokenLayer supplies these. */
export interface TokenBounds { id: string; x: number; y: number; radius: number }
export type TokenBoundsProvider = () => readonly TokenBounds[];

/** An edge is live within this fraction of a cell of the segment. No handles. */
export const EDGE_BAND = 0.18;

export interface HitOptions {
  grid: Grid;
  size: number;
  /** Edges only compete when an edge brush is live, or in view mode. */
  edges?: boolean;
  tokens?: TokenBoundsProvider;
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

function tokenAt(point: Point, tokens: TokenBoundsProvider | undefined): string | null {
  if (!tokens) return null;
  let best: { id: string; distance: number } | null = null;
  for (const t of tokens()) {
    const distance = Math.hypot(point.x - t.x, point.y - t.y);
    if (distance <= t.radius && (!best || distance < best.distance)) best = { id: t.id, distance };
  }
  return best?.id ?? null;
}

/** Hit priority: token, then edge (only when `edges` is set), then cell. */
export function hitTest(point: Point, { grid, size, edges, tokens }: HitOptions): Hit | null {
  const token = tokenAt(point, tokens);
  if (token) return { kind: 'token', id: token };

  const cell = grid.fromPoint(point, size);
  if (!cell) return null;

  if (edges) {
    const edge = nearestEdge(point, cell, grid, size);
    if (edge?.inBand) return { kind: 'edge', id: edge.key };
  }
  return { kind: 'cell', id: grid.key(cell) };
}
