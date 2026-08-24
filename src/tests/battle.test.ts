import { describe, expect, it } from 'vitest';
import {
  act, activeUnit, availableActions, createBattle, defenceOf, isOutflanked, rangeBetween, routDc, unit,
} from '../engine/battle.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import type { BattleState } from '../engine/types.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'close', tactics: [] };
const trolls: UnitCard = { name: 'Trolls', level: 8, role: 'infantry', pace: true, tactics: [] };
const open = { cover: false, rough: false, river: false };

function battle(rolls: number[], extra: Partial<Parameters<typeof createBattle>[0]> = {}) {
  // Initiative rolls descend so the order is the deployment order.
  const rng = scriptedRng([20, 15, 15, 1, ...rolls]);
  const state = createBattle({
    units: [
      { card: infantry, side: 'attacker', step: 1 },
      { card: cavalry, side: 'attacker', step: 1 },
      { card: kobolds, side: 'defender', step: 5 },
      { card: trolls, side: 'defender', step: 5 },
    ],
    terrain: open,
    ...extra,
  }, rng);
  return { state, rng };
}

const place = (state: BattleState, id: string, step: number) => { unit(state, id).step = step; };
const kinds = (state: BattleState) => availableActions(state).map((o) => o.kind);

describe('deployment and initiative', () => {
  it('orders units by initiative and starts at step distances that are extreme', () => {
    const { state } = battle([]);
    expect(state.order).toEqual(['u0', 'u1', 'u2', 'u3']);
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('extreme');
  });
  it('rejects a unit outside its deployment zone', () => {
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', step: 3 }], terrain: open }, scriptedRng([1])))
      .toThrow(/cannot deploy/);
  });
});

describe('movement', () => {
  it('advance moves one step and the double advance needs Pace on open ground', () => {
    const { state, rng } = battle([]);
    expect(kinds(state)).not.toContain('double-advance');
    let s = act(state, { kind: 'advance' }, rng);
    expect(unit(s, 'u0').step).toBe(2);
    s = act(s, { kind: 'pass' }, rng);
    expect(activeUnit(s)!.id).toBe('u1');
    expect(kinds(s)).toContain('double-advance');
  });
  it('rough ground forbids the double advance', () => {
    const { state } = battle([], { terrain: { ...open, rough: true } });
    place(state, 'u0', 1);
    let s = act(state, { kind: 'pass' }, scriptedRng([]));
    expect(kinds(s)).not.toContain('double-advance');
  });
});

describe('strikes and wounds', () => {
  it('a hit deals one wound and a critical hit two', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    let s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([10]));
    expect(unit(s, 'u2').wounds).toBe(1);
    unit(s, 'u0').strikeUsed = false;
    s = act(s, { kind: 'strike', target: 'u2' }, scriptedRng([20]));
    expect(unit(s, 'u2').wounds).toBe(3);
  });
  it('a unit may Strike once per round', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    const s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([2]));
    expect(kinds(s)).not.toContain('strike');
  });
  it('four wounds destroy the unit', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    unit(state, 'u2').wounds = 3;
    const s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('destroyed');
  });
  it('a critical failure leaves the striker exposed', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    unit(state, 'u2').stats.defence = 40;
    const s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([1]));
    expect(unit(s, 'u0').exposed).toBe(true);
    expect(defenceOf(s, unit(s, 'u0'), false)).toBe(22);
  });
});

describe('outflanking and bracing', () => {
  it('a unit engaged by two enemies is outflanked for −2 Defence', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    expect(isOutflanked(state, unit(state, 'u2'))).toBe(true);
    expect(defenceOf(state, unit(state, 'u2'), false)).toBe(unit(state, 'u2').stats.defence - 2);
  });
  it('brace adds +2 and does not stack with cover', () => {
    const { state } = battle([], { terrain: { ...open, cover: true } });
    const k = unit(state, 'u2');
    k.braced = true;
    expect(defenceOf(state, k, true)).toBe(k.stats.defence + 2);
  });
  it('a braced unit takes a free Strike at an enemy advancing in, and that spends its Strike', () => {
    const { state } = battle([]);
    place(state, 'u2', 2);
    unit(state, 'u2').braced = true;
    const s = act(state, { kind: 'advance' }, scriptedRng([19]));
    expect(unit(s, 'u0').wounds).toBe(1);
    expect(unit(s, 'u2').strikeUsed).toBe(true);
  });
});

describe('volleys', () => {
  it('needs reach: a close-reach salvo cannot fire at long range', () => {
    const { state } = battle([]);
    place(state, 'u0', 4);
    place(state, 'u2', 6);
    place(state, 'u3', 6);
    let s = act(state, { kind: 'pass' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    expect(activeUnit(s)!.id).toBe('u2');
    expect(availableActions(s).find((o) => o.kind === 'volley')).toBeUndefined();
    place(s, 'u0', 5);
    expect(availableActions(s).find((o) => o.kind === 'volley')!.targets).toEqual(['u0']);
  });
  it('is not allowed while engaged', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    const s = act(state, { kind: 'pass' }, scriptedRng([]));
    s.activeIndex = 2;
    expect(kinds(s)).not.toContain('volley');
  });
});

describe('morale', () => {
  it('a wounded unit checks at end of round and fails into shaken', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    // strike hits (10), then three passes, then kobolds' rout check rolls 2.
    let s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([10]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([8]));
    s = act(s, { kind: 'pass' }, scriptedRng([8]));
    expect(s.round).toBe(2);
    expect(unit(s, 'u2').shaken).toBe(1);
  });
  it('uses the highest enemy within close range for the rout DC, with fear +2', () => {
    const { state } = battle([]);
    place(state, 'u2', 1);
    expect(routDc(state, unit(state, 'u2'))).toBe(23);
    unit(state, 'u1').fear = true;
    expect(routDc(state, unit(state, 'u2'))).toBe(25);
  });
  it('shaken 3 routs the unit, which must retreat and leaves at its edge', () => {
    const { state } = battle([]);
    unit(state, 'u2').shaken = 3;
    place(state, 'u2', 5);
    let s = act(state, { kind: 'pass' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    expect(unit(s, 'u2').status).toBe('left');
    expect(activeUnit(s)!.id).toBe('u3');
  });
  it('ends the battle when one side has nothing standing', () => {
    const { state } = battle([]);
    unit(state, 'u2').status = 'destroyed';
    unit(state, 'u3').shaken = 3;
    place(state, 'u3', 6);
    let s = act(state, { kind: 'pass' }, scriptedRng([]));
    s = act(s, { kind: 'pass' }, scriptedRng([]));
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('attacker');
  });
  it('dusk ends round six as a draw', () => {
    const { state } = battle([]);
    state.round = 6;
    let s = state;
    for (let i = 0; i < 4; i++) s = act(s, { kind: 'pass' }, scriptedRng([]));
    expect(s.endedBy).toBe('dusk');
    expect(s.winner).toBe('draw');
  });
});

describe('walls', () => {
  it('engage across the wall at −2 for the attacker and bombard breaches them', () => {
    const { state } = battle([], { wallsTier: 2 });
    place(state, 'u0', 5);
    place(state, 'u2', 6);
    place(state, 'u3', 6);
    const opt = availableActions(state).find((o) => o.kind === 'strike')!;
    expect(opt.targets).toEqual(['u2', 'u3']);
    const s = act(state, { kind: 'strike', target: 'u2' }, scriptedRng([10]));
    const c = s.log.at(-1)!.check ?? s.log.at(-2)!.check;
    expect(c!.modifier).toBe(unit(s, 'u0').stats.strike! - 2);
  });
  it('the garrison gets the wall bonus until the walls fall', () => {
    const { state } = battle([], { wallsTier: 3 });
    place(state, 'u2', 6);
    expect(defenceOf(state, unit(state, 'u2'), false)).toBe(unit(state, 'u2').stats.defence + 2);
    state.walls!.remaining = 0;
    expect(defenceOf(state, unit(state, 'u2'), false)).toBe(unit(state, 'u2').stats.defence);
  });
});
