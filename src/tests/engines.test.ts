import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, unit } from '../engine/battle.js';
import { ENGINES } from '../engine/engines.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'close', tactics: [] };
const open = { cover: false, rough: false, river: false };
const engine = (name: string) => ENGINES.find((e) => e.name === name)!;

function battle(engines: string[], wallsTier?: number) {
  return createBattle({
    units: [
      { card: infantry, side: 'attacker', step: 1, engines: engines.map(engine) },
      { card: kobolds, side: 'defender', step: 5 },
    ],
    terrain: open,
    wallsTier,
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
    expect(s1.log.at(-2)!.check!.modifier).toBe(12);
    expect(unit(s1, 'u1').wounds).toBe(1);
    expect(availableActions(s1).some((o) => o.kind === 'fire-engine')).toBe(false);
  });
  it('a ballista cannot reach extreme range', () => {
    expect(availableActions(battle(['Ballista'])).some((o) => o.kind === 'fire-engine')).toBe(false);
  });
  it('a ram only works against walls from step 5 and gets +2', () => {
    const s0 = battle(['Battering Ram'], 2);
    expect(availableActions(s0).some((o) => o.kind === 'engine-bombard')).toBe(false);
    unit(s0, 'u0').step = 5;
    unit(s0, 'u1').step = 6;
    const s1 = act(s0, { kind: 'engine-bombard', engine: 0 }, scriptedRng([10]));
    expect(s1.log.at(-2)!.check!.modifier).toBe(engine('Battering Ram').launch + 2);
    expect(s1.walls!.remaining).toBe(2);
  });
  it('a routed unit abandons its engine and an enemy on that step captures it when the battle ends', () => {
    const s0 = battle(['Catapult']);
    const u0 = unit(s0, 'u0');
    u0.shaken = 3;
    u0.engines[0].status = 'abandoned';
    u0.engines[0].step = 1;
    unit(s0, 'u1').step = 1;
    let s = act(s0, { kind: 'retreat' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    expect(s.phase).toBe('ended');
    expect(unit(s, 'u0').engines[0].status).toBe('captured');
  });
});
