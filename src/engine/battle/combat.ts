import { abilityMemory, exploitBonus, resolveBonus, holdsGround, attackAbilities, markOf, type AbilityContext } from '../ability-effects.js';
import { hasSight } from '../sight.js';
import { heightEdge, heightRange, TERRAIN } from '../terrain.js';
import {
  at, barrierBetween, notation, sameCell, structuralDamage, type Square, type Wall,
} from '../board.js';
import { possessive, rollLine, succeeded, successes, type Degree } from '../check.js';
import type { Activity } from '../ladders.js';
import type { Rng } from '../rng.js';
import { levelDc } from '../tables.js';
import { BANDS, REACH_RANK, ROUTED_AT, type BattleState, type Unit } from '../types.js';
import {
  grid, dist, unitAt, square, isEngaged, garrisoned, rollBonus, roll, attackRoll, defenceOf, willModifier,
  log, attackOn, abilityLog, fortitudeModifier,
} from './state.js';
import { forcedStep, nativeWaterMovement, enterable, moveTo } from './movement.js';
import { applyWounds, addDisorder, endCondition } from './wounds.js';

/** The troop weapon's preferred range band. Siege attacks have separate profiles. */
export function shootHome(state: BattleState, u: Unit): number {
  const reach = u.stats.reach;
  return reach ? REACH_RANK[reach] : 1;
}

export const canShoot = (state: BattleState, u: Unit) => u.stats.volley !== null;

const SHOT_BANDS = ['short', 'medium', 'long', 'extreme'] as const;

/** Preferred distance interval: from two hexes out to the weapon's band. */
function shootPreferred(state: BattleState, u: Unit): { min: number; max: number } {
  return { min: 2, max: BANDS[SHOT_BANDS[shootHome(state, u) - 1]] };
}

/** Weapons flex one hex past their band at −2. Only short weapons flex inward, to a target
 * across a wall at distance 1. */
export function shootCeiling(state: BattleState, u: Unit): number {
  return canShoot(state, u) ? shootPreferred(state, u).max + 1 : 0;
}
/** Hexes a shot gains downhill: one for each level the shooter stands above the target hex. */
const downhillReach = (state: BattleState, u: Unit, to: Square): number =>
  heightRange(at(state.board, shotFrom(state, u)).elevation, at(state.board, to).elevation);
export function shootFloor(state: BattleState, u: Unit): number {
  return shootHome(state, u) === 1 ? 1 : 2;
}
export function shootRangeLabel(state: BattleState, u: Unit): string {
  const preferred = shootPreferred(state, u);
  const range = preferred.min === preferred.max ? `${preferred.min}` : `${preferred.min}–${preferred.max}`;
  return `${range} hexes preferred · ${shootFloor(state, u)}–${shootCeiling(state, u)} allowed · −2 outside preferred · +1 hex a level downhill`;
}

const shotFrom = (_state: BattleState, u: Unit): Square => u.square;
const canShootCell = (state: BattleState, u: Unit, to: Square): boolean => {
  const from = shotFrom(state, u);
  const distance = dist(state, from, to);
  return distance >= shootFloor(state, u) && distance <= shootCeiling(state, u) + downhillReach(state, u, to) && hasSight(state.board, from, to);
};
export const canShootTarget = (state: BattleState, u: Unit, target: Unit): boolean =>
  !isEngaged(state, u, target) && canShootCell(state, u, target.square);
const shotRangePenalty = (state: BattleState, u: Unit, to: Square): number => {
  const distance = dist(state, shotFrom(state, u), to);
  const preferred = shootPreferred(state, u);
  return distance < preferred.min || distance > preferred.max + downhillReach(state, u, to) ? 2 : 0;
};
export const heightBetween = (state: BattleState, from: Square, to: Square): number =>
  heightEdge(at(state.board, from).elevation, at(state.board, to).elevation);
export const highGroundBonus = (state: BattleState, from: Square, to: Square): number =>
  Math.max(0, heightBetween(state, from, to));
export const uphillPenalty = (state: BattleState, from: Square, to: Square): number =>
  Math.max(0, -heightBetween(state, from, to));

export function strikeModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = (u.stats.strike ?? 0) + rollBonus(u) + exploitBonus(state, u, target, 'melee');
  m -= u.disorder;
  // The worst circumstance penalty alone: attacking uphill from a ford costs 1 once.
  m -= Math.max(TERRAIN[square(state, u).terrain].strikePenalty, uphillPenalty(state, u.square, target.square));
  m += highGroundBonus(state, u.square, target.square);
  return m;
}

/** With no target, the part a unit sheet shows: range, height, exploits and firing into a melee
 * each need a target to read. */
export function shootModifier(state: BattleState, u: Unit, target?: Unit): number {
  if (!target) return (u.stats.volley ?? 0) + rollBonus(u) - u.disorder + (garrisoned(state, u) ? 1 : 0);
  let m = (u.stats.volley ?? 0) + rollBonus(u) + exploitBonus(state, u, target, 'volley');
  m -= shotRangePenalty(state, u, target.square);
  m -= u.disorder;
  m += Math.max(highGroundBonus(state, shotFrom(state, u), target.square), garrisoned(state, u, target) ? 1 : 0);
  m -= uphillPenalty(state, shotFrom(state, u), target.square);
  if (state.units.some((a) => a.side === u.side && a.id !== u.id && isEngaged(state, target, a))) m -= 4;
  return m;
}

export function abilityContext(state: BattleState, rng: Rng, source: Unit): AbilityContext {
  return {
    log: (u, text, mark, outcome) => abilityLog(state)(u, `${u.name}: ${text}`, mark, outcome),
    will: (target, dc, ability, fear = false) => {
      const c = roll(state, rng, target, willModifier(target) + (fear ? resolveBonus(state, target) : 0), dc);
      const saved = succeeded(c.degree);
      log(state, target, rollLine(target.name, `Will save against ${possessive(source.name)} ${ability.label}`, c), c,
        { kind: 'ability', unit: target.id, outcome: saved ? 'resisted' : 'saveFailed', ...markOf(ability) });
      return saved;
    },
    regenerationSave: target => {
      const c = roll(state, rng, target, fortitudeModifier(target), levelDc(target.level));
      log(state, target, rollLine(target.name, 'Fortitude save for Regeneration', c), c);
      return succeeded(c.degree);
    },
    attack: target => {
      const modifier = source.stats.volley === null ? strikeModifier(state, source, target) : shootModifier(state, source, target);
      const c = attackRoll(state, rng, source, target, modifier, defenceOf(state, target, source, true));
      log(state, source, rollLine(source.name, `control Volley against ${target.name}`, c, 'attack'), c, undefined, attackOn(target));
      abilityMemory(source).attackUsed = true;
      return succeeded(c.degree);
    },
    clear: target => endCondition(state, target),
    move: (target, to) => moveTo(state, target, to),
    displace: (target, direction) => forcedStep(state, source.square, target, direction),
  };
}

/**
 * Aegis's own roll, ahead of any attack roll — a Strike, a shot, a Blast, a charge's Fight, a
 * free strike: the attacker's Will against the caster's spell DC. Unlike Ward, it is not
 * consumed here — it stands until the target's own `begin`, so it gates every attack against
 * the target before then, not only the first.
 */
export function attackGate(state: BattleState, rng: Rng, attacker: Unit, target: Unit): boolean {
  if (!target.aegis) return true;
  const c = roll(state, rng, attacker, willModifier(attacker), target.aegis.dc);
  log(state, attacker, rollLine(attacker.name, `Will save against ${possessive(target.name)} aegis`, c), c, undefined, { unit: target.id, reads: 'aegis' });
  if (succeeded(c.degree)) return true;
  log(state, attacker, `${attacker.name}'s attack is wasted against the aegis.`);
  return false;
}

interface StrikeOpts { charging?: boolean; free?: boolean; pressed?: boolean; circumstance?: number; bonus?: number; saveShift?: number; label: string }

// `null` means Aegis wasted the whole attempt: no roll, no wound, nothing for `melee` to read.
export function resolveStrike(state: BattleState, rng: Rng, u: Unit, target: Unit, opts: StrikeOpts): Degree | null {
  const ctx = abilityContext(state, rng, u);
  const guarded = !!u.guard || !!u.abilityState?.guardAtStart;
  if (!opts.free) attackAbilities(state, u, target, 'melee', 'use', null, 0, !!opts.charging, guarded, ctx);
  if (!attackGate(state, rng, u, target)) return null;
  const c = attackRoll(state, rng, u, target, strikeModifier(state, u, target) + Math.max(0, (opts.circumstance ?? 0) - highGroundBonus(state, u.square, target.square)) + (opts.bonus ?? 0), defenceOf(state, target, u, false));
  log(state, u, rollLine(u.name, `${opts.label} against ${target.name}`, c, 'attack'), c,
    opts.free ? { kind: 'freeStrike', attacker: u.id, target: target.id } : undefined, attackOn(target));
  const rolled = successes(c.degree);
  const damage = applyWounds(state, rng, target, rolled, u.name, u, opts.pressed ?? false, opts.saveShift ?? 0, u.level, u.attackTags?.melee);
  if (!opts.free) {
    attackAbilities(state, u, target, 'melee', 'result', c.degree, damage, !!opts.charging, guarded, ctx);
    abilityMemory(u).attackUsed = true;
  }
  // A unit exposed already has nothing more for the critical miss to take.
  if (c.degree === 'critical-failure' && !opts.free && !u.exposed) {
    u.exposed = true;
    log(state, u, `${u.name} is exposed (−2 Defence) until it acts again.`);
  }
  return c.degree;
}

/** What a charge carries into the Fight: `bonus` on the attack roll, `saveShift` on the
 * target's save against the wound, and `impact` — a cavalry charge applies Press, so a
 * Strike lands as a Press and a Press as an Overrun, at the price paid. */
export interface MeleeOpts { charging?: boolean; circumstance?: number; bonus?: number; saveShift?: number; impact?: boolean }

// A Fight is one roll, one way. A hit wounds, and the target's Fortitude save decides its
// disorder; a miss repulses the attacker, whose Will save against the target's level DC
// decides its own. The activity adds no number to the roll: Press makes the target save twice and keep the worse, and
// Overrun drives it back a hex besides.
export function melee(state: BattleState, rng: Rng, u: Unit, target: Unit, activity: Activity, opts: MeleeOpts = {}) {
  const eff = activity.fight!;
  const impact = opts.impact ?? false;
  const drive = eff.drive || (impact && eff.press);
  u.attacked = true;
  const before = { ...target.square };
  const degree = resolveStrike(state, rng, u, target, {
    charging: opts.charging, pressed: eff.press || impact, circumstance: opts.circumstance, bonus: opts.bonus, saveShift: opts.saveShift, label: activity.label,
  });
  if (degree === null) return;
  if (succeeded(degree)) {
    if (drive && u.status === 'active' && sameCell(before, target.square)) giveGround(state, u, target);
    return;
  }
  const c = roll(state, rng, u, willModifier(u) + (u.disorder >= ROUTED_AT - 1 ? resolveBonus(state, u) : 0), levelDc(target.level));
  log(state, u, rollLine(u.name, `Will save against ${possessive(target.name)} repulse`, c), c, undefined, { unit: u.id, reads: 'repulse' });
  if (!succeeded(c.degree)) addDisorder(state, u, 1, 'a repulsed attack');
}

/**
 * Overrun's shove, the shape of Pathfinder's Shove: the target moves one hex directly away
 * from the attacker, and the attacker steps into the hex it left, so contact holds. A destroyed
 * target simply yields its hex. With that one hex blocked the target holds without extra
 * disorder. Take cover also blocks displacement; the Overrun resolves as a Press.
 */
/** Section 10: water, a cliff or a standing wall behind the target. An occupied hex or the
 * board's edge merely blocks the shove. A native flier has the sky behind it. */
const cornered = (state: BattleState, target: Unit, ground: Square, away: Square): boolean =>
  !target.flying && grid(state).inBounds(away)
  && ((at(state.board, away).terrain === 'water' && !nativeWaterMovement(target)) || barrierBetween(state.board, ground, away) !== null);

function giveGround(state: BattleState, u: Unit, target: Unit) {
  const ground = target.square;
  if (target.status !== 'active') {
    if (!unitAt(state, ground)) {
      moveTo(state, u, ground);
      log(state, u, `${u.name} overruns and takes ${notation(ground)}.`);
    }
    return;
  }
  if (target.guard?.holds || holdsGround(state, target)) {
    log(state, target, `${target.name} holds its ground under cover: the Overrun lands as a Press.`);
    return;
  }
  // Section 8 blocks the shove on water, a wall or a cliff with no flier exception at all, and
  // the target spends no action of its own giving ground — Fly buys only its next activation
  // (`follow` already reads a holder's native `flying` alone for the same reason), so an unspent
  // Fly does not open a hex here either. A native flier still shrugs the shove off anywhere.
  const away = grid(state).beyond(u.square, ground);
  if (away && cornered(state, target, ground, away)) {
    log(state, target, `${target.name} is cornered with no ground to give.`);
    addDisorder(state, target, 1, 'cornered');
    return;
  }
  if (!away || !enterable(state, ground, away, { flying: target.flying,
    swimming: at(state.board, away).terrain === 'water' && (target.movementRates?.swim ?? 0) > 0 })) {
    log(state, target, `${target.name} has nowhere to give ground and holds its hex without losing extra Morale.`);
    return;
  }
  moveTo(state, target, away);
  moveTo(state, u, ground);
  log(state, u, `${u.name} drives ${target.name} back to ${notation(away)} and takes ${notation(ground)}.`);
}

export function shootAt(state: BattleState, rng: Rng, u: Unit, target: Unit, activity: Activity, bonus = 0) {
  const source = `${u.name}'s volley`;
  const ctx = abilityContext(state, rng, u);
  attackAbilities(state, u, target, 'volley', 'use', null, 0, false, !!u.guard, ctx);
  u.attacked = true;
  if (!attackGate(state, rng, u, target)) return;
  const c = attackRoll(state, rng, u, target, shootModifier(state, u, target) + bonus, defenceOf(state, target, u, true, false, shotFrom(state, u)));
  log(state, u, rollLine(u.name, `${activity.label} against ${target.name}`, c, 'attack'), c, undefined, attackOn(target));
  const damage = applyWounds(state, rng, target, successes(c.degree), source, u, false, 0, u.level, u.attackTags?.volley);
  attackAbilities(state, u, target, 'volley', 'result', c.degree, damage, false, !!u.guard, ctx);
  abilityMemory(u).attackUsed = true;
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

/** A pinning shooter's shot at a unit that fumbles its way out: ordinary Volley damage, and not
 * the shooter's own attack for its next activation. */
export function freeShot(state: BattleState, rng: Rng, u: Unit, target: Unit): Degree | null {
  if (!attackGate(state, rng, u, target)) return null;
  const c = attackRoll(state, rng, u, target, shootModifier(state, u, target), defenceOf(state, target, u, true, false, shotFrom(state, u)));
  log(state, u, rollLine(u.name, `Free shot against ${target.name}`, c, 'attack'), c,
    { kind: 'freeStrike', attacker: u.id, target: target.id }, attackOn(target));
  applyWounds(state, rng, target, successes(c.degree), `${u.name}'s volley`, u);
  return c.degree;
}

export const wallDc = (state: BattleState, wall: Wall) =>
  10 + wall.tier + Math.max(0, ...state.units.filter((d) => d.side === 'defender' && d.status === 'active').map((d) => d.level));

export function attackWall(state: BattleState, rng: Rng, u: Unit, key: string, modifier: number, label: string) {
  const wall = state.board.walls[key];
  if (!wall || wall.remaining <= 0) return;
  // A wall swing is the activation's one attack like any other, so Sure strike is spent here
  // rather than surviving to the unit's next Strike.
  const c = attackRoll(state, rng, u, null, modifier, wallDc(state, wall));
  log(state, u, rollLine(u.name, `${label} against the wall ${key}`, c, 'attack'), c);
  const hits = successes(c.degree);
  if (!hits) return;
  wall.remaining = Math.max(0, wall.remaining - structuralDamage(wall, hits));
  log(state, u, wall.remaining ? `The wall holds ${wall.remaining}/${wall.boxes}.` : `The wall at ${key} is breached.`);
}
