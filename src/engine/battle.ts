import {
  at, barrierBetween, deployRanks, edgeKey, gridOf, notation, parse, SIZE,
  type Board, type Square, type Wall,
} from './board.js';
import { cardTraits, deriveStats, paceOf, speedOf, type SiegeEngineCard, type UnitCard } from './cards.js';
import { reachable, stepFeet } from './path.js';
import { check, succeeded, type CheckResult, type Degree } from './check.js';
import {
  LADDERS, qualityFor, rungOf, treesFor,
  type Grade, type LadderType, type Rung,
} from './ladders.js';
import {
  bandOut, castRungOf, TRADITION_TIERS, TREE_LABEL, TREE_RANGE, TREE_ROLLS,
  TREE_TARGET, type CastAxis, type CastBand, type CastTier, type Tree,
} from './magic.js';
import type { Rng } from './rng.js';
import { levelDc } from './tables.js';
import {
  ACTION_BONUS, ACTIONS_PER_ACTIVATION, BANDS, LAST_ROUND, MAX_WOUNDS, REACH_RANK,
  type Action, type ActionOffer, type Activation, type BattleState, type ChargeAction,
  type ChargeOption, type EngineState, type MoveAction, type MoveReach,
  type Range, type RungAction, type RungOption, type RungTarget, type Side,
  type TargetOffer, type TargetRef, type Unit, type WithdrawAction, type WithdrawOffer,
} from './types.js';

export interface Deployment { card: UnitCard; side: Side; square: string; engines?: SiegeEngineCard[]; }

/** An engine deployed on a square of its own rather than attached to a unit. */
export interface Emplacement { card: SiegeEngineCard; side: Side; square: string; }

export interface BattleSetup { units: Deployment[]; board: Board; engines?: Emplacement[]; }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const homeRank = (s: Side) => (s === 'attacker' ? 0 : SIZE - 1);

export const sameSquare = (a: Square, b: Square) => a.file === b.file && a.rank === b.rank;

const grid = (state: BattleState) => gridOf(state.board);
const dist = (state: BattleState, a: Square, b: Square) => grid(state).distance(a, b);

export function canDeploy(board: Board, side: Side, ambush: boolean, sq: Square): boolean {
  return gridOf(board).inBounds(sq) && deployRanks(side, ambush).includes(sq.rank) && at(board, sq).terrain !== 'water';
}

// The rng is unused now that there is no initiative roll; callers still pass one.
export function createBattle(setup: BattleSetup, _rng?: Rng): BattleState {
  const taken = new Set<string>();
  const units: Unit[] = setup.units.map((d, i) => {
    const traits = cardTraits(d.card);
    const sq = parse(d.square);
    if (!canDeploy(setup.board, d.side, traits.tactics.includes('ambush'), sq)) throw new Error(`${d.card.name} cannot deploy on ${d.square}`);
    if (taken.has(d.square)) throw new Error(`${d.square} is already occupied`);
    taken.add(d.square);
    return {
      id: `u${i}`, name: d.card.name, side: d.side, level: d.card.level, role: d.card.role,
      stats: deriveStats(d.card), pace: paceOf(d.card), fear: traits.fear, tactics: traits.tactics,
      tradition: traits.caster ? traits.tradition : null,
      trees: treesFor(d.card),
      quality: qualityFor(d.card),
      speed: speedOf(d.card), flying: d.card.sheet?.fly ?? false,
      noRetreat: traits.signals.includes('no-retreat'),
      actions: ACTIONS_PER_ACTIVATION, attacked: false, feet: 0,
      engines: (d.engines ?? []).map((e) => engineState(e, d.side, sq, false)),
      square: sq, wounds: d.card.wounds ?? 0, disorder: d.card.disorder ?? 0, status: 'active' as const,
      guard: null, rooted: 0, exposed: false, inspired: false,
      suppressedBy: null, pinnedBy: null, frightened: false, stunned: false, persistent: null,
      sureStrike: false, wrath: false, haste: 0,
      ward: false, stoneskin: false, aegis: null,
      sureFooting: false, flies: false,
    };
  });
  const emplaced = (setup.engines ?? []).map((e) => {
    const sq = parse(e.square);
    if (!canDeploy(setup.board, e.side, false, sq)) throw new Error(`${e.card.name} cannot deploy on ${e.square}`);
    if (taken.has(e.square)) throw new Error(`${e.square} is already occupied`);
    taken.add(e.square);
    return engineState(e.card, e.side, sq, true);
  });
  const state: BattleState = {
    units, engines: emplaced, order: units.map((u) => u.id), round: 1,
    pending: 'attacker', active: null, begun: false, activated: [], lastSide: null,
    board: clone(setup.board),
    phase: 'battle', winner: null, endedBy: null,
    startingCount: { attacker: count(units, 'attacker'), defender: count(units, 'defender') },
    halfChecked: { attacker: false, defender: false },
    log: [{ round: 1, text: 'Round 1 begins.' }],
  };
  state.pending = nextSide(state) ?? 'attacker';
  refreshEmplacements(state);
  return state;
}

const engineState = (e: SiegeEngineCard, side: Side, square: Square, emplaced: boolean): EngineState =>
  ({ name: e.name, kind: e.kind, launch: e.launch, reach: e.reach, fired: false, status: 'crewed', square, side, emplaced });

const count = (units: Unit[], side: Side) => units.filter((u) => u.side === side).length;

export const unit = (state: BattleState, id: string): Unit => {
  const u = state.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

/** Morale runs one point past Quality. At Quality the unit is shaken and may do nothing but
 * Rally or withdraw; the point above it is the rout, and Rally is the only way back down. */
export const isShaken = (u: Unit) => u.status === 'active' && u.disorder >= u.quality;
export const isRouted = (u: Unit) => u.status === 'active' && u.disorder > u.quality;
export const isStanding = (u: Unit) => u.status === 'active' && u.disorder <= u.quality;
export const isWeakened = (u: Unit) => u.wounds >= 2;
export const isBroken = (u: Unit) => u.wounds >= 3;

/** Units of `side` that may still act this round. */
export function activatable(state: BattleState, side: Side): Unit[] {
  return state.order.map((id) => unit(state, id))
    .filter((u) => u.side === side && u.status === 'active' && !state.activated.includes(u.id));
}

// The side with more un-activated units goes next; a tie goes to the side that did not act last.
function nextSide(state: BattleState): Side | null {
  const a = activatable(state, 'attacker').length;
  const d = activatable(state, 'defender').length;
  if (!a && !d) return null;
  if (!a) return 'defender';
  if (!d) return 'attacker';
  if (a !== d) return a > d ? 'attacker' : 'defender';
  return state.lastSide === 'attacker' ? 'defender' : 'attacker';
}

export const activeUnit = (state: BattleState): Unit | null => {
  if (state.phase !== 'battle') return null;
  if (state.active) {
    const u = unit(state, state.active);
    if (u.side === state.pending && u.status === 'active' && !state.activated.includes(u.id)) return u;
  }
  return activatable(state, state.pending)[0] ?? null;
};

/** Pick which of the pending side's units acts next. */
export function select(input: BattleState, id: string): BattleState {
  const state = clone(input);
  const u = unit(state, id);
  if (u.side !== state.pending || state.activated.includes(id) || u.status !== 'active') {
    throw new Error(`${u.name} cannot activate now`);
  }
  if (state.begun && state.active !== id) throw new Error('an activation is already under way');
  state.active = id;
  return state;
}

/** Put the pick back so the side is choosing again. Once the activation has begun the actions
 * are already spent on that unit, so the choice stands and this does nothing. */
export function deselect(input: BattleState): BattleState {
  if (input.begun || input.active === null) return input;
  const state = clone(input);
  state.active = null;
  return state;
}

export const unitAt = (state: BattleState, sq: Square): Unit | undefined =>
  state.units.find((u) => u.status === 'active' && sameSquare(u.square, sq));

const square = (state: BattleState, u: Unit) => at(state.board, u.square);
const elevation = (state: BattleState, u: Unit) => square(state, u).elevation;

export function isEngaged(state: BattleState, a: Unit, b: Unit): boolean {
  if (a.side === b.side || a.status !== 'active' || b.status !== 'active') return false;
  if (dist(state, a.square, b.square) !== 1) return false;
  return barrierBetween(state.board, a.square, b.square)?.kind !== 'cliff';
}

export const engagedEnemies = (state: BattleState, u: Unit) =>
  state.units.filter((e) => isEngaged(state, u, e));

export const wallBetween = (state: BattleState, a: Unit, b: Unit): Wall | null => {
  const barrier = barrierBetween(state.board, a.square, b.square);
  return barrier?.kind === 'wall' ? barrier.wall : null;
};

/** Which of the four range bands a distance falls in. Rank 5 is out of range altogether. */
function bandRank(state: BattleState, d: number): number {
  const b = BANDS[state.board.grid];
  return d <= b.short ? 1 : d <= b.medium ? 2 : d <= b.long ? 3 : d <= b.extreme ? 4 : 5;
}

export function rangeBetween(state: BattleState, a: Unit, b: Unit): Range {
  if (isEngaged(state, a, b)) return 'engaged';
  return (['short', 'medium', 'long', 'extreme', 'beyond'] as const)[bandRank(state, dist(state, a.square, b.square)) - 1];
}

export const isOutflanked = (state: BattleState, u: Unit) => engagedEnemies(state, u).length >= 2;

// Walls belong to the defender: a defender beside a standing segment is garrisoned.
export function garrisoned(state: BattleState, u: Unit): boolean {
  if (u.side !== 'defender') return false;
  return grid(state).neighbours(u.square)
    .some((n) => (state.board.walls[edgeKey(u.square, n)]?.remaining ?? 0) > 0);
}

/** Brace's Defence bonus, and what a defend-allies Guard shares with a neighbour. */
export const GUARD_DEFENCE = ACTION_BONUS;

/** A defend-allies ally under any Guard shares +2 with its neighbours, whatever it paid for it. */
const auraOn = (state: BattleState, u: Unit) => state.units.some((a) =>
  a.side === u.side && a.id !== u.id && a.status === 'active'
  && a.guard && a.tactics.includes('defend-allies') && dist(state, a.square, u.square) === 1)
  ? GUARD_DEFENCE : 0;

/**
 * What the conditions in force are worth on any roll the unit makes. Read, never spent: the
 * modifier functions below are called to show a number as often as to roll one, so the roll
 * that consumes `inspired` clears it at the roll itself.
 */
export function rollBonus(u: Unit): number {
  let n = 0;
  if (u.inspired) n += ACTION_BONUS;
  if (u.suppressedBy) n -= 2;
  if (u.frightened) n -= 1;
  return n;
}

export function defenceOf(state: BattleState, target: Unit, attacker: Unit | null, vsVolley: boolean, ignoresCover = false): number {
  // Circumstance bonuses never stack; the highest applies.
  let circumstance = Math.max(target.guard?.defence ?? 0, auraOn(state, target));
  const downhill = attacker ? elevation(state, attacker) > elevation(state, target) : false;
  if (vsVolley && !ignoresCover && square(state, target).terrain === 'forest' && !downhill) circumstance = Math.max(circumstance, 1);
  let penalty = target.disorder;
  if (isOutflanked(state, target)) penalty += 2;
  if (target.exposed) penalty += 2;
  if (target.suppressedBy) penalty += 2;
  if (target.frightened) penalty += 1;
  return target.stats.defence + circumstance - penalty;
}

export function reachOf(state: BattleState, u: Unit): number {
  if (u.stats.volley === null || u.stats.reach === null) return 0;
  return REACH_RANK[u.stats.reach] - (isWeakened(u) ? 1 : 0);
}

/**
 * The unit that works an emplaced engine: a standing friendly in or beside its square. Two
 * units may both be beside it, so the crew is the first in deployment order — one engine
 * fires once a round whoever stands there, and the choice never splits a shot in two.
 */
export const crewOf = (state: BattleState, e: EngineState): Unit | null =>
  state.units.find((u) => u.side === e.side && isStanding(u) && dist(state, u.square, e.square) <= 1) ?? null;

/** Every engine this unit may fire: the ones riding with it, plus any emplacement it crews. */
export const enginesOf = (state: BattleState, u: Unit): EngineState[] =>
  [...u.engines, ...state.engines.filter((e) => crewOf(state, e)?.id === u.id)];

/** An emplaced engine is crewed exactly while a friendly stands by it — nothing sets that. */
function refreshEmplacements(state: BattleState) {
  for (const e of state.engines) e.status = crewOf(state, e) ? 'crewed' : 'abandoned';
}

const crewedArtillery = (state: BattleState, u: Unit): EngineState | null =>
  enginesOf(state, u).find((e) => e.status === 'crewed' && !e.fired && e.kind === 'artillery') ?? null;
const crewedRam = (state: BattleState, u: Unit): EngineState | null =>
  enginesOf(state, u).find((e) => e.status === 'crewed' && !e.fired && e.kind === 'ram') ?? null;

/** The band a shot costs nothing extra to reach; every band beyond it is −2 on the roll
 * (`shootModifier`). A crewed engine replaces the unit's own shooting profile, effective range
 * and all, while it is loaded — but it buys no cheaper activity than anyone else's. */
export function shootHome(state: BattleState, u: Unit): number {
  const e = crewedArtillery(state, u);
  const reach = e ? e.reach : u.stats.reach;
  return reach ? REACH_RANK[reach] : 1;
}

export const canShoot = (state: BattleState, u: Unit) => u.stats.volley !== null || crewedArtillery(state, u) !== null;

const rangeRank = (r: Range) => (r === 'short' ? 1 : r === 'medium' ? 2 : r === 'long' ? 3 : r === 'extreme' ? 4 : r === 'beyond' ? 5 : 0);

/** Whether a bare rank (1-4) names a real band rather than engaged (0) or beyond (5). */
const inRange = (r: number) => r >= 1 && r <= 4;

/** The band a shot at this target is priced in: the true band, one closer for a shooter that
 * stands higher. Engaged (0) and beyond (5) stay where they are. */
function shotRank(state: BattleState, u: Unit, target: Unit): number {
  const r = rangeRank(rangeBetween(state, u, target));
  return inRange(r) && r > 1 && elevation(state, u) > elevation(state, target) ? r - 1 : r;
}

export function strikeModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = (u.stats.strike ?? 0) + rollBonus(u);
  if (isWeakened(u)) m -= 2;
  m -= u.disorder;
  if (square(state, u).terrain === 'swamp' || square(state, u).terrain === 'shallows') m -= 1;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  if (u.side === 'attacker' && wallBetween(state, u, target)) m -= 2;
  return m;
}

export function shootModifier(state: BattleState, u: Unit, target: Unit): number {
  const e = crewedArtillery(state, u);
  let m = (e ? e.launch : (u.stats.volley ?? 0)) + rollBonus(u);
  if (isWeakened(u)) m -= 2;
  m -= u.disorder;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  m -= 2 * Math.max(0, shotRank(state, u, target) - shootHome(state, u));
  if (state.units.some((a) => a.side === u.side && a.id !== u.id && isEngaged(state, target, a))) m -= 4;
  if (garrisoned(state, u)) m += 1;
  return m;
}

/** Will, less disorder: the Rally check, and the save a repulsed attacker makes. */
export const willModifier = (u: Unit) => u.stats.will - u.disorder + rollBonus(u);

/** What a caster rolls to Blast: its own spell attack, less disorder (section 11). */
export const spellAttackModifier = (u: Unit) => (u.stats.spellAttack ?? 0) - u.disorder + rollBonus(u);

/** What a target resists a Controlling effect roll against: the caster's own spell DC, plus
 * whatever this cast's tier bonused it (section 11's "effect roll" bonus). */
export const spellDcFor = (u: Unit, bonus = 0) => (u.stats.spellDc ?? 0) + bonus;

/** The level DC of the strongest enemy nearby — the highest-level enemy within close range,
 * or across the whole field if none is close. Rallying under a dragon's eye is harder than
 * rallying beside a levy. */
export function routDcFor(state: BattleState, u: Unit): number {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  const near = enemies.filter((e) => dist(state, u.square, e.square) <= BANDS[state.board.grid].short);
  const pool = near.length ? near : enemies;
  return levelDc(Math.max(0, ...pool.map((e) => e.level)));
}

const log =(state: BattleState, u: Unit | null, text: string, c?: CheckResult) =>
  state.log.push({ round: state.round, unit: u?.id, text, check: c });

const degreeWord: Record<Degree, string> = {
  'critical-failure': 'critical failure', failure: 'failure', success: 'success', 'critical-success': 'critical success',
};

/**
 * The one step between a hit rolled and a wound taken. Dig in and Take cover cap the hit at a
 * single wound, so a critical lands as an ordinary one.
 */
export function reduceWounds(target: Unit, n: number): number {
  return target.guard?.cap ? Math.min(n, 1) : n;
}

/** The target's Fortitude, less its own disorder, the way every other save reads it. */
export const fortitudeModifier = (u: Unit) => u.stats.fortitude - u.disorder + rollBonus(u);

// A suppression or a pin also lifts when its shooter leaves play — dead or fled fires no more.
function clearAsShooter(state: BattleState, shooterId: string) {
  for (const o of state.units) {
    if (o.suppressedBy === shooterId) o.suppressedBy = null;
    if (o.pinnedBy === shooterId) o.pinnedBy = null;
  }
}

/**
 * Wounds that actually land, after the target's Guard. A wound then asks a Fortitude save
 * against the attacker's level DC before it disorders anyone. `pressed` skips that save: the
 * disorder simply lands.
 */
function applyWounds(state: BattleState, rng: Rng, target: Unit, raw: number, source: string, attacker: Unit, pressed = false): number {
  const n = reduceWounds(target, raw);
  if (n < raw) log(state, target, `${target.name} has dug in: the critical lands as an ordinary hit.`);
  if (n <= 0) return 0;
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  const mark = target.wounds >= MAX_WOUNDS ? 'destroyed' : isBroken(target) ? 'Broken' : isWeakened(target) ? 'Weakened' : '';
  log(state, target, `${target.name} takes ${n} wound${n > 1 ? 's' : ''} from ${source} (${target.wounds}/${MAX_WOUNDS})${mark ? ` — ${mark}` : ''}.`);
  if (target.wounds >= MAX_WOUNDS) { target.status = 'destroyed'; abandonEngines(state, target); clearAsShooter(state, target.id); return n; }
  if (pressed) {
    addDisorder(state, target, 1, 'a pressed hit, no save');
  } else {
    const c = check(rng, fortitudeModifier(target), levelDc(attacker.level));
    log(state, target, `${target.name} braces against the wound: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
    if (!succeeded(c.degree)) addDisorder(state, target, 1, 'a wound taken');
  }
  return n;
}

function abandonEngines(state: BattleState, u: Unit) {
  for (const e of u.engines) {
    if (e.status !== 'crewed') continue;
    e.status = 'abandoned';
    e.square = u.square;
    log(state, u, `${u.name} abandons its ${e.name} on ${notation(e.square)}.`);
  }
}

function addDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (n === 0 || u.status !== 'active') return;
  const wasShaken = isShaken(u);
  const wasRouted = isRouted(u);
  // The rout sits one point above Quality, so that is where the cap goes.
  u.disorder = Math.max(0, Math.min(u.quality + 1, u.disorder + n));
  const routed = !wasRouted && isRouted(u);
  const crossed = routed ? ' — routed' : !wasShaken && isShaken(u) ? ' — shaken' : '';
  log(state, u, `${u.name} is disordered ${u.disorder}/${u.quality} (${n > 0 ? '+' : ''}${n}, ${why})${crossed}.`);
  if (routed) abandonEngines(state, u);
}

function clearDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (u.disorder === 0) return;
  u.disorder = Math.max(0, u.disorder - n);
  log(state, u, `${u.name} clears to disorder ${u.disorder}/${u.quality} (${why}).`);
}

interface StrikeOpts { free?: boolean; pressed?: boolean; label: string }

function resolveStrike(state: BattleState, rng: Rng, u: Unit, target: Unit, opts: StrikeOpts): Degree {
  const c = check(rng, strikeModifier(state, u, target), defenceOf(state, target, u, false));
  log(state, u, `${u.name} ${opts.label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const rolled = c.degree === 'critical-success' ? (opts.free ? 1 : 2) : c.degree === 'success' ? 1 : 0;
  applyWounds(state, rng, target, rolled, u.name, u, opts.pressed ?? false);
  if (c.degree === 'critical-failure' && !opts.free) {
    u.exposed = true;
    log(state, u, `${u.name} is exposed (−2 Defence) until it acts again.`);
  }
  return c.degree;
}

// A Fight is one roll, one way. A hit wounds, and the target's Fortitude save decides its
// disorder; a miss repulses the attacker, whose Will save against the target's level DC
// decides its own. The rung adds no number to the roll: Press skips the target's save, and
// Overrun drives it back a hex besides.
function melee(state: BattleState, rng: Rng, u: Unit, target: Unit, rung: Rung) {
  const eff = rung.fight!;
  u.attacked = true;
  const degree = resolveStrike(state, rng, u, target, { pressed: eff.press, label: rung.verb });
  if (succeeded(degree)) {
    if (eff.drive && u.status === 'active') giveGround(state, u, target);
    return;
  }
  const c = check(rng, willModifier(u), levelDc(target.level));
  log(state, u, `${u.name} is repulsed by ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (!succeeded(c.degree)) addDisorder(state, u, 1, 'a repulsed attack');
}

/**
 * Overrun's shove, the shape of Pathfinder's Shove: the target moves one hex directly away
 * from the attacker, and the attacker steps into the hex it left, so contact holds. A destroyed
 * target simply yields its hex. With that one hex blocked the target holds and takes 1 disorder
 * instead. Take cover blocks it too, but takes nothing for it: the Overrun just lands as a Press.
 */
function giveGround(state: BattleState, u: Unit, target: Unit) {
  const ground = target.square;
  if (target.status !== 'active') {
    if (!unitAt(state, ground)) {
      moveTo(state, u, ground);
      log(state, u, `${u.name} overruns and takes ${notation(ground)}.`);
    }
    return;
  }
  if (target.guard?.holds) {
    log(state, target, `${target.name} holds its ground under cover: the Overrun lands as a Press.`);
    return;
  }
  const away = grid(state).beyond(u.square, ground);
  if (!away || !enterable(state, target, ground, away)) {
    log(state, target, `${target.name} has nowhere to give ground and is crushed against it.`);
    addDisorder(state, target, 1, 'nowhere to give ground');
    return;
  }
  moveTo(state, target, away);
  moveTo(state, u, ground);
  log(state, u, `${u.name} drives ${target.name} back to ${notation(away)} and takes ${notation(ground)}.`);
}

function shootAt(state: BattleState, rng: Rng, u: Unit, target: Unit, rung: Rung) {
  const e = crewedArtillery(state, u);
  const source = e ? `${u.name}'s ${e.name}` : `${u.name}'s volley`;
  u.attacked = true;
  const c = check(rng, shootModifier(state, u, target), defenceOf(state, target, u, true));
  if (e) e.fired = true;
  log(state, u, `${u.name} ${rung.verb} at ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  applyWounds(state, rng, target, c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0, source, u);
  const eff = rung.shoot!;
  // Suppress bites hit or miss — volume fire works by volume, not by landing.
  if (target.status === 'active' && eff.suppress) {
    target.suppressedBy = u.id;
    log(state, target, `${target.name} is suppressed: −2 to everything until ${u.name} next acts.`);
  }
  if (target.status === 'active' && eff.pin) {
    target.pinnedBy = u.id;
    log(state, target, `${target.name} is pinned by ${u.name} until it next acts.`);
  }
}

const wallDc = (state: BattleState, wall: Wall) =>
  10 + wall.tier + Math.max(0, ...state.units.filter((d) => d.side === 'defender' && d.status === 'active').map((d) => d.level));

function attackWall(state: BattleState, rng: Rng, u: Unit, key: string, modifier: number, verb: string) {
  const wall = state.board.walls[key];
  if (!wall || wall.remaining <= 0) return;
  const c = check(rng, modifier, wallDc(state, wall));
  log(state, u, `${u.name} ${verb} the wall ${key}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const hits = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
  if (!hits) return;
  wall.remaining = Math.max(0, wall.remaining - hits);
  log(state, u, wall.remaining ? `The wall holds ${wall.remaining}/${wall.boxes}.` : `The wall at ${key} is breached.`);
}

const enterable = (state: BattleState, u: Unit, from: Square, to: Square) =>
  !unitAt(state, to) && Number.isFinite(stepFeet(state.board, from, to, u.flying));

const occupiedBy = (state: BattleState, u: Unit) =>
  new Set(state.units.filter((o) => o.status === 'active' && o.id !== u.id).map((o) => notation(o.square)));

/** Feet the unit may still spend: what earlier Move actions banked, plus what the rest buy. */
export const movementBudget = (u: Unit) => Math.max(0, u.feet + u.actions * u.speed);

// Movement pools across the activation rather than being lost at the end of each Stride, so a
// swamp cell at 30 ft stays enterable by a 25 ft troop over two actions.
export const moveActionsFor = (u: Unit, feet: number) =>
  feet <= u.feet ? 0 : Math.ceil((feet - u.feet) / u.speed);

/** Every cell the unit can still Stride to, what it costs in feet, and in Move actions. */
export function moveReach(state: BattleState, u: Unit): Map<string, MoveReach> {
  const out = new Map<string, MoveReach>();
  if (u.speed === 0 || u.rooted > 0 || u.pinnedBy || u.actions <= 0 || u.status !== 'active') return out;
  // A unit in contact leaves by withdrawing, which is its own ladder and its own price.
  if (engagedEnemies(state, u).length) return out;
  const reach = reachable(state.board, u.square, {
    budget: movementBudget(u), flying: u.flying, occupied: occupiedBy(state, u),
  });
  const home = notation(u.square);
  for (const [key, entry] of reach) {
    if (key === home) continue;
    out.set(key, { feet: entry.feet, actions: moveActionsFor(u, entry.feet), from: entry.from });
  }
  return out;
}

/** The route to `to`, the unit's own cell first. Empty when `to` is out of reach. */
export function movePath(moves: Map<string, MoveReach>, to: string): string[] {
  if (!moves.has(to)) return [];
  const out: string[] = [];
  let key: string | null = to;
  while (key !== null && moves.has(key)) { out.unshift(key); key = moves.get(key)!.from; }
  if (key !== null) out.unshift(key);
  return out;
}

const touching = (state: BattleState, sq: Square, e: Unit) =>
  dist(state, sq, e.square) === 1 && barrierBetween(state.board, sq, e.square)?.kind !== 'cliff';

/** The cheapest cell within reach from which `u` can fight `e`. */
function approach(state: BattleState, u: Unit, e: Unit, moves: Map<string, MoveReach>): ChargeOption | null {
  let best: ChargeOption | null = null;
  for (const [cell, m] of moves) {
    if (!touching(state, parse(cell), e)) continue;
    if (!best || m.feet < best.feet || (m.feet === best.feet && cell < best.cell)) {
      best = { unit: e.id, cell, feet: m.feet, actions: m.actions };
    }
  }
  return best;
}

/** Enemies this unit can both reach and afford the melee against. */
export function chargeTargets(state: BattleState, u: Unit): ChargeOption[] {
  if (u.stats.strike === null || u.attacked || u.pinnedBy) return [];
  const moves = moveReach(state, u);
  const out: ChargeOption[] = [];
  for (const e of state.units.filter((x) => x.side !== u.side && x.status === 'active')) {
    const option = approach(state, u, e, moves);
    if (option && option.actions + 1 <= u.actions) out.push(option);
  }
  return out;
}

/**
 * Where a withdrawal may end. One cell is free; `feet` of committed distance opens up every
 * cell a Stride of that budget would reach. Cells that break contact win, but a cornered unit
 * is offered the rest rather than being stuck.
 */
export function withdrawTargets(state: BattleState, u: Unit, feet = 0): Square[] {
  const g = grid(state);
  const engaged = engagedEnemies(state, u);
  const routing = isRouted(u) && !engaged.length;
  const step = homewardStep(u);
  const cells = new Set((routing ? g.homeward(u.square, u.side) : g.neighbours(u.square))
    .filter((n) => enterable(state, u, u.square, n))
    .map(notation));
  if (feet > 0 && u.speed > 0) {
    const reach = reachable(state.board, u.square, { budget: feet, flying: u.flying, occupied: occupiedBy(state, u) });
    for (const key of reach.keys()) {
      const sq = parse(key);
      if (sameSquare(sq, u.square)) continue;
      // A routed unit runs for its own edge and nowhere else.
      if (routing && Math.sign(sq.rank - u.square.rank) !== step) continue;
      cells.add(key);
    }
  }
  // Nearest first, so the cell a caller gets by naming none is a step away rather than a sprint.
  const all = [...cells].map(parse)
    .sort((a, c) => g.distance(u.square, a) - g.distance(u.square, c) || notation(a).localeCompare(notation(c)));
  const clear = all.filter((n) => engaged.every((e) => g.distance(e.square, n) > 1));
  return clear.length ? clear : all;
}

const homewardStep = (u: Unit) => Math.sign(homeRank(u.side) - u.square.rank) || -1;

/** The DC to break from a holder: its attack DC, its strike bonus plus ten — or, for a pinning
 * shooter, its Volley plus ten, since nobody is in contact to strike. */
export const escapeDcFor = (holder: Unit, target: Unit) =>
  ((holder.id === target.pinnedBy ? holder.stats.volley : holder.stats.strike) ?? 0) + 10;

/** Reflex is the widest-spreading defensive stat on a troop sheet (5.6 points within a level
 * against AC's 3.2), so it is the one that tells troops apart. */
export const escapeModifier = (u: Unit) => u.stats.reflex - u.disorder + rollBonus(u);

/** Enemies that can actually hold a unit: one with no melee strike cannot, but an active
 * pinning shooter holds it at range regardless. */
export const holdersOf = (state: BattleState, u: Unit): Unit[] => {
  const engaged = engagedEnemies(state, u).filter((e) => e.stats.strike !== null);
  const pinner = u.pinnedBy ? state.units.find((e) => e.id === u.pinnedBy && e.status === 'active') : undefined;
  return pinner && !engaged.some((e) => e.id === pinner.id) ? [...engaged, pinner] : engaged;
};

function moveTo(state: BattleState, u: Unit, to: Square) {
  u.square = to;
  for (const e of u.engines) if (e.status === 'crewed') e.square = to;
}

function leaveField(state: BattleState, u: Unit) {
  u.status = 'left';
  clearAsShooter(state, u.id);
  log(state, u, `${u.name} leaves the field.`);
}

// A troop that comes to grips with something terrible loses order for it.
function fearOnContact(state: BattleState, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.fear && !mover.fear) addDisorder(state, mover, 1, `fear of ${e.name}`);
    if (mover.fear && !e.fear) addDisorder(state, e, 1, `fear of ${mover.name}`);
  }
}

const wallKeys = (state: BattleState) => Object.entries(state.board.walls).filter(([, w]) => w.remaining > 0).map(([k]) => k);
const wallCells = (key: string) => key.split('|').map(parse);
const bordersWall = (u: Unit, key: string) => wallCells(key).some((c) => sameSquare(c, u.square));
const wallRank = (state: BattleState, u: Unit, key: string) =>
  bandRank(state, Math.min(...wallCells(key).map((c) => dist(state, u.square, c))));

const cellTarget = (id: string): RungTarget => ({ kind: 'cell', id, label: id });
const unitTarget = (u: Unit): RungTarget => ({ kind: 'unit', id: u.id, label: u.name });
const wallTarget = (key: string): RungTarget => ({ kind: 'wall', id: key, label: key.replace('|', ' / ') });

interface TargetSet { needsTarget: boolean; targets: RungTarget[] }

/** The cumulative hex reach of a Cast band: how far Engaged/Short/Medium/Long/Extreme carries,
 * the same thresholds Shooting's own bands use. Unlike a shot's Aim/Snipe (an offset window
 * either side of effective range), a spell's range is a ceiling — anything from the caster's
 * own hex out to the band counts, the way "range: 30 feet" reads on any other statblock. */
function castCeiling(state: BattleState, band: CastBand): number {
  return band === 'engaged' ? 1 : BANDS[state.board.grid][band];
}

function targetsFor(state: BattleState, u: Unit, type: LadderType, index: Grade, spell: Tree | null): TargetSet {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  switch (type) {
    case 'shoot': {
      const targets: RungTarget[] = enemies.filter((e) => inRange(shotRank(state, u, e))).map(unitTarget);
      if (u.side === 'attacker' && crewedArtillery(state, u)) {
        targets.push(...wallKeys(state).filter((k) => inRange(wallRank(state, u, k))).map(wallTarget));
      }
      return { needsTarget: true, targets };
    }
    case 'fight': {
      const targets: RungTarget[] = engagedEnemies(state, u).map(unitTarget);
      if (u.side === 'attacker') targets.push(...wallKeys(state).filter((k) => bordersWall(u, k)).map(wallTarget));
      return { needsTarget: true, targets };
    }
    case 'guard':
      return { needsTarget: false, targets: [] };
    case 'rally': {
      if (rungOf('rally', index).rally!.scope !== 'adjacent') return { needsTarget: false, targets: [] };
      const allies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active'
        && dist(state, a.square, u.square) === 1);
      return { needsTarget: false, targets: allies.map(unitTarget) };
    }
    case 'cast': {
      const tree = spell!;
      // The offer's own targets are a superset: the graphical menu only ever pushes effect
      // (see `RungAction.axis`), so range never actually extends, but a direct `act()` call
      // may still push range — `doCastAction` re-checks the real band once the axis is known,
      // the same way `perform`'s own shoot case re-checks a rung's band and logs "falls short".
      const ceiling = castCeiling(state, bandOut(TREE_RANGE[tree], index - 1));
      const wants = TREE_TARGET[tree];
      const pool = wants === 'enemy' ? enemies : state.units.filter((a) => a.side === u.side && a.status === 'active');
      const inRangeOf = (t: Unit) => t.id === u.id || dist(state, t.square, u.square) <= ceiling;
      return { needsTarget: true, targets: pool.filter((t) => (wants === 'enemy' ? t.id !== u.id : true) && inRangeOf(t)).map(unitTarget) };
    }
  }
}

/** Fight, Shoot and a Blast are the one attack an activation gets. Everything else may be
 * repeated; a second attack was the thing that broke the pacing. */
const isAttack = (type: LadderType, spell: Tree | null) =>
  type === 'fight' || type === 'shoot' || (type === 'cast' && spell === 'blast');

/**
 * Cast's own price: an activity costs its own index, capped by how far the caster's tradition
 * may ever reach in that tree (0 meaning no access, section 11). A tactic-granted tree with no
 * tradition behind it stops at the one-action activity.
 */
function castCostFor(u: Unit, tree: Tree, index: Grade): number | null {
  const cap = u.tradition ? TRADITION_TIERS[u.tradition][tree] : 1;
  return index <= cap ? index : null;
}

function rungOption(state: BattleState, u: Unit, type: LadderType, index: Grade, spell: Tree | null, blocked: string | null): RungOption {
  const rung = type === 'cast' ? castRungOf(spell!, index as CastTier) : rungOf(type, index);
  const cost = type === 'cast' ? castCostFor(u, spell!, index) : index;
  const { needsTarget, targets } = targetsFor(state, u, type, index, spell);
  let reason: string | null = blocked ?? (cost === null ? "above your tradition's reach" : null);
  if (!reason && cost !== null && cost > u.actions) reason = `needs ${cost} actions`;
  if (!reason && needsTarget && !targets.length) reason = 'no target';
  return { rung: rung.id, index, label: rung.label, detail: rung.detail, cost, legal: reason === null, reason, needsTarget, targets };
}

/** The one action a withdrawal costs before any ground bought on top of it. */
const BASE_COST = 1;

function offerFor(state: BattleState, u: Unit, type: LadderType, spell: Tree | null): ActionOffer {
  const blocked = isAttack(type, spell) && u.attacked ? 'already attacked this activation'
    : type === 'rally' && !u.disorder && !alliesWithin(state, u, 2).length ? 'no disorder to clear, and nobody near to lift'
      : null;
  const rungs = [1, 2, 3].map((i) => rungOption(state, u, type, i as Grade, spell, blocked)) as [RungOption, RungOption, RungOption];
  return {
    type, spell,
    label: spell ? TREE_LABEL[spell] : type[0].toUpperCase() + type.slice(1),
    detail: type === 'cast' ? castRungOf(spell!, 1).detail : LADDERS[type][0].detail,
    rungs,
  };
}

// The menu is filtered by situation, so it is never long.
export function availableActions(state: BattleState, unitId?: string): ActionOffer[] {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return [];
  // A routed unit is offered no ladder, a shaken one Rally alone; both still Move and withdraw.
  if (isRouted(u)) return [];
  if (isShaken(u)) return [offerFor(state, u, 'rally', null)];
  const contact = engagedEnemies(state, u).length > 0;
  const types: LadderType[] = contact ? ['fight', 'guard'] : ['shoot', 'guard'];
  // A wall is a thing to fight even when nobody defends it.
  if (!contact && u.side === 'attacker' && wallKeys(state).some((k) => bordersWall(u, k))) types.push('fight');
  // Rally is offered whether or not there is disorder to clear: with none, it is the order
  // that lifts the troop beside you.
  types.push('rally');
  const offers = types
    .filter((t) => (t === 'shoot' ? canShoot(state, u) : t === 'fight' ? u.stats.strike !== null : true))
    .map((t) => offerFor(state, u, t, null));
  for (const t of u.trees) offers.push(offerFor(state, u, 'cast', t));
  return offers;
}

interface Escape { holder: Unit; degree: Degree }

/**
 * Breaking contact. One Escape check per holder — the withdrawing unit's Reflex against that
 * enemy's own attack DC — and the four degrees are what Scatter, Break off and Fighting
 * retreat used to name. A critical failure is the one that pins the unit where it stands.
 * `distance` is the further actions spent on ground, another Speed's worth each.
 * proto: section 7 now says one check against the highest holder, read for every holder, with a
 * free Move on a critical. This still rolls per holder until the Withdraw ladder is built.
 */
function doWithdraw(state: BattleState, rng: Rng, u: Unit, action: WithdrawAction, distance: number) {
  const escapes: Escape[] = [];
  let pinned = false;
  for (const holder of holdersOf(state, u)) {
    if (u.status !== 'active') break;
    const c = check(rng, escapeModifier(u), escapeDcFor(holder, u));
    log(state, u, `${u.name} breaks from ${holder.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
    escapes.push({ holder, degree: c.degree });
    if (succeeded(c.degree)) continue;
    // A pinning shooter is not in contact, so a failed roll costs no free strike from it.
    if (holder.id !== u.pinnedBy) resolveStrike(state, rng, holder, u, { free: true, label: 'strikes the withdrawing' });
    if (c.degree !== 'critical-failure' || u.status !== 'active') continue;
    addDisorder(state, u, 1, `${holder.name}'s grip`);
    pinned = true;
  }
  if (u.status !== 'active') return;
  if (pinned) {
    log(state, u, `${u.name} cannot break contact and stays where it stands.`);
    return;
  }
  const options = withdrawTargets(state, u, distance * u.speed);
  const chosen = action.to ? options.find((sq) => notation(sq) === action.to) ?? null : options[0] ?? null;
  if (chosen) {
    moveTo(state, u, chosen);
    log(state, u, `${u.name} withdraws to ${notation(chosen)}.`);
  } else log(state, u, `${u.name} has nowhere to go and holds where it stands.`);
  follow(state, u, escapes);
  if (isRouted(u) && u.square.rank === homeRank(u.side)) leaveField(state, u);
}

/**
 * A `no-retreat` holder gives chase: one free Move of its own Speed, through the ordinary
 * terrain costs, to a cell touching wherever the withdrawal ended. It deals no damage — it
 * only keeps contact, so outrunning it is the only way clear. A critical success on the
 * Escape check shakes it off outright.
 */
function follow(state: BattleState, u: Unit, escapes: Escape[]) {
  for (const { holder, degree } of escapes) {
    if (degree === 'critical-success' || u.status !== 'active') continue;
    if (!holder.noRetreat || isShaken(holder) || !isStanding(holder) || holder.speed === 0 || holder.rooted > 0) continue;
    if (isEngaged(state, holder, u)) continue;
    const reach = reachable(state.board, holder.square, {
      budget: holder.speed, flying: holder.flying, occupied: occupiedBy(state, holder),
    });
    let best: { cell: string; feet: number } | null = null;
    for (const [cell, entry] of reach) {
      if (cell === notation(holder.square) || !touching(state, parse(cell), u)) continue;
      if (!best || entry.feet < best.feet || (entry.feet === best.feet && cell < best.cell)) best = { cell, feet: entry.feet };
    }
    if (!best) { log(state, holder, `${holder.name} cannot follow ${u.name}.`); continue; }
    moveTo(state, holder, parse(best.cell));
    log(state, holder, `${holder.name} gives no retreat and follows ${u.name} to ${best.cell}.`);
    fearOnContact(state, holder);
  }
}

/**
 * A cast's six trees (section 11). `tier` is what the cast bought on whichever one axis was
 * chosen — range, duration or effect (`axis`; Tier 1 on the other two, always). Only `effect`
 * ever changes what a tree actually does; `range` and `duration` instead widen where it lands
 * or how long it lasts, and — for Blast or Controlling only — sweeten the effect roll as a
 * consolation, per "The six trees" in rules.html.
 */
function doCastAction(state: BattleState, rng: Rng, u: Unit, tree: Tree, tier: CastTier, axis: CastAxis, action: RungAction) {
  const target = action.target ? unit(state, action.target) : u;
  const rangeTier = axis === 'range' ? tier : 1;
  const effectTier = axis === 'effect' ? tier : 1;
  const band = bandOut(TREE_RANGE[tree], rangeTier - 1);
  if (target.id !== u.id && dist(state, target.square, u.square) > castCeiling(state, band)) {
    log(state, u, `${u.name}'s ${TREE_LABEL[tree]} cannot carry to ${target.name}.`);
    return;
  }
  if (tree === 'blast') u.attacked = true;
  if (!TREE_ROLLS[tree]) {
    resolveTree(state, rng, u, target, tree, effectTier, 'success');
    return;
  }
  const effectBonus = axis === 'effect' ? (effectTier === 3 ? 2 : effectTier === 2 ? 1 : 0) : 0;
  const pushBonus = axis !== 'effect' ? (tier === 3 ? 4 : tier === 2 ? 2 : 0) : 0;
  if (tree === 'blast') {
    const c = check(rng, spellAttackModifier(u) + effectBonus + pushBonus, defenceOf(state, target, u, false));
    log(state, u, `${u.name} Blasts ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
    resolveTree(state, rng, u, target, tree, effectTier, c.degree);
    return;
  }
  // Controlling remains a resistance check: its own effect tier penalizes the target's Will,
  // while a range or duration tier raises the caster's spell DC.
  const c = check(rng, willModifier(target) - effectBonus, spellDcFor(u, pushBonus));
  log(state, target, `${target.name} resists ${u.name}'s ${TREE_LABEL[tree]}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  resolveTree(state, rng, u, target, tree, effectTier, c.degree);
}

/**
 * What a landed cast actually does, tree by tree (section 11's "The six trees" table).
 * `degree` is the caster's attack result for Blast, the target's resistance result for
 * Controlling, and a plain `'success'` for the four ally trees, which always land.
 */
function resolveTree(state: BattleState, rng: Rng, u: Unit, target: Unit, tree: Tree, effectTier: CastTier, degree: Degree) {
  switch (tree) {
    case 'blast': {
      if (!succeeded(degree)) return;
      let wounds = degree === 'critical-success' ? 2 : 1;
      if (effectTier >= 2) wounds += 1;
      applyWounds(state, rng, target, wounds, `${u.name}'s magic`, u, true);
      break;
    }
    case 'healing': {
      clearDisorder(state, target, 1, 'Healing');
      if (effectTier >= 2 && target.wounds > 0) {
        target.wounds -= 1;
        log(state, u, `${u.name} heals ${target.name}: wounds ${target.wounds}/${MAX_WOUNDS}.`);
      }
      break;
    }
    case 'controlling': {
      if (succeeded(degree)) return;
      // proto: the movement and action penalties went with their fields. Section 9's disorder
      // table is the part of Controlling that still stands, so that is what lands until Wave 9
      // builds Dread, Stun and Hold.
      addDisorder(state, target, degree === 'critical-failure' ? 2 : 1, `${u.name}'s ${TREE_LABEL[tree]}`);
      break;
    }
    // proto: Offense, Defense and Movement each become a menu of three named activities in
    // Waves 10, 11 and 12. Their old buffs went with the fields that held them, so the cast
    // carries and lands nothing in between.
    case 'offense':
    case 'defense':
    case 'movement':
      log(state, u, `${u.name}'s ${TREE_LABEL[tree]} settles on ${target.name} and does nothing yet.`);
      break;
  }
}

function perform(state: BattleState, rng: Rng, u: Unit, rung: Rung, action: RungAction) {
  switch (rung.type) {
    case 'shoot': {
      const outOfBand = (r: number) => !inRange(r);
      if (action.target && action.target.includes('|')) {
        const e = crewedArtillery(state, u);
        if (!e) { log(state, u, `${u.name} has nothing that can batter a wall from here.`); break; }
        if (outOfBand(wallRank(state, u, action.target))) { log(state, u, `${u.name}'s shot falls short of the wall.`); break; }
        e.fired = true;
        u.attacked = true;
        attackWall(state, rng, u, action.target, e.launch - u.disorder - (isWeakened(u) ? 2 : 0) + rollBonus(u), 'bombards');
        break;
      }
      const target = unit(state, action.target!);
      if (outOfBand(shotRank(state, u, target))) { log(state, u, `${u.name}'s shot falls short of ${target.name}.`); break; }
      shootAt(state, rng, u, target, rung);
      break;
    }
    case 'fight': {
      if (action.target && action.target.includes('|')) {
        const ram = crewedRam(state, u);
        if (ram) ram.fired = true;
        u.attacked = true;
        const bonus = (u.stats.strike ?? 0) - u.disorder - (isWeakened(u) ? 2 : 0) + (ram ? 2 : 0) + rollBonus(u);
        attackWall(state, rng, u, action.target, bonus, ram ? 'rams' : 'hacks at');
        break;
      }
      const target = unit(state, action.target!);
      if (!isEngaged(state, u, target)) { log(state, u, `${u.name} is not in contact with ${target.name}.`); break; }
      melee(state, rng, u, target, rung);
      break;
    }
    case 'guard': {
      const eff = rung.guard!;
      u.guard = { defence: eff.defence, cap: eff.cap, holds: eff.holds };
      // One: the rest of this activation, and no further. `finish` clears it. The Guard
      // bonus itself dies when the unit acts again, so a root outliving it would be a penalty
      // charged after the protection it paid for had already lapsed.
      if (eff.rooted) u.rooted = 1;
      const parts = [
        `+${eff.defence} Defence`,
        eff.cap ? 'criticals against it land as ordinary hits' : '',
        eff.holds ? 'holds its ground against an Overrun' : '',
        eff.rooted ? 'may not move again this activation' : '',
      ].filter(Boolean);
      log(state, u, `${u.name} ${rung.verb}: ${parts.join(', ')}.`);
      break;
    }
    case 'rally': {
      // A Quality check against the rout DC — the degree decides how much clears.
      const eff = rung.rally!;
      const c = check(rng, willModifier(u), routDcFor(state, u));
      log(state, u, `${u.name} ${rung.verb}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      const cleared = c.degree === 'critical-success' ? u.disorder
        : c.degree === 'success' ? 2 : c.degree === 'failure' ? 1 : 0;
      if (cleared) clearDisorder(state, u, cleared, rung.label.toLowerCase());
      if (c.degree === 'critical-failure') addDisorder(state, u, 1, 'a rally gone wrong');

      // proto: the ally's half of a Rally is a point of disorder cleared and nothing else
      // until Wave 4 reads the one roll for every unit reached and hands out `inspired`.
      const lift = (a: Unit) => clearDisorder(state, a, 1, `${u.name}'s example`);
      if (eff.scope === 'nearby') {
        for (const a of state.units) {
          if (a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) <= 2) lift(a);
        }
      } else if (eff.scope === 'adjacent' && action.target) {
        const ally = unit(state, action.target);
        if (dist(state, ally.square, u.square) === 1) lift(ally);
      }
      break;
    }
  }
}

const alliesWithin = (state: BattleState, u: Unit, reach: number) => state.units.filter(
  (a) => a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) <= reach,
);

/** Everything a unit's activation offers: the menu, what movement is left, and where it reaches. */
export function activation(state: BattleState, unitId?: string): Activation | null {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return null;
  return {
    unit: u.id, actions: u.actions, attacked: u.attacked, feet: u.feet, speed: u.speed,
    offers: availableActions(state, u.id),
    withdraw: withdrawOffer(state, u.id),
    moves: moveReach(state, u),
    charges: chargeTargets(state, u),
  };
}

// Everything that lasted "until this unit acts again" ends when it starts acting: its own
// Guard, the exposure a critical miss left it with, and the protections cast over it. A
// suppression or a pin ends on its shooter's activation instead, so those are cleared on
// whoever named this unit.
function begin(state: BattleState, u: Unit) {
  if (state.begun && state.active === u.id) return;
  state.active = u.id;
  state.begun = true;
  u.actions = ACTIONS_PER_ACTIVATION;
  u.attacked = false;
  u.feet = 0;
  u.guard = null;
  u.exposed = false;
  u.ward = false;
  u.stoneskin = false;
  u.aegis = null;
  if (u.stunned) {
    u.actions -= 1;
    u.stunned = false;
    log(state, u, `${u.name} is stunned: one fewer action this activation.`);
  }
  clearAsShooter(state, u.id);
}

// What was laid on the unit's next activation is spent by this one and cleared at the end.
function finish(state: BattleState, u: Unit) {
  u.actions = ACTIONS_PER_ACTIVATION;
  u.attacked = false;
  u.feet = 0;
  u.rooted = Math.max(0, u.rooted - 1);
  u.haste = Math.max(0, u.haste - 1);
  u.inspired = false;
  u.frightened = false;
  u.sureStrike = false;
  u.wrath = false;
  u.sureFooting = false;
  u.flies = false;
  state.activated.push(u.id);
  state.lastSide = u.side;
  state.active = null;
  state.begun = false;
  const next = nextSide(state);
  if (next === null) endRound(state);
  else state.pending = next;
}

/**
 * Stop here with actions unspent — also the pass, since a unit that has done nothing may end
 * too. Naming the unit guards against ending the next one's activation when an action has
 * already finished this one.
 */
export function endActivation(input: BattleState, unitId?: string): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = activeUnit(state);
  if (!u) throw new Error('no unit is activating');
  if (unitId && u.id !== unitId) throw new Error(`${unitId} is not activating`);
  finish(state, u);
  refreshEmplacements(state);
  return state;
}

function doRung(state: BattleState, rng: Rng, u: Unit, action: RungAction): number {
  const offer = availableActions(state, u.id).find((o) => o.type === action.type && o.spell === (action.spell ?? null));
  if (!offer) throw new Error(`${action.type} is not available to ${u.name}`);
  const opt = offer.rungs[action.rung - 1];
  if (!opt || !opt.legal) throw new Error(`${offer.label} ${action.rung} is not available to ${u.name}${opt?.reason ? ` — ${opt.reason}` : ''}`);
  if (opt.needsTarget && !opt.targets.some((t) => t.id === action.target)) {
    throw new Error(`${action.target ?? 'nothing'} is not a target for ${opt.label}`);
  }
  const price = opt.cost!;
  if (price > u.actions) throw new Error(`${opt.label} needs ${price} actions`);
  if (price > 1) log(state, u, `${u.name} commits ${price} actions to ${opt.label}.`);
  if (offer.type === 'cast') doCastAction(state, rng, u, offer.spell!, action.rung as CastTier, action.axis ?? 'effect', action);
  else perform(state, rng, u, rungOf(offer.type, action.rung), action);
  return price;
}

/**
 * Every rung that can act on one board object, grouped by its offer — the one answer to
 * "what can this unit do to *that*", and the only thing the popups read. A rung that names no
 * target of its own (Guard, and Rally's own unit) belongs to the acting unit's own piece,
 * which is where its popup opens.
 */
export function offersAt(state: BattleState, target: TargetRef, unitId?: string): TargetOffer[] {
  const u = unitId ? state.units.find((x) => x.id === unitId) : activeUnit(state);
  if (!u) return [];
  const own = target.kind === 'unit' && target.id === u.id;
  const out: TargetOffer[] = [];
  for (const offer of availableActions(state, u.id)) {
    const rungs = offer.rungs.filter((o) => o.legal
      && (o.targets.some((t) => t.kind === target.kind && t.id === target.id) || (own && !o.needsTarget)));
    if (rungs.length) out.push({ offer, rungs });
  }
  return out;
}

/** Withdraw is offered in contact, and to a shaken unit whichever way it faces. */
export function withdrawOffer(state: BattleState, unitId?: string): WithdrawOffer | null {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return null;
  const holders = holdersOf(state, u);
  if (!holders.length && !isShaken(u)) return null;
  const extra = u.speed > 0 && u.rooted === 0 ? Math.max(0, u.actions - BASE_COST) : 0;
  return {
    cost: BASE_COST,
    extra,
    modifier: escapeModifier(u),
    escapes: holders.map((e) => ({ unit: e.id, name: e.name, dc: escapeDcFor(e, u), follows: e.noRetreat })),
    targets: withdrawTargets(state, u, extra * u.speed).map((sq) => cellTarget(notation(sq))),
  };
}

function doWithdrawAction(state: BattleState, rng: Rng, u: Unit, action: WithdrawAction): number {
  const offer = withdrawOffer(state, u.id);
  if (!offer) throw new Error(`${u.name} has nothing to withdraw from`);
  const distance = Math.max(0, Math.trunc(action.distance ?? 0));
  if (distance > offer.extra) throw new Error(`${u.name} has only ${offer.extra} action${offer.extra === 1 ? '' : 's'} to put on distance`);
  if (action.to && !offer.targets.some((t) => t.id === action.to)) throw new Error(`${u.name} cannot withdraw to ${action.to}`);
  if (action.to && !withdrawTargets(state, u, distance * u.speed).some((sq) => notation(sq) === action.to)) {
    throw new Error(`${action.to} is further than ${distance} committed action${distance === 1 ? '' : 's'} carries ${u.name}`);
  }
  doWithdraw(state, rng, u, action, distance);
  return offer.cost + distance;
}

const spendMovement = (u: Unit, m: { feet: number; actions: number }) => {
  u.feet += m.actions * u.speed - m.feet;
};

function doStride(state: BattleState, u: Unit, action: MoveAction): number {
  const m = moveReach(state, u).get(action.to);
  if (!m) throw new Error(`${u.name} cannot reach ${action.to}`);
  spendMovement(u, m);
  moveTo(state, u, parse(action.to));
  log(state, u, `${u.name} strides to ${action.to} — ${m.feet} ft, ${m.actions} action${m.actions === 1 ? '' : 's'}.`);
  fearOnContact(state, u);
  return m.actions;
}

// A Charge is not a rung: it is the movement it takes, plus the Fight activity's own price —
// a Strike unless the action names another.
function doCharge(state: BattleState, rng: Rng, u: Unit, action: ChargeAction): number {
  const foe = unit(state, action.target);
  if (u.stats.strike === null) throw new Error(`${u.name} has no melee`);
  if (u.attacked) throw new Error(`${u.name} has already attacked this activation`);
  const option = approach(state, u, foe, moveReach(state, u));
  if (!option) throw new Error(`${u.name} cannot reach ${foe.name}`);
  const wanted = action.rung ?? 1;
  const cost = option.actions + wanted;
  if (cost > u.actions) throw new Error(`${u.name} has too few actions to charge ${foe.name}`);
  spendMovement(u, option);
  moveTo(state, u, parse(option.cell));
  log(state, u, `${u.name} charges ${foe.name} — ${option.feet} ft to ${option.cell}.`);
  fearOnContact(state, u);
  if (u.status !== 'active' || !isEngaged(state, u, foe)) {
    log(state, u, `${u.name}'s charge finds nobody.`);
    return option.actions;
  }
  melee(state, rng, u, foe, rungOf('fight', wanted));
  return cost;
}

export function act(input: BattleState, action: Action, rng: Rng): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = action.unit ? unit(state, action.unit) : activeUnit(state);
  if (!u) throw new Error('no unit can act');
  if (u.side !== state.pending || state.activated.includes(u.id) || u.status !== 'active') {
    throw new Error(`${u.name} cannot activate now`);
  }
  if (state.begun && state.active !== u.id) throw new Error('an activation is already under way');
  begin(state, u);
  const cost = action.type === 'move' ? doStride(state, u, action)
    : action.type === 'withdraw' ? doWithdrawAction(state, rng, u, action)
      : action.type === 'charge' ? doCharge(state, rng, u, action)
        : doRung(state, rng, u, action);
  u.actions -= cost;
  if (u.actions <= 0 || u.status !== 'active') finish(state, u);
  refreshEmplacements(state);
  return state;
}

const standing = (state: BattleState, side: Side) => state.units.filter((u) => u.side === side && isStanding(u));

function endRound(state: BattleState) {
  log(state, null, `End of round ${state.round}.`);
  for (const side of ['attacker', 'defender'] as Side[]) {
    if (state.halfChecked[side]) continue;
    const lost = state.units.filter((u) => u.side === side && !isStanding(u)).length;
    if (lost * 2 >= state.startingCount[side]) {
      state.halfChecked[side] = true;
      log(state, null, `Half of the ${side}'s army is gone; the line wavers.`);
      for (const u of standing(state, side)) addDisorder(state, u, 1, 'half the army gone');
    }
  }
  for (const u of state.units) for (const e of u.engines) e.fired = false;
  for (const e of state.engines) e.fired = false;
  seizeEmplacements(state);
  const a = standing(state, 'attacker').length;
  const d = standing(state, 'defender').length;
  if (a === 0 || d === 0) {
    state.phase = 'ended';
    state.endedBy = 'rout';
    state.winner = a === 0 && d === 0 ? 'draw' : a === 0 ? 'defender' : 'attacker';
    log(state, null, state.winner === 'draw' ? 'Both armies are spent. The field is empty.' : `The ${state.winner} holds the field.`);
    captureEngines(state);
    return;
  }
  if (state.round >= LAST_ROUND) {
    state.phase = 'ended';
    state.endedBy = 'dusk';
    state.winner = 'draw';
    log(state, null, 'Dusk falls. Both armies withdraw and the ground stays contested.');
    return;
  }
  state.round += 1;
  state.activated = [];
  state.active = null;
  state.begun = false;
  state.pending = nextSide(state) ?? state.pending;
  log(state, null, `Round ${state.round} begins.`);
}

/**
 * An emplacement left with only the enemy beside it changes hands at the end of the round.
 * A friendly still standing by holds it, however outnumbered — the engine is taken by
 * standing on it, not by winning a fight over it.
 */
function seizeEmplacements(state: BattleState) {
  for (const e of state.engines) {
    if (crewOf(state, e)) continue;
    const captor = state.units.find((c) => c.side !== e.side && isStanding(c) && dist(state, c.square, e.square) <= 1);
    if (!captor) continue;
    e.side = captor.side;
    e.status = 'crewed';
    e.fired = true;
    log(state, captor, `${captor.name} takes the ${e.name} on ${notation(e.square)}.`);
  }
}

function captureEngines(state: BattleState) {
  for (const u of state.units) {
    for (const e of u.engines) {
      if (e.status !== 'abandoned') continue;
      const captor = state.units.find((c) => c.side !== u.side && isStanding(c) && dist(state, c.square, e.square) <= 1);
      if (captor) {
        e.status = 'captured';
        log(state, captor, `${captor.name} captures the ${e.name}.`);
      }
    }
  }
}
