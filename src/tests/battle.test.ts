import { describe, expect, it } from 'vitest';
import {
  act, activatable, activation, activeUnit, availableActions, chargeTargets, createBattle, crewOf, defenceOf, deselect,
  endActivation, isOutflanked, isRouted, isShaken, isStanding, moveReach, movePath,
  rangeBetween, routDcFor, select, shootModifier, strikeModifier, unit,
} from '../engine/battle.js';
import { edgeKey, notation, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { ACTION_BONUS, ACTIONS_PER_ACTIVATION, MAX_WOUNDS } from '../engine/types.js';
import type { ActionOffer, BattleState, Side } from '../engine/types.js';
import { rungOf, type Grade, type LadderType } from '../engine/ladders.js';
import { levelDc } from '../engine/tables.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'short', tactics: [] };
const trolls: UnitCard = { name: 'Trolls', level: 8, role: 'infantry', pace: true, tactics: [] };

function battle(rolls: number[], board = openBoard()) {
  const rng = scriptedRng(rolls.length ? rolls : [10]);
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
// Emplacement status follows position, and nothing but an action recomputes it — a test that
// moves a unit by hand has to run one to see the consequence.
const refresh = (state: BattleState) => endActivation(act(state, { type: 'guard', rung: 1 }, scriptedRng([10])));
/** Burn every unit's activation so `endRound` runs, which is where an engine changes hands. */
const runRound = (state: BattleState) => {
  let s = state;
  while (s.round === 1 && s.phase === 'battle') s = burn(s, activeUnit(s)!.id);
  return s;
};
const types = (state: BattleState, id?: string) => availableActions(state, id).map((o) => o.type);
const offer = (state: BattleState, type: LadderType, id?: string) =>
  availableActions(state, id).find((o) => o.type === type) as ActionOffer;
const targets = (o: ActionOffer, rung: Grade) => o.rungs[rung - 1].targets.map((t) => t.id);
const guardOn = (state: BattleState, id: string, rng = scriptedRng([10])) =>
  act(state, { type: 'guard', rung: 1, unit: id }, rng);
const moves = (state: BattleState, id: string) => moveReach(state, unit(state, id));
const said = (state: BattleState, text: string) => state.log.some((e) => e.text.includes(text));
// An activation always refills to three actions, so spending two on Guard is the way to a
// unit with a single action left.
const oneActionLeft = (state: BattleState, id: string) => guardOn(guardOn(state, id), id);
// A routed unit is offered no ladder at all, only the withdrawal, so burning its activation
// takes both. One action leaves two unspent, so the activation is ended by hand unless the
// action ended it.
const burn = (state: BattleState, id: string) => {
  const s = availableActions(state, id).some((o) => o.type === 'guard')
    ? guardOn(state, id)
    : act(state, { type: 'withdraw', unit: id }, scriptedRng([10]));
  return s.phase === 'battle' && s.active === id ? endActivation(s) : s;
};

describe('deployment', () => {
  it('rejects a unit outside its three deployment ranks, on water, or on a taken square', () => {
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a4' }], board: openBoard() }))
      .toThrow(/cannot deploy/);
    const board = openBoard();
    board.squares[0][0].terrain = 'water';
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a1' }], board })).toThrow(/cannot deploy/);
    expect(() => createBattle({ units: [{ card: infantry, side: 'attacker', square: 'a3' }, { card: cavalry, side: 'attacker', square: 'a3' }], board }))
      .toThrow(/occupied/);
  });
  it('starts the attacker out of shooting range of the defender', () => {
    const { state } = battle([]);
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('long');
  });
});

describe('alternating activation', () => {
  const order = (state: BattleState, steps: number) => {
    const sides: Side[] = [];
    let s = state;
    for (let i = 0; i < steps && s.phase === 'battle'; i++) {
      const u = activeUnit(s)!;
      sides.push(u.side);
      s = burn(s, u.id);
    }
    return sides;
  };

  it('alternates strictly when the forces are equal', () => {
    const { state } = battle([]);
    expect(order(state, 4)).toEqual(['attacker', 'defender', 'attacker', 'defender']);
  });

  it('gives the extra activations to the side with more units left to act', () => {
    const state = createBattle({
      units: [
        { card: infantry, side: 'attacker', square: 'a2' },
        { card: infantry, side: 'attacker', square: 'b2' },
        { card: infantry, side: 'attacker', square: 'c2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    expect(order(state, 4)).toEqual(['attacker', 'attacker', 'defender', 'attacker']);
  });

  it('lets the player choose which unit of the pending side acts', () => {
    const { state } = battle([]);
    expect(activatable(state, 'attacker').map((u) => u.id)).toEqual(['u0', 'u1']);
    expect(activeUnit(select(state, 'u1'))!.id).toBe('u1');
    const s = burn(select(state, 'u1'), 'u1');
    expect(s.activated).toEqual(['u1']);
    expect(activeUnit(s)!.side).toBe('defender');
  });

  it('takes back a pick until an action is spent, then holds it', () => {
    const { state } = battle([]);
    expect(deselect(select(state, 'u1')).active).toBe(null);
    const begun = guardOn(select(state, 'u1'), 'u1');
    expect(deselect(begun).active).toBe('u1');
  });

  it('gives each activation three actions and hands over when they are spent', () => {
    const { state } = battle([]);
    let s = guardOn(state, 'u0');
    expect(unit(s, 'u0').actions).toBe(2);
    expect(activation(s)!.actions).toBe(2);
    expect(activeUnit(s)!.id).toBe('u0');
    expect(() => guardOn(s, 'u1')).toThrow(/already under way/);
    s = guardOn(guardOn(s, 'u0'), 'u0');
    expect(s.activated).toEqual(['u0']);
    expect(unit(s, 'u0').actions).toBe(3);
    expect(activeUnit(s)!.side).toBe('defender');
  });

  it('lets a unit stop with actions unspent', () => {
    const { state } = battle([]);
    const s = endActivation(guardOn(state, 'u0'));
    expect(s.activated).toEqual(['u0']);
    expect(activeUnit(s)!.side).toBe('defender');
  });

  it('starts a new round when everyone has acted', () => {
    let s = battle([]).state;
    for (let i = 0; i < 4; i++) s = burn(s, activeUnit(s)!.id);
    expect(s.round).toBe(2);
    expect(s.activated).toEqual([]);
  });
});

describe('the menu is filtered by situation', () => {
  it('offers Shoot and Guard in the open, and movement outside the menu', () => {
    const { state } = battle([]);
    expect(types(state, 'u2')).toEqual(['shoot', 'guard', 'rally']);
    expect(types(state, 'u0')).toEqual(['guard', 'rally']);
    const a = activation(state, 'u0')!;
    expect(a.actions).toBe(3);
    expect(a.speed).toBe(10);
    expect(a.moves.size).toBeGreaterThan(0);
  });
  it('offers Fight and Guard in contact, Rally throughout, and the withdrawal alongside', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    expect(types(state, 'u0')).toEqual(['fight', 'guard', 'rally']);
    expect(activation(state, 'u0')!.withdraw).not.toBeNull();
    unit(state, 'u0').disorder = 1;
    expect(types(state, 'u0')).toEqual(['fight', 'guard', 'rally']);
    // Out of contact and steady, there is nothing to break from.
    expect(activation(state, 'u1')!.withdraw).toBeNull();
  });
  it("offers a caster one row per tree its tradition grants", () => {
    // No tradition set falls back to arcane (cards.ts), whose grid is 0 in Healing.
    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const s = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    expect(availableActions(s, 'u0').filter((o) => o.type === 'cast').map((o) => o.spell))
      .toEqual(['blast', 'controlling', 'offense', 'defense', 'movement']);
  });
});

describe('the six trees', () => {
  const cleric: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
  const castOffer = (state: BattleState, tree: string, id = 'u0') =>
    availableActions(state, id).find((o) => o.type === 'cast' && o.spell === tree)!;

  it("gates which trees a tradition grants at all, and how far each may push", () => {
    const s = createBattle({
      units: [{ card: cleric, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    // Divine's own grid (section 11): blast 1, healing 3, controlling 2, offense 2, defense 2,
    // movement 0 — no Movement row at all, and Blast locked at Tier 1.
    expect(availableActions(s, 'u0').filter((o) => o.type === 'cast').map((o) => o.spell))
      .toEqual(['blast', 'healing', 'controlling', 'offense', 'defense']);
    expect(castOffer(s, 'blast').rungs.map((r) => r.cost)).toEqual([1, null, null]);
    expect(castOffer(s, 'healing').rungs.map((r) => r.cost)).toEqual([1, 2, 3]);
  });

  it("anchors each tree's Tier 1 range at its own base band, and only a range push extends it", () => {
    const s = createBattle({
      units: [
        { card: cleric, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'a1' },
        { card: infantry, side: 'attacker', square: 'a2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    place(s, 'u1', 'c3'); // distance 1: engaged, inside Healing's own base range
    place(s, 'u2', 'c4'); // distance 2: short, one band past it
    unit(s, 'u2').disorder = 1;
    // Tier 1's own target list is the real, unpushed band; Tier 3's is the optimistic
    // superset a range push could reach — `doCastAction` re-checks the real one at resolution,
    // the same way a shot's own rung re-checks its band once a target is actually chosen.
    expect(castOffer(s, 'healing').rungs[0].targets.map((t) => t.id)).toEqual(['u0', 'u1']);
    expect(castOffer(s, 'healing').rungs[2].targets.map((t) => t.id)).toContain('u2');

    // Buying effect instead of range still can't carry to u2, even at Tier 3.
    const boughtEffect = act(s, { type: 'cast', rung: 3, spell: 'healing', target: 'u2', unit: 'u0' }, scriptedRng([15]));
    expect(unit(boughtEffect, 'u2').disorder).toBe(1);

    // Buying range instead reaches it, at Tier 1's own effect (clears 1 disorder).
    const boughtRange = act(s, { type: 'cast', rung: 2, spell: 'healing', target: 'u2', unit: 'u0', axis: 'range' }, scriptedRng([15]));
    expect(unit(boughtRange, 'u2').disorder).toBe(0);
  });

  it("rolls the caster's spell attack against Defence for Blast", () => {
    const blaster: UnitCard = {
      name: 'Blaster', level: 6, role: 'infantry', caster: true, tradition: 'arcane', tactics: [],
      overrides: { spellAttack: 10 },
    };
    const target: UnitCard = { ...infantry, name: 'Target', overrides: { defence: 20 } };
    const launch = (roll: number) => {
      const s = createBattle({
        units: [{ card: blaster, side: 'attacker', square: 'c2' }, { card: target, side: 'defender', square: 'c7' }],
        board: openBoard(),
      });
      place(s, 'u1', 'c3');
      return act(s, { type: 'cast', rung: 1, spell: 'blast', target: 'u1', unit: 'u0' }, scriptedRng([roll, 20]));
    };

    const missed = launch(9);
    expect(unit(missed, 'u1').wounds).toBe(0);
    expect(missed.log.find((e) => e.text.includes('Blasts'))?.check).toMatchObject({ modifier: 10, dc: 20, degree: 'failure' });

    const hit = launch(10);
    expect(unit(hit, 'u1').wounds).toBe(1);
    expect(hit.log.find((e) => e.text.includes('Blasts'))?.check).toMatchObject({ modifier: 10, dc: 20, degree: 'success' });
  });
});

describe('paying for a rung', () => {
  // Level-6 infantry: Fight 2 / Guard 1 / Rally 3 / Shoot 1.
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const costs = (o: ActionOffer) => o.rungs.map((r) => r.cost);

  it('prices a rung at one action at or below the grade, and one more for each rung above', () => {
    const s = engaged();
    for (const [grade, expected] of [[1, [1, 2, 3]], [2, [1, 1, 2]], [3, [1, 1, 1]]] as [Grade, number[]][]) {
      unit(s, 'u0').grades.fight = grade;
      expect(costs(offer(s, 'fight', 'u0'))).toEqual(expected);
    }
    // Every ladder pays the same way, Guard included.
    expect(costs(offer(s, 'guard', 'u0'))).toEqual([1, 2, 3]);
    expect(costs(offer(s, 'rally', 'u0'))).toEqual([1, 1, 1]);
  });

  it('rolls nothing for a rung: the act simply happens at the price', () => {
    const s = engaged();
    unit(s, 'u0').grades.fight = 1;
    const pressed = act(s, { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(unit(pressed, 'u0').actions).toBe(1);
    expect(said(pressed, 'commits 2 actions to Press')).toBe(true);
    expect(pressed.log.some((e) => e.text.includes('reaches for'))).toBe(false);
    const over = act(s, { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(over.activated).toContain('u0');
  });

  it('refuses a rung the actions left cannot pay for, and says what it needs', () => {
    const low = oneActionLeft(engaged(), 'u0');
    unit(low, 'u0').grades.fight = 1;
    expect(offer(low, 'fight', 'u0').rungs.map((r) => r.reason)).toEqual([null, 'needs 2 actions', 'needs 3 actions']);
    expect(() => act(low, { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([10]))).toThrow(/needs 2 actions/);
  });

  it('Shoot and Rally pay the same way: Aim is two actions, and Rally two at grade 1', () => {
    const start = battle([]).state;
    place(start, 'u0', 'c5');
    const s = burn(start, 'u1');
    expect(costs(offer(s, 'shoot', 'u2'))).toEqual([1, 2, 3]);
    const aimed = act(s, { type: 'shoot', rung: 2, target: 'u0', unit: 'u2' }, scriptedRng([10, 10]));
    expect(unit(aimed, 'u2').actions).toBe(1);

    const r = engaged();
    unit(r, 'u0').disorder = 2;
    unit(r, 'u0').grades.rally = 1;
    expect(costs(offer(r, 'rally', 'u0'))).toEqual([1, 2, 3]);
    expect(unit(act(r, { type: 'rally', rung: 2, unit: 'u0' }, scriptedRng([15])), 'u0').actions).toBe(1);
  });

  it('a compelled unit cannot pay for a rung above its grade', () => {
    const s = engaged();
    unit(s, 'u0').compelled = true;
    expect(costs(offer(s, 'fight', 'u0'))).toEqual([1, 1, null]);
    expect(offer(s, 'fight', 'u0').rungs[2].reason).toBe('compelled');
  });

  it("a caster's tiers cost their own number, paid from its own actions first", () => {
    const cleric: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
    const s = createBattle({
      units: [{ card: cleric, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    const tree = (state: BattleState, spell: string) => availableActions(state, 'u0').find((o) => o.type === 'cast' && o.spell === spell)!;
    expect(costs(tree(s, 'healing'))).toEqual([1, 2, 3]);
    // Level 6 ÷ 5: one action of its own, so Tier 3 leaves one of the ordinary three.
    expect(unit(s, 'u0').castPool).toBe(1);
    const deep = act(s, { type: 'cast', rung: 3, spell: 'healing', target: 'u0', unit: 'u0' }, scriptedRng([10]));
    expect(unit(deep, 'u0').castPool).toBe(0);
    expect(unit(deep, 'u0').actions).toBe(1);
    // Blast is capped at Tier 1 for a divine caster: no price reaches further.
    expect(costs(tree(s, 'blast'))).toEqual([1, null, null]);
  });
});

describe('movement points', () => {
  it('one Move action carries a troop one square, and a Pace unit two', () => {
    const { state } = battle([]);
    expect(unit(state, 'u0').speed).toBe(10);
    expect(unit(state, 'u1').speed).toBe(20);
    unit(state, 'u0').actions = 1;
    unit(state, 'u1').actions = 1;
    expect(moves(state, 'u0').get('c3')).toMatchObject({ feet: 10, actions: 1 });
    expect(moves(state, 'u0').has('c4')).toBe(false);
    expect(moves(state, 'u1').get('e4')).toMatchObject({ feet: 20, actions: 1 });
    expect(moves(state, 'u1').has('e5')).toBe(false);
  });

  it('a second Move action buys another square', () => {
    const { state } = battle([]);
    const s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    const u = unit(s, 'u0');
    expect(u.square).toEqual(parse('c3'));
    expect(u.actions).toBe(2);
    expect(u.feet).toBe(0);
    expect(moveReach(s, u).get('c5')).toMatchObject({ feet: 20, actions: 2 });
    expect(movePath(moveReach(s, u), 'c5')).toEqual(['c3', 'c4', 'c5']);
  });

  it('banks the half-action a Pace unit leaves in a single open square', () => {
    const { state } = battle([]);
    const s = act(state, { type: 'move', to: 'e3', unit: 'u1' }, scriptedRng([10]));
    expect(unit(s, 'u1').actions).toBe(2);
    expect(unit(s, 'u1').feet).toBe(10);
    // The banked ten feet buys the next open square outright.
    expect(moves(s, 'u1').get('e4')).toMatchObject({ feet: 10, actions: 0 });
  });

  it('charges a troop two actions for difficult ground and three for swamp', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'forest';
    board.squares[3][2].terrain = 'swamp';
    board.squares[1][3].elevation = 1;
    const { state } = battle([], board);
    const m = moves(state, 'u0');
    expect(m.get('c3')).toMatchObject({ feet: 20, actions: 2 });
    expect(m.get('d2')).toMatchObject({ feet: 20, actions: 2 });
    expect(m.has('c4')).toBe(false);
    // A Pace unit covers two squares an action, so the same forest costs it one.
    expect(moves(state, 'u1').get('e3')).toMatchObject({ feet: 10, actions: 1 });
  });

  it('will not cross water, a standing wall or a cliff, but a breach is a crossing', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    board.squares[1][1].elevation = 2;
    const { state } = battle([], board);
    unit(state, 'u0').actions = 2;
    expect([...moves(state, 'u0').keys()].sort()).toEqual(['b1', 'c1', 'd1']);
    state.board.walls[edgeKey(parse('c2'), parse('d2'))].remaining = 0;
    expect(moves(state, 'u0').get('d2')).toMatchObject({ feet: 10 });
  });

  it('a flier ignores terrain and every blocked edge', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    board.squares[1][1].elevation = 2;
    const { state } = battle([], board);
    const u = unit(state, 'u0');
    u.flying = true;
    u.actions = 1;
    expect([...moves(state, 'u0').keys()].sort()).toContain('c3');
    expect(moves(state, 'u0').get('d2')).toMatchObject({ feet: 10 });
    expect(moves(state, 'u0').get('b2')).toMatchObject({ feet: 10 });
  });

  it('a unit in contact leaves by withdrawing, not by striding', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    expect(moves(state, 'u0').size).toBe(0);
    expect(chargeTargets(state, unit(state, 'u0'))).toEqual([]);
  });

  it('a Charge costs the movement plus one, and the melee is a Fight rung', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c4');
    expect(chargeTargets(state, unit(state, 'u0'))).toEqual([{ unit: 'u2', cell: 'c3', feet: 10, actions: 1 }]);
    const s = act(state, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([20, 1]));
    expect(unit(s, 'u0').square).toEqual(parse('c3'));
    expect(unit(s, 'u0').actions).toBe(1);
    expect(unit(s, 'u2').wounds).toBeGreaterThanOrEqual(1);
  });

  it('three actions cover a stride and then a charge, and no more', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c5');
    let s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    s = act(s, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([10, 10]));
    expect(unit(s, 'u0').square).toEqual(parse('c4'));
    expect(s.activated).toEqual(['u0']);
    expect(s.pending).toBe('defender');
  });

  it('a Move takes no free strikes; only a Withdraw does', () => {
    const { state } = battle([10]);
    place(state, 'u2', 'c4');
    const s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([20]));
    expect(unit(s, 'u0').wounds).toBe(0);
  });
});

describe('one attack an activation, and actions buy acts', () => {
  // Level-6 infantry: strike +11, Will +17, Reflex +14, level DC 22, Fight 2 / Guard 1.
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const strikeMod = (s: BattleState) => s.log.find((e) => e.check)!.check!.modifier;

  it('gives a unit one attack an activation, however many actions are left', () => {
    const s = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').attacked).toBe(true);
    expect(offer(s, 'fight', 'u0').rungs.map((r) => r.legal)).toEqual([false, false, false]);
    expect(offer(s, 'fight', 'u0').rungs[0].reason).toBe('already attacked this activation');
    expect(() => act(s, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5])))
      .toThrow(/already attacked/);
    // Everything that is not an attack is still on offer.
    expect(offer(s, 'guard', 'u0').rungs[0].legal).toBe(true);
  });

  it('spends the same one attack on a shot or a blast', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    const shot = act(burn(state, 'u1'), { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(offer(shot, 'shoot', 'u2').rungs[0].legal).toBe(false);

    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const p0 = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(p0, 'u1', 'c3');
    const blasted = act(p0, { type: 'cast', rung: 1, spell: 'blast', target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(blasted, 'u0').attacked).toBe(true);
    expect(offer(blasted, 'fight', 'u0').rungs[0].legal).toBe(false);
  });

  it('leaves Move buying ground, and a Strike affordable after it', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c4');
    let s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').feet).toBe(0);
    expect(unit(s, 'u0').attacked).toBe(false);
    s = act(s, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(s)).toBe(11);
    expect(unit(s, 'u0').actions).toBe(1);
  });

  it('lets a Fight-2 troop Strike or Press for one action, and Overrun for two', () => {
    const fight = offer(engaged(), 'fight', 'u0');
    expect(fight.granted).toBe(2);
    expect(fight.rungs.map((r) => r.cost)).toEqual([1, 1, 2]);

    const strike = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(strike)).toBe(11);
    expect(unit(strike, 'u0').actions).toBe(2);

    // The rung is not a number: Press rolls exactly what Strike rolls.
    const press = act(engaged(), { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(press)).toBe(11);
    expect(unit(press, 'u0').actions).toBe(2);

    const overrun = act(engaged(), { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(overrun.log.some((e) => e.text.includes('overruns'))).toBe(true);
    expect(unit(overrun, 'u0').actions).toBe(1);
  });

  it('spends the rest on other acts: a Strike and then a Brace', () => {
    let s = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    s = act(s, { type: 'guard', rung: 1, unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').guard).toEqual({ defence: 2, rung: 1 });
    expect(unit(s, 'u0').actions).toBe(1);
  });
});

describe('Rally: the roll carries the amount, the rung carries the scope', () => {
  // Level-6 infantry: Will +17, quality 5, rally grade 3 — Steady, Rally and Inspire are all
  // free, so the tests below pick a rung directly with no reach roll in the way. Kobolds L3
  // sit adjacent at c3, so the rout DC reads their level; Trolls L8 stay out at e7.
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const rallyOn = (disorder: number, roll: number) => {
    const s = engaged();
    unit(s, 'u0').disorder = disorder;
    return unit(act(s, { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([roll])), 'u0');
  };

  it('the degree decides how much clears: all, 2, 1, or nothing and a point gained', () => {
    expect(rallyOn(3, 20).disorder).toBe(0); // critical success clears everything
    expect(rallyOn(3, 6).disorder).toBe(1); // success clears 2
    expect(rallyOn(3, 2).disorder).toBe(2); // failure still clears 1 — degrade, never cancel
    expect(rallyOn(3, 1).disorder).toBe(4); // critical failure (a natural 1) clears nothing, and adds 1
  });

  it('reads the rout DC off the highest-level enemy within close range, falling back to the field', () => {
    const state = engaged();
    expect(routDcFor(state, unit(state, 'u0'))).toBe(levelDc(3)); // Kobolds L3, close at c3
    place(state, 'u2', 'h7'); // now nothing is close; the field falls back to Trolls L8
    expect(routDcFor(state, unit(state, 'u0'))).toBe(levelDc(8));
  });

  it('Rally reaches one adjacent ally, and Inspire reaches every friendly unit within 2', () => {
    const ally = (name: string): UnitCard => ({ name, level: 6, role: 'infantry', tactics: [] });
    const build = () => {
      const state = createBattle({
        units: [
          { card: infantry, side: 'attacker', square: 'a1' },
          { card: ally('Adjacent'), side: 'attacker', square: 'b1' },
          { card: ally('Near'), side: 'attacker', square: 'c1' },
          { card: ally('Far'), side: 'attacker', square: 'd1' },
          { card: kobolds, side: 'defender', square: 'h8' },
        ],
        board: openBoard(),
      });
      place(state, 'u0', 'd4');
      place(state, 'u1', 'd5'); // distance 1 from u0 — adjacent
      place(state, 'u2', 'd6'); // distance 2 — within Inspire, but not Rally
      place(state, 'u3', 'd7'); // distance 3 — beyond both
      unit(state, 'u0').disorder = 1;
      for (const id of ['u1', 'u2', 'u3']) unit(state, id).disorder = 2;
      return state;
    };

    const reach = build();
    expect(offer(reach, 'rally', 'u0').rungs[1].targets.map((t) => t.id)).toEqual(['u1']);
    const rallied = act(reach, { type: 'rally', rung: 2, unit: 'u0', target: 'u1' }, scriptedRng([10]));
    expect(unit(rallied, 'u1').disorder).toBe(1);
    expect(unit(rallied, 'u2').disorder).toBe(2);
    expect(unit(rallied, 'u3').disorder).toBe(2);

    const inspired = act(build(), { type: 'rally', rung: 3, unit: 'u0' }, scriptedRng([10]));
    expect(unit(inspired, 'u1').disorder).toBe(1);
    expect(unit(inspired, 'u2').disorder).toBe(1);
    expect(unit(inspired, 'u3').disorder).toBe(2); // beyond Inspire's radius, untouched
  });

  it('lends heart to a neighbour with nothing to clear', () => {
    const levy: UnitCard = { name: 'Levy', level: 6, role: 'infantry', tactics: [] };
    const state = createBattle({
      units: [
        { card: levy, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'e2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    place(state, 'u0', 'd4');
    place(state, 'u1', 'd5');
    place(state, 'u2', 'd6');
    const bare = strikeModifier(state, unit(state, 'u1'), unit(state, 'u2'));

    // Steady clears nothing here — the levy is in good order — but the troop beside it still
    // takes heart, which is the whole role a weak unit has next to a strong one.
    const s = act(state, { type: 'rally', rung: 1, unit: 'u0', target: 'u1' }, scriptedRng([10]));
    expect(unit(s, 'u1').heartened).toBe(true);
    expect(strikeModifier(s, unit(s, 'u1'), unit(s, 'u2'))).toBe(bare + ACTION_BONUS);

    // It waits for the troop it was given to, and is spent by that activation.
    const round = endActivation(select(endActivation(s), 'u2'));
    expect(unit(round, 'u1').heartened).toBe(true);
    expect(unit(endActivation(select(round, 'u1')), 'u1').heartened).toBe(false);
  });
});

describe('rungs carry effects', () => {
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };

  it('Overrun drives a hit target back a hex and takes its ground; a miss moves nobody', () => {
    const state = engaged();
    unit(state, 'u0').grades.fight = 3;
    const s = act(state, { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(notation(unit(s, 'u0').square)).toBe('c3');
    expect(notation(unit(s, 'u2').square)).toBe('c4');
    expect(said(s, 'drives Kobolds back')).toBe(true);
    const miss = act(state, { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([2, 10]));
    expect(notation(unit(miss, 'u0').square)).toBe('c2');
    expect(notation(unit(miss, 'u2').square)).toBe('c3');
  });

  it('Overrun takes the ground of a target it destroys; a Strike leaves it', () => {
    const state = engaged();
    unit(state, 'u0').grades.fight = 3;
    unit(state, 'u2').wounds = MAX_WOUNDS - 1;
    const s = act(state, { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('destroyed');
    expect(notation(unit(s, 'u0').square)).toBe('c3');
    const strike = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(notation(unit(strike, 'u0').square)).toBe('c2');
  });

  it('Press skips the Fortitude save: a hit disorders outright, and a miss gives nothing extra', () => {
    const hit = act(engaged(), { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(unit(hit, 'u2').wounds).toBe(1);
    expect(unit(hit, 'u2').disorder).toBe(1);
    expect(said(hit, 'no save')).toBe(true);
    // The same 20 on a Strike is a save made, and no disorder.
    const strike = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(unit(strike, 'u2').disorder).toBe(0);
    const miss = act(engaged(), { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([2, 20]));
    expect(unit(miss, 'u2').disorder).toBe(0);
  });

  // Every Guard sets +2 Defence; the rung carries the effect. u2 attacks at +7 into a Defence
  // set for an even matchup.
  const guarded = (rung: Grade) => {
    const state = engaged();
    unit(state, 'u0').grades.guard = 3;
    unit(state, 'u0').stats.defence = strikeModifier(state, unit(state, 'u2'), unit(state, 'u0')) + 12;
    return endActivation(act(state, { type: 'guard', rung, unit: 'u0' }, scriptedRng([10])), 'u0');
  };
  const struck = (s: BattleState, roll: number) =>
    unit(act(s, { type: 'fight', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([roll, 1])), 'u0').wounds;

  it('every Guard is +2 Defence, whatever the rung', () => {
    for (const rung of [1, 2, 3] as Grade[]) {
      const s = guarded(rung);
      expect(unit(s, 'u0').guard).toEqual({ defence: 2, rung });
      expect(defenceOf(s, unit(s, 'u0'), null, false)).toBe(unit(s, 'u0').stats.defence + 2);
    }
  });

  it('lands criticals as ordinary hits on a unit that has dug in, and nowhere else', () => {
    // A natural 20 is a critical at that Defence, so it is exactly the hit Dig in blunts.
    expect(struck(guarded(1), 20)).toBe(2);
    expect(struck(guarded(2), 20)).toBe(1);
    // An ordinary hit is untouched, and so is a miss.
    expect(struck(guarded(2), 19)).toBe(1);
    expect(struck(guarded(2), 13)).toBe(0);
  });

  it('braces the allies beside a shieldwall, and nobody further off', () => {
    const state = engaged();
    unit(state, 'u0').grades.guard = 3;
    place(state, 'u1', 'c1');
    const s = act(state, { type: 'guard', rung: 3, unit: 'u0' }, scriptedRng([10]));
    const ally = unit(s, 'u1');
    expect(defenceOf(s, ally, null, false)).toBe(ally.stats.defence + ACTION_BONUS);
    place(s, 'u1', 'a1');
    expect(defenceOf(s, unit(s, 'u1'), null, false)).toBe(ally.stats.defence);
    // Dig in braces nobody.
    const dug = act(state, { type: 'guard', rung: 2, unit: 'u0' }, scriptedRng([10]));
    expect(defenceOf(dug, unit(dug, 'u1'), null, false)).toBe(ally.stats.defence);
  });
});

describe('shooting', () => {
  it('Fire reaches effective range and Aim one band off it', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    const s = offer(state, 'shoot', 'u2');
    expect(s.granted).toBe(1);
    expect(targets(s, 1)).toEqual(['u0']);
    place(state, 'u0', 'c4');
    const far = offer(state, 'shoot', 'u2');
    expect(targets(far, 1)).toEqual([]);
    expect(targets(far, 2)).toEqual(['u0']);
  });
  it('a shooter on higher ground counts the band one closer, so Fire reaches medium', () => {
    const board = openBoard();
    board.squares[6][2].elevation = 1;
    const { state } = battle([], board);
    place(state, 'u0', 'c4');
    expect(targets(offer(state, 'shoot', 'u2'), 1)).toEqual(['u0']);
  });
  it("a troop's own volley pays nothing beyond the rung at extreme", () => {
    const hex = battle([], openBoard('hex')).state;
    place(hex, 'u0', 'c2');
    place(hex, 'u2', 'c9');
    expect(rangeBetween(hex, unit(hex, 'u2'), unit(hex, 'u0'))).toBe('extreme');
    expect(shootModifier(hex, unit(hex, 'u2'), unit(hex, 'u0'))).toBe(unit(hex, 'u2').stats.volley);
  });
  it('is −4 into a melee and +1 from behind a standing wall', () => {
    const board = openBoard();
    board.walls[edgeKey(parse('c6'), parse('c7'))] = { tier: 2, boxes: 3, remaining: 3 };
    const { state } = battle([], board);
    place(state, 'u0', 'c4');
    place(state, 'u1', 'c5');
    const k = unit(state, 'u2');
    expect(shootModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley! + 1);
    place(state, 'u3', 'd4');
    expect(shootModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley! + 1 - 4);
  });
  it('caps the top band on hex, where a ring is true range', () => {
    const hex = battle([], openBoard('hex')).state;
    place(hex, 'u0', 'c2');
    const bandAt = (cell: string) => {
      place(hex, 'u2', cell);
      return rangeBetween(hex, unit(hex, 'u0'), unit(hex, 'u2'));
    };
    expect(bandAt('c4')).toBe('short');
    expect(bandAt('c6')).toBe('medium');
    expect(bandAt('c8')).toBe('long');
    expect(bandAt('c9')).toBe('extreme');
    // Kobolds are short-reach; even Snipe's ±2 swing tops out at long, so extreme (from c9)
    // is still out of reach. Beyond itself never occurs on this board — its own radius caps
    // extreme at 8, which is already the farthest two hexes can ever be.
    expect(targets(offer(hex, 'shoot', 'u2'), 3)).toEqual([]);
    // Manhattan distance already over-counts a square diagonal, so square keeps no cap.
    const sq = battle([], openBoard('square')).state;
    place(sq, 'u0', 'a1');
    place(sq, 'u2', 'h8');
    expect(rangeBetween(sq, unit(sq, 'u0'), unit(sq, 'u2'))).toBe('extreme');
  });
});

describe('a Fight is one roll', () => {
  // Level-6 infantry at +11 into the Kobolds' Defence 18: 7+ hits. Will +17 against their
  // level DC 18 fails only on a natural 1.
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const fight = (rolls: number[]) => act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng(rolls));

  it('a hit wounds, and the target saves against the disorder or takes it', () => {
    const failed = fight([10, 5]);
    expect(unit(failed, 'u2').wounds).toBe(1);
    expect(unit(failed, 'u2').disorder).toBe(1);
    expect(unit(failed, 'u0').wounds).toBe(0);
    expect(unit(failed, 'u0').disorder).toBe(0);
    const saved = fight([10, 20]);
    expect(unit(saved, 'u2').wounds).toBe(1);
    expect(unit(saved, 'u2').disorder).toBe(0);
  });

  it("a miss repulses the attacker: a Will save against the target's level DC, or 1 disorder", () => {
    const shaken = fight([2, 1]);
    expect(unit(shaken, 'u2').wounds).toBe(0);
    expect(unit(shaken, 'u0').disorder).toBe(1);
    expect(said(shaken, 'repulsed')).toBe(true);
    const held = fight([2, 2]);
    expect(unit(held, 'u0').disorder).toBe(0);
    // The target never strikes back: its answer waits for its own activation.
    expect(unit(held, 'u0').wounds).toBe(0);
    expect(held.log.filter((e) => e.check)).toHaveLength(2);
  });

  it('a critical hit deals two wounds and a critical miss exposes the striker', () => {
    const crit = fight([20, 1]);
    expect(unit(crit, 'u2').wounds).toBe(2);
    const state = engaged();
    unit(state, 'u2').stats.defence = 40;
    const miss = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([1, 20]));
    expect(unit(miss, 'u0').exposed).toBe(true);
    expect(defenceOf(miss, unit(miss, 'u0'), null, false)).toBe(unit(miss, 'u0').stats.defence - 2);
  });

  it('striking uphill or out of a swamp costs −1, and outflanking costs the target −2 Defence', () => {
    const board = openBoard();
    board.squares[2][2].elevation = 1;
    board.squares[1][2].terrain = 'swamp';
    const { state } = battle([], board);
    place(state, 'u2', 'c3');
    expect(strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'))).toBe(unit(state, 'u0').stats.strike! - 2);
    place(state, 'u1', 'd3');
    expect(isOutflanked(state, unit(state, 'u2'))).toBe(true);
    expect(defenceOf(state, unit(state, 'u2'), null, false)).toBe(unit(state, 'u2').stats.defence - 2);
  });
});

describe('withdrawal', () => {
  // Level-6 infantry escapes on Reflex +14. Kobolds hold at DC 17 (strike +7 + 10), so 3–12
  // succeeds, 13+ crits, 2 fails and a natural 1 crit-fails. Trolls hold at DC 23.
  const held = (holders: Record<string, string> = { u2: 'c3' }) => {
    const { state } = battle([]);
    for (const [id, sq] of Object.entries(holders)) place(state, id, sq);
    return state;
  };
  const wounds = (s: BattleState, id = 'u0') => unit(s, id).wounds;
  const where = (s: BattleState, id = 'u0') => notation(unit(s, id).square);

  it('rolls Reflex against each holder\'s own attack DC', () => {
    const w = activation(held(), 'u0')!.withdraw!;
    expect(w.cost).toBe(1);
    expect(w.modifier).toBe(14);
    expect(w.escapes).toEqual([{ unit: 'u2', name: 'Kobolds', dc: 17, follows: false }]);
    // Disorder is −1 to everything, the escape included.
    const shaken = held();
    unit(shaken, 'u0').disorder = 2;
    expect(activation(shaken, 'u0')!.withdraw!.modifier).toBe(12);
  });

  it('resolves the four degrees: away clean, struck, or held where it stands', () => {
    const away = act(held(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([5]));
    expect(wounds(away)).toBe(0);
    expect(where(away)).toBe('c1');

    const struck = act(held(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([2, 20]));
    expect(wounds(struck)).toBe(1);
    expect(where(struck)).toBe('c1');
    expect(unit(struck, 'u0').disorder).toBe(1);

    // A critical failure is the one degree that does not break contact at all.
    const pinned = act(held(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([1, 20]));
    expect(where(pinned)).toBe('c2');
    expect(wounds(pinned)).toBe(1);
    expect(unit(pinned, 'u0').disorder).toBe(2);
  });

  it('rolls once per holder, so two enemies are two checks', () => {
    const two = held({ u2: 'c3', u3: 'b2' });
    expect(activation(two, 'u0')!.withdraw!.escapes.map((e) => e.dc)).toEqual([17, 23]);
    // Kobolds fail (2, struck), Trolls succeed (10) — one strike, not two.
    const s = act(two, { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([2, 20, 1, 10]));
    expect(wounds(s)).toBe(1);
    expect(where(s)).toBe('c1');
  });

  it('buys distance with further actions, and refuses a cell further than it bought', () => {
    const one = activation(held(), 'u0')!.withdraw!;
    // Two spare actions at a square each, so the far cells are on offer up front.
    expect(one.extra).toBe(2);
    expect(one.targets.map((t) => t.id)).toContain('b1');
    expect(() => act(held(), { type: 'withdraw', to: 'b1', unit: 'u0' }, scriptedRng([5])))
      .toThrow(/further than 0 committed actions/);
    const far = act(held(), { type: 'withdraw', to: 'b1', unit: 'u0', distance: 2 }, scriptedRng([5]));
    expect(where(far)).toBe('b1');
    expect(far.activated).toContain('u0');
  });

  it('refuses more distance than the actions left', () => {
    expect(() => act(held(), { type: 'withdraw', to: 'c1', unit: 'u0', distance: 3 }, scriptedRng([5])))
      .toThrow(/only 2 actions to put on distance/);
  });

  it('consults no grade — the check is the holder, not the troop\'s profile', () => {
    expect(activation(held(), 'u0')!.withdraw).not.toHaveProperty('granted');
    expect(unit(held(), 'u0').grades).not.toHaveProperty('withdraw');
    expect(types(held(), 'u0')).not.toContain('withdraw');
  });

  it('is offered even with nowhere to go, so a cornered unit is never stuck', () => {
    const { state } = battle([]);
    place(state, 'u0', 'a1');
    place(state, 'u1', 'a2');
    place(state, 'u2', 'b1');
    const w = activation(state, 'u0')!.withdraw!;
    expect(w.escapes).toHaveLength(1);
    expect(w.targets).toEqual([]);
    const s = act(state, { type: 'withdraw', unit: 'u0' }, scriptedRng([5]));
    expect(notation(unit(s, 'u0').square)).toBe('a1');
  });
});

describe('no retreat', () => {
  // Line Infantry carries the 'no-retreat' signal and walks 20 ft; the levy it holds walks 25.
  const line: UnitCard = {
    name: 'Line', level: 6, role: 'infantry', signals: ['no-retreat'], tactics: [],
    sheet: { ac: 24, hp: 96, battleDc: 21, salvoDc: null, salvoFeet: null, fortitude: 15, reflex: 14, will: 13, perception: 13, speed: 20, fly: false },
  };
  const chased = (runner: UnitCard = infantry) => {
    const state = createBattle({
      units: [{ card: runner, side: 'attacker', square: 'c2' }, { card: line, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(state, 'u1', 'c3');
    return state;
  };

  it('follows a withdrawal it can reach, and deals no damage doing it', () => {
    const s = act(chased(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([5]));
    expect(notation(unit(s, 'u0').square)).toBe('c1');
    expect(notation(unit(s, 'u1').square)).toBe('c2');
    expect(unit(s, 'u0').wounds).toBe(0);
    expect(unit(s, 'u0').disorder).toBe(0);
  });

  it('cannot follow a unit that outruns its single move', () => {
    // Two committed actions carry the Pace unit four squares, out to e4. The Line's one move
    // covers a square, which puts no cell adjacent to e4 inside its reach.
    const s = act(chased(cavalry), { type: 'withdraw', to: 'e4', unit: 'u0', distance: 2 }, scriptedRng([5]));
    expect(notation(unit(s, 'u0').square)).toBe('e4');
    expect(notation(unit(s, 'u1').square)).toBe('c3');
  });

  it('is shaken off outright by a critical success', () => {
    // Reflex +14 against the Line's DC 21 crits on 17 or better.
    const s = act(chased(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([17]));
    expect(notation(unit(s, 'u0').square)).toBe('c1');
    expect(notation(unit(s, 'u1').square)).toBe('c3');
  });

  it('follows a failed escape too, on top of the free strike', () => {
    // 1 + 14 crit-fails, which pins the unit, so there is nothing to follow.
    const pinned = act(chased(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([1, 20]));
    expect(notation(unit(pinned, 'u0').square)).toBe('c2');
    expect(unit(pinned, 'u0').wounds).toBe(1);
  });
});

describe('disorder', () => {
  it('a wounding shot disorders the target, and Rally clears it', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    // 20 crits the shot; 1 auto-fails the Fortitude save against it, so the wound disorders.
    const hit = act(burn(state, 'u1'), { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([20, 1]));
    expect(unit(hit, 'u0').wounds).toBe(2);
    expect(unit(hit, 'u0').disorder).toBe(1);
    const rallied = act(endActivation(hit), { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([10]));
    expect(unit(rallied, 'u0').disorder).toBe(0);
  });
  it('a Fortitude save that succeeds shrugs the wound off with no disorder at all', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    // 20 crits the shot; 20 also crit-succeeds the save, so the wound lands with no disorder.
    const hit = act(burn(state, 'u1'), { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([20]));
    expect(unit(hit, 'u0').wounds).toBe(2);
    expect(unit(hit, 'u0').disorder).toBe(0);
  });
  it('disorder is −1 to everything', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    const before = strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'));
    unit(state, 'u0').disorder = 2;
    expect(strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'))).toBe(before - 2);
    expect(defenceOf(state, unit(state, 'u0'), null, false)).toBe(unit(state, 'u0').stats.defence - 2);
  });
  it('at Quality a unit is shaken: Rally, Move or withdraw, and it still counts as standing', () => {
    const { state } = battle([]);
    const k = unit(state, 'u2');
    expect(k.quality).toBe(5);
    k.disorder = k.quality;
    expect(isShaken(k)).toBe(true);
    expect(isRouted(k)).toBe(false);
    expect(isStanding(k)).toBe(true);
    expect(types(state, 'u2')).toEqual(['rally']);
    expect(activation(state, 'u2')!.withdraw).not.toBeNull();
    expect(moveReach(state, k).size).toBeGreaterThan(0);
  });
  it('one point past Quality a unit routs, and disorder stops there', () => {
    const { state } = battle([]);
    const k = unit(state, 'u2');
    k.disorder = k.quality + 1;
    expect(isRouted(k)).toBe(true);
    expect(isStanding(k)).toBe(false);
    expect(types(state, 'u2')).toEqual([]);
    expect(activation(state, 'u2')!.withdraw).not.toBeNull();
  });
  it('a shaken unit rallies back below Quality', () => {
    const { state } = battle([]);
    const k = unit(state, 'u2');
    k.disorder = k.quality;
    const s = act(burn(state, 'u0'), { type: 'rally', rung: 1, unit: 'u2' }, scriptedRng([18]));
    expect(isShaken(unit(s, 'u2'))).toBe(false);
  });
  it('a routed unit leaves the field at its own edge; a shaken one holds', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c8');
    const shaken = structuredClone(state);
    unit(shaken, 'u2').disorder = unit(shaken, 'u2').quality;
    expect(unit(act(burn(shaken, 'u0'), { type: 'withdraw', unit: 'u2' }, scriptedRng([10])), 'u2').status).toBe('active');

    unit(state, 'u2').disorder = unit(state, 'u2').quality + 1;
    const s = act(burn(state, 'u0'), { type: 'withdraw', unit: 'u2' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('left');
  });
  it('fear disorders whoever comes to grips with it', () => {
    const { state } = battle([]);
    unit(state, 'u2').fear = true;
    place(state, 'u2', 'c4');
    const s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').disorder).toBe(1);
  });
});

describe('the battle ends', () => {
  it('when one side has nothing standing', () => {
    const { state } = battle([]);
    unit(state, 'u2').status = 'destroyed';
    unit(state, 'u3').disorder = unit(state, 'u3').quality;
    let s = state;
    while (s.phase === 'battle') s = burn(s, activeUnit(s)!.id);
    expect(s.winner).toBe('attacker');
    expect(s.endedBy).toBe('rout');
  });
  it('at dusk on round six', () => {
    let s = battle([]).state;
    while (s.phase === 'battle') s = burn(s, activeUnit(s)!.id);
    expect(s.round).toBe(6);
    expect(s.endedBy).toBe('dusk');
  });
});

describe.each(['square', 'hex'] as const)('a full round on %s', (kind) => {
  it('activates every unit once, striding and guarding, and comes back round', () => {
    const { state } = battle([], openBoard(kind));
    const seen: string[] = [];
    let s = state;
    while (s.round === 1 && s.phase === 'battle') {
      const u = activeUnit(s)!;
      seen.push(u.id);
      const a = activation(s, u.id)!;
      const cell = [...a.moves].filter(([, m]) => m.actions === 1).map(([k]) => k).sort()[0];
      let next = cell ? act(s, { type: 'move', to: cell, unit: u.id }, scriptedRng([10])) : s;
      if (next.phase === 'battle' && next.active === u.id) next = guardOn(next, u.id);
      s = next.phase === 'battle' && next.active === u.id ? endActivation(next) : next;
    }
    expect(seen.sort()).toEqual(['u0', 'u1', 'u2', 'u3']);
    expect(s.round).toBe(2);
    expect(activation(s)!.moves.size).toBeGreaterThan(0);
  });
});

describe('an emplaced engine', () => {
  const catapult = { name: 'Catapult', level: 7, kind: 'artillery' as const, launch: 12, reach: 'extreme' as const, defence: 20 };
  const emplaced = () => createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
    engines: [{ card: catapult, side: 'defender', square: 'c8' }],
    board: openBoard(),
  });

  it('is crewed by whichever friendly stands beside it, and lets that unit fire it', () => {
    const state = emplaced();
    expect(state.engines[0].status).toBe('crewed');
    expect(crewOf(state, state.engines[0])!.id).toBe('u1');
    expect(shootModifier(state, unit(state, 'u1'), unit(state, 'u0'))).toBe(catapult.launch);
  });

  it('holds its square when the crew walks off, and goes abandoned', () => {
    let state = emplaced();
    place(state, 'u1', 'c5');
    state = refresh(state);
    expect(notation(state.engines[0].square)).toBe('c8');
    expect(state.engines[0].status).toBe('abandoned');
    expect(crewOf(state, state.engines[0])).toBeNull();
  });

  it('changes hands at the end of a round once only the enemy stands by it', () => {
    let state = emplaced();
    place(state, 'u1', 'c5');
    place(state, 'u0', 'b8');
    state = runRound(state);
    expect(state.engines[0].side).toBe('attacker');
    expect(crewOf(state, state.engines[0])!.id).toBe('u0');
  });

  it('stays put while a friendly is still beside it, however close the enemy', () => {
    let state = emplaced();
    place(state, 'u0', 'b8');
    state = runRound(state);
    expect(state.engines[0].side).toBe('defender');
  });
});
