import { describe, expect, it } from 'vitest';
import { act, activation, at, createBattle, dragBlockReason, gridOf, notation, parse, select, type UnitCard } from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
function battle() {
  const b = createBattle({ board: openBoard('square'), units: [
    { card: cavalry, side: 'attacker', square: 'e2' },
    { card: cavalry, side: 'defender', square: 'e7' },
  ] });
  b.pending = 'attacker';
  b.units[0].speed = 20;
  return b;
}

describe('drag refusal feedback', () => {
  it('offers a complete approach when affordable and explains an insufficient budget', () => {
    const b = battle(); const u = b.units[0];
    expect(dragBlockReason(b, u, 'e7')).toBeNull();
    u.actions = 1;
    expect(dragBlockReason(b, u, 'e7')).toContain('exceeds that budget');
    u.actions = 3;
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'e5' }, scriptedRng([10]));
    const mover = moved.units[0];
    expect(mover.actions).toBe(1);
    expect(dragBlockReason(moved, mover, 'e7')).toBeNull();
    expect(activation(moved, mover.id)!.charges.some(c => c.unit === b.units[1].id)).toBe(true);
    expect(() => act(moved, { type: 'charge', unit: mover.id, target: b.units[1].id }, scriptedRng([10, 10]))).not.toThrow();
  });

  it('allows a one-action fight in contact and explains a spent attack separately from actions', () => {
    const b = battle(); const [u, enemy] = b.units;
    u.square = parse('e6'); u.actions = 1;
    expect(dragBlockReason(b, u, 'e7')).toBeNull();
    expect(activation(b, u.id)!.offers.find(o => o.type === 'fight')!.activities[0].legal).toBe(true);
    u.attacked = true;
    expect(dragBlockReason(b, u, 'e7')).toContain('already attacked this activation');
    enemy.square = parse('e8');
    expect(dragBlockReason(b, u, 'e8')).toContain('already attacked this activation');
  });

  it('explains enemy control when it closes every charge approach', () => {
    const b = battle(); const [u, enemy] = b.units;
    u.square = parse('e4'); enemy.square = parse('e6');
    b.units.push({ ...enemy, id: 'blocker', square: parse('e5') });
    expect(dragBlockReason(b, u, 'e6')).toContain('already in contact');
    u.square = parse('e2');
    b.units[2].square = parse('f5');
    for (const cell of gridOf(b.board).cells()) at(b.board, cell).terrain = 'water';
    for (const cell of ['e2', 'e3', 'e4', 'e5', 'e6', 'f5']) at(b.board, parse(cell)).terrain = 'open';
    u.actions = 1;
    expect(dragBlockReason(b, u, 'e6')).toContain('Another enemy controls the approach');
  });

  it('reports water, occupancy and movement cost instead of a bare X', () => {
    const b = battle(); const [u, ally] = b.units;
    at(b.board, parse('d2')).terrain = 'water';
    expect(dragBlockReason(b, u, 'd2')).toContain('Water');
    ally.side = u.side; ally.square = parse('f2');
    expect(dragBlockReason(b, u, 'f2')).toContain('occupies f2');
    u.actions = 1;
    expect(dragBlockReason(b, u, 'e6')).toContain('needs 2 movement actions');
    expect(dragBlockReason(b, u, 'e3')).toBeNull();
    expect(dragBlockReason(b, u, notation(u.square))).toBeNull();
  });

  it.each([
    ['rooted', (u: ReturnType<typeof battle>['units'][number]) => { u.rooted = 1; }],
    ['pinned', (u: ReturnType<typeof battle>['units'][number]) => { u.pinnedBy = 'u1'; }],
    ['All actions are spent', (u: ReturnType<typeof battle>['units'][number]) => { u.actions = 0; }],
  ] as const)('explains %s', (reason, change) => {
    const b = battle(); const u = b.units[0]; change(u);
    expect(dragBlockReason(b, u, 'e7')).toContain(reason);
  });
});
