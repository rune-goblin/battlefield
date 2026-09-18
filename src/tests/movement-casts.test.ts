import { describe, expect, it } from 'vitest';
import { act, availableActions, createBattle, endActivation, moveReach, unit } from '../engine/battle.js';
import { gridOf, notation, parse } from '../engine/board.js';
import type { UnitCard } from '../engine/cards.js';
import { CAST_ACTIVITIES } from '../engine/magic.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const caster: UnitCard = { name: 'Wizard', level: 6, role: 'infantry', caster: true, tradition: 'arcane', tactics: [], overrides: { spellAttack: 10 } };
const ally: UnitCard = { name: 'Ally', level: 6, role: 'infantry', tactics: [] };
const setup = () => createBattle({ board: openBoard(), units: [
  { card: caster, side: 'attacker', square: 'c2' },
  { card: ally, side: 'attacker', square: 'd2' },
  { card: ally, side: 'defender', square: 'i8' },
] });
const burst = (state = setup(), target = 'u1') => act(state,
  { type: 'cast', spell: 'movement', activity: 1, target, unit: 'u0' },
  { d20: () => { throw new Error('Burst of speed must not roll'); } });
const placements = (state: ReturnType<typeof setup>) => availableActions(state, 'u0')
  .find(o => o.type === 'cast' && o.spell === 'movement')!.activities[2].targets.map(t => t.id);

describe('Movement cast progression', () => {
  it('offers Burst of speed, Sure footing, and Translocate in order', () => {
    expect(CAST_ACTIVITIES.movement.map(a => a.label)).toEqual(['Burst of speed', 'Sure footing', 'Translocate']);
  });

  it('grants one hex automatically and spends one caster action', () => {
    const s = burst();
    expect(unit(s, 'u1').feet).toBe(10);
    expect(unit(s, 'u1').movementBonus).toBe(10);
    expect(unit(s, 'u0').actions).toBe(2);
  });

  it('grants one hex once, retains terrain costs, and expires after the ally acts', () => {
    const start = setup();
    start.board.squares[2][3].terrain = 'forest';
    let s = burst(start);
    expect(unit(s, 'u1').feet).toBe(10);
    expect(unit(s, 'u1').speed).toBe(10);
    expect(moveReach(s, unit(s, 'u1')).get('d3')).toMatchObject({ feet: 20, actions: 1 });
    s = endActivation(s, scriptedRng([10]));
    s = endActivation(s, scriptedRng([10]), 'u2');
    s = act(s, { type: 'move', to: 'd3', unit: 'u1' }, scriptedRng([10]));
    expect(unit(s, 'u1').feet).toBe(0);
    expect(unit(s, 'u1').actions).toBe(2);
    s = endActivation(s, scriptedRng([10]));
    expect(unit(s, 'u1').movementBonus).toBe(0);
    expect(unit(s, 'u1').feet).toBe(0);
  });

  it('makes a self-cast available immediately and clears it at activation end', () => {
    let s = burst(setup(), 'u0');
    expect(moveReach(s, unit(s, 'u0')).get('c3')).toMatchObject({ actions: 0 });
    s = act(s, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').feet).toBe(0);
    s = endActivation(s, scriptedRng([10]));
    expect(unit(s, 'u0').movementBonus).toBe(0);
  });

  it('keeps the existing bonus without stacking or replenishing spent movement', () => {
    const s = setup();
    unit(s, 'u1').movementBonus = 10;
    unit(s, 'u1').feet = 10;
    expect(unit(burst(s), 'u1').feet).toBe(10);
    unit(s, 'u1').feet = 0;
    expect(unit(burst(s), 'u1').feet).toBe(0);
  });

  it('puts the terrain benefit at two actions without granting flight', () => {
    const s = act(setup(), { type: 'cast', spell: 'movement', activity: 2, target: 'u1', unit: 'u0' }, scriptedRng([]));
    expect(unit(s, 'u0').actions).toBe(1);
    expect(unit(s, 'u1').sureFooting).toBe(true);
    expect(unit(s, 'u1').flies).toBe(false);
    expect(unit(s, 'u1').movementBonus).toBe(0);
  });

  it.each([0, 10, 70])('caps Translocate at four hexes with recipient Speed %i', speed => {
    const s = setup();
    unit(s, 'u0').speed = 80;
    unit(s, 'u1').speed = speed;
    const targets = placements(s);
    expect(targets).toContain('d2+d6');
    expect(targets).not.toContain('d2+d7');
    const moved = act(s, { type: 'cast', spell: 'movement', activity: 3, target: 'd2+d6', unit: 'u0' }, scriptedRng([]));
    expect(unit(moved, 'u1').square).toEqual(parse('d6'));
    expect(unit(moved, 'u1').actions).toBe(3);
    expect(() => act(s, { type: 'cast', spell: 'movement', activity: 3, target: 'd2+d7', unit: 'u0' }, scriptedRng([]))).toThrow();
  });

  it('uses hex distance and keeps the ally within the caster’s short range', () => {
    const s = setup();
    s.board = openBoard('hex');
    const g = gridOf(s.board);
    const origin = unit(s, 'u1').square;
    const targets = placements(s).filter(t => t.startsWith('d2+'));
    expect(targets.length).toBeGreaterThan(0);
    expect(Math.max(...targets.map(t => g.distance(origin, parse(t.split('+')[1]))))).toBe(4);
    const beyond = g.cells().find(sq => g.distance(origin, sq) === 5)!;
    expect(targets).not.toContain(`d2+${notation(beyond)}`);
    unit(s, 'u1').square = parse('h5');
    expect(placements(s).some(t => t.startsWith('h5+'))).toBe(false);
  });

  it('crosses obstacles while requiring an empty landing the ally can occupy', () => {
    const s = setup();
    s.board.squares[5][3].terrain = 'water';
    expect(placements(s)).not.toContain('d2+d6');
    expect(placements(s)).not.toContain('d2+c2');
    unit(s, 'u1').flying = true;
    expect(placements(s)).toContain('d2+d6');
    unit(s, 'u1').flying = false;
    s.board.squares[5][3].terrain = 'open';
    s.board.squares[3][3].terrain = 'water';
    s.board.squares[4][3].elevation = 3;
    expect(placements(s)).toContain('d2+d6');
  });
});
