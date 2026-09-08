import type { Rng } from './rng.js';

export type Degree = 'critical-failure' | 'failure' | 'success' | 'critical-success';
const LADDER: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success'];

export interface CheckResult { roll: number; modifier: number; total: number; dc: number; degree: Degree; }

/** Two d20s, the one kept and the pair, so a log line can show what was thrown away. */
export interface TwiceResult extends CheckResult { rolls: [number, number] }

export function degreeOf(roll: number, modifier: number, dc: number): Degree {
  const total = roll + modifier;
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (roll === 20) i = Math.min(3, i + 1);
  if (roll === 1) i = Math.max(0, i - 1);
  return LADDER[i];
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
  const rank = (c: CheckResult) => LADDER.indexOf(c.degree);
  const kept = (better ? rank(a) >= rank(b) : rank(a) <= rank(b)) ? a : b;
  return { ...kept, rolls };
}

export function rollTwice(rng: Rng, modifier: number, dc: number, better: boolean): TwiceResult {
  return readTwice([rng.d20(), rng.d20()], modifier, dc, better);
}

export const succeeded = (d: Degree) => d === 'success' || d === 'critical-success';
