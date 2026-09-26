import type { Rng } from './rng.js';

export type Degree = 'critical-failure' | 'failure' | 'success' | 'critical-success';
const DEGREES: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success'];

export interface CheckResult { roll: number; modifier: number; total: number; dc: number; degree: Degree; }

/** Two d20s, the one kept and the pair, so a log line can show what was thrown away. */
export interface TwiceResult extends CheckResult { rolls: [number, number] }

export function degreeOf(roll: number, modifier: number, dc: number): Degree {
  const total = roll + modifier;
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (roll === 20) i = Math.min(3, i + 1);
  if (roll === 1) i = Math.max(0, i - 1);
  return DEGREES[i];
}

/** The degree of a roll already made: one d20 reaches several units, each with its own DC. */
export function readCheck(roll: number, modifier: number, dc: number): CheckResult {
  return { roll, modifier, total: roll + modifier, dc, degree: degreeOf(roll, modifier, dc) };
}

export function check(rng: Rng, modifier: number, dc: number): CheckResult {
  return readCheck(rng.d20(), modifier, dc);
}

/** A pair already thrown, read against one DC: a Blast throws its two dice once and each unit
 * caught reads them against its own Defence, keeping the better or the worse as its flags say. */
export function readTwice(rolls: [number, number], modifier: number, dc: number, better: boolean): TwiceResult {
  const [a, b] = rolls.map((r) => readCheck(r, modifier, dc));
  // Degree first, not total: a natural 20 shifts the degree up without the higher total.
  const rank = (c: CheckResult) => DEGREES.indexOf(c.degree);
  const kept = (better ? rank(a) >= rank(b) : rank(a) <= rank(b)) ? a : b;
  return { ...kept, rolls };
}

export function rollTwice(rng: Rng, modifier: number, dc: number, better: boolean): TwiceResult {
  return readTwice([rng.d20(), rng.d20()], modifier, dc, better);
}

export const succeeded = (d: Degree) => d === 'success' || d === 'critical-success';

export const successes = (d: Degree): 0 | 1 | 2 => d === 'critical-success' ? 2 : d === 'success' ? 1 : 0;

const DEGREE_WORD: Record<Degree, string> = {
  'critical-failure': 'critical failure', failure: 'failure', success: 'success', 'critical-success': 'critical success',
};
const ATTACK_WORD: Record<Degree, string> = {
  'critical-failure': 'critical miss', failure: 'miss', success: 'hit', 'critical-success': 'critical hit',
};

export const possessive = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/**
 * Every roll is logged the same way: whose roll, what it is and against what, the sum, the
 * outcome. "Troll Marauders' Will save against Line Infantry's repulse: 5 + 11 = 16 vs 22,
 * failure." The roll is named as a noun, so the outcome is the only verdict in the line: a verb
 * such as "resists" or "breaks off" reads as a result and then contradicts the one that follows.
 * An attack ends in hit or miss, the words the board shows for it.
 */
export function rollLine(who: string, what: string, c: CheckResult, kind: 'attack' | 'check' = 'check'): string {
  return `${possessive(who)} ${what}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${(kind === 'attack' ? ATTACK_WORD : DEGREE_WORD)[c.degree]}.`;
}
