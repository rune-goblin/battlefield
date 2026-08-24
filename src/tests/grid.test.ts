import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, isOutflanked, unit } from '../engine/battle.js';
import { allSquares, hexGrid, notation, parse, squareGrid, type Grid } from '../engine/grid.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import type { BattleState } from '../engine/types.js';

const at = (grid: Grid, key: string) => grid.neighbours(parse(key)).map(notation).sort();

describe.each([['square', squareGrid], ['hex', hexGrid]] as const)('%s grid', (_kind, grid) => {
  it('round-trips keys and centres', () => {
    for (const c of allSquares()) {
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
    expect(at(hexGrid, 'a1')).toEqual(['a2', 'b1']);
    expect(at(hexGrid, 'h1')).toEqual(['g1', 'g2', 'h2']);
  });
  it('measures cube distance, so a square diagonal can be one step or two', () => {
    expect(hexGrid.distance(parse('c2'), parse('d1'))).toBe(1);
    expect(hexGrid.distance(parse('c2'), parse('b1'))).toBe(2);
    expect(hexGrid.distance(parse('a1'), parse('c4'))).toBe(4);
  });
  it('continues a Pace step in the same cube direction', () => {
    expect(hexGrid.beyond(parse('a1'), parse('a2'))).toEqual(parse('b3'));
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
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'close', tactics: [] };
const trolls: UnitCard = { name: 'Trolls', level: 8, role: 'infantry', tactics: [] };

function hexBattle() {
  const rng = scriptedRng([20, 15, 15, 1, 10, 10, 10, 10]);
  const state = createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: cavalry, side: 'attacker', square: 'e2' },
      { card: kobolds, side: 'defender', square: 'c7' },
      { card: trolls, side: 'defender', square: 'e7' },
    ],
    board: openBoard('hex'),
  }, rng);
  return { state, rng };
}

const option = (state: BattleState, kind: string) => availableActions(state).find((o) => o.kind === kind);

describe('battle on hex', () => {
  it('advances into six neighbours and Pace reaches the cell beyond', () => {
    const { state, rng } = hexBattle();
    expect(option(state, 'advance')!.targets).toEqual(expect.arrayContaining(['b2', 'd2', 'c1', 'd1', 'c3', 'd3']));
    const s = act(act(state, { kind: 'advance', target: 'd1' }, rng), { kind: 'pass' }, rng);
    expect(unit(s, 'u0').square).toEqual(parse('d1'));
    expect(activeUnit(s)!.id).toBe('u1');
    expect(option(s, 'advance')!.targets).toContain('d4');
  });
  it('engages across a square diagonal and outflanks from two of the six', () => {
    const { state } = hexBattle();
    unit(state, 'u2').square = parse('d1');
    expect(option(state, 'strike')!.targets).toEqual(['u2']);
    unit(state, 'u3').square = parse('c3');
    expect(isOutflanked(state, unit(state, 'u0'))).toBe(true);
  });
  it('retreats homeward by rows', () => {
    const { state, rng } = hexBattle();
    const s = act(state, { kind: 'retreat', target: 'c1' }, rng);
    expect(unit(s, 'u0').status).toBe('left');
  });
});
