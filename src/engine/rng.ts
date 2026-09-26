export interface Rng { d20(): number; }

export function scriptedRng(rolls: number[]): Rng {
  let i = 0;
  return { d20: () => rolls[i++ % rolls.length] };
}

export const randomRng: Rng = { d20: () => Math.floor(Math.random() * 20) + 1 };

export type Random = () => number;

export function seededRandom(seed: number): Random {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
