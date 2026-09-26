import { describe, expect, it } from 'vitest';
import {
  act, at, COMBATANTS, createBattle, dragBlockReason, movementRates, movementSpeed, moveReach,
  notation, parse, select, speedOf, stepFeet, type UnitCard,
} from '../engine/index.js';
import { upgradeEngine } from '../engine/legacy.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const source = COMBATANTS.find(c => c.name === 'Line Infantry')!;
const card = (land: number, otherSpeeds: { type: string; value: number }[] = []): UnitCard => ({
  ...source, sheet: { ...source.sheet!, speed: land, otherSpeeds },
});
const battle = (army: UnitCard) => {
  const b = createBattle({ board: openBoard('hex'), units: [
    { card: army, side: 'attacker', square: 'c2' },
    { card: source, side: 'defender', square: 'g8' },
  ] });
  b.pending = 'attacker';
  return b;
};

describe('source movement speeds', () => {
  it('uses the source speeds regardless of role or Pace', () => {
    for (const role of ['infantry', 'cavalry'] as const) {
      expect(speedOf({ ...card(20), role, pace: true })).toBe(20);
      expect(speedOf({ ...card(60), role, pace: false })).toBe(40);
    }
    expect(speedOf(card(0))).toBe(0);
    expect(movementRates(card(0, [{ type: 'fly', value: 60 }]))).toEqual({ land: 0, fly: 40, swim: 0 });
  });

  it.each([[0, 0], [10, 1], [15, 1], [20, 2], [25, 2], [30, 2], [35, 3], [40, 3], [45, 3], [60, 4]])(
    'converts source Speed %i to %i hexes per Move', (feet, hexes) => {
      expect(speedOf(card(feet))).toBe(hexes * 10);
    });

  it('uses Wyvern Flight’s 60-foot flight and preserves its source values in battle', () => {
    const wyverns = COMBATANTS.find(c => c.name === 'Wyvern Flight')!;
    const b = battle(wyverns); const u = b.units[0];
    expect(u.sourceSpeed).toEqual({ speed: 20, otherSpeeds: [{ type: 'fly', value: 60 }] });
    expect(movementSpeed(u)).toBe(40);
    at(b.board, parse('c3')).terrain = 'water';
    at(b.board, parse('c4')).terrain = 'water';
    at(b.board, parse('c5')).terrain = 'water';
    at(b.board, parse('c6')).terrain = 'water';
    u.actions = 1;
    expect(moveReach(b, u).get('c6')?.actions).toBe(1);
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'c6' }, scriptedRng([]));
    expect(notation(moved.units[0].square)).toBe('c6');
    expect(moved.units[0].actions).toBe(2);
  });

  it('chooses land on open ground and flight over expensive terrain at their own rates', () => {
    const board = openBoard('hex');
    const rates = movementRates(card(60, [{ type: 'fly', value: 30 }]));
    expect(stepFeet(board, parse('c2'), parse('c3'), { rates })).toBe(10);
    at(board, parse('c3')).terrain = 'swamp';
    expect(stepFeet(board, parse('c2'), parse('c3'), { rates })).toBe(20);
    at(board, parse('c3')).terrain = 'water';
    expect(stepFeet(board, parse('c2'), parse('c3'), { rates })).toBe(20);
  });

  it('uses swim Speed in water, land Speed on land, and shares one action budget', () => {
    const b = battle(card(15, [{ type: 'swim', value: 30 }])); const u = b.units[0];
    u.actions = 1;
    at(b.board, parse('c3')).terrain = 'water';
    at(b.board, parse('c4')).terrain = 'water';
    expect(moveReach(b, u).get('c4')?.actions).toBe(1);
    expect(moveReach(b, u).has('e2')).toBe(false);
    expect(dragBlockReason(b, u, 'c3')).toBeNull();
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'c3' }, scriptedRng([]));
    expect(moved.units[0].feet).toBe(10);
    expect(moveReach(moved, moved.units[0]).get('c4')?.actions).toBe(0);
    expect(moveReach(moved, moved.units[0]).get('d3')?.actions).toBe(1);
  });

  it('keeps a slow swimmer from borrowing a faster land Speed', () => {
    const b = battle(card(60, [{ type: 'swim', value: 15 }])); const u = b.units[0];
    u.actions = 1;
    at(b.board, parse('c3')).terrain = 'water';
    at(b.board, parse('c4')).terrain = 'water';
    expect(moveReach(b, u).get('c3')?.actions).toBe(1);
    expect(moveReach(b, u).has('c4')).toBe(false);
    expect(dragBlockReason(b, u, 'c4')).toContain('needs 2 movement actions');
  });

  it('crosses an adjacent rough hill for one Move at source Speed 20', () => {
    const b = battle(card(20)); const u = b.units[0];
    at(b.board, parse('c3')).terrain = 'rough';
    at(b.board, parse('c3')).elevation = 1;
    u.actions = 1;
    expect(dragBlockReason(b, u, 'c3')).toBeNull();
    u.actions = 3;
    expect(moveReach(b, u).get('c3')).toMatchObject({ feet: 20, actions: 1 });
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'c3' }, scriptedRng([]));
    expect(notation(moved.units[0].square)).toBe('c3');
    expect(moved.units[0].actions).toBe(2);
  });

  it('limits hauling to land Speed and prevents hauling an engine into water', () => {
    const b = battle(card(20, [{ type: 'fly', value: 60 }, { type: 'swim', value: 60 }])); const u = b.units[0];
    u.engines.push({ id: 'test', name: 'Test cart', kind: 'artillery', launch: 0, reach: null,
      fired: false, emplaced: false, status: 'crewed', square: u.square, side: u.side, hauling: true, speed: 20 });
    expect(movementSpeed(u)).toBe(20);
    at(b.board, parse('c3')).terrain = 'water';
    expect(moveReach(b, u).has('c3')).toBe(false);
  });

  it.each([
    { terrain: 'rough', actions: 2 },
    { terrain: 'swamp', actions: 3 },
  ] as const)('hauls an engine with a legacy half-hex rate uphill into $terrain in $actions actions', ({ terrain, actions }) => {
    const b = battle(card(20)); const u = b.units[0];
    u.engines.push({ id: 'test', name: 'Test cart', kind: 'artillery', launch: 0, reach: null,
      fired: false, emplaced: false, status: 'crewed', square: u.square, side: u.side, hauling: true, speed: 5 });
    upgradeEngine(u.engines[0]);
    at(b.board, parse('c3')).terrain = terrain;
    at(b.board, parse('c3')).elevation = 1;
    expect(movementSpeed(u)).toBe(10);
    expect(stepFeet(b.board, u.square, parse('c3'))).toBe(actions * 10);
    expect(dragBlockReason(b, u, 'c3')).toBeNull();
    expect(moveReach(b, u).get('c3')?.actions).toBe(actions);
    const moved = act(select(b, u.id), { type: 'move', unit: u.id, to: 'c3' }, scriptedRng([]));
    if (actions < 3) expect(moved.units[0].actions).toBe(3 - actions);
    else expect(moved.activated).toContain(u.id);
    expect(moved.units[0].engines[0].square).toEqual(parse('c3'));
  });
});
