import { describe, expect, it } from 'vitest';
import { COMBATANTS } from '../engine/combatants.js';
import { OFFICIAL } from '../engine/official.js';
import { deriveStats } from '../engine/cards.js';

describe('combatants', () => {
  it('imports every troop with a usable card', () => {
    expect(COMBATANTS).toHaveLength(38);
    for (const c of COMBATANTS) {
      const s = deriveStats(c);
      expect(s.strike, c.name).toBeGreaterThan(0);
      expect(s.defence, c.name).toBeGreaterThan(10);
      expect((s.volley === null) === (s.reach === null), c.name).toBe(true);
    }
  });
  it('keeps the worked-example numbers', () => {
    const s = deriveStats(COMBATANTS.find((c) => c.name === 'Line Infantry')!);
    expect(s).toMatchObject({ strike: 11, volley: 11, reach: 'long', defence: 24, will: 13 });
  });
});

describe('official troops', () => {
  it('imports a broad selection with usable cards', () => {
    expect(OFFICIAL.length).toBeGreaterThanOrEqual(30);
    expect(new Set(OFFICIAL.map((c) => c.role))).toEqual(new Set(['infantry', 'cavalry']));
    for (const c of OFFICIAL) {
      const s = deriveStats(c);
      expect(s.defence, c.name).toBeGreaterThan(10);
      expect(s.strike!, c.name).toBeGreaterThan(0);
    }
  });
  it('keeps official names distinct from the Reignmaker set', () => {
    const rm = new Set(COMBATANTS.map((c) => c.name));
    expect(OFFICIAL.filter((c) => rm.has(c.name))).toEqual([]);
  });
});
