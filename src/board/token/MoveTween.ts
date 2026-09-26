import type { Grid, Point } from '../../engine/index.js';
import { easeInOut, easeOutCubic } from '../easing.js';

const MOVE_TWEEN_MS = 200;
// A routed walk holds a steady pace per cell rather than stretching one tween over the whole
// distance, so a six-cell move reads as six steps; the cap keeps a long charge watchable.
const WALK_STEP_MS = 150;
const WALK_MAX_MS = 900;

interface Tween {
  points: Point[];
  /** Length of each leg, so a multi-leg walk holds one pace instead of speeding up on the
   * long legs and crawling on the short ones. */
  spans: number[];
  length: number;
  start: number;
  duration: number;
  walk: boolean;
}

function tweenOf(points: Point[], duration: number, walk: boolean): Tween {
  const spans: number[] = [];
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const span = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    spans.push(span);
    length += span;
  }
  return { points, spans, length, start: performance.now(), duration, walk };
}

function along(points: Point[], spans: number[], distance: number): Point {
  let left = distance;
  for (let i = 0; i < spans.length; i += 1) {
    if (left > spans[i] && i < spans.length - 1) {
      left -= spans[i];
      continue;
    }
    const t = spans[i] > 0 ? Math.min(1, left / spans[i]) : 1;
    const a = points[i];
    const b = points[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return points[points.length - 1];
}

const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/** A piece's travel between cells: a short slide for a plain move, a paced walk along a queued
 * route. The piece asks it where to stand and sets its own position. */
export class MoveTween {
  // A battle move tweens from wherever the token is actually sitting (which may itself be
  // mid-tween from the previous move) to the new cell's centre. `lastCell` is null until the
  // first `place()`, so mounting never tweens in from the origin.
  private lastCell: string | null = null;
  private tween: Tween | null = null;
  private route: string[] | null = null;

  get moving(): boolean { return this.tween !== null; }

  /** The route this piece's next move follows, its own cell first. Spent by that move — see
   * `takeRoute`. */
  setRoute(cells: readonly string[]): void {
    this.route = cells.length > 1 ? [...cells] : null;
  }

  /** Starts whatever travel brings a piece standing at `from` to `cell`. Returns the point to
   * snap to when nothing travels, and null while a tween carries it. */
  place(from: Point, cell: string, grid: Grid, size: number): Point | null {
    const target = grid.center(grid.parse(cell), size);
    const walk = this.takeRoute(from, cell, grid, size);
    let snap: Point | null = null;
    if (walk) {
      this.tween = tweenOf(walk, Math.min(WALK_MAX_MS, WALK_STEP_MS * (walk.length - 1)), true);
    } else if (this.tween && same(this.tween.points[this.tween.points.length - 1], target)) {
      // A redraw that does not move the piece (a prop, a ring, the log) must not cut a tween
      // already running to this same cell short.
    } else if (this.lastCell !== null && this.lastCell !== cell) {
      this.tween = tweenOf([from, target], MOVE_TWEEN_MS, false);
    } else {
      snap = target;
      this.tween = null;
    }
    this.lastCell = cell;
    return snap;
  }

  /** Where the running tween stands this frame, or null when none runs. */
  step(): Point | null {
    if (!this.tween) return null;
    const { points, spans, length, start, duration, walk } = this.tween;
    const t = Math.min(1, (performance.now() - start) / duration);
    const eased = walk ? easeInOut(t) : easeOutCubic(t);
    const point = along(points, spans, eased * length);
    if (t >= 1) this.tween = null;
    return point;
  }

  /** The waypoints of the queued route, from where the piece actually stands to `cell`, or
   * null when no route explains this move. The route is spent either way: it describes one
   * move, and a second move must not replay it. A route is trimmed at `cell` rather than
   * required to end there, so a push that fails and stops at its fallback still walks the
   * part of the route it covered. */
  private takeRoute(from: Point, cell: string, grid: Grid, size: number): Point[] | null {
    const route = this.route;
    // A redraw that does not move the piece leaves the route queued: it is spent by the move
    // it describes, not by whatever else happens to redraw first.
    if (!route || cell === this.lastCell) return null;
    this.route = null;
    if (route[0] !== this.lastCell) return null;
    const end = route.indexOf(cell);
    if (end < 1) return null;
    return [from, ...route.slice(1, end + 1).map((k) => grid.center(grid.parse(k), size))];
  }
}
