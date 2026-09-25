import type { Point } from '../engine/grid.js';
import type { Tree, Verb } from '../engine/index.js';

export interface TargetArrow {
  from: string;
  to: string;
  toCells?: string[];
  tone?: Tree | Verb;
  /** Gray: the pointer is on something the action cannot reach. */
  muted?: boolean;
}

/** Project a hex centre, an edge midpoint or a shared corner through the same board transform. */
export function targetAnchor(cells: readonly string[], screenOf: (cell: string) => Point | null): Point | null {
  const points = cells.map(screenOf);
  if (!points.length || points.some((point) => !point)) return null;
  return {
    x: points.reduce((sum, p) => sum + p!.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p!.y, 0) / points.length,
  };
}
