import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, unit } from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { ENGINES } from '../engine/engines.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { openBoard } from './helpers.js';
import type { BattleState } from '../engine/types.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };
const engine = (name: string) => ENGINES.find((e) => e.name === name)!;

function battle(engines: string[], wallTier?: number) {
  const board = openBoard();
  if (wallTier) board.walls[edgeKey(parse('c6'), parse('c7'))] = { tier: wallTier, boxes: wallTier + 1, remaining: wallTier + 1 };
  return createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2', engines: engines.map(engine) },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
    board,
  });
}

const offer = (state: BattleState, type: 'shoot' | 'fight', id = 'u0') =>
  availableActions(state, id).find((o) => o.type === type)!;

describe('siege engines', () => {
  it('imports all 59 Trooper weapons with launch bonuses', () => {
    expect(ENGINES).toHaveLength(59);
    expect(engine('Catapult')).toMatchObject({ kind: 'artillery', launch: 12, reach: 'extreme' });
    expect(engine('Battering Ram').kind).toBe('ram');
  });

  // A crewed engine replaces the unit's own shooting profile, effective range and all, and
  // always gets the full grade-3 spread free — a gun crew works its whole engineered range
  // without the gamble an ordinary troop's own Reach check carries.
  it('a catapult shoots at extreme range with no roll to reach it, once per round', () => {
    const s0 = battle(['Catapult']);
    const shoot = offer(s0, 'shoot');
    expect(shoot.granted).toBe(3);
    expect(shoot.rungs[2].targets.map((t) => t.id)).toEqual(['u1']);
    expect(shoot.rungs[0].targets).toEqual([]);
    const s1 = act(s0, { type: 'shoot', rung: 3, target: 'u1' }, scriptedRng([10]));
    expect(unit(s1, 'u1').wounds).toBe(1);
    expect(s1.log.find((e) => e.check)!.check!.modifier).toBe(engine('Catapult').launch);
    expect(unit(s1, 'u0').engines[0].fired).toBe(true);
  });

  it('a ballista also gets the full grade-3 spread once crewed, medium reach and all', () => {
    const s0 = battle(['Ballista']);
    const shoot = offer(s0, 'shoot');
    expect(shoot.granted).toBe(3);
    expect(shoot.rungs[2].targets.map((t) => t.id)).toEqual(['u1']);
  });

  it('a ram only works against a wall it stands beside, and adds +2', () => {
    const s0 = battle(['Battering Ram'], 2);
    expect(availableActions(s0, 'u0').some((o) => o.type === 'fight')).toBe(false);
    unit(s0, 'u0').square = parse('c5');
    expect(offer(s0, 'fight')).toBeUndefined();
    unit(s0, 'u0').square = parse('c6');
    const key = edgeKey(parse('c6'), parse('c7'));
    expect(offer(s0, 'fight').rungs[0].targets.map((t) => t.id)).toContain(key);
    const s1 = act(s0, { type: 'fight', rung: 1, target: key }, scriptedRng([10]));
    expect(s1.log.find((e) => e.check)!.check!.modifier).toBe(unit(s0, 'u0').stats.strike! + 2);
    expect(s1.board.walls[key].remaining).toBe(2);
  });

  it('a catapult bombards a wall from anywhere in its band', () => {
    const s0 = battle(['Catapult'], 1);
    const key = edgeKey(parse('c6'), parse('c7'));
    expect(offer(s0, 'shoot').rungs[2].targets.map((t) => t.id)).toContain(key);
    const s1 = act(s0, { type: 'shoot', rung: 3, target: key }, scriptedRng([20]));
    expect(s1.board.walls[key].remaining).toBe(0);
  });

  it('a routed unit abandons its engine and an adjacent enemy captures it when the battle ends', () => {
    const s0 = battle(['Catapult']);
    const u0 = unit(s0, 'u0');
    u0.disorder = u0.quality;
    u0.engines[0].status = 'abandoned';
    u0.engines[0].square = parse('c2');
    unit(s0, 'u1').square = parse('c3');
    let s = s0;
    while (s.phase === 'battle') {
      const u = activeUnit(s)!;
      s = availableActions(s, u.id).some((o) => o.type === 'guard')
        ? act(s, { type: 'guard', rung: 1, unit: u.id }, scriptedRng([10]))
        : act(s, { type: 'withdraw', unit: u.id }, scriptedRng([1]));
    }
    expect(activeUnit(s)).toBeNull();
    expect(unit(s, 'u0').engines[0].status).toBe('captured');
  });
});
