import type { Point } from '../engine/index.js';

export const GATE_HALF_OPENING = .24;
export interface GateLeaf { hinge: Point; tip: Point }

/** Double doors meet on the wall when shut and swing 90 degrees away from the interior when open. */
export function gateLeaves(a: Point, b: Point, interior: Point, open: boolean): GateLeaf[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const half = span * GATE_HALF_OPENING;
  const sign = (interior.x - mid.x) * -dy + (interior.y - mid.y) * dx >= 0 ? 1 : -1;
  const outward = { x: dy / span * sign, y: -dx / span * sign };
  return [-1, 1].map(side => {
    const hinge = { x: mid.x + dx / span * half * side, y: mid.y + dy / span * half * side };
    return { hinge, tip: open ? { x: hinge.x + outward.x * half, y: hinge.y + outward.y * half } : { ...mid } };
  });
}

/** Handles follow the interior face of each leaf as it swings outward. */
export function gateHandles(a: Point, b: Point, interior: Point, open: boolean, offset: number): { anchor: Point; center: Point }[] {
  return gateLeaves(a, b, interior, open).map(({ hinge, tip }) => {
    const dx = tip.x - hinge.x, dy = tip.y - hinge.y;
    const length = Math.hypot(dx, dy) || 1;
    const anchor = { x: hinge.x + dx * .72, y: hinge.y + dy * .72 };
    const sign = (interior.x - anchor.x) * -dy + (interior.y - anchor.y) * dx >= 0 ? 1 : -1;
    return { anchor, center: { x: anchor.x - dy / length * sign * offset, y: anchor.y + dx / length * sign * offset } };
  });
}
