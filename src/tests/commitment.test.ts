import { describe, expect, it } from 'vitest';
import { act, availableActions, createBattle, isRouted, unit } from '../engine/battle.js';
import { parse, notation } from '../engine/board.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Troop', level: 6, role: 'infantry', salvo: 'medium', caster: true, tradition: 'divine', tactics: [], overrides: { strike: 11, volley: 11, spellAttack: 11, spellDc: 21, defence: 24, will: 13, fortitude: 15 } };
function setup(contact = false, card = troop) {
  const s = createBattle({ board: openBoard(), units: [
    { card, side: 'attacker', square: 'c2' },
    { card: troop, side: 'attacker', square: 'd2' },
    { card: troop, side: 'defender', square: 'c7' },
    { card: troop, side: 'defender', square: 'e7' },
  ] });
  if (contact) unit(s, 'u2').square = parse('c3');
  return s;
}
const checkFor = (s: ReturnType<typeof setup>, text: string) => s.log.find(e => e.text.includes(text) && e.check)?.check!;

describe('action commitment', () => {
  it('buys attack accuracy, spends the full cost, and retains one attack per activation', () => {
    const s = act(setup(true), { unit: 'u0', type: 'fight', activity: 1, target: 'u2', focus: 1 }, scriptedRng([11, 20]));
    expect(checkFor(s, 'strikes').modifier).toBe(13);
    expect(unit(s, 'u2').wounds).toBe(1);
    expect(unit(s, 'u0').actions).toBe(1);
    expect(() => act(s, { unit: 'u0', type: 'fight', activity: 1, target: 'u2' }, scriptedRng([20]))).toThrow(/already attacked/);
    const full = act(setup(true), { unit: 'u0', type: 'fight', activity: 1, target: 'u2', focus: 2 }, scriptedRng([10, 20]));
    expect(checkFor(full, 'strikes').modifier).toBe(15);
    expect(full.activated).toContain('u0');
  });

  it('supports a focused tier-two shot without changing its suppression effect', () => {
    const state = setup(); unit(state, 'u2').square = parse('c5');
    const s = act(state, { unit: 'u0', type: 'shoot', activity: 2, target: 'u2', focus: 1 }, scriptedRng([11, 20]));
    expect(checkFor(s, 'suppresses').modifier).toBe(13);
    expect(unit(s, 'u2').suppressedBy).toBe('u0');
    expect(s.activated).toContain('u0');
  });

  it('stacks commitment with the charge bonus and retains exposure', () => {
    const state = setup(); unit(state, 'u2').square = parse('c4');
    const s = act(state, { unit: 'u0', type: 'charge', target: 'u2', focus: 2 }, scriptedRng([10, 20]));
    expect(checkFor(s, 'strikes').modifier).toBe(17);
    expect(unit(s, 'u0').exposed).toBe(true);
    expect(s.activated).toContain('u0');
  });

  it('rejects unsupported, malformed and unaffordable commitment', () => {
    for (const focus of [-1, .5, 3, NaN]) {
      expect(() => act(setup(true), { unit: 'u0', type: 'fight', activity: 1, target: 'u2', focus }, scriptedRng([10]))).toThrow(/commitment/);
    }
    expect(() => act(setup(), { unit: 'u0', type: 'guard', activity: 1, focus: 1 }, scriptedRng([10]))).toThrow(/commitment/);
    expect(() => act(setup(true), { unit: 'u0', type: 'fight', activity: 2, target: 'u2', focus: 2 }, scriptedRng([10]))).toThrow(/needs 4 actions/);
    const state = setup(); unit(state, 'u0').stunned = true;
    expect(() => act(state, { unit: 'u0', type: 'rally', activity: 1, focus: 2 }, scriptedRng([10]))).toThrow(/needs 3 actions/);
  });

  it('lets a hasted unit concentrate tier three but caps the extra bonus at +4', () => {
    const state = setup(true); unit(state, 'u0').haste = 2;
    const s = act(state, { unit: 'u0', type: 'fight', activity: 3, target: 'u2', focus: 1 }, scriptedRng([11, 20, 20]));
    expect(checkFor(s, 'overruns').modifier).toBe(13);
    expect(s.activated).toContain('u0');
  });

  it('allows concentrated Missile above the tradition activity cap', () => {
    const state = setup(); unit(state, 'u2').square = parse('c5');
    const s = act(state, { unit: 'u0', type: 'cast', spell: 'blast', activity: 1, target: 'u2', focus: 2 }, scriptedRng([10, 20]));
    expect(checkFor(s, 'Missile catches').modifier).toBe(15);
    expect(unit(s, 'u2').wounds).toBe(1);
    expect(unit(s, 'u0').castTrees).toContain('blast');
  });

  it('uses one boosted Line roll for both enemies, with one wound resolution each', () => {
    const state = setup(false, { ...troop, tradition: 'arcane' });
    unit(state, 'u2').square = parse('c5'); unit(state, 'u3').square = parse('c6');
    const target = availableActions(state, 'u0').find(o => o.spell === 'blast')!.activities[1].targets.find(t => t.id.split('+').sort().join('+') === 'c5+c6')!;
    const s = act(state, { unit: 'u0', type: 'cast', spell: 'blast', activity: 2, target: target.id, focus: 1 }, scriptedRng([11, 20, 20]));
    const checks = s.log.filter(e => e.text.includes('Line catches')).map(e => e.check!);
    expect(checks.map(c => [c.roll, c.modifier])).toEqual([[11, 13], [11, 13]]);
    expect([unit(s, 'u2').wounds, unit(s, 'u3').wounds]).toEqual([1, 1]);
  });

  it('concentrates shared Healing and Rally rolls without increasing their scope', () => {
    const state = setup();
    for (const id of ['u0', 'u1']) { unit(state, id).wounds = 1; unit(state, id).disorder = 1; }
    const healed = act(state, { unit: 'u0', type: 'cast', spell: 'healing', activity: 2, target: 'u0+u1', focus: 1 }, scriptedRng([10]));
    expect([unit(healed, 'u0').wounds, unit(healed, 'u1').wounds]).toEqual([0, 0]);
    const rallied = act(state, { unit: 'u0', type: 'rally', activity: 1, focus: 2 }, scriptedRng([8]));
    expect(unit(rallied, 'u0').disorder).toBe(0);
    expect(unit(rallied, 'u1').disorder).toBe(1);
    expect(checkFor(rallied, 'steadies').modifier).toBe(16);
  });

  it('boosts Controlling DC and retains the chosen activity effect', () => {
    const state = setup(); unit(state, 'u2').square = parse('c5');
    const s = act(state, { unit: 'u0', type: 'cast', spell: 'controlling', activity: 2, target: 'u2', focus: 1 }, scriptedRng([9]));
    expect(checkFor(s, 'resists').dc).toBe(23);
    expect(unit(s, 'u2').disorder).toBe(1);
    expect(unit(s, 'u2').stunned).toBe(true);
    expect(unit(s, 'u2').rooted).toBe(0);
  });
});

describe('resisting morale pressure', () => {
  it('lets a unit at two disorder resist Press and routes it only on a failed save', () => {
    const state = setup(true); const target = unit(state, 'u2'); target.disorder = 2;
    const action = { unit: 'u0', type: 'fight' as const, activity: 2 as const, target: 'u2' };
    const held = act(state, action, scriptedRng([15, 20, 20]));
    expect(unit(held, 'u2').disorder).toBe(2);
    expect(isRouted(unit(held, 'u2'))).toBe(false);
    const routed = act(state, action, scriptedRng([15, 20, 1]));
    expect(isRouted(unit(routed, 'u2'))).toBe(true);
  });

  it('adds no disorder when an Overrun cannot displace the target', () => {
    const state = setup(true); unit(state, 'u3').square = parse('c4');
    for (const [rolls, disorder] of [[[15, 20, 20], 0], [[15, 20, 1], 1]] as const) {
      const s = act(state, { unit: 'u0', type: 'fight', activity: 3, target: 'u2' }, scriptedRng([...rolls]));
      expect(unit(s, 'u2').disorder).toBe(disorder);
      expect(notation(unit(s, 'u2').square)).toBe('c3');
      expect(notation(unit(s, 'u0').square)).toBe('c2');
    }
  });

  it('uses the same saving throw for cavalry impact, while Stoneskin prevents disorder', () => {
    const state = setup(false, { ...troop, tactics: ['cavalry-charge'] }); unit(state, 'u2').square = parse('c4');
    const s = act(state, { unit: 'u0', type: 'charge', target: 'u2' }, scriptedRng([15, 20, 20]));
    expect(unit(s, 'u2').disorder).toBe(0);
    expect(s.log.some(e => e.text.includes('keeps the worse'))).toBe(true);
    const protectedState = setup(true); unit(protectedState, 'u2').stoneskin = true;
    const protectedResult = act(protectedState, { unit: 'u0', type: 'fight', activity: 2, target: 'u2' }, scriptedRng([20, 1, 1]));
    expect(unit(protectedResult, 'u2').disorder).toBe(0);
    expect(unit(protectedResult, 'u2').wounds).toBe(1);
  });
});
