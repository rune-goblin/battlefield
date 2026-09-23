import { describe, expect, it } from 'vitest';
import { act, availableActions, createBattle, isOutflanked, moveReach, unit } from '../engine/battle.js';
import { allSquares, gridFor, notation, parse, squareGrid, type Grid } from '../engine/grid.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import type { BattleState } from '../engine/types.js';
import type { Verb } from '../engine/ladders.js';

const hexGrid = gridFor('hex', 9);
const at = (grid: Grid, key: string) => grid.neighbours(parse(key)).map(notation).sort();

describe.each([['square', squareGrid], ['hex', hexGrid]] as const)('%s grid', (_kind, grid) => {
  it('round-trips keys and centres', () => {
    for (const c of grid.cells()) {
      expect(grid.parse(grid.key(c))).toEqual(c);
      for (const size of [16, 40]) expect(grid.fromPoint(grid.center(c, size), size)).toEqual(c);
    }
  });
  it('keeps edge keys and distance symmetric', () => {
    const [a, b] = [parse('c4'), parse('d4')];
    expect(grid.edgeKey(a, b)).toBe(grid.edgeKey(b, a));
    expect(grid.distance(a, b)).toBe(grid.distance(b, a));
    expect(grid.edgeSegment(a, b, 40)).toHaveLength(2);
  });
});

describe('square grid', () => {
  it('has four orthogonal neighbours and Manhattan distance', () => {
    expect(at(squareGrid, 'd4')).toEqual(['c4', 'd3', 'd5', 'e4']);
    expect(at(squareGrid, 'a1')).toEqual(['a2', 'b1']);
    expect(squareGrid.distance(parse('a1'), parse('c4'))).toBe(5);
    expect(squareGrid.beyond(parse('c2'), parse('c3'))).toEqual(parse('c4'));
  });
});

describe('hex grid', () => {
  it('has six neighbours inside the board and fewer at the rim', () => {
    expect(at(hexGrid, 'd4')).toEqual(['c4', 'd3', 'd5', 'e3', 'e4', 'e5']);
    expect(at(hexGrid, 'c1')).toEqual(['b2', 'c2', 'd1']);
    expect(at(hexGrid, 'g1')).toEqual(['f1', 'f2', 'g2']);
  });
  it('measures cube distance, so a square diagonal can be one step or two', () => {
    expect(hexGrid.distance(parse('c2'), parse('d1'))).toBe(1);
    expect(hexGrid.distance(parse('c2'), parse('b3'))).toBe(2);
    expect(hexGrid.distance(parse('c1'), parse('e4'))).toBe(4);
  });
  it('continues a Pace step in the same cube direction', () => {
    expect(hexGrid.beyond(parse('c1'), parse('c2'))).toEqual(parse('d3'));
    expect(hexGrid.beyond(parse('e2'), parse('e3'))).toEqual(parse('d4'));
    expect(hexGrid.beyond(parse('e2'), parse('f2'))).toEqual(parse('g2'));
    expect(hexGrid.beyond(parse('a2'), parse('a1'))).toBeNull();
  });
  it('sends each side homeward by rows', () => {
    expect(hexGrid.homeward(parse('d4'), 'attacker').map(notation).sort()).toEqual(['d3', 'e3']);
    expect(hexGrid.homeward(parse('d4'), 'defender').map(notation).sort()).toEqual(['d5', 'e5']);
  });
});

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'short', tactics: [] };
const trolls: UnitCard = { name: 'Trolls', level: 8, role: 'infantry', tactics: [] };

function hexBattle() {
  return createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: cavalry, side: 'attacker', square: 'e2' },
      { card: kobolds, side: 'defender', square: 'c7' },
      { card: trolls, side: 'defender', square: 'e7' },
    ],
    board: openBoard('hex'),
  });
}

const offer = (state: BattleState, type: Verb, id?: string) =>
  availableActions(state, id).find((o) => o.type === type)!;
const targets = (state: BattleState, type: Verb, activity: 1 | 2 | 3, id?: string) =>
  offer(state, type, id).activities[activity - 1].targets.map((t) => t.id);

describe('battle on hex', () => {
  it('strides into six neighbours for ten feet each, and further for a second action', () => {
    const state = hexBattle();
    const moves = moveReach(state, unit(state, 'u0'));
    for (const cell of ['b2', 'c1', 'c3', 'd1', 'd2', 'd3']) {
      expect(moves.get(cell), cell).toMatchObject({ feet: 10, actions: 1 });
    }
    expect(moves.get('c4')).toMatchObject({ feet: 20, actions: 2 });
    expect(moves.get('c5')).toMatchObject({ feet: 30, actions: 3 });
  });
  it('engages across a square diagonal and flanks from two of the six', () => {
    const state = hexBattle();
    unit(state, 'u2').square = parse('d1');
    expect(targets(state, 'fight', 1, 'u0')).toEqual(['u2']);
    unit(state, 'u3').square = parse('c3');
    expect(isOutflanked(state, unit(state, 'u0'))).toBe(true);
  });
  it('sends a routed unit homeward by rows and off its own edge', () => {
    const state = hexBattle();
    unit(state, 'u0').disorder = 3;
    const s = act(state, { type: 'step', to: 'c1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').status).toBe('left');
  });
});
