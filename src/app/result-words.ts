import type { CombatTextIcon, CombatTextPart } from '../services/CombatTextService.js';
import type { CheckLanding, Degree, Status } from '../engine/index.js';
import { signed } from './presentation.js';

export type ResultWord = CombatTextPart;

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
export const DESTROYED: ResultWord = { text: 'Destroyed', tone: 'bad', icon: 'dead' };
const REPULSED: ResultWord = { text: 'Repulsed', tone: 'warn' };
/** Red and loud: the cast came to nothing, which is the caster's failure. */
const BLOCKED: ResultWord = { text: 'Blocked', tone: 'bad' };
export const RESISTED: ResultWord = { text: 'Resisted', tone: 'bad', loud: true };

/** A cast that took hold reads as its own name, green for the caster whose spell it is. */
export const tookHold = (label: string): ResultWord => ({ text: label, tone: 'good' });

// Orange for what an enemy did to the piece, green for its own stance and its side's casts.
const STATUS_WORD: Record<Status, [string, ResultWord['tone']]> = {
  guard: ['Guard', 'good'], fortified: ['Fortified', 'good'],
  pinned: ['Pinned', 'warn'], rooted: ['Held', 'warn'], suppressed: ['Suppressed', 'warn'], stunned: ['Stunned', 'warn'],
  frightened: ['Frightened', 'warn'], exposed: ['Exposed', 'warn'], persistent: ['Marked', 'warn'],
  aegis: ['Aegis', 'good'], warded: ['Warded', 'good'], stoneskin: ['Stoneskin', 'good'],
  'sure-strike': ['Sure strike', 'good'], wrath: ['Wrath', 'good'], hasted: ['Hasted', 'good'],
  'sure-footing': ['Sure footing', 'good'], 'burst-of-speed': ['Burst of speed', 'good'], inspired: ['Inspired', 'good'],
};

export const conditionWord = (status: Status): ResultWord =>
  ({ text: STATUS_WORD[status][0], tone: STATUS_WORD[status][1], icon: status });

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
export function effectWord(icon: CombatTextIcon, lost: number): ResultWord {
  return { text: signed(-lost), tone: lost > 0 ? 'bad' : 'good', icon };
}
