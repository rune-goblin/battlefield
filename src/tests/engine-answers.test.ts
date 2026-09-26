import { describe, expect, it } from 'vitest';
import { activation, availableActions, commitment, createBattle, parse, ROUTED_AT, unit, type UnitCard } from '../engine/index.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Troop', level: 6, role: 'infantry', salvo: 'medium', tactics: [], overrides: { strike: 11, volley: 11, defence: 24, will: 13, fortitude: 15 } };
const battle = () => createBattle({ board: openBoard(), units: [
  { card: troop, side: 'attacker', square: 'c2' },
  { card: troop, side: 'defender', square: 'c7' },
] });

describe('activation verbs', () => {
  it('refuses a routed unit every verb but Step, in the Morale table’s words', () => {
    const s = battle(); unit(s, 'u0').disorder = ROUTED_AT;
    const { verbs } = activation(s, 'u0')!;
    for (const verb of ['fight', 'shoot', 'cast', 'rally', 'guard'] as const) {
      expect(verbs[verb]).toEqual({ legal: false, reason: 'routed: move or step' });
    }
    expect(verbs.step).toEqual({ legal: true, reason: null });
  });

  it('names the pin as the reason a pinned unit cannot Step', () => {
    const s = battle(); unit(s, 'u0').pinnedBy = 'u1';
    expect(activation(s, 'u0')!.verbs.step).toEqual({ legal: false, reason: 'pinned: Move to get away' });
  });
});

describe('commitment', () => {
  it('leaves a three-action Controlling cast no room, and lets a tier-II one reach three', () => {
    const occultist: UnitCard = { ...troop, level: 16, caster: true, tradition: 'occult' };
    const s = createBattle({ board: openBoard(), units: [
      { card: occultist, side: 'attacker', square: 'c2' },
      { card: troop, side: 'defender', square: 'c7' },
    ] });
    unit(s, 'u1').square = parse('c4');
    const u = unit(s, 'u0');
    const offer = availableActions(s, 'u0').find((o) => o.spell === 'controlling')!;
    expect(commitment(u, offer, offer.activities[3])).toBeNull();
    expect(commitment(u, offer, offer.activities[1])).toEqual({ base: 2, available: 3 });
  });
});
