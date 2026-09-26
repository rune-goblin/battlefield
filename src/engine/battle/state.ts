import type { AbilityMark, AbilityOutcome } from '../abilities.js';
import { exploitBonus, shieldBonus, type AbilityContext } from '../ability-effects.js';
import { wallsFor } from '../walls.js';
import { coverBetween, wallCoverBetween, isMountain } from '../sight.js';
import { TERRAIN, TERRAIN_NOTE } from '../terrain.js';
import { at, barrierBetween, gridOf, sameCell, SIZE, type Square } from '../board.js';
import { check, rollTwice, type CheckResult } from '../check.js';
import { canFocus } from '../ladders.js';
import { SHOOTER_CONDITIONS, resetConditions } from '../conditions.js';
import type { Rng } from '../rng.js';
import { levelDc } from '../tables.js';
import { isTargetRef } from '../targets.js';
import {
  ACTION_BONUS, BANDS, REACH_RANK, ROUTED_AT, opponent, type BattleState, type ChargeAction, type Range,
  type ActivityAction, type Side, type TargetRef, type Unit, type LogTag, type CheckLanding,
} from '../types.js';

export const homeRank = (s: Side, dimension = SIZE) => (s === 'attacker' ? 0 : dimension - 1);

export const grid = (state: BattleState) => gridOf(state.board);
export const dist = (state: BattleState, a: Square, b: Square) => grid(state).distance(a, b);

export const unit = (state: BattleState, id: string): Unit => {
  const u = state.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

/** A command's target, or undefined when it names none. A client older than typed targets sends a
 * string, which is refused here rather than failing later on a missing field. */
export function checkedTarget(target: unknown): TargetRef | undefined {
  if (target == null) return undefined;
  if (!isTargetRef(target)) throw new Error('This target is no longer understood. Choose the target again.');
  return target;
}

/** The one unit a target names, for the activities that name a single unit. */
export function soleUnit(state: BattleState, ref: TargetRef | undefined): Unit {
  if (ref?.kind !== 'unit' || ref.ids.length !== 1) throw new Error('This activity names one unit as its target.');
  return unit(state, ref.ids[0]);
}

/** Every unit a group target names, in the order it names them. */
export function targetUnits(state: BattleState, ref: TargetRef | undefined): Unit[] {
  if (ref?.kind !== 'unit') throw new Error('This activity names units as its target.');
  return ref.ids.map((id) => unit(state, id));
}

/** Zero Morale routes the unit; any remaining Morale still counts as standing. */
export const isRouted = (u: Unit) => u.status === 'active' && u.disorder >= ROUTED_AT;
export const isStanding = (u: Unit) => u.status === 'active' && u.disorder < ROUTED_AT;

/** Troops in camp survive the day but never hold ground or take another activation today. */
export const isSurvivor = (u: Unit) => (u.status === 'active' || u.status === 'camp') && u.disorder < ROUTED_AT;

export type UnitOutcome = 'standing' | 'routed' | 'camp' | 'destroyed';

/** A unit that left the field counts as routed: only a routed unit walks off its home edge, and
 * a failed flee routs the unit it lets go. */
export const unitOutcome = (u: Unit): UnitOutcome =>
  u.status === 'destroyed' ? 'destroyed'
    : u.status === 'left' || u.disorder >= ROUTED_AT ? 'routed'
      : u.status === 'camp' ? 'camp' : 'standing';

const OUTCOME_LABEL: Record<UnitOutcome, string> = {
  standing: 'Standing', routed: 'Routed', camp: 'In camp', destroyed: 'Destroyed',
};

export const unitStatusLabel = (u: Unit): string => OUTCOME_LABEL[unitOutcome(u)];

export const mayActivate = (state: BattleState, u: Unit) => u.side === state.pending && u.status === 'active' && !state.activated.includes(u.id);
export const canActNow = (state: BattleState, u: Unit) => state.phase === 'battle' && isStanding(u) && mayActivate(state, u) && (!state.begun || state.active === u.id);

/** Units of `side` that may still act this round. `nextSide` asks this for a side that is
 * not yet pending, so pending is read as `side` here rather than off `state`. */
export function activatable(state: BattleState, side: Side): Unit[] {
  return state.order.map((id) => unit(state, id))
    .filter((u) => u.side === side && mayActivate({ ...state, pending: side }, u));
}

// The side with more un-activated units goes next; a tie goes to the side that did not act last.
export function nextSide(state: BattleState): Side | null {
  const a = activatable(state, 'attacker').length;
  const d = activatable(state, 'defender').length;
  if (!a && !d) return null;
  if (!a) return 'defender';
  if (!d) return 'attacker';
  if (a !== d) return a > d ? 'attacker' : 'defender';
  return opponent(state.lastSide ?? 'defender');
}

export const activeUnit = (state: BattleState): Unit | null => {
  if (state.phase !== 'battle') return null;
  if (state.active) {
    const u = unit(state, state.active);
    if (mayActivate(state, u)) return u;
  }
  return activatable(state, state.pending)[0] ?? null;
};

export const unitAt = (state: BattleState, sq: Square): Unit | undefined =>
  state.units.find((u) => u.status === 'active' && sameCell(u.square, sq));

export const square = (state: BattleState, u: Unit) => at(state.board, u.square);
export const elevation = (state: BattleState, u: Unit) => square(state, u).elevation;

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
  const b = BANDS;
  return d <= b.short ? 1 : d <= b.medium ? 2 : d <= b.long ? 3 : d <= b.extreme ? 4 : 5;
}

export function rangeBetween(state: BattleState, a: Unit, b: Unit): Range {
  if (isEngaged(state, a, b)) return 'engaged';
  return (['short', 'medium', 'long', 'extreme', 'beyond'] as const)[bandRank(state, dist(state, a.square, b.square)) - 1];
}

export const isOutflanked = (state: BattleState, u: Unit) => engagedEnemies(state, u).length >= 2;

/** What the unit's ground and position mean for it, for its status line. The conditions on it
 * are the app's to word. */
export function positionNotes(state: BattleState, u: Unit): string[] {
  const hex = at(state.board, u.square);
  const hauled = u.engines.find((e) => e.hauling);
  return [
    isMountain(state.board, u.square) ? 'mountain +1 Defence' : '',
    TERRAIN_NOTE[hex.terrain],
    hauled ? `hauling ${hauled.name}` : '',
    hex.elevation > 0 ? 'attacks +1 and shots +1 hex a level downhill' : '',
    u.flies ? 'flying' : '',
    state.phase === 'battle' && isOutflanked(state, u) ? 'outflanked' : '',
  ].filter(Boolean);
}

// A defender occupies a firing position on the interior side of an intact wall.
export function garrisoned(state: BattleState, u: Unit, target?: Unit): boolean {
  return u.side === 'defender' && wallsFor(state.board).firingPosition(u.square, target?.square);
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
  if (u.frightened || u.abilityState?.auraFear) n -= 1;
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

export function defenceOf(state: BattleState, target: Unit, attacker: Unit | null, vsVolley: boolean, ignoresCover = false, origin?: Square): number {
  // Circumstance bonuses never stack; the highest applies.
  let circumstance = Math.max(target.guard?.defence ?? 0, auraOn(state, target), shieldBonus(state, target));
  if (isMountain(state.board, target.square)) circumstance = Math.max(circumstance, 1);
  if (vsVolley && !ignoresCover && attacker) circumstance = Math.max(circumstance, coverBetween(state.board, origin ?? attacker.square, target.square), wallCoverBetween(state.board, origin ?? attacker.square, target.square));
  let penalty = target.disorder;
  const terrainPenalty = TERRAIN[square(state, target).terrain].defencePenalty;
  penalty += Math.max(terrainPenalty, isOutflanked(state, target) ? 2 : 0, target.exposed ? 2 : 0);
  if (target.suppressedBy) penalty += 2;
  if (target.frightened || target.abilityState?.auraFear) penalty += 1;
  return target.stats.defence + circumstance - penalty + exploitBonus(state, target, attacker, 'defence', vsVolley);
}

export function reachOf(state: BattleState, u: Unit): number {
  if (u.stats.volley === null || u.stats.reach === null) return 0;
  return REACH_RANK[u.stats.reach];
}

/** Will, less disorder: the Rally check, and the save a repulsed attacker makes. */
export const willModifier = (u: Unit) => u.stats.will - u.disorder + rollBonus(u);

/** What a caster rolls to Blast: its own spell attack, less disorder (section 11). */
export const spellAttackModifier = (u: Unit) => (u.stats.spellAttack ?? 0) - u.disorder + rollBonus(u);

/** What a target rolls its Will save against: the caster's own spell DC (section 11). */
export const spellDcFor = (u: Unit) => u.stats.spellDc ?? 0;

/** Healing's roll: a caster's spell attack, or battlefield medicine's own Will where the troop
 * casting has none (section 11). */
export const healingModifier = (u: Unit) => (u.stats.spellAttack === null ? willModifier(u) : spellAttackModifier(u));

/** Controlling's DC: a caster's spell DC, or demoralize's own level DC where the troop casting
 * has none (section 11). */
export const controllingDc = (u: Unit) => (u.stats.spellDc === null ? levelDc(u.level) : spellDcFor(u));

/** The level DC of the strongest enemy nearby — the highest-level enemy within close range,
 * or across the whole field if none is close. Rallying under a dragon's eye is harder than
 * rallying beside a levy. */
export function routDcFor(state: BattleState, u: Unit): number {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  const near = enemies.filter((e) => dist(state, u.square, e.square) <= BANDS.short);
  const pool = near.length ? near : enemies;
  return levelDc(Math.max(0, ...pool.map((e) => e.level)));
}

export const log =(state: BattleState, u: Unit | null, text: string, c?: CheckResult, tag?: LogTag, lands?: CheckLanding) =>
  state.log.push({ round: state.round, unit: u?.id, text, check: c, tag, lands });

export const attackOn = (target: Unit): CheckLanding => ({ unit: target.id, reads: 'attack' });

export const abilityLog = (state: BattleState): AbilityContext['log'] => (u, text, mark?: AbilityMark, outcome: AbilityOutcome = 'applied') =>
  log(state, u, text, undefined, mark && { kind: 'ability', unit: u.id, outcome, ...mark });

/** The target's Fortitude, less its own disorder, the way every other save reads it. */
export const fortitudeModifier = (u: Unit) => u.stats.fortitude - u.disorder + rollBonus(u);

// A suppression or a pin also lifts when its shooter leaves play — dead or fled fires no more.
export function clearAsShooter(state: BattleState, shooterId: string) {
  for (const o of state.units) resetConditions(o, SHOOTER_CONDITIONS.filter((key) => o[key] === shooterId));
}

/** Reflex, less disorder: what a unit rolls to leave a zone of control. */
export const escapeModifier = (u: Unit) => u.stats.reflex - u.disorder + rollBonus(u);

/** Reject malformed or unsupported commitment before any action resolves. */
export function validateFocus(action: ActivityAction | ChargeAction): number {
  const focus = action.focus ?? 0;
  if (!Number.isInteger(focus) || focus < 0 || focus > 2
    || (focus > 0 && !canFocus(action.type, 'spell' in action ? action.spell : null))) {
    throw new Error('invalid commitment: spend up to two extra actions on a supported activity');
  }
  return focus;
}
