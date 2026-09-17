import { describe, expect, it } from 'vitest';
import { act, at, createBattle, engagedEnemies, gridOf, meleePlans, notation, parse, select, type UnitCard } from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const card: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
function battle() {
  const b = createBattle({ board: openBoard('square'), units: [
    { card, side: 'attacker', square: 'e2' }, { card, side: 'defender', square: 'e7' },
  ] });
  b.pending = 'attacker'; b.units[0].speed = 20;
  return select(b, b.units[0].id);
}

describe('complete melee routes', () => {
  it('offers the ordinary attack and the cheaper charge as distinct choices', () => {
    const b = battle(); const [u, target] = b.units;
    const plans = meleePlans(b, u, target.id);
    expect(plans.map(p => [p.kind, p.moveActions + 1])).toEqual([['fight', 3], ['charge', 2]]);
    expect(plans.find(p => p.kind === 'charge')!.bonus).toBe(2);
    expect(notation(u.square)).toBe('e2');
    expect(b.log).toHaveLength(1);
  });

  it.each(['fight', 'charge'] as const)('resolves move + %s exactly like the separate legal actions', kind => {
    const b = battle(); const [u, target] = b.units;
    const plan = meleePlans(b, u, target.id).find(p => p.kind === kind)!;
    const combined = act(b, { type: 'advance', target: target.id, via: plan.via!, finish: kind }, scriptedRng([15, 15]));
    const moved = act(b, { type: 'move', to: plan.via! }, scriptedRng([]));
    const separate = act(moved, { type: kind, target: target.id, activity: 1 }, scriptedRng([15, 15]));
    expect(combined).toEqual(separate);
    expect(notation(b.units[0].square)).toBe('e2');
  });

  it('reserves the full chosen attack cost and rejects the sequence before any movement or dice', () => {
    const b = battle(); const [u, target] = b.units;
    const plan = meleePlans(b, u, target.id).find(p => p.kind === 'fight')!;
    const before = JSON.stringify(b);
    expect(() => act(b, { type: 'advance', target: target.id, via: plan.via!, finish: 'fight', activity: 2 }, { d20() { throw new Error('dice drawn'); } }))
      .toThrow('exceed the available actions');
    expect(JSON.stringify(b)).toBe(before);
  });

  it('offers a move and fight when another enemy prevents the charge', () => {
    const b = battle(); const [u, target] = b.units;
    target.square = parse('e6');
    b.units.push({ ...target, id: 'blocker', square: parse('f5') });
    for (const cell of gridOf(b.board).cells()) at(b.board, cell).terrain = 'water';
    for (const key of ['e2', 'e3', 'e4', 'e5', 'e6', 'f5']) at(b.board, parse(key)).terrain = 'open';
    const plans = meleePlans(b, u, target.id);
    expect(plans.map(p => p.kind)).toEqual(['fight']);
    for (const cell of plans[0].movePath.slice(1, -1)) {
      expect(engagedEnemies(b, { ...u, square: parse(cell) })).toHaveLength(0);
    }
  });

  it('uses banked movement, prices rough ground and preserves the final one-action attack', () => {
    const b = battle(); const [u, target] = b.units;
    b.begun = true; u.actions = 1; u.feet = 20; target.square = parse('e6');
    const plan = meleePlans(b, u, target.id).find(p => p.kind === 'charge')!;
    expect(plan.moveActions).toBe(0);
    expect(() => act(b, { type: 'advance', target: target.id, via: plan.via!, finish: 'charge' }, scriptedRng([15, 15]))).not.toThrow();
    u.feet = 0;
    at(b.board, parse('e3')).terrain = 'swamp';
    expect(meleePlans(b, u, target.id)).toEqual([]);
    u.attacked = true; u.actions = 3;
    expect(meleePlans(b, u, target.id)).toEqual([]);
  });
});
