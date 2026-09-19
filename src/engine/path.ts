import { at, barrierBetween, gridOf, notation, type Board, type Square, type SquareTerrain } from './board.js';
import { TERRAIN } from './terrain.js';

/** One board cell is ten feet, so every cost below reads as a PF2e distance. */
export const CELL_FEET = 10;

/** What entering a square costs in feet, off section 10's terrain table. A troop moves a square
 * an action, so it pays a forest in two whole actions; a Pace unit pays it in one. */
export const TERRAIN_FEET = Object.fromEntries(
  Object.entries(TERRAIN).map(([terrain, effect]) => [terrain, effect.enter * CELL_FEET]),
) as Record<SquareTerrain, number>;

/** Each level of elevation gained. Two levels apart is a cliff, and `barrierBetween` blocks it. */
export const CLIMB_FEET = CELL_FEET;

export interface MoveOpts {
  climber?: boolean;
  /** Feet of movement to spend. */
  budget: number;
  /** A flier ignores terrain cost and every blocked edge. */
  flying?: boolean;
  /** Sure footing: every hex costs one and a climb nothing. Water and blocked edges still stop it. */
  surefooted?: boolean;
  /** A charge's run: hexes the terrain table bars to a charge, and climbs, are impassable. Sure
   * footing opens them. */
  evenGround?: boolean;
  /** Cells somebody else is standing on. */
  occupied?: ReadonlySet<string>;
  /** These cells can be entered, but the route must end there (enemy zones of control). */
  stopAt?: ReadonlySet<string>;
}

export type StepOpts = Omit<MoveOpts, 'budget' | 'occupied' | 'stopAt'>;

export interface ReachEntry {
  /** Feet spent getting here from the start. */
  feet: number;
  /** The cell this one was reached from; `null` on the start cell. */
  from: string | null;
}

export type ReachMap = Map<string, ReachEntry>;

/**
 * Feet to step from one neighbouring cell to the next, or `Infinity` when the step is blocked.
 * Walls and cliffs sit on edges, so a breached wall is a crossing with no cost of its own.
 */
export function stepFeet(board: Board, from: Square, to: Square, opts: StepOpts = {}): number {
  if (!gridOf(board).inBounds(to)) return Infinity;
  const ground = TERRAIN_FEET[at(board, to).terrain];
  const climb = Math.max(0, at(board, to).elevation - at(board, from).elevation);
  // Even ground is a question about the ground, not about the price, so it is asked ahead of
  // flight: a flier pays 1 a hex over forest and has still crossed forest.
  if (opts.evenGround && !opts.surefooted && (!TERRAIN[at(board, to).terrain].charge || climb > 0 || !!board.siegeFields?.some(f => f.cells.includes(notation(to))))) return Infinity;
  if (opts.flying) return CELL_FEET;
  const barrier = barrierBetween(board, from, to);
  const web = opts.climber && board.siegeFields?.some(f => f.kind === 'web' && f.cells.includes(notation(from)) && f.cells.includes(notation(to)));
  if (barrier && !(barrier.kind === 'wall' && web)) return Infinity;
  // Water is the one ground Sure footing cannot flatten: it blocks where forest merely costs.
  if (opts.surefooted) return Number.isFinite(ground) ? CELL_FEET : Infinity;
  const field = board.siegeFields?.some(f => f.cells.includes(notation(to)));
  // Costs never add: the step pays the worst of its ground, a siege field, and its climb.
  return Math.max(ground, field ? 2 * CELL_FEET : 0, climb ? CELL_FEET + climb * CLIMB_FEET : 0);
}

/**
 * Every cell reachable on `budget` feet, keyed by cell, with the cell it was reached from.
 * The start cell is present at zero feet.
 */
export function reachable(board: Board, start: Square, opts: MoveOpts): ReachMap {
  const g = gridOf(board);
  const step: StepOpts = { climber: opts.climber, flying: opts.flying, surefooted: opts.surefooted, evenGround: opts.evenGround };
  const occupied = opts.occupied ?? new Set<string>();
  const startKey = notation(start);
  const reach: ReachMap = new Map([[startKey, { feet: 0, from: null }]]);
  // proto: sorting the whole frontier each pass is Reignmaker's shape and stays legible; 64
  // cells never make a heap worth it.
  const frontier: { cell: Square; feet: number }[] = [{ cell: start, feet: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.feet - b.feet);
    const cur = frontier.shift()!;
    if (cur.feet > (reach.get(notation(cur.cell))?.feet ?? Infinity)) continue;
    if (notation(cur.cell) !== startKey && opts.stopAt?.has(notation(cur.cell))) continue;
    for (const n of g.neighbours(cur.cell)) {
      const key = notation(n);
      if (occupied.has(key)) continue;
      const feet = cur.feet + stepFeet(board, cur.cell, n, step);
      if (!Number.isFinite(feet) || feet > opts.budget) continue;
      if (feet >= (reach.get(key)?.feet ?? Infinity)) continue;
      reach.set(key, { feet, from: notation(cur.cell) });
      frontier.push({ cell: n, feet });
    }
  }
  return reach;
}

/** The cheapest route to `to`, start cell first. Empty when `to` was never reached. */
export function pathTo(reach: ReachMap, to: string): string[] {
  if (!reach.has(to)) return [];
  const out: string[] = [];
  for (let key: string | null = to; key !== null; key = reach.get(key)!.from) out.unshift(key);
  return out;
}

export const feetTo = (reach: ReachMap, to: string): number => reach.get(to)?.feet ?? Infinity;
