import type { Rng } from './rng.js';

export type Degree = 'critical-failure' | 'failure' | 'success' | 'critical-success';
const LADDER: Degree[] = ['critical-failure', 'failure', 'success', 'critical-success'];

export interface CheckResult { roll: number; modifier: number; total: number; dc: number; degree: Degree; }

export function degreeOf(roll: number, modifier: number, dc: number): Degree {
  const total = roll + modifier;
  let i = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  if (roll === 20) i = Math.min(3, i + 1);
  if (roll === 1) i = Math.max(0, i - 1);
  return LADDER[i];
}

export function check(rng: Rng, modifier: number, dc: number): CheckResult {
  const roll = rng.d20();
  return { roll, modifier, total: roll + modifier, dc, degree: degreeOf(roll, modifier, dc) };
}

export const succeeded = (d: Degree) => d === 'success' || d === 'critical-success';
