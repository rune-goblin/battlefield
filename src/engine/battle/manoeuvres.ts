import { abilityMemory, unitAbilities, resolveBonus } from '../ability-effects.js';
import { at, barrierBetween, notation, parse, type Square } from '../board.js';
import { reachable, reachableVia, routedPath, type ReachMap, type Routed } from '../path.js';
import { readCheck, rollLine, succeeded } from '../check.js';
import { activityOf, type ActivityIndex } from '../ladders.js';
import type { Rng } from '../rng.js';
import {
  ACTION_BONUS, BANDS, ROUTED_AT, type BattleState, type ChargeAction, type ChargeOption, type MoveAction,
  type StepAction, type MeleePlan, type FleeAction, type FleePlan, type Unit,
} from '../types.js';
import {
  grid, dist, unit, isRouted, unitAt, elevation, engagedEnemies, roll, willModifier, routDcFor, log,
  clearAsShooter, escapeModifier, validateFocus,
} from './state.js';
import { abandonEngines } from './emplacements.js';
import {
  movementSpeed, groundFor, canEndOn, occupiedBy, controlCells, moveActionsFor, strideReach, moveReach,
  movePath, touching, stepTargets, escapeDcFor, holdersOf, moveTo, isFleeEdge, departed,
} from './movement.js';
import { resolveStrike, melee, freeShot } from './combat.js';

/** A charge is Sudden Charge: one action of run on top of the Fight's own price buys twice the
 * unit's Speed at the ordinary terrain prices. */
const CHARGE_ACTIONS = 1;
const CHARGE_SPEEDS = 2;
/** The Charge table offers a Strike or a Press; an Overrun comes only through impact. */
export const CHARGE_ACTIVITIES: readonly ActivityIndex[] = [1, 2];

/** `charged` marks any earlier Charge, so a `once` ability gives impact to the first alone. */
export function chargeImpact(u: Unit): boolean {
  if (u.tactics.includes('cavalry-charge')) return true;
  const ability = unitAbilities(u).find(a => a.kind === 'charge');
  return !!ability && (!ability.once || !u.abilityState?.charged);
}
/** A charge that ends a short range from where it began has built momentum: +2 on the attack. */
const runUp = (state: BattleState, from: Square, landing: Square) =>
  dist(state, from, landing) >= BANDS.short;

/** Whether the unit may charge at all. One in contact fights instead, and a pinned, rooted or
 * spent unit charges nothing. */
const canCharge = (state: BattleState, u: Unit) =>
  u.status === 'active' && movementSpeed(u) > 0 && u.rooted === 0 && !u.pinnedBy
  && u.actions > CHARGE_ACTIONS && engagedEnemies(state, u).length === 0;

/**
 * Cells the run may not enter: where somebody stands, and every hex an enemy other than the
 * target holds. A charge comes to grips with the first unit it engages (section 7), so a route
 * that would put the charger in contact with anyone else is no route at all. A hex an enemy
 * touches only across a wall or a cliff is free, since neither holds engagement.
 */
function chargeBlocked(state: BattleState, u: Unit, target: Unit): Set<string> {
  const blocked = new Set(occupiedBy(state, u));
  for (const e of state.units) {
    if (e.side === u.side || e.status !== 'active' || e.id === target.id) continue;
    for (const n of grid(state).neighbours(e.square)) {
      if (barrierBetween(state.board, e.square, n) === null) blocked.add(notation(n));
    }
  }
  return blocked;
}

/** Section 7: a charge runs over ground the terrain table opens to it, and never climbs. */
const chargeRun = (state: BattleState, u: Unit, blocked: ReadonlySet<string>, via: readonly string[]): Routed | null =>
  reachableVia(state.board, u.square, via, {
    budget: CHARGE_SPEEDS * movementSpeed(u), ...groundFor(u), evenGround: true, occupied: blocked, stopAt: controlCells(state, u),
  });

/** Where the run ends: the nearest hex past the last waypoint that touches the target, preferring
 * one that earns the run-up. A last waypoint that already touches it is the landing. */
function chargeApproach(state: BattleState, u: Unit, e: Unit, via: readonly string[] = []): { option: ChargeOption; path: string[] } | null {
  if (!canCharge(state, u)) return null;
  const run = chargeRun(state, u, chargeBlocked(state, u, e), via);
  if (!run) return null;
  const spent = run.route[run.route.length - 1].feet;
  const landings = [...run.reach]
    .filter(([cell]) => touching(state, parse(cell), e) && canEndOn(u, state.board, parse(cell)))
    .map(([cell, entry]) => ({ cell, feet: spent + entry.feet, runUp: runUp(state, u.square, parse(cell)) }))
    .sort((a, b) => Number(b.runUp) - Number(a.runUp) || a.feet - b.feet || a.cell.localeCompare(b.cell));
  const best = landings[0];
  return best ? {
    option: { unit: e.id, cell: best.cell, feet: best.feet, actions: CHARGE_ACTIONS, runUp: best.runUp },
    path: routedPath(run, best.cell).map((step) => step.cell),
  } : null;
}

const approach = (state: BattleState, u: Unit, e: Unit, via: readonly string[] = []): ChargeOption | null =>
  chargeApproach(state, u, e, via)?.option ?? null;

/** The route a charge takes to its landing hex, its own cell first. Not the ordinary Move's
 * route: this one is priced on twice Speed, and turns aside from every zone of control but the
 * target's. */
export function chargePath(state: BattleState, u: Unit, targetId: string, via: readonly string[] = []): string[] {
  const target = state.units.find((e) => e.id === targetId);
  if (!target) return [];
  return chargeApproach(state, u, target, via)?.path ?? [];
}

/** Enemies this unit can both reach, through `via` in order, and afford the melee against. */
export function chargeTargets(state: BattleState, u: Unit, via: readonly string[] = []): ChargeOption[] {
  if (u.stats.strike === null || u.attacked) return [];
  const out: ChargeOption[] = [];
  for (const e of state.units.filter((x) => x.side !== u.side && x.status === 'active')) {
    const option = approach(state, u, e, via);
    if (option && option.actions + 1 <= u.actions) out.push(option);
  }
  return out;
}

/** Cheapest legal route for each choice. Ordinary movement reserves one action for melee;
 * Charge still gets exactly twice Speed, and every leg respects first contact. The waypoints bind
 * the whole road in order: the move walks the first `split` of them and the charge runs the
 * rest, so a waypoint beside the target picks the hex the charge lands on. */
export function meleePlans(state: BattleState, u: Unit, targetId: string, waypoints: readonly string[] = []): MeleePlan[] {
  const found = state.units.find(e => e.id === targetId && e.status === 'active' && e.side !== u.side);
  if (!found || u.status !== 'active' || u.actions < 1 || u.attacked || u.stats.strike === null || isRouted(u)) return [];
  const target: Unit = found;
  const candidates: MeleePlan[] = [];
  const home = notation(u.square);
  function consider(from: Unit, via: string | null, move: string[], feet: number, moveActions: number, split: number) {
    const projected = { ...state, units: state.units.map(x => x.id === u.id ? from : x) };
    const run = waypoints.slice(split);
    if (!run.length && touching(projected, from.square, target)) {
      candidates.push({ target: targetId, kind: 'fight', via, cell: notation(from.square), moveActions,
        feet, bonus: 0, movePath: move, attackPath: [notation(from.square)], split });
    }
    const charge = chargeApproach(projected, from, target, run);
    if (charge) candidates.push({ target: targetId, kind: 'charge', via, cell: charge.option.cell, moveActions,
      feet: feet + charge.option.feet, bonus: charge.option.runUp ? ACTION_BONUS : 0, movePath: move, attackPath: charge.path, split });
  }
  consider(u, null, [home], 0, 0, 0);
  const canMove = movementSpeed(u) > 0 && !u.rooted && !u.pinnedBy && !engagedEnemies(state, u).length;
  for (let split = 0; canMove && split <= waypoints.length; split++) {
    const routed = strideReach(state, { ...u, actions: u.actions - 1 }, waypoints.slice(0, split));
    // Every later split walks this one's waypoints too, so none of them reaches either.
    if (!routed) break;
    for (const cell of routed.reach.keys()) {
      if (cell === home || !canEndOn(u, state.board, parse(cell))) continue;
      const path = routedPath(routed, cell);
      const feet = path[path.length - 1].feet;
      const moveActions = moveActionsFor(u, feet);
      consider({ ...u, square: parse(cell), actions: u.actions - moveActions,
        feet: u.feet + moveActions * movementSpeed(u) - feet }, cell, path.map((step) => step.cell), feet, moveActions, split);
    }
  }
  candidates.sort((a, b) => a.moveActions - b.moveActions || b.bonus - a.bonus || a.feet - b.feet
    || (a.via ?? '').localeCompare(b.via ?? '') || a.cell.localeCompare(b.cell) || a.split - b.split);
  return (['fight', 'charge'] as const).flatMap(kind => {
    const best = candidates.find(p => p.kind === kind);
    return best ? [best] : [];
  });
}

/** Explain a refused drag using the same destinations and terrain costs as the actions. */
export function dragBlockReason(state: BattleState, u: Unit, cell: string): string | null {
  if (cell === notation(u.square)) return null;
  const target = unitAt(state, parse(cell));
  if (target && target.side !== u.side) {
    if (meleePlans(state, u, target.id).length) return null;
    if (u.attacked) return `${u.name} has already attacked this activation. Each unit gets one attack per activation.`;
    if (u.stats.strike === null) return `${u.name} has no melee attack.`;
    if (u.actions <= 0) return 'All actions are spent. End the activation.';
    if (isRouted(u)) return 'This unit is routed. Move or Step toward its own edge.';
    if (engagedEnemies(state, u).length) return 'This unit is already in contact. Use Melee against an adjacent enemy, or Move or Step to change position.';
    if (u.rooted > 0) return 'This unit is rooted. A charge requires movement; you can still use Melee against an adjacent enemy.';
    if (u.pinnedBy) return 'This unit is pinned. Move out of the pin before charging.';
    if (movementSpeed(u) === 0) return 'This unit has Speed 0. A charge requires movement.';
    const landings = (reach: ReachMap) => [...reach].filter(([key]) =>
      touching(state, parse(key), target) && canEndOn(u, state.board, parse(key)));
    const route = reachable(state.board, u.square, {
      budget: Infinity, ...groundFor(u), occupied: chargeBlocked(state, u, target), stopAt: controlCells(state, u),
    });
    const feet = Math.min(...landings(route).map(([, entry]) => entry.feet));
    if (Number.isFinite(feet)) return `Reaching ${target.name} needs ${feet} ft of movement. This unit has ${u.actions} action${u.actions === 1 ? '' : 's'} left; every legal move-and-attack route exceeds that budget. A charge covers ${CHARGE_SPEEDS * movementSpeed(u)} ft for ${CHARGE_ACTIONS + 1} actions.`;
    const withoutOtherControl = reachable(state.board, u.square, {
      budget: Infinity, ...groundFor(u), occupied: occupiedBy(state, u),
    });
    if (landings(withoutOtherControl).length) return 'Another enemy controls the approach. A charge must engage its target first. Move into contact and use Melee, or choose another target.';
    return 'Terrain, barriers or occupied hexes block every approach to this enemy.';
  }
  if (moveReach(state, u).has(cell) || stepTargets(state, u).includes(cell)) return null;
  if (target) return `${target.name} occupies ${cell}. Choose an empty hex.`;
  if (u.actions <= 0) return 'All actions are spent. End the activation.';
  if (u.rooted > 0) return 'This unit is rooted. Move, Step and Charge are unavailable until the root ends.';
  if (movementSpeed(u) === 0) return 'This unit has Speed 0 and must hold its position.';
  if (!canEndOn(u, state.board, parse(cell))) return 'This unit must end its movement on land. Water is an invalid destination.';
  const route = reachable(state.board, u.square, {
    budget: Infinity, ...groundFor(u), occupied: occupiedBy(state, u), stopAt: controlCells(state, u),
  });
  const feet = route.get(cell)?.feet;
  if (feet !== undefined) {
    const needed = moveActionsFor(u, feet);
    return `Reaching ${cell} needs ${needed} movement actions; this unit has ${u.actions} left. The whole route uses ${Number((feet / movementSpeed(u)).toFixed(2))} Moves before banked movement. Each step uses its highest terrain, climb or field cost.`;
  }
  const withoutControl = reachable(state.board, u.square, { budget: Infinity, ...groundFor(u), occupied: occupiedBy(state, u) });
  return withoutControl.has(cell)
    ? 'Enemy contact ends movement before this hex. Move into contact, then Move again to continue.'
    : 'Terrain, barriers or occupied hexes block the route to this hex.';
}

export function fleePlan(state: BattleState, u: Unit, cell: string): FleePlan | null {
  if (state.phase !== 'battle' || u.status !== 'active' || u.actions < 1 || movementSpeed(u) <= 0
    || u.rooted > 0 || u.pinnedBy || !isFleeEdge(state, u, cell)) return null;
  const home = notation(u.square);
  // A held unit gets away with a Move first; only one already on the edge may Flee from contact.
  if (cell !== home && holdersOf(state, u).length) return null;
  const movement = cell === home ? { feet: 0, actions: 0 } : moveReach(state, u).get(cell);
  if (!movement || movement.actions + 1 > u.actions) return null;
  return { cell, path: cell === home ? [home] : movePath(state, u, cell).map(s => s.cell),
    feet: movement.feet, moveActions: movement.actions, actions: movement.actions + 1,
    modifier: willModifier(u) + resolveBonus(state, u), dc: routDcFor(state, { ...u, square: parse(cell) }) };
}

export function fleeBlockReason(state: BattleState, u: Unit, cell: string): string {
  if (!isFleeEdge(state, u, cell)) return 'Flee through a map edge in this unit’s starting zone.';
  if (u.rooted > 0) return 'This unit is rooted and cannot leave its hex.';
  if (u.pinnedBy) return 'Break the pin before fleeing.';
  if (holdersOf(state, u).length && notation(u.square) !== cell) return 'Move out of contact before fleeing.';
  if (movementSpeed(u) <= 0) return 'This unit has no movement and cannot flee.';
  if (notation(u.square) !== cell && !moveReach(state, u).has(cell)) return dragBlockReason(state, u, cell) ?? 'This unit cannot reach that edge.';
  return 'Reaching this edge and fleeing requires movement plus one action to flee.';
}

export function doFlee(state: BattleState, rng: Rng, u: Unit, action: FleeAction): number {
  const plan = fleePlan(state, u, action.to);
  if (!plan) throw new Error(fleeBlockReason(state, u, action.to));
  if (plan.path.length > 1) doStride(state, rng, u, { type: 'move', unit: u.id, to: action.to });
  const wasRouted = isRouted(u);
  const c = roll(state, rng, u, plan.modifier, plan.dc);
  log(state, u, rollLine(u.name, `Will check to flee through ${action.to}`, c), c);
  if (succeeded(c.degree) && !wasRouted) {
    u.status = 'camp';
    log(state, u, `${u.name} escapes to camp without losing morale and remains available after the day.`);
  } else {
    u.disorder = ROUTED_AT;
    u.status = 'left';
    abandonEngines(state, u);
    log(state, u, `${u.name} escapes but is routed and will not return at the end of the day.`);
  }
  clearAsShooter(state, u.id);
  return plan.actions;
}

/**
 * Tumbling out of a zone of control: one Reflex roll, read against each holder's own DC. Falling
 * short of any holds the unit where it stands; each holder the roll critically fails against also
 * makes its free attack — a Strike, or a pinning shooter's Volley. True when the unit gets away.
 */
function escape(state: BattleState, rng: Rng, u: Unit, holders: Unit[]): boolean {
  const c = roll(state, rng, u, escapeModifier(u), Math.max(...holders.map((h) => escapeDcFor(state, h, u))));
  log(state, u, rollLine(u.name, 'Reflex check to get away', c), c);
  if (succeeded(c.degree)) return true;
  for (const h of holders) {
    if (u.status !== 'active') break;
    if (readCheck(c.roll, c.modifier, escapeDcFor(state, h, u)).degree !== 'critical-failure') continue;
    if (h.id === u.pinnedBy) freeShot(state, rng, h, u);
    else resolveStrike(state, rng, h, u, { free: true, label: 'Free strike' });
  }
  if (u.status === 'active') log(state, u, `${u.name} cannot break away and stays where it stands.`);
  return false;
}

export function doStep(state: BattleState, u: Unit, action: StepAction): number {
  if (!stepTargets(state, u).includes(action.to)) throw new Error(`${u.name} cannot step to ${action.to}`);
  moveTo(state, u, parse(action.to));
  log(state, u, `${u.name} steps to ${action.to}.`);
  departed(state, u);
  return 1;
}

const spendMovement = (u: Unit, m: { feet: number; actions: number }) => {
  u.feet += m.actions * movementSpeed(u) - m.feet;
};

// proto: a Move that fails to get away spends one action, even one banked movement would have paid.
export function doStride(state: BattleState, rng: Rng, u: Unit, action: MoveAction): number {
  const m = moveReach(state, u, action.waypoints).get(action.to);
  if (!m) throw new Error(`${u.name} cannot reach ${action.to}`);
  const holders = holdersOf(state, u);
  if (holders.length && !escape(state, rng, u, holders)) return 1;
  spendMovement(u, m);
  moveTo(state, u, parse(action.to));
  log(state, u, `${u.name} strides to ${action.to} — ${m.feet} ft, ${m.actions} action${m.actions === 1 ? '' : 's'}.`);
  if (holders.length) departed(state, u);
  return m.actions;

}

// A Charge costs one action more than the Fight it ends in — a Strike unless the action names
// another — for twice Speed of run. The run's leftover feet never bank.
export function doCharge(state: BattleState, rng: Rng, u: Unit, action: ChargeAction): number {
  const foe = unit(state, action.target);
  if (u.stats.strike === null) throw new Error(`${u.name} has no melee`);
  if (u.attacked) throw new Error(`${u.name} has already attacked this activation`);
  const option = approach(state, u, foe, action.waypoints);
  if (!option) throw new Error(`${u.name} cannot reach ${foe.name}`);
  const wanted = action.activity ?? 1;
  if (!CHARGE_ACTIVITIES.includes(wanted)) throw new Error('invalid charge activity');
  const focus = validateFocus(action);
  const cost = CHARGE_ACTIONS + wanted + focus;
  if (cost > u.actions) throw new Error(`${u.name} has too few actions to charge ${foe.name}`);
  const bonus = option.runUp ? ACTION_BONUS : 0;
  // Read from the hex the charge starts in, whatever hex it ends on.
  const saveShift = elevation(state, u) > at(state.board, foe.square).elevation ? -ACTION_BONUS : 0;
  const impact = chargeImpact(u);
  abilityMemory(u).charged = true;
  moveTo(state, u, parse(option.cell));
  const carried = [
    bonus ? `+${bonus} on the Melee attack for the run-up` : '',
    saveShift ? `${foe.name}'s save is at −${ACTION_BONUS}, charged from above` : '',
    impact ? 'the impact forces two Fortitude rolls, keeping the worse' : '',
    focus ? `commitment +${focus * ACTION_BONUS} on the Melee attack (${cost} actions total)` : '',
  ].filter(Boolean);
  log(state, u, `${u.name} charges ${foe.name} — ${option.feet} ft to ${option.cell}${carried.length ? `, ${carried.join(', ')}` : ''}.`);
  melee(state, rng, u, foe, activityOf('fight', wanted), { charging: true, circumstance: bonus, bonus: focus * ACTION_BONUS, saveShift, impact });
  return cost;
}
