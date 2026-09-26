import { describe, expect, it } from 'vitest';
import { act, availableActions, createBattle, endActivation, isRouted, isStanding, unit } from '../engine/index.js';
import { COMBATANTS, OFFICIAL, ROSTER, ENGINES, ROUTED_AT, parse, type UnitCard } from '../engine/index.js';
import { migrateMorale } from '../runtime/session.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const caster: UnitCard = { name: 'Caster', level: 6, role: 'infantry', caster: true, tradition: 'occult', salvo: 'medium', tactics: [] };
const setup = () => createBattle({ board: openBoard(), units: [
  { card: caster, side: 'attacker', square: 'c2' },
  { card: caster, side: 'attacker', square: 'd2' },
  { card: caster, side: 'defender', square: 'c7' },
] });

describe('three-pip morale', () => {
  it.each(['destroyed', 'routed', 'left'] as const)('preserves survivor morale at round end when half the army is %s', (loss) => {
    let battle = setup();
    unit(battle, 'u0').disorder = 2;
    unit(battle, 'u0').wounds = 2;
    const casualty = unit(battle, 'u1');
    if (loss === 'routed') casualty.disorder = ROUTED_AT;
    else casualty.status = loss;
    if (loss === 'destroyed') casualty.wounds = 4;
    if (loss === 'left') casualty.disorder = ROUTED_AT;

    for (let i = 0; i < 3 && battle.round === 1 && battle.phase === 'battle'; i++) {
      battle = endActivation(battle, scriptedRng([10]));
    }

    expect(battle.round).toBe(2);
    expect(battle.phase).toBe('battle');
    expect(unit(battle, 'u0').disorder).toBe(2);
    expect(unit(battle, 'u0').wounds).toBe(2);
    expect(isStanding(unit(battle, 'u0'))).toBe(true);
    expect(unit(battle, 'u2').disorder).toBe(0);
  });

  it('uses the same terminal pip for every troop regardless of Will', () => {
    for (const card of [...COMBATANTS, ...OFFICIAL, ...ROSTER]) {
      const battle = createBattle({ board: openBoard(), units: [
        { card: { ...card, disorder: 2 }, side: 'attacker', square: 'c2' },
        { card: caster, side: 'defender', square: 'c7' },
      ] });
      const u = unit(battle, 'u0');
      expect(isStanding(u), card.name).toBe(true);
      expect(availableActions(battle, u.id).some(o => o.type === 'guard'), card.name).toBe(true);
      u.disorder = 3;
      expect(isRouted(u), card.name).toBe(true);
      expect(availableActions(battle, u.id), card.name).toEqual([]);
    }
  });

  it('allows casting at two disorder and caps a two-point loss at three', () => {
    const battle = setup();
    unit(battle, 'u0').disorder = 2;
    unit(battle, 'u2').disorder = 2;
    unit(battle, 'u2').square = parse('c4');
    const next = act(battle, { type: 'cast', unit: 'u0', spell: 'controlling', activity: 1, target: 'u2' }, scriptedRng([1]));
    expect(unit(next, 'u2').disorder).toBe(3);
    expect(isRouted(unit(next, 'u2'))).toBe(true);
    expect(next.log.some(e => e.text.includes('loses 1 Morale (Morale 0/3') && e.text.includes('routed'))).toBe(true);
  });

  it('restores ordinary actions when an ally clears the third pip', () => {
    const battle = setup();
    unit(battle, 'u1').disorder = 3;
    const next = act(battle, { type: 'rally', unit: 'u0', activity: 2, target: 'u1' }, scriptedRng([10]));
    expect(unit(next, 'u1').disorder).toBe(2);
    expect(next.log.some(e => e.unit === 'u1' && e.text.includes('restores 1 Morale (Morale 1/3'))).toBe(true);
    expect(isStanding(unit(next, 'u1'))).toBe(true);
    expect(availableActions(next, 'u1').map(o => o.type)).toEqual(expect.arrayContaining(['shoot', 'guard', 'rally', 'cast']));
  });

  it('normalizes imported disorder and abandons an engine on a routed starting unit', () => {
    const battle = createBattle({ board: openBoard(), units: [
      { card: { ...caster, disorder: 6 }, side: 'attacker', square: 'c2', engines: [{ card: ENGINES.find(e => e.name === 'Catapult')! }] },
      { card: caster, side: 'defender', square: 'c7' },
    ] });
    expect(unit(battle, 'u0').disorder).toBe(ROUTED_AT);
    expect(unit(battle, 'u0').engines[0].status).toBe('abandoned');
  });
});

describe('saved morale migration', () => {
  it('preserves battle progress and applies the fixed track to legacy saves', () => {
    const battle = setup();
    Object.assign(unit(battle, 'u0'), { quality: 2, disorder: 2, wounds: 1 });
    Object.assign(unit(battle, 'u1'), { quality: 5, disorder: 5 });
    const log = structuredClone(battle.log);
    expect(migrateMorale(battle)).toBe(battle);
    expect(unit(battle, 'u0')).not.toHaveProperty('quality');
    expect(unit(battle, 'u0').wounds).toBe(1);
    expect(isStanding(unit(battle, 'u0'))).toBe(true);
    expect(unit(battle, 'u1').disorder).toBe(3);
    expect(isRouted(unit(battle, 'u1'))).toBe(true);
    expect(battle.log).toEqual(log);
    expect(migrateMorale(structuredClone(battle))).toEqual(battle);
  });
});
