import { describe, expect, it } from 'vitest';
import {
  act, activatable, activeUnit, availableActions, createBattle, defenceOf, isOutflanked, isRouted,
  moveTargets, rangeBetween, select, shootModifier, strikeModifier, unit,
} from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
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
// A routed unit is offered nothing but Withdraw, so burning its activation takes both.
const burn = (state: BattleState, id: string) =>
  availableActions(state, id).some((o) => o.type === 'guard')
    ? guardOn(state, id)
    : act(state, { type: 'withdraw', rung: 1, unit: id }, scriptedRng([10]));

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
    const s = guardOn(select(state, 'u1'), 'u1');
    expect(s.activated).toEqual(['u1']);
    expect(activeUnit(s)!.side).toBe('defender');
  });

  it('runs one action per activation and starts a new round when everyone has acted', () => {
    let s = battle([]).state;
    for (let i = 0; i < 4; i++) s = guardOn(s, activeUnit(s)!.id);
    expect(s.round).toBe(2);
    expect(s.activated).toEqual([]);
  });
});

describe('the menu is filtered by situation', () => {
  it('offers Move, Shoot and Guard in the open', () => {
    const { state } = battle([]);
    expect(types(state, 'u2')).toEqual(['move', 'shoot', 'guard']);
    expect(types(state, 'u0')).toEqual(['move', 'guard']);
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
    expect(unit(s, 'u0').rooted).toBe(true);
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

  it('a rooted unit may not move on its next activation', () => {
    const { state } = battle([]);
    let s = act(state, { type: 'guard', rung: 2, unit: 'u0' }, scriptedRng([5]));
    for (const id of ['u2', 'u1', 'u3']) s = guardOn(s, id);
    expect(offer(s, 'move', 'u0').rungs.every((r) => r.reason === 'rooted')).toBe(true);
  });
});

describe('movement', () => {
  it('Advance steps one cell, March goes further, and Pace adds one more', () => {
    const { state } = battle([]);
    const m = offer(state, 'move', 'u0');
    expect(targets(m, 1)).toEqual(['b2', 'c1', 'c3', 'd2']);
    expect(targets(m, 2)).toContain('c4');
    expect(targets(m, 2)).not.toContain('c5');
    expect(targets(offer(state, 'move', 'u1'), 2)).toContain('e5');
  });
  it('water, walls and cliffs are not crossed', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    board.squares[1][1].elevation = 2;
    const { state } = battle([], board);
    expect(targets(offer(state, 'move', 'u0'), 1)).toEqual(['c1']);
  });
  it('slow ground costs two points, so only a March enters it', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'swamp';
    const { state } = battle([], board);
    const m = offer(state, 'move', 'u0');
    expect(targets(m, 1)).not.toContain('c3');
    expect(targets(m, 2)).toContain('c3');
  });
  it('Charge closes to contact and fights, and a failed reach marches instead', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c4');
    const m = offer(state, 'move', 'u0');
    expect(targets(m, 3)).toEqual(['u2']);
    const hit = act(state, { type: 'move', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([15, 10, 1]));
    expect(unit(hit, 'u0').square).toEqual(parse('c3'));
    expect(unit(hit, 'u2').wounds).toBe(1);
    const short = act(state, { type: 'move', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([4]));
    expect(unit(short, 'u0').square).toEqual(parse('c3'));
    expect(unit(short, 'u2').wounds).toBe(0);
  });
  it('a Move takes no free strikes; only a Withdraw does', () => {
    const { state } = battle([10]);
    place(state, 'u2', 'c4');
    const s = act(state, { type: 'move', rung: 1, target: 'c3', unit: 'u0' }, scriptedRng([20]));
    expect(unit(s, 'u0').wounds).toBe(0);
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
    const hit = act(guardOn(state, 'u1'), { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([20]));
    expect(unit(hit, 'u0').wounds).toBe(2);
    expect(unit(hit, 'u0').disorder).toBe(1);
    const rallied = act(hit, { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([10]));
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
    const s = act(guardOn(state, 'u0'), { type: 'withdraw', rung: 1, unit: 'u2' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('left');
  });
  it('fear disorders whoever comes to grips with it', () => {
    const { state } = battle([]);
    unit(state, 'u2').fear = true;
    place(state, 'u2', 'c4');
    const s = act(state, { type: 'move', rung: 1, target: 'c3', unit: 'u0' }, scriptedRng([10]));
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
  it('activates every unit once and comes back round', () => {
    const { state } = battle([], openBoard(kind));
    const seen: string[] = [];
    let s = state;
    while (s.round === 1 && s.phase === 'battle') {
      const u = activeUnit(s)!;
      seen.push(u.id);
      const move = offer(s, 'move', u.id);
      s = move && move.rungs[1].targets.length
        ? act(s, { type: 'move', rung: 2, target: move.rungs[1].targets[0].id, unit: u.id }, scriptedRng([10]))
        : guardOn(s, u.id);
    }
    expect(seen.sort()).toEqual(['u0', 'u1', 'u2', 'u3']);
    expect(s.round).toBe(2);
    expect(moveTargets(s, unit(s, 'u0'), 1).size).toBeGreaterThan(0);
  });
});
