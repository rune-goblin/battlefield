import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, unit } from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { ENGINES } from '../engine/engines.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { openBoard } from './helpers.js';

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
  }, scriptedRng([20, 1]));
}

describe('siege engines', () => {
  it('imports all 59 Trooper weapons with launch bonuses', () => {
    expect(ENGINES).toHaveLength(59);
    expect(engine('Catapult')).toMatchObject({ kind: 'artillery', launch: 12, reach: 'extreme' });
    expect(engine('Battering Ram').kind).toBe('ram');
  });
  it('a catapult fires at extreme range without penalty, once per round', () => {
    const s0 = battle(['Catapult']);
    const fire = availableActions(s0).find((o) => o.kind === 'fire-engine')!;
    expect(fire.targets).toEqual(['u1']);
    const s1 = act(s0, { kind: 'fire-engine', engine: 0, target: 'u1' }, scriptedRng([10]));
    expect(unit(s1, 'u1').wounds).toBe(1);
    expect(availableActions(s1).some((o) => o.kind === 'fire-engine')).toBe(false);
  });
  it('a ballista cannot reach extreme range', () => {
    expect(availableActions(battle(['Ballista'])).some((o) => o.kind === 'fire-engine')).toBe(false);
  });
  it('a ram only works against a wall it stands beside and gets +2', () => {
    const s0 = battle(['Battering Ram'], 2);
    expect(availableActions(s0).some((o) => o.kind === 'engine-bombard')).toBe(false);
    unit(s0, 'u0').square = parse('c6');
    const key = edgeKey(parse('c6'), parse('c7'));
    expect(availableActions(s0).find((o) => o.kind === 'engine-bombard')!.targets).toEqual([key]);
    const s1 = act(s0, { kind: 'engine-bombard', engine: 0, target: key }, scriptedRng([10]));
    expect(s1.log.at(-2)!.check!.modifier).toBe(engine('Battering Ram').launch + 2);
    expect(s1.board.walls[key].remaining).toBe(2);
  });
  it('a catapult bombards a wall from anywhere', () => {
    const s0 = battle(['Catapult'], 1);
    expect(availableActions(s0).find((o) => o.kind === 'engine-bombard')!.targets).toHaveLength(1);
  });
  it('a routed unit abandons its engine and an adjacent enemy captures it when the battle ends', () => {
    const s0 = battle(['Catapult']);
    const u0 = unit(s0, 'u0');
    u0.shaken = 3;
    u0.engines[0].status = 'abandoned';
    u0.engines[0].square = parse('c2');
    unit(s0, 'u1').square = parse('c3');
    let s = s0;
    while (s.phase === 'battle') s = act(s, { kind: 'pass' }, scriptedRng([1]));
    expect(activeUnit(s)).toBeNull();
    expect(unit(s, 'u0').engines[0].status).toBe('captured');
  });
});
