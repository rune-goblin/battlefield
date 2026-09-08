import { describe, expect, it } from 'vitest';
import { COMBATANTS } from '../engine/combatants.js';
import { qualityFor } from '../engine/ladders.js';
import { OFFICIAL } from '../engine/official.js';
import { ROSTER } from '../engine/roster.js';
import type { UnitCard } from '../engine/cards.js';

const troop = (name: string) => [...COMBATANTS, ...OFFICIAL, ...ROSTER].find((c) => c.name === name)!;

describe('Quality', () => {
  it('reads off the Will save, the one stat that spreads within a level', () => {
    expect(qualityFor(troop('Angelic Chorus'))).toBe(5);
    expect(qualityFor(troop('Conscript Squad'))).toBe(3);
  });

  it('derives Quality for every published troop without hand-authoring', () => {
    for (const card of [...COMBATANTS, ...OFFICIAL] as UnitCard[]) {
      expect(qualityFor(card), card.name).toBeGreaterThanOrEqual(2);
    }
  });
});
