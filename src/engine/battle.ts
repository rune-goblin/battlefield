import {
  at, barrierBetween, deployRanks, edgeKey, gridOf, notation, parse, SIZE,
  type Board, type Square, type Wall,
} from './board.js';
import { cardTraits, deriveStats, paceOf, speedOf, type SiegeEngineCard, type UnitCard } from './cards.js';
import { CELL_FEET, pathTo, reachable, stepFeet, type ReachMap, type StepOpts } from './path.js';
import { check, readCheck, readTwice, rollTwice, succeeded, type CheckResult, type Degree } from './check.js';
import {
  VERBS, qualityFor, activityOf, treesFor,
  type ActivityIndex, type Verb, type Activity,
} from './ladders.js';
import {
  castActivityOf, TRADITION_CAP, TREE_LABEL, TREE_RANGE, TREE_TARGET, type Tree,
} from './magic.js';
import type { Rng } from './rng.js';
import { levelDc } from './tables.js';
import {
  ACTION_BONUS, ACTIONS_PER_ACTIVATION, BANDS, LAST_ROUND, MAX_WOUNDS, REACH_RANK,
  type Action, type ActionOffer, type Activation, type BattleState, type ChargeAction,
  type ChargeOption, type EngineState, type MoveAction, type MoveReach, type PathStep,
  type Range, type ActivityAction, type ActivityOption, type ActivityTarget, type Side,
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
      trees: treesFor(d.card), castTrees: [],
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

/** A barrier breaks contact: neither a cliff nor a standing wall holds engagement (section 10),
 * so a unit beside one Moves and shoots as if the enemy over it were a hex further off. */
export function isEngaged(state: BattleState, a: Unit, b: Unit): boolean {
  if (a.side === b.side || a.status !== 'active' || b.status !== 'active') return false;
  if (dist(state, a.square, b.square) !== 1) return false;
  return barrierBetween(state.board, a.square, b.square) === null;
}

export const engagedEnemies = (state: BattleState, u: Unit) =>
  state.units.filter((e) => isEngaged(state, u, e));

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

/** The one place a d20 is actually thrown: every roll a unit makes — a Strike, a shot, a
 * save, Rally — goes through here so `inspired` is spent exactly once, on the roll it
 * bonused, and not on every later call that only reads `rollBonus` to show a number. */
export function roll(state: BattleState, rng: Rng, u: Unit, modifier: number, dc: number): CheckResult {
  const c = check(rng, modifier, dc);
  u.inspired = false;
  return c;
}

/** Every attack roll — a Strike, a shot, a swing at a wall — goes through here, not `roll`
 * directly, so Sure strike and Ward can send it to `rollTwice` without skipping `roll`'s own
 * `inspired` spend. Both flags are consumed by the roll they touch, so a Ward and a Sure
 * strike on the same attack cancel to the one plain roll below rather than two doubled ones.
 * A null target is a wall segment: it has a Defence of sorts but no ward to read. */
export function attackRoll(state: BattleState, rng: Rng, attacker: Unit, target: Unit | null, modifier: number, dc: number): CheckResult {
  const sureStrike = attacker.sureStrike;
  const ward = target?.ward ?? false;
  attacker.sureStrike = false;
  if (target) target.ward = false;
  if (sureStrike === ward) return roll(state, rng, attacker, modifier, dc);
  attacker.inspired = false;
  const c = rollTwice(rng, modifier, dc, sureStrike);
  log(state, attacker, sureStrike
    ? `${attacker.name} rolls twice under sure strike and keeps the better: ${c.rolls[0]} and ${c.rolls[1]}.`
    : `${target!.name}'s ward rolls the attack twice and keeps the worse: ${c.rolls[0]} and ${c.rolls[1]}.`);
  return c;
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

/** What a target rolls its Will save against: the caster's own spell DC (section 11). */
export const spellDcFor = (u: Unit) => u.stats.spellDc ?? 0;

/** Healing's roll: a caster's spell attack, or battlefield medicine's own Will where the troop
 * casting has none (section 11). */
const healingModifier = (u: Unit) => (u.stats.spellAttack === null ? willModifier(u) : spellAttackModifier(u));

/** Controlling's DC: a caster's spell DC, or demoralize's own level DC where the troop casting
 * has none (section 11). */
const controllingDc = (u: Unit) => (u.stats.spellDc === null ? levelDc(u.level) : spellDcFor(u));

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
 * The one step between a hit rolled and a wound taken. Dig in, Take cover and Stoneskin all cap
 * the hit at a single wound, so a critical lands as an ordinary one.
 */
export function reduceWounds(target: Unit, n: number): number {
  return target.guard?.cap || target.stoneskin ? Math.min(n, 1) : n;
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
 * disorder simply lands. `saveShift` bends it — a charge from above is −2 on it.
 */
function applyWounds(state: BattleState, rng: Rng, target: Unit, raw: number, source: string, attacker: Unit, pressed = false, saveShift = 0): number {
  const n = reduceWounds(target, raw);
  if (n < raw) log(state, target, target.stoneskin && !target.guard?.cap
    ? `${target.name}'s stoneskin caps the critical at one wound.`
    : `${target.name} has dug in: the critical lands as an ordinary hit.`);
  if (n <= 0) return 0;
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  const mark = target.wounds >= MAX_WOUNDS ? 'destroyed' : isBroken(target) ? 'Broken' : isWeakened(target) ? 'Weakened' : '';
  log(state, target, `${target.name} takes ${n} wound${n > 1 ? 's' : ''} from ${source} (${target.wounds}/${MAX_WOUNDS})${mark ? ` — ${mark}` : ''}.`);
  if (attacker.wrath) {
    attacker.wrath = false;
    target.persistent = { dc: levelDc(attacker.level) };
    log(state, target, `${target.name} is marked by ${attacker.name}'s wrath: 1 more wound at the end of its next activation.`);
  }
  if (target.wounds >= MAX_WOUNDS) { target.status = 'destroyed'; abandonEngines(state, target); clearAsShooter(state, target.id); return n; }
  if (target.stoneskin) {
    log(state, target, `${target.name}'s stoneskin costs it no disorder.`);
  } else if (pressed) {
    addDisorder(state, target, 1, 'a pressed hit, no save');
  } else {
    const c = roll(state, rng, target, fortitudeModifier(target) + saveShift, levelDc(attacker.level));
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

// Never set while disorder stands (`inspired`'s own invariant), so every call site already
// checks that before reaching here; a unit already inspired just keeps its one bonus.
function inspire(state: BattleState, u: Unit) {
  if (u.inspired) return;
  u.inspired = true;
  log(state, u, `${u.name} is inspired: +2 to its next roll.`);
}

/**
 * Aegis's own roll, ahead of any attack roll — a Strike, a shot, a Blast, a charge's Fight, a
 * free strike: the attacker's Will against the caster's spell DC. Unlike Ward, it is not
 * consumed here — it stands until the target's own `begin`, so it gates every attack against
 * the target before then, not only the first.
 */
function attackGate(state: BattleState, rng: Rng, attacker: Unit, target: Unit): boolean {
  if (!target.aegis) return true;
  const c = roll(state, rng, attacker, willModifier(attacker), target.aegis.dc);
  log(state, attacker, `${attacker.name} tests ${target.name}'s aegis: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (succeeded(c.degree)) return true;
  log(state, attacker, `${attacker.name}'s attack is wasted against the aegis.`);
  return false;
}

interface StrikeOpts { free?: boolean; pressed?: boolean; bonus?: number; saveShift?: number; label: string }

// `null` means Aegis wasted the whole attempt: no roll, no wound, nothing for `melee` to read.
function resolveStrike(state: BattleState, rng: Rng, u: Unit, target: Unit, opts: StrikeOpts): Degree | null {
  if (!attackGate(state, rng, u, target)) return null;
  const c = attackRoll(state, rng, u, target, strikeModifier(state, u, target) + (opts.bonus ?? 0), defenceOf(state, target, u, false));
  log(state, u, `${u.name} ${opts.label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const rolled = c.degree === 'critical-success' ? (opts.free ? 1 : 2) : c.degree === 'success' ? 1 : 0;
  applyWounds(state, rng, target, rolled, u.name, u, opts.pressed ?? false, opts.saveShift ?? 0);
  // A charger is exposed already, so the critical miss has nothing left to take.
  if (c.degree === 'critical-failure' && !opts.free && !u.exposed) {
    u.exposed = true;
    log(state, u, `${u.name} is exposed (−2 Defence) until it acts again.`);
  }
  return c.degree;
}

/** What a charge carries into the Fight: `bonus` on the attack roll, `saveShift` on the
 * target's save against the wound, and `impact` — a cavalry charge's hit needs no save, so a
 * Strike lands as a Press and a Press as an Overrun, at the price paid. */
export interface MeleeOpts { bonus?: number; saveShift?: number; impact?: boolean }

// A Fight is one roll, one way. A hit wounds, and the target's Fortitude save decides its
// disorder; a miss repulses the attacker, whose Will save against the target's level DC
// decides its own. The activity adds no number to the roll: Press skips the target's save, and
// Overrun drives it back a hex besides.
function melee(state: BattleState, rng: Rng, u: Unit, target: Unit, activity: Activity, opts: MeleeOpts = {}) {
  const eff = activity.fight!;
  const impact = opts.impact ?? false;
  const drive = eff.drive || (impact && eff.press);
  u.attacked = true;
  const degree = resolveStrike(state, rng, u, target, {
    pressed: eff.press || impact, bonus: opts.bonus, saveShift: opts.saveShift, label: activity.verb,
  });
  if (degree === null) return;
  if (succeeded(degree)) {
    if (drive && u.status === 'active') giveGround(state, u, target);
    return;
  }
  const c = roll(state, rng, u, willModifier(u), levelDc(target.level));
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
  // Section 8 blocks the shove on water, a wall or a cliff with no flier exception at all, and
  // the target spends no action of its own giving ground — Fly buys only its next activation
  // (`follow` already reads a holder's native `flying` alone for the same reason), so an unspent
  // Fly does not open a hex here either. A native flier still shrugs the shove off anywhere.
  const away = grid(state).beyond(u.square, ground);
  if (!away || !enterable(state, ground, away, { flying: target.flying })) {
    log(state, target, `${target.name} has nowhere to give ground and is crushed against it.`);
    addDisorder(state, target, 1, 'nowhere to give ground');
    return;
  }
  moveTo(state, target, away);
  moveTo(state, u, ground);
  log(state, u, `${u.name} drives ${target.name} back to ${notation(away)} and takes ${notation(ground)}.`);
}

function shootAt(state: BattleState, rng: Rng, u: Unit, target: Unit, activity: Activity) {
  const e = crewedArtillery(state, u);
  const source = e ? `${u.name}'s ${e.name}` : `${u.name}'s volley`;
  u.attacked = true;
  if (!attackGate(state, rng, u, target)) return;
  const c = attackRoll(state, rng, u, target, shootModifier(state, u, target), defenceOf(state, target, u, true));
  if (e) e.fired = true;
  log(state, u, `${u.name} ${activity.verb} at ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  applyWounds(state, rng, target, c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0, source, u);
  const eff = activity.shoot!;
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
  // A wall swing is the activation's one attack like any other, so Sure strike is spent here
  // rather than surviving to the unit's next Strike.
  const c = attackRoll(state, rng, u, null, modifier, wallDc(state, wall));
  log(state, u, `${u.name} ${verb} the wall ${key}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const hits = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
  if (!hits) return;
  wall.remaining = Math.max(0, wall.remaining - hits);
  log(state, u, wall.remaining ? `The wall holds ${wall.remaining}/${wall.boxes}.` : `The wall at ${key} is breached.`);
}

/** How this unit pays for ground: a native flier and Fly are the same thing, and Sure footing
 * flattens every price short of water. */
const groundFor = (u: Unit): StepOpts => ({ flying: u.flying || u.flies, surefooted: u.sureFooting });

/** Whether `u` could stand on `sq` unassisted: section 7 gives a native flier free run of
 * anywhere, but Fly only "crosses" water (section 11) — it never says a unit ends its move
 * there, and `finish` strips the buff, so a unit that ends its Move or Translocate on water
 * with only an unspent Fly would be grounded in a river with no way out. */
const canEndOn = (u: Unit, board: Board, sq: Square) =>
  u.flying || !u.flies || at(board, sq).terrain !== 'water';

const enterable = (state: BattleState, from: Square, to: Square, opts: StepOpts) =>
  !unitAt(state, to) && Number.isFinite(stepFeet(state.board, from, to, opts));

const occupiedBy = (state: BattleState, u: Unit) =>
  new Set(state.units.filter((o) => o.status === 'active' && o.id !== u.id).map((o) => notation(o.square)));

/** Feet the unit may still spend: what earlier Move actions banked, plus what the rest buy. */
export const movementBudget = (u: Unit) => Math.max(0, u.feet + u.actions * u.speed);

// Movement pools across the activation rather than being lost at the end of each Stride, so a
// swamp cell at 30 ft stays enterable by a 25 ft troop over two actions.
export const moveActionsFor = (u: Unit, feet: number) =>
  feet <= u.feet ? 0 : Math.ceil((feet - u.feet) / u.speed);

// Shared by moveReach and movePath: the one Stride ever asks the same question, "how far does
// this budget carry, and through what". Where it may end is a separate question, asked after.
const strideReach = (state: BattleState, u: Unit): ReachMap =>
  reachable(state.board, u.square, { budget: movementBudget(u), ...groundFor(u), occupied: occupiedBy(state, u) });

/** Every cell the unit can still Stride to, what it costs in feet, and in Move actions. */
export function moveReach(state: BattleState, u: Unit): Map<string, MoveReach> {
  const out = new Map<string, MoveReach>();
  if (u.speed === 0 || u.rooted > 0 || u.pinnedBy || u.actions <= 0 || u.status !== 'active') return out;
  // A unit in contact leaves by withdrawing, which is its own verb and its own price.
  if (engagedEnemies(state, u).length) return out;
  const reach = strideReach(state, u);
  const home = notation(u.square);
  for (const [key, entry] of reach) {
    if (key === home || !canEndOn(u, state.board, parse(key))) continue;
    out.set(key, { feet: entry.feet, actions: moveActionsFor(u, entry.feet) });
  }
  return out;
}

/** The route to `to`, the unit's own cell first, with the cost of each step — including a hex
 * a flier only crosses. `moveReach`'s map holds destinations, not the road between them, so a
 * cheapest route that runs through a hex the unit may not stop on would otherwise break the
 * walk back; this asks `reachable` directly instead of the destinations that were filtered
 * from it. Empty when `to` is not itself a legal destination. */
export function movePath(state: BattleState, u: Unit, to: string): PathStep[] {
  if (!moveReach(state, u).has(to)) return [];
  const reach = strideReach(state, u);
  return pathTo(reach, to).map((cell) => {
    const feet = reach.get(cell)!.feet;
    return { cell, feet, actions: moveActionsFor(u, feet) };
  });
}

/** Contact from a hex the unit has yet to reach: a charge's landing hex, a pursuer's. Reads the
 * edge the way `isEngaged` does, so neither one comes to grips over a wall or a cliff. */
const touching = (state: BattleState, sq: Square, e: Unit) =>
  dist(state, sq, e.square) === 1 && barrierBetween(state.board, sq, e.square) === null;

/** A charge is one action of movement however far it carries, and that action buys two Speeds
 * at the ordinary terrain prices — the discount the verb sells. */
const CHARGE_ACTIONS = 1;
const CHARGE_SPEEDS = 2;

/** Every cell the run can end on. Empty for a unit that may not charge at all: one in contact
 * (that is a Fight), pinned, rooted, or with nothing left to spend. */
function chargeReach(state: BattleState, u: Unit): ReachMap {
  if (u.status !== 'active' || u.speed === 0 || u.rooted > 0 || u.pinnedBy) return new Map();
  if (u.actions <= 0 || engagedEnemies(state, u).length) return new Map();
  return reachable(state.board, u.square, {
    budget: CHARGE_SPEEDS * u.speed, ...groundFor(u), occupied: occupiedBy(state, u),
  });
}

/**
 * The +2, unless every way in crossed rough going or climbed for it. Section 7 gives the charge
 * "any path the movement allows", so the cheapest route the run was priced on does not decide
 * this: a second search that bans rough ground and climbs outright says whether a clean way in
 * existed. Sure footing turns rough ground open and keeps the +2 wherever the run went; flight
 * only makes the ground cheap, and a flier that crossed forest has crossed forest.
 */
function chargeBonus(state: BattleState, u: Unit, cell: string): number {
  if (u.sureFooting) return ACTION_BONUS;
  const even = reachable(state.board, u.square, {
    budget: CHARGE_SPEEDS * u.speed, ...groundFor(u), evenGround: true, occupied: occupiedBy(state, u),
  });
  return even.has(cell) ? ACTION_BONUS : 0;
}

// proto: the landing hex is the cheapest one touching the target, so a charge whose cheapest
// contact hex can only be reached over rough ground still loses a +2 it could have kept by
// coming in on the far side. Where to land is the player's choice and no offer carries it yet.
/** The cheapest cell within reach from which `u` can fight `e`. */
function approach(state: BattleState, u: Unit, e: Unit, reach: ReachMap): ChargeOption | null {
  let best: ChargeOption | null = null;
  for (const [cell, entry] of reach) {
    if (!touching(state, parse(cell), e) || !canEndOn(u, state.board, parse(cell))) continue;
    if (!best || entry.feet < best.feet || (entry.feet === best.feet && cell < best.cell)) {
      best = { unit: e.id, cell, feet: entry.feet, actions: CHARGE_ACTIONS };
    }
  }
  return best;
}

/** Enemies this unit can both reach and afford the melee against. */
export function chargeTargets(state: BattleState, u: Unit): ChargeOption[] {
  if (u.stats.strike === null || u.attacked) return [];
  const reach = chargeReach(state, u);
  const out: ChargeOption[] = [];
  for (const e of state.units.filter((x) => x.side !== u.side && x.status === 'active')) {
    const option = approach(state, u, e, reach);
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
    .filter((n) => enterable(state, u.square, n, groundFor(u)) && canEndOn(u, state.board, n))
    .map(notation));
  if (feet > 0 && u.speed > 0) {
    const reach = reachable(state.board, u.square, { budget: feet, ...groundFor(u), occupied: occupiedBy(state, u) });
    for (const key of reach.keys()) {
      const sq = parse(key);
      if (sameSquare(sq, u.square) || !canEndOn(u, state.board, sq)) continue;
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

// proto: reads the piece even when another unit fired it and the crew pinned with its own
// Volley, so the escape DC can say launch + 10 for a shot that rolled Volley.
/** What a shot off this unit rolls: a crewed artillery piece stands in for a Volley the crew
 * may not have, loaded or not — a pinning crew holds its target with the shot it already made. */
const volleyOf = (state: BattleState, u: Unit) => {
  const e = enginesOf(state, u).find((x) => x.status === 'crewed' && x.kind === 'artillery');
  return e ? e.launch : (u.stats.volley ?? 0);
};

/** The DC to break from a holder: its attack DC, its strike bonus plus ten — or, for a pinning
 * shooter, its Volley plus ten, since nobody is in contact to strike. */
export const escapeDcFor = (state: BattleState, holder: Unit, target: Unit) =>
  (holder.id === target.pinnedBy ? volleyOf(state, holder) : (holder.stats.strike ?? 0)) + 10;

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

const cellTarget = (id: string): ActivityTarget => ({ kind: 'cell', id, label: id });
const unitTarget = (u: Unit): ActivityTarget => ({ kind: 'unit', id: u.id, label: u.name });
const wallTarget = (key: string): ActivityTarget => ({ kind: 'wall', id: key, label: key.replace('|', ' / ') });

interface TargetSet { needsTarget: boolean; targets: ActivityTarget[] }

/** How far a tree's own range carries, in hexes: the same thresholds Shooting's bands use. A
 * spell's range is a ceiling — anything from the caster's own hex out to the band counts, the
 * way "range: 30 feet" reads on any other statblock. */
function castCeiling(state: BattleState, tree: Tree): number {
  const band = TREE_RANGE[tree];
  return band === 'engaged' ? 1 : BANDS[state.board.grid][band];
}

// proto: a shape is offered as one target, its hexes joined by '+', so the aim popup needs no
// multi-select. `blast` splits it again at resolution.
const shapeId = (shape: Square[]) => shape.map(notation).sort().join('+');

const enemiesIn = (state: BattleState, u: Unit, shape: Square[]) => state.units.filter(
  (e) => e.side !== u.side && e.status === 'active' && shape.some((c) => sameSquare(c, e.square)),
);

/** Every pair of hexes a Line may cover: two adjacent hexes on one straight line out from the
 * caster, the further of them second, both in range. */
function lineShapes(state: BattleState, u: Unit, ceiling: number): Square[][] {
  const g = grid(state);
  const out: Square[][] = [];
  for (const a of g.cells()) {
    const near = dist(state, u.square, a);
    if (near < 1 || near > ceiling) continue;
    for (const b of g.neighbours(a)) {
      const far = dist(state, u.square, b);
      if (far !== near + 1 || far > ceiling) continue;
      if (g.collinear(u.square, a, b)) out.push([a, b]);
    }
  }
  return out;
}

/** Every trio of hexes a Burst may cover: the three that meet at one corner of the grid, all
 * of them in range. */
function burstShapes(state: BattleState, u: Unit, ceiling: number): Square[][] {
  const g = grid(state);
  const seen = new Set<string>();
  const out: Square[][] = [];
  for (const c of g.cells()) {
    if (dist(state, u.square, c) > ceiling) continue;
    for (const shape of g.corners(c)) {
      if (shape.some((x) => dist(state, u.square, x) > ceiling)) continue;
      const key = shapeId(shape);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(shape);
    }
  }
  return out;
}

/** Missile names the enemy itself, as every other attack does; Line and Burst name a shape. */
function blastTargets(state: BattleState, u: Unit, index: ActivityIndex, ceiling: number): ActivityTarget[] {
  if (index === 1) {
    return state.units
      .filter((e) => e.side !== u.side && e.status === 'active' && dist(state, e.square, u.square) <= ceiling)
      .map(unitTarget);
  }
  const shapes = index === 2 ? lineShapes(state, u, ceiling) : burstShapes(state, u, ceiling);
  return shapes
    .map((shape) => ({ shape, caught: enemiesIn(state, u, shape) }))
    .filter(({ caught }) => caught.length > 0)
    .map(({ shape, caught }) => ({ kind: 'cell' as const, id: shapeId(shape), label: caught.map((e) => e.name).join(', ') }));
}

const healPool = (state: BattleState, u: Unit): Unit[] => [
  u, ...state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) === 1),
];

function combinations<T>(pool: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (pool.length < size) return [];
  const [head, ...rest] = pool;
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)];
}

/** Every group Soothe, Heal or Restore may reach: the caster and its adjacent allies, `index`
 * at a time. Heaviest need first, so the cheapest legal row (`activityOption`'s own pick) lands on
 * the group that most wants it. */
function healTargets(state: BattleState, u: Unit, index: ActivityIndex): ActivityTarget[] {
  const need = (t: Unit) => t.disorder + t.wounds;
  return combinations(healPool(state, u), index)
    .sort((a, b) => b.reduce((n, t) => n + need(t), 0) - a.reduce((n, t) => n + need(t), 0))
    .map((group) => ({ kind: 'unit' as const, id: group.map((t) => t.id).sort().join('+'), label: group.map((t) => t.name).join(', ') }));
}

/** A hex a unit may be set down in: empty, and ground it could stand on — water holds nobody
 * but a native flier. */
const standable = (state: BattleState, u: Unit, sq: Square) =>
  !unitAt(state, sq) && canEndOn(u, state.board, sq);

// proto: the pair is one target, the ally's own hex and the hex it lands on joined by '+', so
// the aim popup needs no second pick — the same shape a Blast's Line uses. Touching either hex
// finds it, and touching one that several pairs share lands on the first of them.
/** Every placement Translocate offers: each ally, and each empty hex within that ally's own
 * Speed of it, whatever lies between. */
function translocateTargets(state: BattleState, allies: Unit[]): ActivityTarget[] {
  const g = grid(state);
  const out: ActivityTarget[] = [];
  for (const a of allies) {
    const hexes = Math.floor(a.speed / CELL_FEET);
    for (const sq of g.cells()) {
      const away = dist(state, a.square, sq);
      if (away < 1 || away > hexes || !standable(state, a, sq)) continue;
      out.push({ kind: 'cell', id: `${notation(a.square)}+${notation(sq)}`, label: `${a.name} to ${notation(sq)}` });
    }
  }
  return out;
}

function targetsFor(state: BattleState, u: Unit, type: Verb, index: ActivityIndex, spell: Tree | null): TargetSet {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  switch (type) {
    case 'shoot': {
      const targets: ActivityTarget[] = enemies.filter((e) => inRange(shotRank(state, u, e))).map(unitTarget);
      if (u.side === 'attacker' && crewedArtillery(state, u)) {
        targets.push(...wallKeys(state).filter((k) => inRange(wallRank(state, u, k))).map(wallTarget));
      }
      return { needsTarget: true, targets };
    }
    case 'fight': {
      const targets: ActivityTarget[] = engagedEnemies(state, u).map(unitTarget);
      if (u.side === 'attacker') targets.push(...wallKeys(state).filter((k) => bordersWall(u, k)).map(wallTarget));
      return { needsTarget: true, targets };
    }
    case 'guard':
      return { needsTarget: false, targets: [] };
    case 'rally': {
      if (activityOf('rally', index).rally!.scope !== 'adjacent') return { needsTarget: false, targets: [] };
      const allies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active'
        && dist(state, a.square, u.square) === 1);
      return { needsTarget: false, targets: allies.map(unitTarget) };
    }
    case 'cast': {
      const tree = spell!;
      const ceiling = castCeiling(state, tree);
      if (tree === 'blast') return { needsTarget: true, targets: blastTargets(state, u, index, ceiling) };
      if (tree === 'healing') return { needsTarget: true, targets: healTargets(state, u, index) };
      const pool = TREE_TARGET[tree] === 'enemy' ? enemies
        : state.units.filter((a) => a.side === u.side && a.status === 'active');
      const inReach = pool.filter((t) => dist(state, t.square, u.square) <= ceiling);
      if (tree === 'movement' && index === 3) return { needsTarget: true, targets: translocateTargets(state, inReach) };
      return { needsTarget: true, targets: inReach.map(unitTarget) };
    }
  }
}

/** Fight, Shoot and a Blast are the one attack an activation gets. Everything else may be
 * repeated; a second attack was the thing that broke the pacing. */
const isAttack = (type: Verb, spell: Tree | null) =>
  type === 'fight' || type === 'shoot' || (type === 'cast' && spell === 'blast');

/**
 * Cast's own price: an activity costs its own index, capped by how far the caster's tradition
 * may ever reach in that tree (0 meaning no access, section 11). A tactic-granted tree with no
 * tradition behind it stops at the one-action activity.
 */
function castCostFor(u: Unit, tree: Tree, index: ActivityIndex): number | null {
  const cap = u.tradition ? TRADITION_CAP[u.tradition][tree] : 1;
  return index <= cap ? index : null;
}

function activityOption(state: BattleState, u: Unit, type: Verb, index: ActivityIndex, spell: Tree | null, blocked: string | null): ActivityOption {
  const activity = type === 'cast' ? castActivityOf(spell!, index) : activityOf(type, index);
  const cost = type === 'cast' ? castCostFor(u, spell!, index) : index;
  const { needsTarget, targets } = targetsFor(state, u, type, index, spell);
  let reason: string | null = blocked ?? (cost === null ? "above your tradition's reach" : null);
  if (!reason && cost !== null && cost > u.actions) reason = `needs ${cost} actions`;
  if (!reason && needsTarget && !targets.length) reason = 'no target';
  return { activity: activity.id, index, label: activity.label, detail: activity.detail, cost, legal: reason === null, reason, needsTarget, targets };
}

function offerFor(state: BattleState, u: Unit, type: Verb, spell: Tree | null): ActionOffer {
  const blocked = isAttack(type, spell) && u.attacked ? 'already attacked this activation'
    : spell && u.castTrees.includes(spell) ? 'already cast this activation' : null;
  const activities = [1, 2, 3].map((i) => activityOption(state, u, type, i as ActivityIndex, spell, blocked)) as [ActivityOption, ActivityOption, ActivityOption];
  return {
    type, spell,
    label: spell ? TREE_LABEL[spell] : type[0].toUpperCase() + type.slice(1),
    detail: type === 'cast' ? castActivityOf(spell!, 1).detail : VERBS[type][0].detail,
    activities,
  };
}

// The menu is filtered by situation, so it is never long.
export function availableActions(state: BattleState, unitId?: string): ActionOffer[] {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return [];
  // A routed unit is offered no verb, a shaken one Rally alone; both still Move and withdraw.
  if (isRouted(u)) return [];
  if (isShaken(u)) return [offerFor(state, u, 'rally', null)];
  const contact = engagedEnemies(state, u).length > 0;
  const types: Verb[] = contact ? ['fight', 'guard'] : ['shoot', 'guard'];
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

/** Withdraw's three activities. No table in `ladders.ts` holds them — Withdraw is not one of
 * the five verbs a menu offers — but they are priced and read like any other: cost is index. */
const WITHDRAW: { id: string; label: string; detail: string }[] = [
  {
    id: 'break-off', label: 'Break off',
    detail: 'One Disengage check against the highest holder. A success takes you one hex clear; a critical adds a free Move of your Speed and throws off every pursuer. A failure lets each holder whose grip the roll missed strike free, one wound at most; a critical failure adds 1 disorder and you stay.',
  },
  {
    id: 'disengage', label: 'Disengage',
    detail: 'No check and no free strike: you are one hex clear. Each holder rolls Reflex against your level DC instead, and one that fails is rooted on its next activation and does not follow.',
  },
  {
    id: 'fighting-retreat', label: 'Fighting retreat',
    detail: 'Disengage, and a holder that fails its roll takes 1 disorder as well, drawn out of its line.',
  },
];

/** What the withdrawal did: whether the unit leaves its hex, whether a free Move carries it
 * further than one, and which holders are still on its heels. */
interface Break { leaves: boolean; far: boolean; chasers: Unit[] }

/**
 * Break contact. The activity decides who rolls: at Break off the withdrawing unit rolls to get
 * away, above it the enemy left holding air rolls instead.
 */
function doWithdraw(state: BattleState, rng: Rng, u: Unit, action: WithdrawAction) {
  const holders = holdersOf(state, u);
  // Read before anything moves: breaking away clears the pin, and a pinning shooter never chases.
  const chasers = holders.filter((h) => h.noRetreat && h.id !== u.pinnedBy);
  const result = action.activity === 1
    ? breakOff(state, rng, u, holders, chasers)
    : disengage(state, rng, u, holders, chasers, action.activity === 3);
  if (u.status !== 'active') return;
  if (!result.leaves) {
    log(state, u, `${u.name} cannot break contact and stays where it stands.`);
    return;
  }
  withdrawTo(state, u, action.to, result.far);
  follow(state, u, result.chasers);
  if (isRouted(u) && u.square.rank === homeRank(u.side)) leaveField(state, u);
}

/**
 * One Disengage check, however many enemies hold the unit: Reflex against the highest attack DC
 * among them. The same roll is then read against each holder's own DC, so a grip it cleared
 * lands no free strike even when the highest one held.
 */
function breakOff(state: BattleState, rng: Rng, u: Unit, holders: Unit[], chasers: Unit[]): Break {
  if (!holders.length) return { leaves: true, far: false, chasers: [] };
  const dc = Math.max(...holders.map((h) => escapeDcFor(state, h, u)));
  const c = roll(state, rng, u, escapeModifier(u), dc);
  log(state, u, `${u.name} breaks off: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (succeeded(c.degree)) {
    const clean = c.degree === 'critical-success';
    if (clean && chasers.length) log(state, u, `${u.name} is away clean: ${chasers.map((h) => h.name).join(' and ')} cannot keep up.`);
    return { leaves: true, far: clean, chasers: clean ? [] : chasers };
  }
  for (const h of holders) {
    if (u.status !== 'active') break;
    // A pinning shooter stands at range, so no grip of its own lands a blow.
    if (h.id === u.pinnedBy) continue;
    if (succeeded(readCheck(c.roll, c.modifier, escapeDcFor(state, h, u)).degree)) continue;
    resolveStrike(state, rng, h, u, { free: true, label: 'strikes the withdrawing' });
  }
  if (u.status !== 'active') return { leaves: false, far: false, chasers: [] };
  if (c.degree !== 'critical-failure') return { leaves: true, far: false, chasers };
  addDisorder(state, u, 1, 'a grip that held');
  return { leaves: false, far: false, chasers: [] };
}

/**
 * The unit simply goes. Every holder rolls its own Reflex against the withdrawing unit's level
 * DC to keep hold of it, and one that fails is left rooted where it stands — and, at Fighting
 * retreat, drawn out of its line for a point of disorder.
 */
function disengage(state: BattleState, rng: Rng, u: Unit, holders: Unit[], chasers: Unit[], fighting: boolean): Break {
  const passed = new Set<string>();
  for (const h of holders) {
    const c = roll(state, rng, h, escapeModifier(h), levelDc(u.level));
    log(state, h, `${h.name} keeps hold of ${u.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
    if (succeeded(c.degree)) { passed.add(h.id); continue; }
    h.rooted = 1;
    log(state, h, `${h.name} is left holding air: no Move, Charge or Withdraw on its next activation.`);
    if (fighting) addDisorder(state, h, 1, `${u.name}'s fighting retreat`);
  }
  return { leaves: true, far: false, chasers: chasers.filter((h) => passed.has(h.id)) };
}

// proto: a `to` the break cannot carry to lands on whichever legal cell lies nearest it, so a
// short break still goes the way the player pointed.
/**
 * One hex clear of everything that held the unit — or, on a critical Break off, anywhere a free
 * Move of its Speed reaches.
 */
function withdrawTo(state: BattleState, u: Unit, to: string | undefined, far: boolean) {
  const options = withdrawTargets(state, u, far ? u.speed : 0);
  if (!options.length) {
    log(state, u, `${u.name} has nowhere to go and holds where it stands.`);
    return;
  }
  const g = grid(state);
  const wanted = to ? parse(to) : null;
  const chosen = !wanted ? options[0]
    : options.find((sq) => sameSquare(sq, wanted))
      ?? options.reduce((best, sq) => (g.distance(sq, wanted) < g.distance(best, wanted) ? sq : best));
  moveTo(state, u, chosen);
  log(state, u, `${u.name} withdraws to ${notation(chosen)}${far ? ' — a free Move on the clean break' : ''}.`);
  // Section 7: the unit is clear of everything that held it, and any further ground is an
  // ordinary Move. A pin that survived the break would leave it stuck one hex over.
  if (u.pinnedBy) {
    const pinner = state.units.find((e) => e.id === u.pinnedBy);
    u.pinnedBy = null;
    log(state, u, `${u.name} is out from under ${pinner ? `${pinner.name}'s` : 'the'} pin.`);
  }
}

/**
 * A `no-retreat` holder gives chase: one free Move of its own Speed, through the ordinary
 * terrain costs, to a cell touching wherever the withdrawal ended. It deals no damage — it
 * only keeps contact, so outrunning it is the only way clear.
 */
function follow(state: BattleState, u: Unit, chasers: Unit[]) {
  for (const holder of chasers) {
    if (u.status !== 'active') return;
    if (isShaken(holder) || !isStanding(holder) || holder.speed === 0 || holder.rooted > 0) continue;
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

/** One cast: the tree is spent for this activation, and its own case resolves it. */
function doCastAction(state: BattleState, rng: Rng, u: Unit, tree: Tree, index: ActivityIndex, action: ActivityAction) {
  u.castTrees.push(tree);
  resolveTree(state, rng, u, tree, index, action);
}

/** The one unit an ally tree or a Controlling cast lands on, or null when it is out of range. */
function castTarget(state: BattleState, u: Unit, tree: Tree, action: ActivityAction): Unit | null {
  const target = action.target ? unit(state, action.target) : u;
  if (target.id !== u.id && dist(state, target.square, u.square) > castCeiling(state, tree)) {
    log(state, u, `${u.name}'s ${TREE_LABEL[tree]} cannot carry to ${target.name}.`);
    return null;
  }
  return target;
}

/**
 * Blast, the activation's one attack: one spell attack, read against the Defence of the enemy
 * in each hex of the shape. A hit is 1 wound, a critical 2, and the wound asks the Fortitude
 * save as any other does.
 */
function blast(state: BattleState, rng: Rng, u: Unit, index: ActivityIndex, action: ActivityAction) {
  const activity = castActivityOf('blast', index);
  const shape = index === 1 ? [unit(state, action.target!).square] : action.target!.split('+').map(parse);
  const caught = enemiesIn(state, u, shape);
  u.attacked = true;
  log(state, u, `${u.name} casts ${activity.label} on ${shape.map(notation).join(', ')}.`);
  const modifier = spellAttackModifier(u);
  // Every aegis in the shape gates the cast, and one failure wastes the whole activity,
  // "actions and all" — the rule reads on the activity, not on the hex that carries it.
  for (const target of caught) if (!attackGate(state, rng, u, target)) return;
  const sureStrike = u.sureStrike;
  const warded = new Set(caught.filter((t) => t.ward).map((t) => t.id));
  u.sureStrike = false;
  for (const t of caught) t.ward = false;
  // The shape's one attack, thrown once, plus the second die Sure strike or a ward in the shape
  // asks for. Each unit reads the pair its own way against its own Defence: better under sure
  // strike, worse under a ward of its own, and the first die alone when the two cancel. Only the
  // die `roll` throws carries; the DC it takes goes nowhere, since each hex reads its own below.
  const first = roll(state, rng, u, modifier, defenceOf(state, caught[0], u, false)).roll;
  const second = sureStrike || warded.size ? rng.d20() : null;
  if (second !== null) {
    log(state, u, `${activity.label} is thrown twice, ${first} and ${second}: ${sureStrike
      ? 'sure strike keeps the better, and a warded hex reads the first alone'
      : 'a warded hex keeps the worse, and the rest read the first'}.`);
  }
  for (const target of caught) {
    const dc = defenceOf(state, target, u, false);
    const c = second !== null && sureStrike !== warded.has(target.id)
      ? readTwice([first, second], modifier, dc, sureStrike)
      : readCheck(first, modifier, dc);
    log(state, u, `${activity.label} catches ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
    const wounds = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
    applyWounds(state, rng, target, wounds, `${u.name}'s ${activity.label}`, u);
  }
}

/** The critical's "one more thing": end the first condition present, pinned through persistent
 * damage — an order this wave fixes, since rules.html lists the six in prose, not by priority. */
function endCondition(state: BattleState, target: Unit): boolean {
  if (target.pinnedBy) {
    const pinner = state.units.find((e) => e.id === target.pinnedBy);
    target.pinnedBy = null;
    log(state, target, `${target.name} is healed clear of ${pinner ? `${pinner.name}'s` : 'the'} pin.`);
    return true;
  }
  if (target.rooted > 0) {
    target.rooted = 0;
    log(state, target, `${target.name} is healed clear of root.`);
    return true;
  }
  if (target.suppressedBy) {
    target.suppressedBy = null;
    log(state, target, `${target.name} is healed clear of suppression.`);
    return true;
  }
  if (target.exposed) {
    target.exposed = false;
    log(state, target, `${target.name} is healed clear of exposure.`);
    return true;
  }
  if (target.frightened) {
    target.frightened = false;
    log(state, target, `${target.name} is healed clear of fright.`);
    return true;
  }
  if (target.persistent) {
    target.persistent = null;
    log(state, target, `${target.name} is healed clear of the persistent wound.`);
    return true;
  }
  return false;
}

function healWound(state: BattleState, target: Unit) {
  if (target.wounds <= 0) return;
  target.wounds -= 1;
  log(state, target, `${target.name} is healed: wounds ${target.wounds}/${MAX_WOUNDS}.`);
}

/** One unit a Healing roll reaches, read against its own level DC. */
function healOne(state: BattleState, target: Unit, degree: Degree) {
  if (degree === 'critical-failure') return;
  clearDisorder(state, target, 1, 'Healing');
  if (degree === 'failure') return;
  healWound(state, target);
  if (degree === 'success') return;
  if (!endCondition(state, target)) healWound(state, target);
}

/** Translocate, the one buff that happens at cast time: the ally is set down whatever lies
 * between, and the leap is none of its own actions. No check, and no free strike from anything
 * it was in contact with. */
function translocate(state: BattleState, u: Unit, label: string, action: ActivityAction) {
  const [home, landing] = (action.target ?? '').split('+');
  const ally = unitAt(state, parse(home));
  if (!ally || !landing) { log(state, u, `${u.name}'s ${label} finds nobody to move.`); return; }
  const held = engagedEnemies(state, ally).length > 0;
  log(state, u, `${u.name} casts ${label} on ${ally.name}.`);
  moveTo(state, ally, parse(landing));
  log(state, ally, `${ally.name} is set down on ${landing}${held ? ', out of contact with nothing to strike it' : ''}.`);
  fearOnContact(state, ally);
}

/**
 * What a cast does, tree by tree (section 11). Each tree owns its own targets, its own roll
 * and its own effect; `index` is the activity bought, which is also its price.
 */
function resolveTree(state: BattleState, rng: Rng, u: Unit, tree: Tree, index: ActivityIndex, action: ActivityAction) {
  switch (tree) {
    case 'blast':
      blast(state, rng, u, index, action);
      break;
    case 'healing': {
      const targets = action.target!.split('+').map((id) => unit(state, id));
      const activity = castActivityOf('healing', index);
      log(state, u, `${u.name} casts ${activity.label} on ${targets.map((t) => t.name).join(', ')}.`);
      const modifier = healingModifier(u);
      const cast = roll(state, rng, u, modifier, levelDc(targets[0].level));
      for (const target of targets) {
        const c = readCheck(cast.roll, modifier, levelDc(target.level));
        log(state, u, `${activity.label} reaches ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
        healOne(state, target, c.degree);
      }
      break;
    }
    case 'controlling': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      const c = roll(state, rng, target, willModifier(target), controllingDc(u));
      log(state, target, `${target.name} resists ${u.name}'s ${TREE_LABEL[tree]}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      if (c.degree === 'critical-success') break;
      if (c.degree === 'success') {
        target.frightened = true;
        log(state, target, `${target.name} is frightened: −1 to every roll and to Defence until the end of its next activation.`);
        break;
      }
      addDisorder(state, target, c.degree === 'critical-failure' ? 2 : 1, `${u.name}'s ${TREE_LABEL[tree]}`);
      if (index >= 2) {
        target.stunned = true;
        log(state, target, `${target.name} is stunned: one action fewer on its next activation.`);
      }
      if (index >= 3) {
        target.rooted = 1;
        log(state, target, `${target.name} is held: rooted on its next activation.`);
      }
      break;
    }
    case 'offense': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      const activity = castActivityOf('offense', index);
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`);
      if (index === 1) {
        if (target.sureStrike) { log(state, target, `${target.name} is already rolling its next attack twice.`); break; }
        target.sureStrike = true;
        log(state, target, `${target.name} rolls its next attack twice and takes the better.`);
      } else if (index === 2) {
        target.wrath = true;
        log(state, target, `${target.name}'s next hit will leave persistent damage.`);
      } else {
        if (target.haste > 0) { log(state, target, `${target.name} is already hasted.`); break; }
        target.haste = 2;
        // `begin` is what deals the extra action, and on a self-cast it has already run, so the
        // first of the two is handed over here; this activation's `finish` spends it like any
        // other. A delta, never a total: a stun still subtracts from it.
        if (target.id === u.id) {
          u.actions += 1;
          log(state, target, `${target.name} is hasted: an extra action at once, and one on its next activation.`);
        } else {
          log(state, target, `${target.name} is hasted: an extra action on each of its next two activations.`);
        }
      }
      break;
    }
    case 'defense': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      const activity = castActivityOf('defense', index);
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`);
      if (index === 1) {
        if (target.ward) { log(state, target, `${target.name} is already warded.`); break; }
        target.ward = true;
        log(state, target, `${target.name}'s next attack rolls twice and the attacker takes the worse.`);
      } else if (index === 2) {
        if (target.stoneskin) { log(state, target, `${target.name} already has stoneskin.`); break; }
        target.stoneskin = true;
        log(state, target, `${target.name} has stoneskin: every hit caps at one wound and costs no disorder.`);
      } else {
        if (target.aegis) { log(state, target, `${target.name} is already under an aegis.`); break; }
        target.aegis = { dc: spellDcFor(u) };
        log(state, target, `${target.name} is under an aegis: an attacker must beat Will DC ${target.aegis.dc} or waste the attempt.`);
      }
      break;
    }
    case 'movement': {
      const activity = castActivityOf('movement', index);
      if (index === 3) { translocate(state, u, activity.label, action); break; }
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`);
      if (index === 1) {
        target.sureFooting = true;
        log(state, target, `${target.name} has sure footing: every hex costs it 1 on its next activation, and a charge through rough ground still lands its +2.`);
      } else {
        target.flies = true;
        log(state, target, `${target.name} flies on its next activation: 1 a hex, across water, cliffs and standing walls.`);
      }
      break;
    }
  }
}

function perform(state: BattleState, rng: Rng, u: Unit, activity: Activity, action: ActivityAction) {
  switch (activity.type) {
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
      shootAt(state, rng, u, target, activity);
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
      melee(state, rng, u, target, activity);
      break;
    }
    case 'guard': {
      const eff = activity.guard!;
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
      log(state, u, `${u.name} ${activity.verb}: ${parts.join(', ')}.`);
      break;
    }
    case 'rally': {
      // One roll, d20 + Will vs the rallying unit's own rout DC, read for every unit reached:
      // Steady is u alone, Rally adds one adjacent ally, Inspire every ally within 2.
      const eff = activity.rally!;
      const reached: Unit[] = [u];
      if (eff.scope === 'adjacent' && action.target) {
        const ally = unit(state, action.target);
        if (dist(state, ally.square, u.square) === 1) reached.push(ally);
      } else if (eff.scope === 'nearby') {
        reached.push(...alliesWithin(state, u, 2));
      }
      const c = roll(state, rng, u, willModifier(u), routDcFor(state, u));
      log(state, u, `${u.name} ${activity.verb}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      for (const a of reached) {
        // Critical success reads "if none is left" (after the 2-point clear); a plain success
        // reads "if it has none" (before the roll) — a unit sitting at exactly 1 disorder
        // clears to 0 on a success without being inspired, only on a critical.
        if (c.degree === 'critical-success') {
          clearDisorder(state, a, 2, activity.label.toLowerCase());
          if (a.disorder === 0) inspire(state, a);
        } else if (c.degree === 'success') {
          if (a.disorder > 0) clearDisorder(state, a, 1, activity.label.toLowerCase());
          else inspire(state, a);
        }
      }
      if (c.degree === 'critical-failure') addDisorder(state, u, 1, 'a rally gone wrong');
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
  // The hasted total is set before the stun subtracts, so the two compose (4 − 1 = 3) instead
  // of a later write to `actions` silently overwriting the stun.
  u.actions = ACTIONS_PER_ACTIVATION + (u.haste > 0 ? 1 : 0);
  u.attacked = false;
  u.feet = 0;
  u.castTrees = [];
  u.guard = null;
  u.exposed = false;
  u.ward = false;
  u.stoneskin = false;
  u.aegis = null;
  if (u.haste > 0) log(state, u, `${u.name} is hasted: one extra action this activation.`);
  if (u.stunned) {
    u.actions -= 1;
    u.stunned = false;
    log(state, u, `${u.name} is stunned: one fewer action this activation.`);
  }
  clearAsShooter(state, u.id);
}

/** Wrath's wound, waiting on the target's own `finish`. Its DC was fixed when the hit landed,
 * so no attacker is needed here — only the mark. */
function landPersistent(state: BattleState, rng: Rng, target: Unit) {
  const dc = target.persistent!.dc;
  target.persistent = null;
  if (target.status !== 'active') return;
  const n = reduceWounds(target, 1);
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  const mark = target.wounds >= MAX_WOUNDS ? 'destroyed' : isBroken(target) ? 'Broken' : isWeakened(target) ? 'Weakened' : '';
  log(state, target, `${target.name} takes 1 wound from persistent damage (${target.wounds}/${MAX_WOUNDS})${mark ? ` — ${mark}` : ''}.`);
  if (target.wounds >= MAX_WOUNDS) { target.status = 'destroyed'; abandonEngines(state, target); clearAsShooter(state, target.id); return; }
  if (target.stoneskin) {
    log(state, target, `${target.name}'s stoneskin costs it no disorder.`);
    return;
  }
  const c = roll(state, rng, target, fortitudeModifier(target), dc);
  log(state, target, `${target.name} braces against the persistent wound: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (!succeeded(c.degree)) addDisorder(state, target, 1, 'a persistent wound');
}

// What was laid on the unit's next activation is spent by this one and cleared at the end.
function finish(state: BattleState, rng: Rng, u: Unit) {
  u.actions = ACTIONS_PER_ACTIVATION;
  u.attacked = false;
  u.feet = 0;
  u.rooted = Math.max(0, u.rooted - 1);
  u.haste = Math.max(0, u.haste - 1);
  // The persistent wound lands before the clears below: its Fortitude save is a roll of this
  // activation, so `inspired` bonuses it and is spent by it, and `frightened` still costs its −1.
  if (u.persistent) landPersistent(state, rng, u);
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
export function endActivation(input: BattleState, rng: Rng, unitId?: string): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = activeUnit(state);
  if (!u) throw new Error('no unit is activating');
  if (unitId && u.id !== unitId) throw new Error(`${unitId} is not activating`);
  // A pass is an activation. `act` is the only other caller of `begin`, so without this a unit
  // that ends its turn having done nothing would carry its guard, its stun and every spell laid
  // on it into the activation it next acts in.
  if (!state.begun) begin(state, u);
  finish(state, rng, u);
  refreshEmplacements(state);
  return state;
}

function doActivity(state: BattleState, rng: Rng, u: Unit, action: ActivityAction): number {
  const offer = availableActions(state, u.id).find((o) => o.type === action.type && o.spell === (action.spell ?? null));
  if (!offer) throw new Error(`${action.type} is not available to ${u.name}`);
  const opt = offer.activities[action.activity - 1];
  if (!opt || !opt.legal) throw new Error(`${offer.label} ${action.activity} is not available to ${u.name}${opt?.reason ? ` — ${opt.reason}` : ''}`);
  if (opt.needsTarget && !opt.targets.some((t) => t.id === action.target)) {
    throw new Error(`${action.target ?? 'nothing'} is not a target for ${opt.label}`);
  }
  const price = opt.cost!;
  if (price > u.actions) throw new Error(`${opt.label} needs ${price} actions`);
  if (price > 1) log(state, u, `${u.name} commits ${price} actions to ${opt.label}.`);
  if (offer.type === 'cast') doCastAction(state, rng, u, offer.spell!, action.activity, action);
  else perform(state, rng, u, activityOf(offer.type, action.activity), action);
  return price;
}

/**
 * Every activity that can act on one board object, grouped by its offer — the one answer to
 * "what can this unit do to *that*", and the only thing the popups read. A activity that names no
 * target of its own (Guard, and Rally's own unit) belongs to the acting unit's own piece,
 * which is where its popup opens.
 */
// proto: Line, Burst, Heal and Restore arrive as one target holding several parts joined by
// '+' (`d3+d4`, `u1+u2`). A touch on a cell resolves to `{kind:'unit'}` when something stands
// there (`applyProp`), so a shape target is found by the touched unit's own square as well as
// by a bare cell id; touching any one part finds the whole target.
export function targetMatches(state: BattleState, t: ActivityTarget, ref: TargetRef): boolean {
  const parts = t.id.split('+');
  if (t.kind === ref.kind) return parts.includes(ref.id);
  if (t.kind !== 'cell' || ref.kind !== 'unit') return false;
  const found = state.units.find((x) => x.id === ref.id);
  return found !== undefined && parts.includes(notation(found.square));
}

export function offersAt(state: BattleState, target: TargetRef, unitId?: string): TargetOffer[] {
  const u = unitId ? state.units.find((x) => x.id === unitId) : activeUnit(state);
  if (!u) return [];
  const own = target.kind === 'unit' && target.id === u.id;
  const out: TargetOffer[] = [];
  for (const offer of availableActions(state, u.id)) {
    const activities = offer.activities.filter((o) => o.legal
      && (o.targets.some((t) => targetMatches(state, t, target)) || (own && !o.needsTarget)));
    if (activities.length) out.push({ offer, activities });
  }
  return out;
}

/** Withdraw is offered in contact, and to a shaken unit whichever way it faces. A rooted unit
 * is offered nothing: no Move, no Charge and no Withdraw while the root stands. */
export function withdrawOffer(state: BattleState, unitId?: string): WithdrawOffer | null {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active' || u.rooted > 0) return null;
  const holders = holdersOf(state, u);
  if (!holders.length && !isShaken(u)) return null;
  const activities = ([1, 2, 3] as ActivityIndex[]).map((index): ActivityOption => {
    const w = WITHDRAW[index - 1];
    // Above Break off the holders are the ones who roll, so with none there is nothing to buy.
    const reason = index > u.actions ? `needs ${index} actions`
      : index > 1 && !holders.length ? 'nothing holds you' : null;
    return {
      activity: w.id, index, label: w.label, detail: w.detail, cost: index,
      legal: reason === null, reason, needsTarget: false, targets: [],
    };
  }) as [ActivityOption, ActivityOption, ActivityOption];
  return {
    activities,
    modifier: escapeModifier(u),
    dc: Math.max(0, ...holders.map((h) => escapeDcFor(state, h, u))),
    holders: holders.map((h) => ({
      unit: h.id, name: h.name, dc: escapeDcFor(state, h, u),
      pinning: h.id === u.pinnedBy, follows: h.noRetreat && h.id !== u.pinnedBy,
    })),
    targets: withdrawTargets(state, u, u.speed).map((sq) => cellTarget(notation(sq))),
  };
}

function doWithdrawAction(state: BattleState, rng: Rng, u: Unit, action: WithdrawAction): number {
  const offer = withdrawOffer(state, u.id);
  if (!offer) throw new Error(`${u.name} has nothing to withdraw from`);
  const option = offer.activities[action.activity - 1];
  if (!option) throw new Error(`${u.name} has no withdrawal ${action.activity}`);
  if (!option.legal) throw new Error(`${u.name} cannot ${option.label.toLowerCase()}: ${option.reason}`);
  if (action.to && !offer.targets.some((t) => t.id === action.to)) throw new Error(`${u.name} cannot withdraw to ${action.to}`);
  doWithdraw(state, rng, u, action);
  return action.activity;
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

// A Charge is not an activity: it is one action of movement, plus the Fight activity's own price —
// a Strike unless the action names another. The run's leftover feet never bank.
function doCharge(state: BattleState, rng: Rng, u: Unit, action: ChargeAction): number {
  const foe = unit(state, action.target);
  if (u.stats.strike === null) throw new Error(`${u.name} has no melee`);
  if (u.attacked) throw new Error(`${u.name} has already attacked this activation`);
  const reach = chargeReach(state, u);
  const option = approach(state, u, foe, reach);
  if (!option) throw new Error(`${u.name} cannot reach ${foe.name}`);
  const wanted = action.activity ?? 1;
  const cost = CHARGE_ACTIONS + wanted;
  if (cost > u.actions) throw new Error(`${u.name} has too few actions to charge ${foe.name}`);
  const bonus = chargeBonus(state, u, option.cell);
  // Read from the hex the charge starts in, whatever hex it ends on.
  const saveShift = elevation(state, u) > at(state.board, foe.square).elevation ? -ACTION_BONUS : 0;
  const impact = u.tactics.includes('cavalry-charge');
  moveTo(state, u, parse(option.cell));
  const carried = [
    bonus ? `+${bonus} on the Fight` : 'no +2: the going was rough',
    saveShift ? `${foe.name}'s save is at −${ACTION_BONUS}, charged from above` : '',
    impact ? 'the impact needs no save' : '',
  ].filter(Boolean);
  log(state, u, `${u.name} charges ${foe.name} — ${option.feet} ft to ${option.cell}, ${carried.join(', ')}.`);
  u.exposed = true;
  log(state, u, `${u.name} is exposed (−2 Defence) until it acts again.`);
  fearOnContact(state, u);
  if (u.status !== 'active' || !isEngaged(state, u, foe)) {
    log(state, u, `${u.name}'s charge finds nobody.`);
    return CHARGE_ACTIONS;
  }
  melee(state, rng, u, foe, activityOf('fight', wanted), { bonus, saveShift, impact });
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
        : doActivity(state, rng, u, action);
  u.actions -= cost;
  if (u.actions <= 0 || u.status !== 'active') finish(state, rng, u);
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
