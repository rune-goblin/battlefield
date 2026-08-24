import { describe, expect, it } from 'vitest';
import { generateForce, LIBRARY } from '../engine/force.js';
import { seededRandom } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';

const opponent: UnitCard[] = [
  { name: 'a', level: 6, role: 'infantry' }, { name: 'b', level: 7, role: 'cavalry' }, { name: 'c', level: 5, role: 'infantry' },
];
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
const total = (f: { card: UnitCard }[]) => f.reduce((s, u) => s + u.card.level, 0);

describe('generateForce', () => {
  it('is deterministic for a seed', () => {
    expect(generateForce(opponent, seededRandom(3))).toEqual(generateForce(opponent, seededRandom(3)));
  });
  it('matches the opponent in count and total level', () => {
    for (const seed of seeds) {
      const f = generateForce(opponent, seededRandom(seed));
      expect(f.length).toBeGreaterThanOrEqual(2);
      expect(f.length).toBeLessThanOrEqual(4);
      expect(Math.abs(total(f) - 18)).toBeLessThanOrEqual(4);
      expect(f.every(u => Math.abs(u.card.level - 6) <= 3)).toBe(true);
      expect(f.every(u => LIBRARY.includes(u.card))).toBe(true);
    }
  });
  it('honours a fixed count', () => {
    expect(generateForce(opponent, seededRandom(9), { count: 5 })).toHaveLength(5);
  });
  it('gives at most one unit an engine, and attackers facing walls usually bring one', () => {
    const forces = seeds.map(seed => generateForce(opponent, seededRandom(seed), { attacking: true, wallsTier: 2 }));
    expect(forces.every(f => f.filter(u => u.engine).length <= 1)).toBe(true);
    expect(forces.filter(f => f.some(u => u.engine)).length).toBeGreaterThan(20);
    const open = seeds.map(seed => generateForce(opponent, seededRandom(seed)));
    expect(open.every(f => f.every(u => !u.engine || u.engine.kind === 'artillery'))).toBe(true);
  });
  it('builds a default force against an empty side', () => {
    const f = generateForce([], seededRandom(1));
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(total(f)).toBeGreaterThan(0);
  });
});
