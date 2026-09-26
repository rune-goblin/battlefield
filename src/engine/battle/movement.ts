import { unitAbilities, holdsGround, refreshAbilityAuras } from '../ability-effects.js';
import { at, barrierBetween, deployRanks, notation, parse, type Board, type Square } from '../board.js';
import { CELL_FEET, reachableVia, routedPath, stepFeet, type Routed, type StepOpts } from '../path.js';
import type { BattleState, EscapeOffer, MoveReach, PathStep, Unit } from '../types.js';
import {
  homeRank, grid, dist, isRouted, unitAt, engagedEnemies, log, clearAsShooter, escapeModifier,
} from './state.js';
import { enginesOf, engineSpeed } from './emplacements.js';

export const movementSpeed = (u: Unit): number => {
  const hauled = u.engines.filter(e => e.hauling && e.status === 'crewed');
  return Math.min(u.speed, ...(hauled.length && u.movementRates ? [u.movementRates.land] : []),
    ...hauled.map(e => engineSpeed(e) ?? u.speed));
};

// Hold Ground is asked last, so a push with nowhere to go does not spend it.
export function forcedStep(state: BattleState, from: Square, target: Unit, direction: 'push' | 'pull') {
  if (target.rooted > 0 || target.guard?.holds || target.engines.some(e => e.hauling)) return;
  const distance = dist(state, from, target.square);
  const to = grid(state).neighbours(target.square).find(cell =>
    (direction === 'pull' ? dist(state, from, cell) < distance : dist(state, from, cell) > distance)
    && enterable(state, target.square, cell, groundFor(target)) && canEndOn(target, state.board, cell));
  if (to && !holdsGround(state, target)) moveTo(state, target, to);
}

/** Source movement modes share a budget; each step chooses the cheapest legal mode.
 * Temporary Fly uses the unit's current Speed, and hauling restricts movement to land. */
export const groundFor = (u: Unit): StepOpts => {
  const hauling = u.engines.some(e => e.hauling && e.status === 'crewed');
  const rates = u.movementRates && !hauling ? { ...u.movementRates,
    fly: u.flies ? Math.max(u.speed, u.movementRates.fly) : u.flying ? u.movementRates.fly || u.speed : 0 } : undefined;
  return { climber: u.role === 'infantry' && !hauling, flying: !hauling && (u.flying || u.flies),
    rates, terrainPassage: unitAbilities(u).filter(a => a.kind === 'terrain-passage').flatMap(a => a.terrain ?? []), surefooted: u.sureFooting };
};

export const nativeWaterMovement = (u: Unit): boolean => u.flying || (u.movementRates?.swim ?? 0) > 0;

/** Whether `u` could stand on `sq` unassisted: section 7 gives a native flier free run of
 * anywhere, but Fly only "crosses" water (section 11) — it never says a unit ends its move
 * there, and `finish` strips the buff, so a unit that ends its Move or Translocate on water
 * with only an unspent Fly would be grounded in a river with no way out. */
export const canEndOn = (u: Unit, board: Board, sq: Square) =>
  at(board, sq).terrain !== 'water' || (nativeWaterMovement(u) && !u.engines.some(e => e.hauling && e.status === 'crewed'));

export const enterable = (state: BattleState, from: Square, to: Square, opts: StepOpts) =>
  !unitAt(state, to) && Number.isFinite(stepFeet(state.board, from, to, opts));

export const occupiedBy = (state: BattleState, u: Unit) =>
  new Set(state.units.filter((o) => o.status === 'active' && o.id !== u.id).map((o) => notation(o.square)));

/** Entering an enemy's adjacent, unblocked hex ends ordinary movement, even one that stays
 * beside the enemy it started against. */
export function controlCells(state: BattleState, u: Unit, cleared: ReadonlySet<string> = new Set()): Set<string> {
  const cells = new Set<string>();
  for (const enemy of state.units) {
    if (enemy.side === u.side || enemy.status !== 'active' || cleared.has(enemy.id)) continue;
    for (const cell of grid(state).neighbours(enemy.square)) {
      if (barrierBetween(state.board, cell, enemy.square) === null) cells.add(notation(cell));
    }
  }
  return cells;
}

/** Feet the unit may still spend: what earlier Move actions banked, plus what the rest buy. */
export const movementBudget = (u: Unit) => Math.max(0, u.feet + u.actions * movementSpeed(u));

// Movement pools across the activation rather than being lost at the end of each Stride, so a
// swamp cell at 30 ft stays enterable by a 25 ft troop over two actions.
export const moveActionsFor = (u: Unit, feet: number) =>
  feet <= u.feet ? 0 : Math.ceil((feet - u.feet) / movementSpeed(u));

// Shared by moveReach and movePath: the one Stride ever asks the same question, "how far does
// this budget carry, and through what". Where it may end is a separate question, asked after.
export const strideReach = (state: BattleState, u: Unit, via: readonly string[] = []): Routed | null =>
  reachableVia(state.board, u.square, via, { budget: movementBudget(u), ...groundFor(u), occupied: occupiedBy(state, u), stopAt: controlCells(state, u) });

/** A unit in contact or pinned may still Stride; it rolls to get away first. */
const canStride = (u: Unit): boolean =>
  movementSpeed(u) !== 0 && u.rooted <= 0 && u.actions > 0 && u.status === 'active';

/** Every cell the unit can still Stride to, through `via` in order, what it costs in feet, and in Move actions. */
export function moveReach(state: BattleState, u: Unit, via: readonly string[] = []): Map<string, MoveReach> {
  const out = new Map<string, MoveReach>();
  const routed = canStride(u) ? strideReach(state, u, via) : null;
  if (!routed) return out;
  const home = notation(u.square);
  const spent = routed.route[routed.route.length - 1].feet;
  for (const [key, entry] of routed.reach) {
    if (key === home || !canEndOn(u, state.board, parse(key))) continue;
    const feet = spent + entry.feet;
    out.set(key, { feet, actions: moveActionsFor(u, feet) });
  }
  return out;
}

/** The route to `to`, the unit's own cell first, with the cost of each step — including a hex
 * a flier only crosses. `moveReach`'s map holds destinations, not the road between them, so a
 * cheapest route that runs through a hex the unit may not stop on would otherwise break the
 * walk back; this asks `reachable` directly instead of the destinations that were filtered
 * from it. Empty when `to` is not itself a legal destination. */
export function movePath(state: BattleState, u: Unit, to: string, via: readonly string[] = []): PathStep[] {
  if (!canStride(u) || to === notation(u.square) || !canEndOn(u, state.board, parse(to))) return [];
  const routed = strideReach(state, u, via);
  return routed ? routedPath(routed, to).map(({ cell, feet }) => ({ cell, feet, actions: moveActionsFor(u, feet) })) : [];
}

/** Contact from a hex the unit has yet to reach: a charge's landing hex, a pursuer's. Reads the
 * edge the way `isEngaged` does, so neither one comes to grips over a wall or a cliff. */
export const touching = (state: BattleState, sq: Square, e: Unit) =>
  dist(state, sq, e.square) === 1 && barrierBetween(state.board, sq, e.square) === null;

/** Hexes one Step reaches: adjacent, empty, open to land movement at the plain cost, and
 * homeward for a routed unit. A pinned or rooted unit cannot Step. */
export function stepTargets(state: BattleState, u: Unit): string[] {
  if (u.status !== 'active' || u.actions < 1 || u.rooted > 0 || u.pinnedBy || movementSpeed(u) === 0) return [];
  const g = grid(state);
  const land: StepOpts = { climber: groundFor(u).climber, surefooted: u.sureFooting };
  return (isRouted(u) ? g.homeward(u.square, u.side) : g.neighbours(u.square))
    .filter((n) => !unitAt(state, n) && stepFeet(state.board, u.square, n, land) <= CELL_FEET && canEndOn(u, state.board, n))
    .map(notation).sort();
}

/** What a shot off this unit rolls: a crewed artillery piece stands in for a Volley the crew
 * may not have, loaded or not — a pinning crew holds its target with the shot it already made. */
const volleyOf = (state: BattleState, u: Unit) => {
  const e = enginesOf(state, u).find((x) => x.status === 'crewed' && x.kind === 'artillery');
  return e ? e.launch : (u.stats.volley ?? 0);
};

/** A holder's Battle DC, or its Salvo DC when it pins: Strike and Volley are stored as those less ten. */
export const escapeDcFor = (state: BattleState, holder: Unit, target: Unit) =>
  (holder.id === target.pinnedBy ? volleyOf(state, holder) : (holder.stats.strike ?? 0)) + 10;

/** Enemies that can actually hold a unit: one with no melee strike cannot, but an active
 * pinning shooter holds it at range regardless. */
export const holdersOf = (state: BattleState, u: Unit): Unit[] => {
  const engaged = engagedEnemies(state, u).filter((e) => e.stats.strike !== null);
  const pinner = u.pinnedBy ? state.units.find((e) => e.id === u.pinnedBy && e.status === 'active') : undefined;
  return pinner && !engaged.some((e) => e.id === pinner.id) ? [...engaged, pinner] : engaged;
};

export function moveTo(state: BattleState, u: Unit, to: Square, carry = true) {
  u.square = to;
  refreshAbilityAuras(state);
  for (const e of [...u.engines]) {
    if (e.status !== 'crewed') continue;
    if (carry && e.hauling && engineSpeed(e) !== 0) e.square = to;
    else {
      u.engines = u.engines.filter(x => x.id !== e.id);
      e.emplaced = true;
      e.hauling = false;
      state.engines.push(e);
    }
  }
}

function leaveField(state: BattleState, u: Unit) {
  u.status = 'left';
  refreshAbilityAuras(state);
  clearAsShooter(state, u.id);
  log(state, u, `${u.name} leaves the field.`);
}

/** Every outer edge cell belonging to this troop's original deployment zone. */
export function isFleeEdge(state: BattleState, u: Unit, cell: string): boolean {
  const g = grid(state), sq = parse(cell);
  return g.inBounds(sq) && deployRanks(u.side, u.tactics.includes('ambush'), g.dimension).includes(sq.rank)
    && g.neighbours(sq).length < (g.kind === 'hex' ? 6 : 4);
}

/** A hex a unit may be set down in: empty, and ground it could stand on — water holds nobody
 * but a native flier. */
export const standable = (state: BattleState, u: Unit, sq: Square) =>
  !unitAt(state, sq) && canEndOn(u, state.board, sq);

/** After a unit changes hex: the pin ends, and a routed unit that reached its own edge leaves. */
export function departed(state: BattleState, u: Unit) {
  if (u.pinnedBy) {
    const pinner = state.units.find((e) => e.id === u.pinnedBy);
    u.pinnedBy = null;
    log(state, u, `${u.name} is out from under ${pinner ? `${pinner.name}'s` : 'the'} pin.`);
  }
  if (isRouted(u) && u.square.rank === homeRank(u.side, state.board.squares.length)) leaveField(state, u);
}

/** The roll a Move out of a zone of control makes. `null` when nothing holds the unit. */
export function escapeOffer(state: BattleState, u: Unit): EscapeOffer | null {
  const holders = holdersOf(state, u);
  if (!holders.length) return null;
  return {
    modifier: escapeModifier(u),
    dc: Math.max(...holders.map((h) => escapeDcFor(state, h, u))),
    holders: holders.map((h) => ({
      unit: h.id, name: h.name, dc: escapeDcFor(state, h, u),
      pinning: h.id === u.pinnedBy,
    })),
  };
}
