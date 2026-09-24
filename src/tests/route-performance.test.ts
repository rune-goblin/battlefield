import { afterEach, describe, expect, it, vi } from 'vitest';
import * as paths from '../engine/path.js';
import { chargePath, createBattle, movePath, moveReach, parse, type UnitCard } from '../engine/index.js';
import { openBoard } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
const card: UnitCard = { name: 'Infantry', level: 3, role: 'infantry', tactics: [] };
const battle = () => createBattle({ board: openBoard(), units: [
  { card, side: 'attacker', square: 'c2' }, { card, side: 'defender', square: 'g8' },
] });

describe('movement route work', () => {
  it('reuses the charge search to reconstruct its route', () => {
    const state = battle();
    const unit = state.units[0];
    unit.actions = 3;
    unit.speed = 20;
    state.units[1].square = parse('c6');
    const search = vi.spyOn(paths, 'reachableVia');
    expect(chargePath(state, unit, state.units[1].id)).toEqual(['c2', 'c3', 'c4', 'c5']);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('searches the board once for a legal route', () => {
    const state = battle();
    const unit = state.units[0];
    unit.actions = 3;
    unit.speed = 20;
    const search = vi.spyOn(paths, 'reachableVia');
    const route = movePath(state, unit, 'c4');
    expect(route.map(step => step.cell)).toEqual(['c2', 'c3', 'c4']);
    expect(search).toHaveBeenCalledTimes(1);
    expect(route.at(-1)).toMatchObject({ feet: 20, actions: 1 });
  });

  it('keeps route endpoints consistent with reach through terrain and enemy control', () => {
    const state = battle();
    const unit = state.units[0];
    unit.actions = 3;
    unit.speed = 25;
    state.board.squares[2][2].terrain = 'water';
    state.board.squares[3][2].terrain = 'forest';
    state.units[1].square = parse('e4');
    const reach = moveReach(state, unit);
    for (const [cell, cost] of reach) expect(movePath(state, unit, cell).at(-1)).toEqual({ cell, ...cost });
    for (const cell of ['c2', 'c3', 'e4', 'i9']) expect(movePath(state, unit, cell)).toEqual([]);
    unit.rooted = 1;
    expect(movePath(state, unit, 'b2')).toEqual([]);
  });
});
