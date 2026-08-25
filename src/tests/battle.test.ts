import { describe, expect, it } from 'vitest';
import {
  act, activatable, activation, activeUnit, availableActions, chargeTargets, createBattle, defenceOf,
  endActivation, isOutflanked, isRouted, movementBudget, moveReach, movePath, PUSH_BONUS, pushModifierFor,
  pushReach, rangeBetween, select, shootModifier, strikeModifier, unit,
} from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { ACTION_BONUS } from '../engine/types.js';
import type { ActionOffer, BattleState, Side } from '../engine/types.js';
import type { Grade, LadderType } from '../engine/ladders.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', salvo: 'close', tactics: [] };
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
const types = (state: BattleState, id?: string) => availableActions(state, id).map((o) => o.type);
const offer = (state: BattleState, type: LadderType, id?: string) =>
  availableActions(state, id).find((o) => o.type === type) as ActionOffer;
const targets = (o: ActionOffer, rung: Grade) => o.rungs[rung - 1].targets.map((t) => t.id);
const guardOn = (state: BattleState, id: string, rng = scriptedRng([10])) =>
  act(state, { type: 'guard', rung: 1, unit: id }, rng);
const moves = (state: BattleState, id: string) => moveReach(state, unit(state, id));
// An activation always refills to three actions, so spending two on Guard is the only way to
// reach a push with a single action behind it.
const oneActionLeft = (state: BattleState, id: string) => guardOn(guardOn(state, id), id);
// A routed unit is offered nothing but Withdraw, so burning its activation takes both. One
// action leaves two unspent, so the activation is ended by hand unless the action ended it.
const burn = (state: BattleState, id: string) => {
  const s = availableActions(state, id).some((o) => o.type === 'guard')
    ? guardOn(state, id)
    : act(state, { type: 'withdraw', rung: 1, unit: id }, scriptedRng([10]));
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
    expect(rangeBetween(state, unit(state, 'u0'), unit(state, 'u2'))).toBe('extreme');
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
    expect(types(state, 'u2')).toEqual(['shoot', 'guard']);
    expect(types(state, 'u0')).toEqual(['guard']);
    const a = activation(state, 'u0')!;
    expect(a.actions).toBe(3);
    expect(a.speed).toBe(25);
    expect(a.moves.size).toBeGreaterThan(0);
  });
  it('offers Fight, Guard and Withdraw in contact, and Rally once disordered', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    expect(types(state, 'u0')).toEqual(['fight', 'guard', 'withdraw']);
    unit(state, 'u0').disorder = 1;
    expect(types(state, 'u0')).toEqual(['fight', 'guard', 'withdraw', 'rally']);
  });
  it('offers a caster one row per spell it knows', () => {
    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const s = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    expect(availableActions(s, 'u0').filter((o) => o.type === 'cast').map((o) => o.spell))
      .toEqual(['blast', 'ward', 'mend', 'bless', 'compel']);
  });
});

describe('reaching above your grade', () => {
  // Level-6 infantry: Guard 1, Will +17, level DC 22. Rolls 15 / 5 / 4 / 1 give the four degrees.
  const reachGuard = (roll: number) => {
    const { state } = battle([]);
    return act(state, { type: 'guard', rung: 2, unit: 'u0' }, scriptedRng([roll]));
  };

  it('takes a granted rung with no roll at all', () => {
    const { state } = battle([]);
    const g = offer(state, 'guard', 'u0');
    expect(g.granted).toBe(1);
    expect(g.reachable).toBe(2);
    expect(g.reachDc).toBe(22);
    expect(g.rungs.map((r) => r.access)).toEqual(['free', 'reach', 'locked']);
    const s = guardOn(state, 'u0');
    expect(s.log.some((e) => e.check)).toBe(false);
    expect(unit(s, 'u0').guard).toEqual({ defence: 2, aura: 0 });
  });

  it('critical success climbs one rung further', () => {
    const s = reachGuard(15);
    expect(unit(s, 'u0').guard).toEqual({ defence: 3, aura: 1 });
  });

  it('success lands on the rung reached for', () => {
    const s = reachGuard(5);
    expect(unit(s, 'u0').guard).toEqual({ defence: 3, aura: 0 });
    expect(unit(s, 'u0').rooted).toBe(2);
  });

  it('failure falls back to the granted rung and still acts', () => {
    const s = reachGuard(4);
    expect(unit(s, 'u0').guard).toEqual({ defence: 2, aura: 0 });
    expect(unit(s, 'u0').disorder).toBe(0);
  });

  it('critical failure falls back and costs a point of disorder', () => {
    const s = reachGuard(1);
    expect(unit(s, 'u0').guard).toEqual({ defence: 2, aura: 0 });
    expect(unit(s, 'u0').disorder).toBe(1);
  });

  it('a grade-3 unit has nothing to reach for', () => {
    const { state } = battle([]);
    unit(state, 'u0').grades.guard = 3;
    const g = offer(state, 'guard', 'u0');
    expect(g.reachable).toBeNull();
    expect(g.rungs.map((r) => r.access)).toEqual(['free', 'free', 'free']);
  });

  it('a unit that digs in may not move for the rest of this activation or the next', () => {
    const { state } = battle([]);
    let s = act(state, { type: 'guard', rung: 2, unit: 'u0' }, scriptedRng([5]));
    expect(moves(s, 'u0').size).toBe(0);
    s = endActivation(s);
    for (const id of ['u2', 'u1', 'u3']) s = burn(s, id);
    expect(moves(s, 'u0').size).toBe(0);
    expect(moves(endActivation(s), 'u0').size).toBeGreaterThan(0);
  });
});

describe('movement points', () => {
  it('one Move action spends Speed and stops short of what it cannot afford', () => {
    const { state } = battle([]);
    expect(unit(state, 'u0').speed).toBe(25);
    unit(state, 'u0').actions = 1;
    const m = moves(state, 'u0');
    expect(m.get('c3')).toMatchObject({ feet: 10, actions: 1 });
    expect(m.get('c4')).toMatchObject({ feet: 20, actions: 1 });
    expect(m.has('c5')).toBe(false);
  });

  it('a second Move action buys another Speed, and the five feet left over carry', () => {
    const { state } = battle([]);
    const s = act(state, { type: 'move', to: 'c4', unit: 'u0' }, scriptedRng([10]));
    const u = unit(s, 'u0');
    expect(u.square).toEqual(parse('c4'));
    expect(u.actions).toBe(2);
    expect(u.feet).toBe(5);
    expect(moveReach(s, u).get('f4')).toMatchObject({ feet: 30, actions: 1 });
    expect(movePath(moveReach(s, u), 'f4')).toEqual(['c4', 'd4', 'e4', 'f4']);
  });

  it('spends the terrain table in feet', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'forest';
    board.squares[3][2].terrain = 'swamp';
    board.squares[1][3].elevation = 1;
    const { state } = battle([], board);
    const m = moves(state, 'u0');
    expect(m.get('c3')!.feet).toBe(20);
    expect(m.get('d2')!.feet).toBe(20);
    expect(m.get('c4')!.feet).toBe(50);
  });

  it('will not cross water, a standing wall or a cliff, but a breach is a crossing', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    board.squares[1][1].elevation = 2;
    const { state } = battle([], board);
    unit(state, 'u0').actions = 1;
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
    place(state, 'u2', 'c6');
    let s = act(state, { type: 'move', to: 'c4', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    s = act(s, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([10, 10]));
    expect(unit(s, 'u0').square).toEqual(parse('c5'));
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

describe('the push band', () => {
  it('is bounded to one action\'s worth of movement beyond what the unit can afford', () => {
    const { state } = battle([]);
    const u = unit(state, 'u0');
    const affordable = moveReach(state, u);
    const budget = movementBudget(u);
    const push = pushReach(state, u);
    expect(push.size).toBeGreaterThan(0);
    for (const [cell, p] of push) {
      expect(affordable.has(cell)).toBe(false);
      expect(p.feet).toBeGreaterThan(budget);
      expect(p.feet).toBeLessThanOrEqual(budget + u.speed);
      // A failed reach must have somewhere affordable to land.
      expect(affordable.has(p.fallback)).toBe(true);
    }
  });

  it('critical success reaches the cell, spending every action and no disorder', () => {
    const { state } = battle([]);
    const [cell] = [...pushReach(state, unit(state, 'u0')).keys()];
    const s = act(state, { type: 'push', to: cell, unit: 'u0' }, scriptedRng([20]));
    expect(unit(s, 'u0').square).toEqual(parse(cell));
    expect(unit(s, 'u0').disorder).toBe(0);
    // Spent every action left, win or lose, so the activation always ends here.
    expect(s.activated).toEqual(['u0']);
    expect(s.pending).toBe('defender');
  });

  it('success reaches the cell', () => {
    const { state } = battle([]);
    const [cell] = [...pushReach(state, unit(state, 'u0')).keys()];
    const s = act(state, { type: 'push', to: cell, unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').square).toEqual(parse(cell));
    expect(unit(s, 'u0').disorder).toBe(0);
  });

  it('failure stops at the furthest affordable cell along the route, no disorder', () => {
    const state = oneActionLeft(battle([]).state, 'u0');
    const push = pushReach(state, unit(state, 'u0'));
    const [cell] = [...push.keys()];
    const s = act(state, { type: 'push', to: cell, unit: 'u0' }, scriptedRng([4]));
    expect(unit(s, 'u0').square).toEqual(parse(push.get(cell)!.fallback));
    expect(unit(s, 'u0').disorder).toBe(0);
  });

  it('critical failure stops at the fallback and gains 1 disorder', () => {
    const state = oneActionLeft(battle([]).state, 'u0');
    const push = pushReach(state, unit(state, 'u0'));
    const [cell] = [...push.keys()];
    const s = act(state, { type: 'push', to: cell, unit: 'u0' }, scriptedRng([1]));
    expect(unit(s, 'u0').square).toEqual(parse(push.get(cell)!.fallback));
    expect(unit(s, 'u0').disorder).toBe(1);
  });

  it('mounted and cavalry-charge grant a bonus that helps a push succeed', () => {
    const plain = unit(battle([]).state, 'u0');
    expect(pushModifierFor(plain)).toBe(plain.stats.will);

    const mountedCard: UnitCard = { name: 'Dragoons', level: 6, role: 'infantry', tactics: [], signals: ['mounted'] };
    const chargerCard: UnitCard = { name: 'Charger', level: 6, role: 'cavalry', tactics: ['cavalry-charge'] };
    for (const card of [mountedCard, chargerCard]) {
      const s0 = createBattle({ units: [{ card, side: 'attacker', square: 'c2' }], board: openBoard() }, scriptedRng([10]));
      const u = unit(s0, 'u0');
      expect(pushModifierFor(u)).toBe(u.stats.will + PUSH_BONUS);
    }

    // Wired end to end on a one-action push, so the commitment bonus is zero and the mount is
    // the only thing in play: mod 17 vs DC 22 rolls 21 and fails, 23 with the bonus and lands.
    const infState = oneActionLeft(battle([]).state, 'u0');
    const [infCell] = [...pushReach(infState, unit(infState, 'u0')).keys()];
    const infResult = act(infState, { type: 'push', to: infCell, unit: 'u0' }, scriptedRng([4]));
    expect(unit(infResult, 'u0').square).not.toEqual(parse(infCell));

    const mState = oneActionLeft(createBattle({ units: [{ card: mountedCard, side: 'attacker', square: 'c2' }], board: openBoard() }, scriptedRng([10])), 'u0');
    const [mCell] = [...pushReach(mState, unit(mState, 'u0')).keys()];
    const mResult = act(mState, { type: 'push', to: mCell, unit: 'u0' }, scriptedRng([4]));
    expect(unit(mResult, 'u0').square).toEqual(parse(mCell));
  });

  it('every action after the first weights the push check', () => {
    expect(pushModifierFor(unit(battle([]).state, 'u0'), 3)).toBe(17 + 2 * ACTION_BONUS);

    const one = oneActionLeft(battle([]).state, 'u0');
    const [oneCell] = [...pushReach(one, unit(one, 'u0')).keys()];
    expect(unit(act(one, { type: 'push', to: oneCell, unit: 'u0' }, scriptedRng([4])), 'u0').square)
      .not.toEqual(parse(oneCell));

    // The same roll, with all three actions behind it: 4 + 17 + 4 = 25 against DC 22.
    const all = battle([]).state;
    const [allCell] = [...pushReach(all, unit(all, 'u0')).keys()];
    expect(unit(act(all, { type: 'push', to: allCell, unit: 'u0' }, scriptedRng([4])), 'u0').square)
      .toEqual(parse(allCell));
  });
});

describe('actions buy weight, not repetition', () => {
  // Level-6 infantry: strike +11, Will +17, level DC 22, Fight 2 / Guard 1 / Withdraw 2.
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
    const blasted = act(p0, { type: 'cast', rung: 2, spell: 'blast', target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(blasted, 'u0').attacked).toBe(true);
    expect(offer(blasted, 'fight', 'u0').rungs[0].legal).toBe(false);
  });

  it('puts each action after the first on the roll as +2', () => {
    for (const extra of [0, 1, 2]) {
      const s = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { roll: extra } }, scriptedRng([10, 5]));
      expect(strikeMod(s)).toBe(11 + extra * ACTION_BONUS);
      expect(unit(s, 'u0').actions).toBe(s.activated.includes('u0') ? 3 : 2 - extra);
    }
  });

  it('puts each action after the first on the push check instead', () => {
    // Guard 1 reaching for Dig in: DC 22 against Will +17, so a 2 needs the full commitment.
    const brace = { defence: 2, aura: 0 };
    const digIn = { defence: 3, aura: 0 };
    const reach = (push: number) =>
      unit(act(engaged(), { type: 'guard', rung: 2, unit: 'u0', spend: { push } }, scriptedRng([2])), 'u0').guard;
    expect(reach(0)).toEqual(brace);
    expect(reach(1)).toEqual(brace);
    expect(reach(2)).toEqual(digIn);
  });

  it('takes 0.50, 0.60 and 0.80 wounds a turn on one, two and three actions in an even matchup', () => {
    const rate = (extra: number) => {
      let wounds = 0;
      for (let roll = 1; roll <= 20; roll++) {
        const s0 = engaged();
        // The published medians run parallel, so an even matchup needs 12+ at any level.
        unit(s0, 'u2').stats.defence = strikeModifier(s0, unit(s0, 'u0'), unit(s0, 'u2')) + 12;
        const s = act(s0, { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { roll: extra } }, scriptedRng([roll, 1]));
        wounds += unit(s, 'u2').wounds;
      }
      return wounds / 20;
    };
    expect([rate(0), rate(1), rate(2)]).toEqual([0.5, 0.6, 0.8]);
  });

  it('refuses a roll dial on Guard and Withdraw, which have no roll of their own', () => {
    for (const type of ['guard', 'withdraw'] as const) {
      expect(offer(engaged(), type, 'u0').dials).toMatchObject({ roll: false, push: true, extra: 2, step: 2 });
      expect(() => act(engaged(), { type, rung: 1, unit: 'u0', spend: { roll: 1 } }, scriptedRng([10])))
        .toThrow(/no roll of its own/);
    }
    expect(offer(engaged(), 'fight', 'u0').dials).toMatchObject({ roll: true, push: true });
  });

  it('refuses more actions than the unit has, and a push dial on a rung it is granted', () => {
    expect(() => act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { roll: 3 } }, scriptedRng([10, 5])))
      .toThrow(/only 3 actions/);
    expect(() => act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { push: 1 } }, scriptedRng([10, 5])))
      .toThrow(/needs no push check/);
  });

  it('lets every type absorb a full three-action commitment', () => {
    const ends = (s: BattleState) => { expect(s.activated).toContain('u0'); return s; };

    ends(act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { roll: 2 } }, scriptedRng([10, 5])));
    ends(act(engaged(), { type: 'guard', rung: 2, unit: 'u0', spend: { push: 2 } }, scriptedRng([2])));
    ends(act(engaged(), { type: 'withdraw', rung: 3, target: 'c1', unit: 'u0', spend: { push: 2 } }, scriptedRng([4])));

    const start = battle([]).state;
    place(start, 'u0', 'c5');
    const shooter = burn(start, 'u1');
    const shot = act(shooter, { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(strikeMod(shot)).toBe(7);
    expect(unit(shot, 'u2').actions).toBe(2);
    const heavy = act(shooter, { type: 'shoot', rung: 1, target: 'u0', unit: 'u2', spend: { roll: 2 } }, scriptedRng([10]));
    expect(strikeMod(heavy)).toBe(7 + 2 * ACTION_BONUS);
    expect(heavy.activated).toContain('u2');

    // Rally clears its rung outright; the committed actions buy a Quality check that can only add.
    const shaken = engaged();
    unit(shaken, 'u0').disorder = 3;
    const steady = act(shaken, { type: 'rally', rung: 1, unit: 'u0', spend: { roll: 2 } }, scriptedRng([10]));
    ends(steady);
    expect(unit(steady, 'u0').disorder).toBe(1);
    expect(unit(act(shaken, { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([10])), 'u0').disorder).toBe(2);

    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const p0 = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(p0, 'u1', 'c3');
    const cast = act(p0, { type: 'cast', rung: 2, spell: 'blast', target: 'u1', unit: 'u0', spend: { roll: 2 } }, scriptedRng([10]));
    expect(cast.activated).toContain('u0');
    expect(strikeMod(cast)).toBe(unit(p0, 'u0').stats.will + 2 * ACTION_BONUS);
  });

  it('leaves in good order on a full commitment and comes apart on a single action', () => {
    const cornered = () => {
      const { state } = battle([]);
      place(state, 'u2', 'c3');
      place(state, 'u3', 'b2');
      return state;
    };
    const scattered = act(cornered(), { type: 'withdraw', rung: 1, target: 'c1', unit: 'u0' }, scriptedRng([20, 20]));
    expect(unit(scattered, 'u0').wounds).toBe(2);
    expect(unit(scattered, 'u0').disorder).toBe(3);

    // Withdraw 2 reaching for a Fighting retreat: DC 24, so 4 + 17 falls back to Break off and
    // one free strike, while 4 + 17 + 4 leaves the field clean.
    const halfway = act(cornered(), { type: 'withdraw', rung: 3, target: 'c1', unit: 'u0' }, scriptedRng([4, 20]));
    expect(unit(halfway, 'u0').wounds).toBe(1);
    const clean = act(cornered(), { type: 'withdraw', rung: 3, target: 'c1', unit: 'u0', spend: { push: 2 } }, scriptedRng([4, 20]));
    expect(unit(clean, 'u0').wounds).toBe(0);
    expect(unit(clean, 'u0').disorder).toBe(0);
    expect(unit(clean, 'u0').square).toEqual(parse('c1'));
  });

  it('leaves Move buying ground, and a Strike affordable after it', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c5');
    let s = act(state, { type: 'move', to: 'c4', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').feet).toBe(5);
    expect(unit(s, 'u0').attacked).toBe(false);
    s = act(s, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(s)).toBe(11);
    expect(unit(s, 'u0').actions).toBe(1);
  });

  it('lets a Fight-2 troop Strike for one action, Press for two, or reach Overrun with three', () => {
    const fight = offer(engaged(), 'fight', 'u0');
    expect(fight.granted).toBe(2);
    expect(fight.rungs.map((r) => r.access)).toEqual(['free', 'free', 'reach']);
    expect(fight.cost).toBe(1);
    expect(fight.dials.extra).toBe(2);

    const strike = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(strike)).toBe(11);
    expect(unit(strike, 'u0').actions).toBe(2);

    const press = act(engaged(), { type: 'fight', rung: 2, target: 'u2', unit: 'u0', spend: { roll: 1 } }, scriptedRng([10, 5]));
    expect(strikeMod(press)).toBe(11 + 2 + ACTION_BONUS);
    expect(unit(press, 'u0').actions).toBe(1);

    // Overrun is DC 24 against Will +17: a 4 needs both spare actions on the push check.
    const overrun = act(engaged(), { type: 'fight', rung: 3, target: 'u2', unit: 'u0', spend: { push: 2 } }, scriptedRng([4, 20, 5]));
    expect(overrun.log.some((e) => e.text.includes('overruns'))).toBe(true);
    expect(overrun.activated).toContain('u0');
  });
});

describe('shooting', () => {
  it('Loose reaches the close band and Volley the long one', () => {
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
    expect(bandAt('c4')).toBe('close');
    expect(bandAt('c5')).toBe('long');
    expect(bandAt('c7')).toBe('extreme');
    expect(bandAt('c8')).toBe('beyond');
    expect(targets(offer(hex, 'shoot', 'u2'), 3)).toEqual([]);
    // Manhattan distance already over-counts a square diagonal, so square keeps no cap.
    const sq = battle([], openBoard('square')).state;
    place(sq, 'u0', 'a1');
    place(sq, 'u2', 'h8');
    expect(rangeBetween(sq, unit(sq, 'u0'), unit(sq, 'u2'))).toBe('extreme');
  });
  it('Barrage ignores cover', () => {
    const board = openBoard();
    board.squares[3][2].terrain = 'forest';
    const { state } = battle([], board);
    place(state, 'u0', 'c4');
    const k = unit(state, 'u2');
    expect(defenceOf(state, unit(state, 'u0'), k, true)).toBe(unit(state, 'u0').stats.defence + 1);
    expect(defenceOf(state, unit(state, 'u0'), k, true, true)).toBe(unit(state, 'u0').stats.defence);
  });
});

describe('melee is one exchange', () => {
  it('the attacker rolls, the defender rolls back, and the loser gains disorder', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    const s = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(unit(s, 'u2').wounds).toBe(1);
    expect(unit(s, 'u0').wounds).toBe(0);
    expect(unit(s, 'u2').disorder).toBe(1);
    expect(unit(s, 'u0').disorder).toBe(0);
  });
  it('a critical hit deals two wounds and a critical miss exposes the striker', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    const crit = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([20, 1]));
    expect(unit(crit, 'u2').wounds).toBe(2);
    unit(state, 'u2').stats.defence = 40;
    const miss = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([1, 1]));
    expect(unit(miss, 'u0').exposed).toBe(true);
    expect(defenceOf(miss, unit(miss, 'u0'), null, false)).toBe(unit(miss, 'u0').stats.defence - 2);
  });
  it('Press adds +2 and costs a point of disorder when it misses', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    unit(state, 'u2').stats.defence = 40;
    const s = act(state, { type: 'fight', rung: 2, target: 'u2', unit: 'u0' }, scriptedRng([5, 1]));
    expect(s.log[1].check!.modifier).toBe(unit(s, 'u0').stats.strike! + 2);
    expect(unit(s, 'u0').disorder).toBe(1);
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
  it('Scatter draws every free strike and a point of disorder; a fighting retreat draws none', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    place(state, 'u3', 'b2');
    const messy = act(state, { type: 'withdraw', rung: 1, target: 'c1', unit: 'u0' }, scriptedRng([20, 20]));
    expect(unit(messy, 'u0').wounds).toBe(2);
    // One point for each free strike that wounded, and one for the Scatter itself.
    expect(unit(messy, 'u0').disorder).toBe(3);
    unit(state, 'u0').grades.withdraw = 3;
    const clean = act(state, { type: 'withdraw', rung: 3, target: 'c1', unit: 'u0' }, scriptedRng([20]));
    expect(unit(clean, 'u0').wounds).toBe(0);
    expect(unit(clean, 'u0').square).toEqual(parse('c1'));
  });
  it('Scatter is always available, even with nowhere to go', () => {
    const { state } = battle([]);
    place(state, 'u0', 'a1');
    place(state, 'u1', 'a2');
    place(state, 'u2', 'b1');
    const w = offer(state, 'withdraw', 'u0');
    expect(targets(w, 1)).toEqual([]);
    expect(w.rungs[0].legal).toBe(true);
  });
});

describe('disorder', () => {
  it('a wounding shot disorders the target, and Rally clears it', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    const hit = act(burn(state, 'u1'), { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([20]));
    expect(unit(hit, 'u0').wounds).toBe(2);
    expect(unit(hit, 'u0').disorder).toBe(1);
    const rallied = act(endActivation(hit), { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([10]));
    expect(unit(rallied, 'u0').disorder).toBe(0);
  });
  it('disorder is −1 to everything', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    const before = strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'));
    unit(state, 'u0').disorder = 2;
    expect(strikeModifier(state, unit(state, 'u0'), unit(state, 'u2'))).toBe(before - 2);
    expect(defenceOf(state, unit(state, 'u0'), null, false)).toBe(unit(state, 'u0').stats.defence - 2);
  });
  it('a unit whose disorder reaches its Quality routs and may only withdraw', () => {
    const { state } = battle([]);
    const k = unit(state, 'u2');
    expect(k.quality).toBe(5);
    k.disorder = k.quality;
    expect(isRouted(k)).toBe(true);
    expect(types(state, 'u2')).toEqual(['withdraw']);
  });
  it('a routed unit leaves the field at its own edge', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c8');
    unit(state, 'u2').disorder = unit(state, 'u2').quality;
    const s = act(burn(state, 'u0'), { type: 'withdraw', rung: 1, unit: 'u2' }, scriptedRng([10]));
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
