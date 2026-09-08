import { at, barrierBetween, gridOf, notation, type Board, type Square, type SquareTerrain } from './board.js';

/** One board cell is ten feet, so every cost below reads as a PF2e distance. */
export const CELL_FEET = 10;

/** What entering a square costs: a square's worth of ground, two on difficult terrain and
 * three on very difficult. A troop moves a square an action, so it pays those in whole
 * actions; a Pace unit covers two squares' worth, so difficult ground costs it one. */
export const TERRAIN_FEET: Record<SquareTerrain, number> = {
  open: CELL_FEET,
  // A settlement is a road, so it is never worse than open ground.
  settlement: CELL_FEET,
  forest: 2 * CELL_FEET,
  shallows: 2 * CELL_FEET,
  swamp: 3 * CELL_FEET,
  water: Infinity,
};

/** Each level of elevation gained. Two levels apart is a cliff, and `barrierBetween` blocks it. */
export const CLIMB_FEET = CELL_FEET;

export interface MoveOpts {
  /** Feet of movement to spend. */
  budget: number;
  /** A flier ignores terrain cost and every blocked edge. */
  flying?: boolean;
  /** Sure footing: every hex costs one and a climb nothing. Water and blocked edges still stop it. */
  surefooted?: boolean;
  /** Rough ground and climbs are impassable rather than dear, which answers the charge's own
   * question: is there any route in that touched neither? */
  evenGround?: boolean;
  /** Cells somebody else is standing on. */
  occupied?: ReadonlySet<string>;
}

export type StepOpts = Omit<MoveOpts, 'budget' | 'occupied'>;

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
  if (opts.evenGround && ((Number.isFinite(ground) && ground > CELL_FEET) || climb > 0)) return Infinity;
  if (opts.flying) return CELL_FEET;
  if (barrierBetween(board, from, to) !== null) return Infinity;
  // Water is the one ground Sure footing cannot flatten: it blocks where forest merely costs.
  if (opts.surefooted) return Number.isFinite(ground) ? CELL_FEET : Infinity;
  return ground + climb * CLIMB_FEET;
}

/**
 * Every cell reachable on `budget` feet, keyed by cell, with the cell it was reached from.
 * The start cell is present at zero feet.
 */
export function reachable(board: Board, start: Square, opts: MoveOpts): ReachMap {
  const g = gridOf(board);
  const step: StepOpts = { flying: opts.flying, surefooted: opts.surefooted, evenGround: opts.evenGround };
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
