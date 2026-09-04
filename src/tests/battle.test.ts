import { describe, expect, it } from 'vitest';
import {
  act, activatable, activation, activeUnit, availableActions, chargeTargets, createBattle, crewOf, defenceOf, deselect,
  endActivation, isOutflanked, isRouted, isShaken, isStanding, movementBudget, moveReach, movePath, PUSH_BONUS, pushModifierFor,
  pushReach, rangeBetween, routDcFor, select, shootModifier, strikeModifier, unit,
} from '../engine/battle.js';
import { edgeKey, notation, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { ACTION_BONUS, ACTIONS_PER_ACTIVATION, MAX_WOUNDS } from '../engine/types.js';
import type { ActionOffer, BattleState, Side } from '../engine/types.js';
import { CLIMB_STEP, rungOf, type Grade, type LadderType } from '../engine/ladders.js';
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
// An activation always refills to three actions, so spending two on Guard is the only way to
// reach a push with a single action behind it.
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
    expect(castOffer(s, 'blast').rungs.map((r) => r.access)).toEqual(['free', 'locked', 'locked']);
    expect(castOffer(s, 'healing').rungs.map((r) => r.access)).toEqual(['free', 'reach', 'reach']);
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

    // Pushing effect instead of range still can't carry to u2, even reaching Tier 3 outright.
    const pushedEffect = act(s, { type: 'cast', rung: 3, spell: 'healing', target: 'u2', unit: 'u0', spend: { push: 2 } }, scriptedRng([15]));
    expect(unit(pushedEffect, 'u2').disorder).toBe(1);

    // Pushing range instead reaches it, at Tier 1's own effect (clears 1 disorder).
    const pushedRange = act(s, { type: 'cast', rung: 2, spell: 'healing', target: 'u2', unit: 'u0', axis: 'range', spend: { push: 1 } }, scriptedRng([15]));
    expect(unit(pushedRange, 'u2').disorder).toBe(0);
  });

  it('spends the caster\'s own pool on a push, on top of any ordinary actions committed', () => {
    const s = createBattle({
      units: [{ card: cleric, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    // Level 6 ÷ 5, rounded down: 1 point in the pool.
    expect(unit(s, 'u0').castPool).toBe(1);
    expect(() => act(s, { type: 'cast', rung: 2, spell: 'healing', target: 'u0', unit: 'u0', spend: { pool: 2 } }, scriptedRng([10])))
      .toThrow(/only 1 in its push pool/);
    const s2 = act(s, { type: 'cast', rung: 2, spell: 'healing', target: 'u0', unit: 'u0', spend: { pool: 1 } }, scriptedRng([10]));
    expect(unit(s2, 'u0').castPool).toBe(0);
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

describe('climbing above your grade', () => {
  // Level-6 infantry: Will +17, level DC 22, and Press adds nothing to it. Rolls 15 / 5 / 4 / 1
  // give the four degrees; the second roll in each script is the melee behind the climb.
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const reachPress = (roll: number, grade: Grade = 1) => {
    const s = engaged();
    unit(s, 'u0').grades.fight = grade;
    return act(s, { type: 'fight', rung: grade + 1 as Grade, target: 'u2', unit: 'u0' }, scriptedRng([roll, 5]));
  };

  it('takes a granted rung with no roll at all', () => {
    const s = engaged();
    unit(s, 'u0').grades.fight = 1;
    const f = offer(s, 'fight', 'u0');
    expect(f.granted).toBe(1);
    expect(f.reachable).toBe(2);
    expect(f.climb).toBe('roll');
    expect(f.climbCost).toBe(0);
    expect(f.rungs.map((r) => r.access)).toEqual(['free', 'reach', 'locked']);
  });

  it('critical success climbs one rung further', () => {
    expect(said(reachPress(15), 'reaches for Press')).toBe(true);
    expect(unit(reachPress(15), 'u0').disorder).toBe(0);
  });

  // A climb either happens or it does not: there is no lesser rung to land on.
  it('failure loses the act outright, at no further cost', () => {
    const s = reachPress(4);
    expect(said(s, 'comes to nothing')).toBe(true);
    expect(unit(s, 'u0').disorder).toBe(0);
    expect(unit(s, 'u2').wounds).toBe(0);
    expect(unit(s, 'u0').attacked).toBe(false);
  });

  it('critical failure loses the act and costs a point of disorder, at any grade', () => {
    for (const grade of [1, 2] as Grade[]) {
      const s = reachPress(1, grade);
      expect(said(s, 'comes to nothing')).toBe(true);
      expect(unit(s, 'u0').disorder).toBe(1);
      expect(unit(s, 'u2').wounds).toBe(0);
      expect(unit(s, 'u0').attacked).toBe(false);
    }
  });

  // Every rung carries the DC of the climb to itself, not the offer's nearest one: a caster may
  // gamble for two tiers at once, and the further gamble is the dearer by CLIMB_STEP.
  it('prices the climb to each rung, with a step for every rung past the first', () => {
    const caster: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
    const s = createBattle({
      units: [
        { card: caster, side: 'attacker', square: 'c2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    // A tradition caps how high each tree pushes; this needs one the caster may take to Tier 3.
    const deep = availableActions(s, 'u0').find((o) => o.type === 'cast' && o.rungs[2].access === 'reach')!;
    const [t1, t2, t3] = deep.rungs;
    expect(t1.reachDc).toBeNull();
    expect(t3.reachDc! - t2.reachDc!).toBe(2 + CLIMB_STEP);

    // A ladder only ever offers one rung above the grade, so the step never bites there.
    const f = availableActions(engaged(), 'u0').find((o) => o.type === 'fight')!;
    const climbed = f.rungs.find((r) => r.access === 'reach')!;
    expect(climbed.reachDc).toBe(f.reachDc);
  });

  // The bite is on the outcome a player actually sees. A one-rung climb fails 35% of the time
  // and costs nothing for it; a two-rung climb fails nearly half the time and costs disorder,
  // which is the only way the further gamble reads as a bet rather than a free lottery ticket.
  it('costs a critically failed cast a point of disorder on top of the cast', () => {
    const caster: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
    const start = () => {
      const s = createBattle({
        units: [
          { card: caster, side: 'attacker', square: 'c2' },
          { card: kobolds, side: 'defender', square: 'c7' },
        ],
        board: openBoard(),
      });
      place(s, 'u1', 'c3');
      return s;
    };
    const deepest = (s: BattleState) =>
      availableActions(s, 'u0').find((o) => o.type === 'cast' && o.rungs[2].access === 'reach')!;
    const cast = (rung: Grade, roll: number) => {
      const s = start();
      const o = deepest(s);
      const target = o.rungs[rung - 1].targets[0]?.id;
      return unit(act(s, { type: 'cast', rung, spell: o.spell!, target, unit: 'u0' }, scriptedRng([roll, 10, 10])), 'u0');
    };

    // A natural 1 is a critical failure whatever the DC: the cast is lost and costs 1 disorder.
    expect(cast(2, 1).disorder).toBe(1);
    expect(cast(3, 1).disorder).toBe(1);
  });

  it('a grade-3 unit has nothing to climb to', () => {
    const s = engaged();
    unit(s, 'u0').grades.fight = 3;
    const f = offer(s, 'fight', 'u0');
    expect(f.reachable).toBeNull();
    expect(f.rungs.map((r) => r.access)).toEqual(['free', 'free', 'free']);
  });
});

describe('what a climb costs, ladder by ladder', () => {
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };

  // Guard's currency is the Defence it sets, so its rungs are postures the grade gates
  // outright — there is nothing to gamble for and nothing to buy.
  it('Guard does not climb at all', () => {
    const g = offer(engaged(), 'guard', 'u0');
    expect(g.climb).toBe('none');
    expect(g.reachable).toBeNull();
    expect(g.dials.push).toBe(false);
    expect(g.rungs.map((r) => r.access)).toEqual(['free', 'locked', 'locked']);
    expect(() => act(engaged(), { type: 'guard', rung: 2, unit: 'u0' }, scriptedRng([10])))
      .toThrow(/a posture is not climbed for/);
  });

  // Aim means taking time: Shoot buys its rung with a further action and never rolls for it.
  it('Shoot buys its climb with an action and no roll', () => {
    const start = battle([]).state;
    place(start, 'u0', 'c5');
    const s = burn(start, 'u1');
    const o = offer(s, 'shoot', 'u2');
    expect(o.climb).toBe('action');
    expect(o.climbCost).toBe(1);
    expect(o.dials.push).toBe(false);
    expect(o.rungs[1].access).toBe('buy');

    const aimed = act(s, { type: 'shoot', rung: 2, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(unit(aimed, 'u2').actions).toBe(1);
    expect(aimed.log.some((e) => e.text.includes('reaches for'))).toBe(false);
    expect(said(aimed, 'takes the time for Aim')).toBe(true);
  });

  it('Rally buys its climb the same way, and refuses it on one action', () => {
    const s = engaged();
    unit(s, 'u0').disorder = 2;
    unit(s, 'u0').grades.rally = 1;
    const o = offer(s, 'rally', 'u0');
    expect(o.climb).toBe('action');
    expect(o.rungs[1].access).toBe('buy');
    expect(unit(act(s, { type: 'rally', rung: 2, unit: 'u0' }, scriptedRng([15])), 'u0').actions).toBe(1);

    // Actions refill when an activation begins, so the way to one action is to spend two.
    const low = oneActionLeft(engaged(), 'u0');
    unit(low, 'u0').disorder = 2;
    unit(low, 'u0').grades.rally = 1;
    expect(offer(low, 'rally', 'u0').rungs[1].reason).toBe('needs 2 actions');
    expect(() => act(low, { type: 'rally', rung: 2, unit: 'u0' }, scriptedRng([15]))).toThrow(/needs 2 actions/);
  });

  // A bought climb takes its action off the top, so the dials only ever see what is left.
  it('a bought climb leaves one fewer action for weight', () => {
    const start = battle([]).state;
    place(start, 'u0', 'c5');
    const s = burn(start, 'u1');
    expect(() => act(s, { type: 'shoot', rung: 2, target: 'u0', unit: 'u2', spend: { roll: 2 } }, scriptedRng([10])))
      .toThrow(/only 3 actions/);
    const one = act(s, { type: 'shoot', rung: 2, target: 'u0', unit: 'u2', spend: { roll: 1 } }, scriptedRng([10]));
    expect(one.activated).toContain('u2');
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

  it('puts each action after the first on the roll as +2', () => {
    for (const extra of [0, 1, 2]) {
      const s = act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { roll: extra } }, scriptedRng([10, 5]));
      expect(strikeMod(s)).toBe(11 + extra * ACTION_BONUS);
      expect(unit(s, 'u0').actions).toBe(s.activated.includes('u0') ? 3 : 2 - extra);
    }
  });

  it('puts each action after the first on the push check instead', () => {
    // Fight 2 reaching for Overrun: DC 24 against Will +17, so a 3 needs the full commitment
    // for the climb to land at all — short of that the act comes to nothing.
    const lands = (push: number) => {
      const s = act(engaged(), { type: 'fight', rung: 3, target: 'u2', unit: 'u0', spend: { push } }, scriptedRng([3, 5]));
      return !s.log.some((e) => e.text.includes('comes to nothing'));
    };
    expect([lands(0), lands(1), lands(2)]).toEqual([false, false, true]);
  });

  it('takes 0.50, 0.60 and 0.80 wounds a turn on one, two and three actions in an even matchup', () => {
    const rate = (extra: number, rung: Grade = 1) => {
      let wounds = 0;
      for (let roll = 1; roll <= 20; roll++) {
        const s0 = engaged();
        // The published medians run parallel, so an even matchup needs 12+ at any level.
        unit(s0, 'u2').stats.defence = strikeModifier(s0, unit(s0, 'u0'), unit(s0, 'u2')) + 12;
        const s = act(s0, { type: 'fight', rung, target: 'u2', unit: 'u0', spend: { roll: extra } }, scriptedRng([roll, 1]));
        wounds += unit(s, 'u2').wounds;
      }
      return wounds / 20;
    };
    expect([rate(0), rate(1), rate(2)]).toEqual([0.5, 0.6, 0.8]);
    // The same table on Press, which is what says the rung adds no number of its own — the
    // old +2 read 0.60 / 0.80 / 1.00 here.
    expect([rate(0, 2), rate(1, 2), rate(2, 2)]).toEqual([0.5, 0.6, 0.8]);
  });

  it('refuses a roll dial on Guard, which has no roll of its own', () => {
    expect(offer(engaged(), 'guard', 'u0').dials)
      .toMatchObject({ roll: false, push: false, defence: true, distance: false, extra: 2, step: 2 });
    expect(() => act(engaged(), { type: 'guard', rung: 1, unit: 'u0', spend: { roll: 1 } }, scriptedRng([10])))
      .toThrow(/no roll of its own/);
    expect(offer(engaged(), 'fight', 'u0').dials).toMatchObject({ roll: true, push: true, defence: false });
    expect(() => act(engaged(), { type: 'fight', rung: 1, target: 'u2', unit: 'u0', spend: { defence: 1 } }, scriptedRng([10, 5])))
      .toThrow(/no Defence to raise/);
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
    ends(act(engaged(), { type: 'guard', rung: 1, unit: 'u0', spend: { defence: 2 } }, scriptedRng([2])));
    ends(act(engaged(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { roll: 2 } }, scriptedRng([4])));

    const start = battle([]).state;
    place(start, 'u0', 'c5');
    const shooter = burn(start, 'u1');
    const shot = act(shooter, { type: 'shoot', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(strikeMod(shot)).toBe(7);
    expect(unit(shot, 'u2').actions).toBe(2);
    const heavy = act(shooter, { type: 'shoot', rung: 1, target: 'u0', unit: 'u2', spend: { roll: 2 } }, scriptedRng([10]));
    expect(strikeMod(heavy)).toBe(7 + 2 * ACTION_BONUS);
    expect(heavy.activated).toContain('u2');

    // Rally is a Quality check against the rout DC; the same natural roll fails unweighted but
    // succeeds once two spare actions weight it — the roll dial is live, not dead weight.
    const shaken = engaged();
    unit(shaken, 'u0').disorder = 3;
    const steady = act(shaken, { type: 'rally', rung: 1, unit: 'u0', spend: { roll: 2 } }, scriptedRng([3]));
    ends(steady);
    expect(unit(steady, 'u0').disorder).toBe(1);
    expect(unit(act(shaken, { type: 'rally', rung: 1, unit: 'u0' }, scriptedRng([3])), 'u0').disorder).toBe(2);

    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const p0 = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(p0, 'u1', 'c3');
    // 1 base action + 2 push reaches Tier 2 on a 20; the spell attack then rolls a 20
    // and hits outright, so the push visibly mattered — the point of this case, not the
    // exact wound arithmetic, which the disorder/casting-specific tests already cover.
    const cast = act(p0, { type: 'cast', rung: 2, spell: 'blast', target: 'u1', unit: 'u0', spend: { push: 2 } }, scriptedRng([20, 20, 20]));
    expect(cast.activated).toContain('u0');
    expect(unit(cast, 'u1').wounds).toBeGreaterThan(0);
  });

  it('buys Defence on Guard, +2 an action counting the first', () => {
    const brace = (defence: number) =>
      unit(act(engaged(), { type: 'guard', rung: 1, unit: 'u0', spend: { defence } }, scriptedRng([10])), 'u0').guard;
    expect(brace(0)).toEqual({ defence: 2, rung: 1 });
    expect(brace(1)).toEqual({ defence: 4, rung: 1 });
    expect(brace(2)).toEqual({ defence: 6, rung: 1 });
    // It raises Defence itself, so it is what the next attack rolls against.
    const held = act(engaged(), { type: 'guard', rung: 1, unit: 'u0', spend: { defence: 2 } }, scriptedRng([10]));
    expect(defenceOf(held, unit(held, 'u0'), null, false)).toBe(unit(held, 'u0').stats.defence + 6);
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
    expect(strikeMod(press)).toBe(11 + ACTION_BONUS);
    expect(unit(press, 'u0').actions).toBe(1);

    // Overrun is DC 24 against Will +17: a 4 needs both spare actions on the push check.
    const overrun = act(engaged(), { type: 'fight', rung: 3, target: 'u2', unit: 'u0', spend: { push: 2 } }, scriptedRng([4, 20, 5]));
    expect(overrun.log.some((e) => e.text.includes('overruns'))).toBe(true);
    expect(overrun.activated).toContain('u0');
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

  it('the roll dial changes the outcome at every rung, not just Steady', () => {
    // Under the old rule Rally and Inspire cleared everything outright, so this natural roll
    // would land on the same result with or without the dial at rungs 2 and 3.
    for (const rung of [1, 2, 3] as Grade[]) {
      const base = () => { const s = engaged(); unit(s, 'u0').disorder = 3; return s; };
      const bare = unit(act(base(), { type: 'rally', rung, unit: 'u0' }, scriptedRng([2])), 'u0');
      const weighted = unit(act(base(), { type: 'rally', rung, unit: 'u0', spend: { roll: 2 } }, scriptedRng([2])), 'u0');
      expect(bare.disorder).toBe(2); // failure clears 1
      expect(weighted.disorder).toBe(1); // the same roll, weighted +4, succeeds and clears 2 instead
    }
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

  it('lends heart to a neighbour with nothing to clear, worth one action of weight', () => {
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

describe('rungs carry effects, actions carry numbers', () => {
  // Level-6 infantry: strike +11, Will +17, Reflex +14, level DC 22, Fight 2 / Guard 1.
  const STRIKE = 11;
  const WILL = 17;
  const REFLEX = 14;
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };
  const mods = (s: BattleState) => s.log.filter((e) => e.check).map((e) => e.check!.modifier);

  it('never puts more than +4 on a roll, whatever the rung', () => {
    expect((ACTIONS_PER_ACTIVATION - 1) * ACTION_BONUS).toBe(4);

    // Strike and Press weigh the same, and two spare actions are the ceiling on both.
    for (const rung of [1, 2] as Grade[]) {
      const s = act(engaged(), { type: 'fight', rung, target: 'u2', unit: 'u0', spend: { roll: 2 } }, scriptedRng([10, 5]));
      expect(mods(s)[0]).toBe(STRIKE + ACTION_BONUS * 2);
    }

    // Overrun: the commitment weights the reach check, and the strike behind it is bare.
    const over = act(engaged(), { type: 'fight', rung: 3, target: 'u2', unit: 'u0', spend: { push: 2 } }, scriptedRng([10, 10, 5]));
    expect(mods(over).slice(0, 2)).toEqual([WILL + 4, STRIKE]);

    // The other rolls a commitment can weight. The shot and the Blast are asserted at +4 in
    // 'lets every type absorb a full three-action commitment'.
    const away = act(engaged(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { roll: 2 } }, scriptedRng([10]));
    expect(mods(away)[0]).toBe(REFLEX + 4);
    const shaken = engaged();
    unit(shaken, 'u0').disorder = 2;
    // The check runs against the unweakened disorder — Rally no longer clears a point before
    // rolling, so nothing has reduced it yet.
    const rallied = act(shaken, { type: 'rally', rung: 1, unit: 'u0', spend: { roll: 2 } }, scriptedRng([10]));
    expect(mods(rallied)[0]).toBe(WILL - 2 + 4);
  });

  it('takes their ground on an Overrun that breaks them', () => {
    const state = engaged();
    unit(state, 'u0').grades.fight = 3;
    unit(state, 'u2').wounds = MAX_WOUNDS - 1;
    const s = act(state, { type: 'fight', rung: 3, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('destroyed');
    expect(notation(unit(s, 'u0').square)).toBe('c3');
    // A Strike leaves the ground where it lies.
    const strike = act(state, { type: 'fight', rung: 1, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(notation(unit(strike, 'u0').square)).toBe('c2');
  });

  // Guard's Defence is bought with actions, the first one included; its rung is orthogonal and
  // carries only the effect. u2 attacks at +7 into a Defence set for an even matchup.
  const guarded = (rung: Grade, defence: number) => {
    const state = engaged();
    unit(state, 'u0').grades.guard = 3;
    unit(state, 'u0').stats.defence = strikeModifier(state, unit(state, 'u2'), unit(state, 'u0')) + 12;
    const s = act(state, { type: 'guard', rung, unit: 'u0', spend: { defence } }, scriptedRng([10]));
    return s.activated.includes('u0') ? s : endActivation(s, 'u0');
  };
  const struck = (s: BattleState, roll: number) =>
    unit(act(s, { type: 'fight', rung: 1, target: 'u0', unit: 'u2' }, scriptedRng([roll, 1])), 'u0').wounds;

  it('scales Guard +2, +4 and +6 Defence on one, two and three actions', () => {
    expect([0, 1, 2].map((d) => unit(guarded(1, d), 'u0').guard!.defence)).toEqual([2, 4, 6]);
    // Which is 0.40, 0.30 and 0.20 wounds an attack against the bare 0.50 — one action, a tenth.
    const rate = (rung: Grade, defence: number) => {
      let wounds = 0;
      for (let roll = 1; roll <= 20; roll++) wounds += struck(guarded(rung, defence), roll);
      return wounds / 20;
    };
    expect([rate(1, 0), rate(1, 1), rate(1, 2)]).toEqual([0.4, 0.3, 0.2]);
  });

  it('lands criticals as ordinary hits on a unit that has dug in, and nowhere else', () => {
    // Defence +6 either way: the rung and the action count are independent.
    expect(unit(guarded(1, 2), 'u0').guard).toEqual({ defence: 6, rung: 1 });
    expect(unit(guarded(2, 2), 'u0').guard).toEqual({ defence: 6, rung: 2 });
    // A natural 20 is a critical at that Defence, so it is exactly the hit Dig in blunts.
    expect(struck(guarded(1, 2), 20)).toBe(2);
    expect(struck(guarded(2, 2), 20)).toBe(1);
    // An ordinary hit is untouched, and so is a miss.
    expect(struck(guarded(2, 2), 19)).toBe(1);
    expect(struck(guarded(2, 2), 17)).toBe(0);
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
  it('Press adds nothing to the roll and costs the loser of the exchange a further disorder', () => {
    const pressed = (rolls: number[], rung: Grade = 2) => {
      const { state } = battle([]);
      place(state, 'u2', 'c3');
      return act(state, { type: 'fight', rung, target: 'u2', unit: 'u0' }, scriptedRng(rolls));
    };
    // The rung is not a number: Press rolls exactly what Strike rolls.
    expect(pressed([10, 5]).log[1].check!.modifier).toBe(pressed([10, 5], 1).log[1].check!.modifier);

    // Won: the defender takes the exchange's point and Press's on top.
    const won = pressed([10, 1]);
    expect(unit(won, 'u2').disorder).toBe(2);
    expect(unit(won, 'u0').disorder).toBe(0);
    expect(unit(pressed([10, 1], 1), 'u2').disorder).toBe(1);

    // Lost: the presser pays the same doubled price. A drawn exchange costs neither side.
    const lost = pressed([1, 20]);
    expect(unit(lost, 'u0').disorder).toBe(2);
    const drawn = pressed([1, 1]);
    expect(unit(drawn, 'u0').disorder).toBe(0);
    expect(unit(drawn, 'u2').disorder).toBe(0);
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

  it('puts each action after the first on the escape check as +2', () => {
    // 8 + 14 = 22 misses the Trolls' DC 23; the same roll with two more actions makes it.
    const two = () => held({ u3: 'c3' });
    const bare = act(two(), { type: 'withdraw', to: 'c1', unit: 'u0' }, scriptedRng([8, 20]));
    expect(wounds(bare)).toBe(1);
    const heavy = act(two(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { roll: 2 } }, scriptedRng([8, 20]));
    expect(wounds(heavy)).toBe(0);
    expect(heavy.activated).toContain('u0');
  });

  it('buys distance with the other dial, and refuses a cell further than it bought', () => {
    const one = activation(held(), 'u0')!.withdraw!;
    // Two spare actions at a square each, so the far cells are on offer up front.
    expect(one.dials).toMatchObject({ roll: true, push: false, defence: false, distance: true, extra: 2 });
    expect(one.targets.map((t) => t.id)).toContain('b1');
    expect(() => act(held(), { type: 'withdraw', to: 'b1', unit: 'u0' }, scriptedRng([5])))
      .toThrow(/further than 0 committed actions/);
    const far = act(held(), { type: 'withdraw', to: 'b1', unit: 'u0', spend: { distance: 2 } }, scriptedRng([5]));
    expect(where(far)).toBe('b1');
  });

  it('refuses an allocation past the actions left, on either dial', () => {
    expect(() => act(held(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { roll: 3 } }, scriptedRng([5])))
      .toThrow(/only 3 actions/);
    expect(() => act(held(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { roll: 2, distance: 1 } }, scriptedRng([5])))
      .toThrow(/only 3 actions/);
    expect(() => act(held(), { type: 'guard', rung: 1, unit: 'u0', spend: { defence: 3 } }, scriptedRng([10])))
      .toThrow(/only 3 actions/);
    expect(() => act(held(), { type: 'withdraw', to: 'c1', unit: 'u0', spend: { push: 1 } }, scriptedRng([5])))
      .toThrow(/needs no push check/);
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
    const s = act(chased(cavalry), { type: 'withdraw', to: 'e4', unit: 'u0', spend: { distance: 2 } }, scriptedRng([5]));
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
  it('at Quality a unit is shaken: Rally or withdraw, and it still counts as standing', () => {
    const { state } = battle([]);
    const k = unit(state, 'u2');
    expect(k.quality).toBe(5);
    k.disorder = k.quality;
    expect(isShaken(k)).toBe(true);
    expect(isRouted(k)).toBe(false);
    expect(isStanding(k)).toBe(true);
    expect(types(state, 'u2')).toEqual(['rally']);
    expect(activation(state, 'u2')!.withdraw).not.toBeNull();
    expect(moveReach(state, k).size).toBe(0);
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
