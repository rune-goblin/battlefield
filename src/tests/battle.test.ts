import { describe, expect, it } from 'vitest';
import {
  act, activeUnit, availableActions, createBattle, defenceOf, isOutflanked, rangeBetween, routDc, strikeModifier, unit, volleyModifier,
} from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import type { BattleState } from '../engine/types.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'close', tactics: [] };
const trolls: UnitCard = { name: 'Trolls', level: 8, role: 'infantry', pace: true, tactics: [] };

function battle(rolls: number[], board = openBoard()) {
  // Initiative rolls descend so the order is the deployment order.
  const rng = scriptedRng([20, 15, 15, 1, ...rolls]);
  const state = createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: cavalry, side: 'attacker', square: 'e2' },
      { card: kobolds, side: 'defender', square: 'c7' },
      { card: trolls, side: 'defender', square: 'e7' },
    ],
    board,
  }, rng);
  return { state, rng };
}

const place = (state: BattleState, id: string, sq: string) => { unit(state, id).square = parse(sq); };
const kinds = (state: BattleState) => availableActions(state).map((o) => o.kind);
const option = (state: BattleState, kind: string) => availableActions(state).find((o) => o.kind === kind);

describe('deployment and initiative', () => {
  it('orders units by initiative and starts out of volley range', () => {
    const { state } = battle([]);
    expect(state.order).toEqual(['u0', 'u1', 'u2', 'u3']);
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('extreme');
  });
  it('rejects a unit outside its three deployment ranks or on water', () => {
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a4' }], board: openBoard() }, scriptedRng([1])))
      .toThrow(/cannot deploy/);
    const board = openBoard();
    board.squares[0][0].terrain = 'water';
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a1' }], board }, scriptedRng([1]))).toThrow(/cannot deploy/);
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a3' }, { card: cavalry, side: 'attacker', square: 'a3' }], board }, scriptedRng([1, 1])))
      .toThrow(/occupied/);
  });
});

describe('movement', () => {
  it('advance moves one square in any direction, and Pace reaches two on open ground', () => {
    const { state, rng } = battle([]);
    const adv = option(state, 'advance')!;
    expect(adv.targets).toEqual(expect.arrayContaining(['c3', 'c1', 'b2', 'd2']));
    expect(adv.targets).not.toContain('c4');
    const s = act(state, { kind: 'advance', target: 'c3' }, rng);
    expect(unit(s, 'u0').square).toEqual(parse('c3'));
    expect(s.actionsLeft).toBe(2);
    const s2 = act(s, { kind: 'pass' }, rng);
    expect(activeUnit(s2)!.id).toBe('u1');
    expect(option(s2, 'advance')!.targets).toContain('e4');
  });
  it('forest cancels Pace and swamp costs two actions', () => {
    const board = openBoard();
    board.squares[2][4].terrain = 'forest';
    board.squares[2][2].terrain = 'swamp';
    const { state, rng } = battle([], board);
    const slow = availableActions(state).find((o) => o.kind === 'advance' && o.cost === 2)!;
    expect(slow.targets).toEqual(['c3']);
    const s = act(state, { kind: 'pass' }, rng);
    expect(option(s, 'advance')!.targets).not.toContain('e4');
  });
  it('water and walls block movement', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    const { state } = battle([], board);
    expect(option(state, 'advance')!.targets).toEqual(expect.not.arrayContaining(['c3', 'd2']));
  });
  it('an engaged unit cannot advance and withdraws for two actions under a free strike', () => {
    const { state, rng } = battle([20]);
    place(state, 'u2', 'c3');
    expect(kinds(state)).not.toContain('advance');
    const w = option(state, 'withdraw')!;
    expect(w.cost).toBe(2);
    expect(w.targets).toEqual(expect.arrayContaining(['c1', 'b2', 'd2']));
    expect(w.targets).not.toContain('c3');
    const s = act(state, { kind: 'withdraw', target: 'c1' }, rng);
    expect(unit(s, 'u2').reactionUsed).toBe(true);
    expect(unit(s, 'u0').wounds).toBe(1);
  });
  it('shallows pin an engaged unit', () => {
    const board = openBoard();
    board.squares[1][2].terrain = 'shallows';
    const { state } = battle([], board);
    place(state, 'u2', 'c3');
    expect(kinds(state)).not.toContain('withdraw');
    expect(kinds(state)).not.toContain('retreat');
  });
});

describe('strikes and wounds', () => {
  it('a hit deals one wound, a critical two, and the second strike takes −5', () => {
    const { state, rng } = battle([10, 20]);
    place(state, 'u2', 'c3');
    const s = act(state, { kind: 'strike', target: 'u2' }, rng);
    expect(unit(s, 'u2').wounds).toBe(1);
    expect(option(s, 'strike')!.label).toBe('Strike (−5)');
    const s2 = act(s, { kind: 'strike', target: 'u2' }, rng);
    expect(s2.log.at(-2)!.check!.modifier).toBe(unit(s2, 'u0').stats.strike! - 5);
    expect(unit(s2, 'u2').wounds).toBe(3);
  });
  it('four wounds destroy the unit', () => {
    const { state, rng } = battle([10]);
    place(state, 'u2', 'c3');
    unit(state, 'u2').wounds = 3;
    const s = act(state, { kind: 'strike', target: 'u2' }, rng);
    expect(unit(s, 'u2').status).toBe('destroyed');
  });
  it('a critical failure leaves the striker exposed', () => {
    const { state, rng } = battle([1]);
    place(state, 'u2', 'c3');
    unit(state, 'u2').stats.defence = 40;
    const s = act(state, { kind: 'strike', target: 'u2' }, rng);
    expect(unit(s, 'u0').exposed).toBe(true);
    expect(defenceOf(s, unit(s, 'u0'), null, false)).toBe(22);
  });
  it('striking uphill or from a swamp costs −1', () => {
    const board = openBoard();
    board.squares[2][2].elevation = 1;
    board.squares[1][2].terrain = 'swamp';
    const { state } = battle([], board);
    place(state, 'u2', 'c3');
    expect(strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'))).toBe(unit(state, 'u0').stats.strike! - 2);
    expect(strikeModifier(state, unit(state, 'u2'), unit(state, 'u0'))).toBe(unit(state, 'u2').stats.strike!);
  });
});

describe('outflanking and bracing', () => {
  it('a unit engaged from two squares is outflanked for −2 Defence', () => {
    const { state } = battle([]);
    place(state, 'u2', 'd2');
    place(state, 'u1', 'd3');
    expect(isOutflanked(state, unit(state, 'u2'))).toBe(true);
    expect(defenceOf(state, unit(state, 'u2'), null, false)).toBe(unit(state, 'u2').stats.defence - 2);
  });
  it('diagonal neighbours are not engaged', () => {
    const { state } = battle([]);
    place(state, 'u2', 'd3');
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('close');
  });
  it('brace adds +2 and does not stack with forest cover', () => {
    const board = openBoard();
    board.squares[6][2].terrain = 'forest';
    const { state } = battle([], board);
    const k = unit(state, 'u2');
    k.braced = true;
    expect(defenceOf(state, k, null, true)).toBe(k.stats.defence + 2);
    expect(defenceOf(state, k, null, false)).toBe(k.stats.defence + 2);
  });
  it('a braced unit spends its reaction on a free Strike at an enemy advancing in', () => {
    const { state, rng } = battle([20]);
    place(state, 'u2', 'c4');
    unit(state, 'u2').braced = true;
    const s = act(state, { kind: 'advance', target: 'c3' }, rng);
    expect(unit(s, 'u0').wounds).toBe(1);
    expect(unit(s, 'u2').reactionUsed).toBe(true);
    place(s, 'u1', 'c2');
    unit(s, 'u2').braced = true;
    expect(unit(s, 'u2').reactionUsed).toBe(true);
  });
});

describe('volleys', () => {
  it('needs reach: a close-reach salvo cannot fire at long range', () => {
    const { state, rng } = battle([]);
    const s = act(act(state, { kind: 'pass' }, rng), { kind: 'pass' }, rng);
    place(s, 'u0', 'c4');
    expect(activeUnit(s)!.id).toBe('u2');
    expect(kinds(s)).not.toContain('volley');
    place(s, 'u0', 'c5');
    expect(option(s, 'volley')!.targets).toEqual(['u0']);
  });
  it('high ground reaches one band further and ignores forest cover', () => {
    const board = openBoard();
    board.squares[6][2].elevation = 1;
    board.squares[3][2].terrain = 'forest';
    const { state, rng } = battle([], board);
    const s = act(act(state, { kind: 'pass' }, rng), { kind: 'pass' }, rng);
    place(s, 'u0', 'c4');
    expect(option(s, 'volley')!.targets).toEqual(['u0']);
    expect(defenceOf(s, unit(s, 'u0'), unit(s, 'u2'), true)).toBe(unit(s, 'u0').stats.defence);
    expect(defenceOf(s, unit(s, 'u0'), unit(s, 'u3'), true)).toBe(unit(s, 'u0').stats.defence + 1);
  });
  it('is not allowed while engaged and is −4 into a melee', () => {
    const { state, rng } = battle([]);
    const s = act(act(state, { kind: 'pass' }, rng), { kind: 'pass' }, rng);
    place(s, 'u0', 'c6');
    expect(kinds(s)).not.toContain('volley');
    place(s, 'u0', 'd7');
    place(s, 'u2', 'c5');
    expect(volleyModifier(s, unit(s, 'u2'), unit(s, 'u0'))).toBe(unit(s, 'u2').stats.volley! - 4);
  });
});

describe('morale', () => {
  it('a wounded unit checks at end of round and fails into shaken', () => {
    const { state, rng } = battle([10, 6, 6, 6, 6, 6, 6]);
    place(state, 'u2', 'c3');
    let s = act(state, { kind: 'strike', target: 'u2' }, rng);
    while (s.round === 1 && s.phase === 'battle') s = act(s, { kind: 'pass' }, rng);
    expect(unit(s, 'u2').shaken).toBe(1);
  });
  it('uses the highest enemy within close range for the rout DC, with fear +2 and high ground −2', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    expect(routDc(state, unit(state, 'u2'))).toBe(22);
    place(state, 'u1', 'd3');
    expect(routDc(state, unit(state, 'u2'))).toBe(23);
    unit(state, 'u1').fear = true;
    expect(routDc(state, unit(state, 'u2'))).toBe(25);
    state.board.squares[2][2].elevation = 1;
    expect(routDc(state, unit(state, 'u2'))).toBe(23);
  });
  it('shaken 3 routs the unit, which retreats homeward and leaves at its edge', () => {
    const { state, rng } = battle([]);
    unit(state, 'u2').shaken = 3;
    let s = act(act(state, { kind: 'pass' }, rng), { kind: 'pass' }, rng);
    expect(unit(s, 'u2').square).toEqual(parse('c8'));
    expect(activeUnit(s)!.id).toBe('u3');
    s = act(act(act(s, { kind: 'pass' }, rng), { kind: 'pass' }, rng), { kind: 'pass' }, rng);
    expect(unit(s, 'u2').status).toBe('left');
  });
  it('ends the battle when one side has nothing standing', () => {
    const { state, rng } = battle([]);
    unit(state, 'u2').status = 'destroyed';
    unit(state, 'u3').shaken = 3;
    let s = state;
    while (s.phase === 'battle') s = act(s, { kind: 'pass' }, rng);
    expect(s.winner).toBe('attacker');
    expect(s.endedBy).toBe('rout');
  });
  it('dusk ends round six as a draw', () => {
    const { state, rng } = battle([]);
    let s = state;
    while (s.phase === 'battle') s = act(s, { kind: 'pass' }, rng);
    expect(s.round).toBe(6);
    expect(s.endedBy).toBe('dusk');
  });
});

describe('walls and cliffs', () => {
  function walled() {
    const board = openBoard();
    board.walls[edgeKey(parse('c6'), parse('c7'))] = { tier: 2, boxes: 3, remaining: 3 };
    const { state, rng } = battle([10], board);
    place(state, 'u0', 'c6');
    return { state, rng };
  }
  it('engages across the wall at −2 for the attacker and blocks the advance', () => {
    const { state } = walled();
    expect(option(state, 'strike')!.targets).toEqual(['u2']);
    expect(strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'))).toBe(unit(state, 'u0').stats.strike! - 2);
    expect(strikeModifier(state, unit(state, 'u2'), unit(state, 'u0'))).toBe(unit(state, 'u2').stats.strike!);
    expect(kinds(state)).not.toContain('advance');
  });
  it('the garrison volleys at +1 and checks morale at −2 until the wall falls', () => {
    const { state } = walled();
    const k = unit(state, 'u2');
    expect(routDc(state, k)).toBe(20);
    place(state, 'u0', 'c4');
    expect(volleyModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley! + 1);
    state.board.walls[edgeKey(parse('c6'), parse('c7'))].remaining = 0;
    expect(volleyModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley!);
  });
  it('a cliff separates neighbours entirely', () => {
    const board = openBoard();
    board.squares[2][2].elevation = 2;
    const { state } = battle([], board);
    place(state, 'u2', 'c3');
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('close');
    expect(option(state, 'advance')!.targets).not.toContain('c3');
  });
});
