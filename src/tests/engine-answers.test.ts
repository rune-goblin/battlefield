import { describe, expect, it } from 'vitest';
import {
  act, activation, availableActions, commitment, createBattle, meleePlans, parse, ROUTED_AT, select, unit, unitOutcome,
  type UnitCard,
} from '../engine/index.js';
import { recoverAtNight, recoveryModifier } from '../engine/aftermath.js';
import { scriptedRng } from '../engine/rng.js';
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

describe('move and melee', () => {
  it('refuses a move and charge that ends in an Overrun before the move begins', () => {
    const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
    const b = createBattle({ board: openBoard(), units: [
      { card: cavalry, side: 'attacker', square: 'e2' }, { card: cavalry, side: 'defender', square: 'e7' },
    ] });
    b.pending = 'attacker'; unit(b, 'u0').speed = 20; unit(b, 'u1').square = parse('e8');
    const s = select(b, 'u0');
    const plan = meleePlans(s, unit(s, 'u0'), 'u1').find((p) => p.kind === 'charge')!;
    expect(() => act(s, { type: 'advance', unit: 'u0', target: 'u1', via: plan.via!, finish: 'charge', activity: 3 },
      { d20() { throw new Error('dice drawn'); } })).toThrow('invalid charge activity');
  });
});

describe('unit outcome', () => {
  it('counts a unit that left as routed, and one in camp as in camp', () => {
    const s = battle();
    const u = unit(s, 'u0');
    expect(unitOutcome({ ...u, status: 'left' })).toBe('routed');
    expect(unitOutcome({ ...u, status: 'camp' })).toBe('camp');
    expect(unitOutcome({ ...u, disorder: ROUTED_AT })).toBe('routed');
    expect(unitOutcome(u)).toBe('standing');
  });
});

describe('overnight recovery', () => {
  it('rolls the modifier recoveryModifier gives', () => {
    const s = createBattle({ board: openBoard(), units: [
      { card: { ...troop, disorder: 2, wounds: 1 }, side: 'attacker', square: 'c2' },
      { card: { ...troop, wounds: 2 }, side: 'attacker', square: 'e2' },
      { card: troop, side: 'defender', square: 'c7' },
    ] });
    s.phase = 'ended'; s.endedBy = 'dusk'; s.winner = 'draw';
    const night = recoverAtNight(s, 'attacker', [{ unit: 'u0', activity: 'rally' }, { unit: 'u1', activity: 'treat' }], scriptedRng([10, 10]));
    const [rally, treat] = night.night!.attacker!;
    expect(rally.check.modifier).toBe(recoveryModifier(unit(s, 'u0'), 'rally', 2).total);
    expect(treat.check.modifier).toBe(recoveryModifier(unit(s, 'u1'), 'treat', 2).total);
    expect(recoveryModifier(unit(s, 'u0'), 'rally', 2)).toEqual({ save: 'Will', bonus: 13, missingMorale: 2, penalty: 2, total: 9 });
  });
});
