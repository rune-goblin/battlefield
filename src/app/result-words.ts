import type { PopupIcon, PopupPart } from '../board/index.js';
import type { CheckLanding, Degree } from '../engine/index.js';
import type { Condition } from '../runtime/events.js';

export type ResultWord = PopupPart;

// proto: English only. Every word the board floats over a piece lives here, so localization has
// one table to replace.
const ATTACK: Record<Degree, ResultWord> = {
  'critical-success': { text: 'Critical Hit', tone: 'good' },
  success: { text: 'Hit', tone: 'good' },
  failure: { text: 'Miss', tone: 'bad' },
  'critical-failure': { text: 'Critical Miss', tone: 'bad' },
};

const CHECK: Record<Degree, ResultWord> = {
  'critical-success': { text: 'Critical Success', tone: 'good' },
  success: { text: 'Success', tone: 'good' },
  failure: { text: 'Failure', tone: 'bad' },
  'critical-failure': { text: 'Critical Failure', tone: 'bad' },
};

export const ROUTED: ResultWord = { text: 'Routed', tone: 'warn', icon: 'routed' };
const REPULSED: ResultWord = { text: 'Repulsed', tone: 'warn' };
/** Red and loud: the cast came to nothing, which is the caster's failure. */
const BLOCKED: ResultWord = { text: 'Blocked', tone: 'bad' };
export const RESISTED: ResultWord = { text: 'Resisted', tone: 'bad', loud: true };

const CONDITION_TEXT: Record<Condition, string> = {
  frightened: 'Frightened', stunned: 'Stunned', rooted: 'Held', suppressed: 'Suppressed',
  pinned: 'Pinned', exposed: 'Exposed', persistent: 'Marked',
};

export const conditionWord = (condition: Condition): ResultWord =>
  ({ text: CONDITION_TEXT[condition], tone: 'warn', icon: condition });

/** Null where the result needs no word: the miss already spoke for a repulse the attacker held,
 * the disorder a failed brace costs is shown as the effect it is, and an attack that passes an
 * aegis goes on to its own result. */
export function wordFor(reads: CheckLanding['reads'], degree: Degree): ResultWord | null {
  if (reads === 'attack') return ATTACK[degree];
  if (reads === 'check') return CHECK[degree];
  if (reads === 'brace') return null;
  const failed = degree === 'failure' || degree === 'critical-failure';
  if (reads === 'aegis') return failed ? BLOCKED : null;
  return failed ? REPULSED : null;
}

/** A change to one of the token's bars, signed as the bar moves: a wound takes a heart away. */
export function effectWord(icon: PopupIcon, lost: number): ResultWord {
  return { text: `${lost > 0 ? '−' : '+'}${Math.abs(lost)}`, tone: lost > 0 ? 'bad' : 'good', icon };
}
