import { abilityMemory, resolveBonus, refreshAbilityAuras, absorbAbilityDamage } from '../ability-effects.js';
import { HEALABLE, resetConditions } from '../conditions.js';
import type { HealingCondition } from '../types.js';
import { rollTwice, rollLine, succeeded } from '../check.js';
import type { Rng } from '../rng.js';
import { levelDc } from '../tables.js';
import { MAX_WOUNDS, ROUTED_AT, type BattleState, type Unit } from '../types.js';
import { isRouted, roll, log, abilityLog, fortitudeModifier, clearAsShooter } from './state.js';
import { abandonEngines } from './emplacements.js';

/**
 * The one step between a hit rolled and a wound taken. Dig in, Take cover and Stoneskin all cap
 * the hit at a single wound, so a critical lands as an ordinary one.
 */
export function reduceWounds(target: Unit, n: number): number {
  return target.guard?.cap || target.stoneskin ? Math.min(n, 1) : n;
}

/**
 * Wounds that actually land, after the target's Guard. A wound then asks a Fortitude save
 * against the attacker's level DC before it disorders anyone. `pressed` rolls that save twice and keeps the worse result. `saveShift` bends it — a charge from above is −2 on it.
 */
export function applyWounds(state: BattleState, rng: Rng, target: Unit, raw: number, source: string, attacker: Unit, pressed = false, saveShift = 0, sourceLevel = attacker.level, tags: string[] = []): number {
  const capped = reduceWounds(target, raw);
  const n = absorbAbilityDamage(state, target, capped, tags, abilityLog(state));
  if (capped < raw) log(state, target, target.stoneskin && !target.guard?.cap
    ? `${target.name}'s stoneskin caps the critical at 1 damage.`
    : `${target.name} has dug in: the critical lands as an ordinary hit.`);
  if (n <= 0) return 0;
  const fell = landWound(state, target, n, `damage from ${source}`);
  if (attacker.wrath) {
    attacker.wrath = false;
    target.persistent = { dc: levelDc(attacker.level) };
    log(state, target, `${target.name} is marked by ${attacker.name}'s wrath: 1 damage at the end of its next activation.`);
  }
  if (fell) { fall(state, target); return n; }
  moraleSave(state, rng, target, { dc: levelDc(sourceLevel), shift: saveShift, pressed, label: 'Fortitude save against Morale loss', cause: 'damage taken' });
  return n;
}

function landWound(state: BattleState, target: Unit, n: number, what: string): boolean {
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  const fell = target.wounds >= MAX_WOUNDS;
  log(state, target, `${target.name} takes ${n} ${what} (Health ${MAX_WOUNDS - target.wounds}/${MAX_WOUNDS})${fell ? ' — destroyed' : ''}.`);
  return fell;
}

function fall(state: BattleState, target: Unit) {
  target.status = 'destroyed';
  abandonEngines(state, target);
  clearAsShooter(state, target.id);
  refreshAbilityAuras(state);
}

type MoraleSave = { dc: number; shift?: number; pressed?: boolean; label: string; cause: string };

function moraleSave(state: BattleState, rng: Rng, target: Unit, { dc, shift = 0, pressed = false, label, cause }: MoraleSave) {
  if (target.stoneskin) {
    log(state, target, `${target.name}'s stoneskin prevents Morale loss.`);
    return;
  }
  const modifier = fortitudeModifier(target) + shift + (target.disorder >= ROUTED_AT - 1 ? resolveBonus(state, target) : 0);
  const twice = pressed ? rollTwice(rng, modifier, dc, false) : null;
  const c = twice ?? roll(state, rng, target, modifier, dc);
  if (pressed) {
    target.inspired = false;
    log(state, target, `${target.name} resists Press: rolls ${twice!.rolls.join(' and ')}, keeps the worse.`);
  }
  log(state, target, rollLine(target.name, label, c), c, undefined, { unit: target.id, reads: 'brace' });
  if (!succeeded(c.degree)) addDisorder(state, target, 1, cause);
}

export function addDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (n === 0 || u.status !== 'active') return;
  const wasRouted = isRouted(u);
  const previous = u.disorder;
  // Every point fits on the three-pip track.
  u.disorder = Math.max(0, Math.min(ROUTED_AT, u.disorder + n));
  const routed = !wasRouted && isRouted(u);
  const crossed = routed ? ' — routed' : '';
  log(state, u, `${u.name} loses ${u.disorder - previous} Morale (Morale ${ROUTED_AT - u.disorder}/${ROUTED_AT}, ${why})${crossed}.`);
  if (routed) abandonEngines(state, u);
}

export function clearDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (u.disorder === 0) return;
  const previous = u.disorder;
  u.disorder = Math.max(0, u.disorder - n);
  log(state, u, `${u.name} restores ${previous - u.disorder} Morale (Morale ${ROUTED_AT - u.disorder}/${ROUTED_AT}, ${why}).`);
}

// Never set while disorder stands (`inspired`'s own invariant), so every call site already
// checks that before reaching here; a unit already inspired just keeps its one bonus.
export function inspire(state: BattleState, u: Unit) {
  if (u.inspired) return;
  u.inspired = true;
  log(state, u, `${u.name} is inspired: +2 to its next roll.`);
}

/** The critical's "one more thing": end the first condition present that `choice` allows. The
 * rules name the six without a priority, so a heal takes them in `CONDITIONS` order, pinned
 * through persistent damage. */
export function endCondition(state: BattleState, target: Unit, choice?: HealingCondition): boolean {
  for (const { key, status, holds, text } of HEALABLE) {
    if (!holds(target) || (choice && choice !== status)) continue;
    const line = text(target, state);
    resetConditions(target, [key]);
    if (key === 'rooted') abilityMemory(target).snare = false;
    log(state, target, line);
    return true;
  }
  return false;
}

export function healWound(state: BattleState, target: Unit) {
  if (target.wounds <= 0) return;
  target.wounds -= 1;
  log(state, target, `${target.name} restores 1 Health (Health ${MAX_WOUNDS - target.wounds}/${MAX_WOUNDS}).`);
}

/** Wrath's wound, waiting on the target's own `finish`. Its DC was fixed when the hit landed,
 * so no attacker is needed here — only the mark. */
export function landPersistent(state: BattleState, rng: Rng, target: Unit) {
  const dc = target.persistent!.dc;
  const tag = target.persistent!.tag;
  target.persistent = null;
  if (target.status !== 'active') return;
  const n = absorbAbilityDamage(state, target, reduceWounds(target, 1), tag ? [tag] : [], abilityLog(state));
  if (n <= 0) return;
  if (landWound(state, target, n, 'persistent damage')) { fall(state, target); return; }
  moraleSave(state, rng, target, { dc, label: 'Fortitude save against Morale loss from persistent damage', cause: 'persistent damage' });
}
