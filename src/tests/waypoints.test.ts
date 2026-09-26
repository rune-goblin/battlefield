import { describe, expect, it } from 'vitest';
import { act, activation, chargePath, chargeTargets, createBattle, meleePlans, movePath, moveReach, notation, parse, select, type UnitCard } from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', salvo: 'medium', tactics: [] };

function battle(enemyAt: string) {
  const b = createBattle({ board: openBoard('square'), units: [
    { card: troop, side: 'attacker', square: 'c2' },
    { card: troop, side: 'defender', square: 'e7' },
  ] });
  b.units[1].square = parse(enemyAt);
  b.pending = 'attacker';
  return b;
}

describe('waypoints', () => {
  it('walk a move through each waypoint and price the whole road', () => {
    const b = battle('h8');
    const u = b.units[0];
    const road = movePath(b, u, 'c3', ['d3']);
    expect(road.map((s) => s.cell)).toEqual(['c2', 'd2', 'd3', 'c3']);
    expect(moveReach(b, u, ['d3']).get('c3')).toEqual({ feet: 30, actions: 3 });
    expect(moveReach(b, u).get('c3')).toEqual({ feet: 10, actions: 1 });
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'c3', waypoints: ['d3'] }, scriptedRng([]));
    expect(notation(moved.units[0].square)).toBe('c3');
  });

  it('refuse a waypoint the route cannot reach', () => {
    const b = battle('h8');
    expect(moveReach(b, b.units[0], ['h1']).size).toBe(0);
    expect(() => act(select(b, b.units[0].id), { type: 'move', unit: b.units[0].id, to: 'c3', waypoints: ['h1'] }, scriptedRng([]))).toThrow(/cannot reach/);
  });

  it('run a charge through its waypoints to the hex the last one names', () => {
    const b = battle('c4');
    const [u, enemy] = b.units;
    u.speed = 30;
    expect(chargeTargets(b, u).find((c) => c.unit === enemy.id)?.cell).toBe('b4');
    expect(chargePath(b, u, enemy.id, ['d4'])).toEqual(['c2', 'd2', 'd3', 'd4']);
    const charged = act(select(b, u.id), { type: 'charge', unit: u.id, target: enemy.id, waypoints: ['d4'] }, scriptedRng([10, 10, 10]));
    expect(notation(charged.units[0].square)).toBe('d4');
  });

  it('let a waypoint beside the target choose where a move and charge lands', () => {
    const b = battle('c4');
    const [u, enemy] = b.units;
    expect(meleePlans(b, u, enemy.id).find((p) => p.kind === 'charge')).toMatchObject({ via: null, cell: 'c3' });
    const plan = meleePlans(b, u, enemy.id, ['b4']).find((p) => p.kind === 'charge')!;
    expect(plan).toMatchObject({ via: 'b2', cell: 'b4', moveActions: 1 });
    const charged = act(select(b, u.id), { type: 'advance', unit: u.id, target: enemy.id, via: 'b2', finish: 'charge', waypoints: ['b4'] }, scriptedRng([10, 10, 10]));
    expect(notation(charged.units[0].square)).toBe('b4');
  });

  it('carry into the activation answer for melee, move and charge alike', () => {
    const b = select(battle('c4'), 'u0');
    const [u, enemy] = b.units;
    const via = activation(b, u.id, ['b4'])!;
    expect(via.melee.get(enemy.id)).toEqual(meleePlans(b, u, enemy.id, ['b4']));
    expect(via.melee.get(enemy.id)).not.toEqual(activation(b, u.id)!.melee.get(enemy.id));
    expect(via.moves).toEqual(moveReach(b, u, ['b4']));
    expect(via.charges).toEqual(chargeTargets(b, u, ['b4']));
  });
});
