import { describe, expect, it } from 'vitest';
import {
  act, activatable, activation, activeUnit, availableActions, chargeTargets, createBattle, crewOf, defenceOf, deselect,
  endActivation, holdersOf, isOutflanked, isRouted, isShaken, isStanding, moveReach, movePath,
  rangeBetween, select, shootModifier, strikeModifier, unit, willModifier,
} from '../engine/battle.js';
import { edgeKey, hexGrid, notation, parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { ACTION_BONUS, ACTIONS_PER_ACTIVATION, MAX_WOUNDS } from '../engine/types.js';
import type { ActionOffer, BattleState, Side } from '../engine/types.js';
import { activityOf, type ActivityIndex, type Verb } from '../engine/ladders.js';

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
const refresh = (state: BattleState) => endActivation(act(state, { type: 'guard', activity: 1 }, scriptedRng([10])), scriptedRng([10]));
/** Burn every unit's activation so `endRound` runs, which is where an engine changes hands. */
const runRound = (state: BattleState) => {
  let s = state;
  while (s.round === 1 && s.phase === 'battle') s = burn(s, activeUnit(s)!.id);
  return s;
};
const types = (state: BattleState, id?: string) => availableActions(state, id).map((o) => o.type);
const offer = (state: BattleState, type: Verb, id?: string) =>
  availableActions(state, id).find((o) => o.type === type) as ActionOffer;
const targets = (o: ActionOffer, activity: ActivityIndex) => o.activities[activity - 1].targets.map((t) => t.id);
const guardOn = (state: BattleState, id: string, rng = scriptedRng([10])) =>
  act(state, { type: 'guard', activity: 1, unit: id }, rng);
const moves = (state: BattleState, id: string) => moveReach(state, unit(state, id));
const said = (state: BattleState, text: string) => state.log.some((e) => e.text.includes(text));
// A routed unit is offered no verb at all, only the withdrawal, so burning its activation
// takes both. One action leaves two unspent, so the activation is ended by hand unless the
// action ended it.
const burn = (state: BattleState, id: string) => {
  const s = availableActions(state, id).some((o) => o.type === 'guard')
    ? guardOn(state, id)
    : act(state, { type: 'withdraw', activity: 1, unit: id }, scriptedRng([10]));
  return s.phase === 'battle' && s.active === id ? endActivation(s, scriptedRng([10])) : s;
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
    const s = endActivation(guardOn(state, 'u0'), scriptedRng([10]));
    expect(s.activated).toEqual(['u0']);
    expect(activeUnit(s)!.side).toBe('defender');
  });

  it('spends a stun even on an activation that does nothing at all', () => {
    const { state } = battle([]);
    unit(state, 'u0').stunned = true;
    const passed = endActivation(select(state, 'u0'), scriptedRng([10]), 'u0');
    expect(unit(passed, 'u0').stunned).toBe(false);
    expect(said(passed, 'Infantry is stunned')).toBe(true);
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

describe('Cast', () => {
  const cleric: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
  const magus: UnitCard = {
    name: 'Magus', level: 6, role: 'infantry', caster: true, tradition: 'arcane', tactics: [],
    overrides: { spellAttack: 10 },
  };
  const castOffer = (state: BattleState, tree: string, id = 'u0') =>
    availableActions(state, id).find((o) => o.type === 'cast' && o.spell === tree)!;

  // The caster stands on c2, and c2 → d3 → d4 is one straight line out from it: the three
  // share a cube coordinate, each hex one further out than the last.
  const blastField = (defences: number[], cells = ['d3', 'd4']) => {
    const foes = defences.map((defence, i): UnitCard =>
      ({ ...infantry, name: `Foe ${i + 1}`, overrides: { defence } }));
    const s = createBattle({
      units: [
        { card: magus, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'e2' },
        ...foes.map((card, i) => ({ card, side: 'defender' as Side, square: `${'cde'[i]}7` })),
      ],
      board: openBoard('hex'),
    });
    foes.forEach((_, i) => place(s, `u${i + 2}`, cells[i]));
    return s;
  };

  it('gates which trees a tradition grants, and how many actions it may spend in each', () => {
    const s = createBattle({
      units: [{ card: cleric, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    // Divine's own row (section 11): blast 1, healing 3, controlling 2, offense 2, defense 2,
    // movement 0 — no Movement row at all, and Blast stops at the one-action activity.
    expect(availableActions(s, 'u0').filter((o) => o.type === 'cast').map((o) => o.spell))
      .toEqual(['blast', 'healing', 'controlling', 'offense', 'defense']);
    expect(castOffer(s, 'blast').activities.map((r) => r.cost)).toEqual([1, null, null]);
    expect(castOffer(s, 'blast').activities.map((r) => r.label)).toEqual(['Missile', 'Line', 'Burst']);
    expect(castOffer(s, 'healing').activities.map((r) => r.cost)).toEqual([1, 2, 3]);
  });

  it('reads one Line roll against the Defence in each of its two hexes', () => {
    const s = blastField([20, 10]);
    expect(castOffer(s, 'blast').activities[1].targets.map((t) => t.id)).toContain('d3+d4');
    // 10 + 10 = 20: a success against 20, a critical against 10.
    const cast = act(s, { type: 'cast', activity: 2, spell: 'blast', target: 'd3+d4', unit: 'u0' }, scriptedRng([10]));
    expect(unit(cast, 'u2').wounds).toBe(1);
    expect(unit(cast, 'u3').wounds).toBe(2);
    expect(cast.log.filter((e) => e.text.startsWith('Line catches'))).toHaveLength(2);
  });

  it("reads the worse of the shape's two dice against a ward in the Line's second hex", () => {
    const s = blastField([20, 10]);
    unit(s, 'u3').ward = true;
    // 10 totals 20: a success against 20 and a critical against 10. The ward's second die, a 3,
    // totals 13 — still a success against 10, so the critical is the thing it takes away.
    const cast = act(s, { type: 'cast', activity: 2, spell: 'blast', target: 'd3+d4', unit: 'u0' }, scriptedRng([10, 3]));
    expect(unit(cast, 'u2').wounds).toBe(1);
    expect(unit(cast, 'u3').wounds).toBe(1);
    expect(unit(cast, 'u3').ward).toBe(false);
  });

  it('wastes the whole Blast on an aegis anywhere in the shape', () => {
    const s = blastField([20, 10]);
    unit(s, 'u3').aegis = { dc: 50 };
    const cast = act(s, { type: 'cast', activity: 2, spell: 'blast', target: 'd3+d4', unit: 'u0' }, scriptedRng([1]));
    expect(unit(cast, 'u2').wounds).toBe(0);
    expect(unit(cast, 'u3').wounds).toBe(0);
    expect(unit(cast, 'u0').attacked).toBe(true);
    expect(said(cast, 'attack is wasted against the aegis')).toBe(true);
  });

  it('draws a Burst on the three hexes that meet at one corner', () => {
    const s = blastField([20], ['d4']);
    const shapes = castOffer(s, 'blast').activities[2].targets.map((t) => t.id);
    // Six corners meet at the enemy's own hex, so six shapes cover it.
    expect(shapes).toContain('d4+e4+e5');
    expect(shapes).toHaveLength(6);
    for (const id of shapes) {
      const [a, b, c] = id.split('+').map(parse);
      expect([[a, b], [b, c], [a, c]].map(([x, y]) => hexGrid.distance(x, y))).toEqual([1, 1, 1]);
    }
  });

  it('reads a Heal against each unit\'s own level DC, so one d20 lands two degrees', () => {
    const levy: UnitCard = { name: 'Levy', level: 2, role: 'infantry', tactics: [] };
    const champion: UnitCard = { name: 'Champion', level: 15, role: 'infantry', tactics: [] };
    const s = createBattle({
      units: [
        { card: cleric, side: 'attacker', square: 'c2' },
        { card: levy, side: 'attacker', square: 'c1' },
        { card: champion, side: 'attacker', square: 'd2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    // Level-6 divine spell attack +11. Roll 15 totals 26: against level 2's DC 16 that clears
    // dc + 10, a critical success; against level 15's DC 34 it falls short, a plain failure.
    const cast = act(s, { type: 'cast', activity: 2, spell: 'healing', target: 'u1+u2', unit: 'u0' }, scriptedRng([15]));
    expect(cast.log.find((e) => e.text.startsWith('Heal reaches Levy'))!.check!.degree).toBe('critical-success');
    expect(cast.log.find((e) => e.text.startsWith('Heal reaches Champion'))!.check!.degree).toBe('failure');
  });
});

describe('Controlling', () => {
  const cleric: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
  const dread = (rolls: number[]) => {
    const s = createBattle({
      units: [
        { card: cleric, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    place(s, 'u1', 'c4');
    return act(s, { type: 'cast', spell: 'controlling', activity: 1, target: 'u1', unit: 'u0' }, scriptedRng(rolls));
  };

  // Divine spell DC 21 against a level-6 troop's Will +17.
  it('frightens the target on a success, and costs it nothing else', () => {
    const s = dread([8]); // total 25: a plain success
    expect(unit(s, 'u1').frightened).toBe(true);
    expect(unit(s, 'u1').disorder).toBe(0);
  });

  it("costs 2 disorder on a critical failure, in place of Dread's 1", () => {
    const s = dread([1]); // a natural 1 drops a failure to a critical one
    expect(unit(s, 'u1').disorder).toBe(2);
    expect(unit(s, 'u1').frightened).toBe(false);
  });

  it('is cast once an activation, Controlling as much as any other tree', () => {
    const s = dread([10]);
    expect(() => act(s, { type: 'cast', spell: 'controlling', activity: 1, target: 'u1', unit: 'u0' }, scriptedRng([10])))
      .toThrow(/already cast this activation/);
  });
});

describe('Offense', () => {
  const occultist: UnitCard = { name: 'Occultist', level: 6, role: 'infantry', caster: true, tradition: 'occult', tactics: [] };

  it('Sure strike keeps the better of two rolls', () => {
    const s = createBattle({
      units: [
        { card: occultist, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'e2' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    place(s, 'u1', 'c3');
    place(s, 'u2', 'c4');
    const cast = act(s, { type: 'cast', spell: 'offense', activity: 1, target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(cast, 'u1').sureStrike).toBe(true);
    const passed = endActivation(endActivation(cast, scriptedRng([10])), scriptedRng([10]), 'u2');
    // 8 totals 19, a plain success; 3 totals 14, a failure. Sure strike keeps the 8.
    const struck = act(passed, { type: 'fight', activity: 1, target: 'u2', unit: 'u1' }, scriptedRng([8, 3]));
    expect(unit(struck, 'u2').wounds).toBe(1);
    expect(unit(struck, 'u1').sureStrike).toBe(false);
    expect(said(struck, 'rolls twice under sure strike')).toBe(true);
  });

  it('a Wrath wound lands at the target\'s finish and asks the save', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    unit(state, 'u0').wrath = true;
    const hit = act(state, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([8]));
    expect(unit(hit, 'u2').persistent).not.toBeNull();
    expect(unit(hit, 'u0').wrath).toBe(false);
    const passed = endActivation(hit, scriptedRng([10]));
    // A natural 1 always fails: the wound lands, then the failed Fortitude save costs disorder.
    const landed = endActivation(passed, scriptedRng([1]), 'u2');
    expect(unit(landed, 'u2').wounds).toBe(2);
    expect(unit(landed, 'u2').persistent).toBeNull();
    expect(said(landed, 'braces against the persistent wound')).toBe(true);
  });

  it('refuses a buff cast on the caster itself: Offense names an ally', () => {
    const s = createBattle({
      units: [
        { card: occultist, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'c3' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    const offense = availableActions(s, 'u0').find((o) => o.type === 'cast' && o.spell === 'offense')!;
    expect(offense.activities[2].targets.map((t) => t.id)).toEqual(['u1']);
    expect(() => act(s, { type: 'cast', spell: 'offense', activity: 3, target: 'u0', unit: 'u0' }, scriptedRng([10])))
      .toThrow('not a target');
  });

  it('a hasted unit has four actions twice and three the third time', () => {
    let s = createBattle({
      units: [
        { card: occultist, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'c3' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    s = act(s, { type: 'cast', spell: 'offense', activity: 3, target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u1').haste).toBe(2);
    const grants: number[] = [];
    for (let i = 0; i < 3; i++) {
      while (activeUnit(s)!.id !== 'u1') s = endActivation(s, scriptedRng([10]), activeUnit(s)!.id);
      s = act(s, { type: 'guard', activity: 1, unit: 'u1' }, scriptedRng([10]));
      grants.push(unit(s, 'u1').actions + 1);
      s = endActivation(s, scriptedRng([10]), 'u1');
    }
    expect(grants).toEqual([4, 4, 3]);
  });
});

describe('Defense', () => {
  const occultist: UnitCard = { name: 'Occultist', level: 6, role: 'infantry', caster: true, tradition: 'occult', tactics: [] };

  it('Ward and Sure strike on one attack cancel to one roll', () => {
    const s = createBattle({
      units: [
        { card: occultist, side: 'attacker', square: 'c1' },
        { card: infantry, side: 'attacker', square: 'c2' },
        { card: occultist, side: 'defender', square: 'c7' },
        { card: kobolds, side: 'defender', square: 'c8' },
      ],
      board: openBoard(),
    });
    place(s, 'u1', 'c3');
    place(s, 'u2', 'c5');
    place(s, 'u3', 'c4');
    const cast = act(s, { type: 'cast', spell: 'offense', activity: 1, target: 'u1', unit: 'u0' }, scriptedRng([10]));
    const afterU0 = endActivation(cast, scriptedRng([10]));
    const warded = act(afterU0, { type: 'cast', spell: 'defense', activity: 1, target: 'u3', unit: 'u2' }, scriptedRng([10]));
    expect(unit(warded, 'u3').ward).toBe(true);
    const afterU2 = endActivation(warded, scriptedRng([10]));
    // 8 totals 19, a plain success, the same single roll either flag alone would have made.
    const struck = act(afterU2, { type: 'fight', activity: 1, target: 'u3', unit: 'u1' }, scriptedRng([8, 3]));
    expect(unit(struck, 'u3').wounds).toBe(1);
    expect(unit(struck, 'u1').sureStrike).toBe(false);
    expect(unit(struck, 'u3').ward).toBe(false);
    expect(said(struck, 'keeps the better')).toBe(false);
    expect(said(struck, 'keeps the worse')).toBe(false);
  });

  it('an attacker that fails the Aegis save spends its actions and its attack', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    // No tradition's cap reaches Aegis (defense index 3; see the Wave 11 todos), so the mark is
    // set directly, the same way the Wrath test sets `wrath` rather than casting Offense 2.
    unit(state, 'u2').aegis = { dc: 50 };
    const gated = act(state, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([1]));
    expect(unit(gated, 'u0').attacked).toBe(true);
    expect(unit(gated, 'u0').actions).toBe(2);
    expect(unit(gated, 'u2').wounds).toBe(0);
    expect(unit(gated, 'u2').aegis).not.toBeNull();
    expect(said(gated, 'attack is wasted against the aegis')).toBe(true);
  });
});

describe('Movement', () => {
  const wizard: UnitCard = { name: 'Wizard', level: 6, role: 'infantry', caster: true, tradition: 'arcane', tactics: [] };
  const druid: UnitCard = { name: 'Druid', level: 6, role: 'infantry', caster: true, tradition: 'primal', tactics: [] };

  it('a sure-footed troop enters swamp for one action, where it pays three', () => {
    const board = openBoard();
    board.squares[3][2].terrain = 'swamp';
    const s = createBattle({
      units: [
        { card: wizard, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'c3' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board,
    });
    expect(moves(s, 'u1').get('c4')).toMatchObject({ feet: 30, actions: 3 });
    const cast = act(s, { type: 'cast', spell: 'movement', activity: 1, target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(cast, 'u1').sureFooting).toBe(true);
    expect(moves(cast, 'u1').get('c4')).toMatchObject({ feet: 10, actions: 1 });
  });

  it('Translocate lifts an ally out of contact, with no strike and none of its own actions', () => {
    const s = createBattle({
      units: [
        { card: druid, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'attacker', square: 'c3' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    place(s, 'u2', 'c4');
    const movement = availableActions(s, 'u0').find((o) => o.type === 'cast' && o.spell === 'movement')!;
    expect(movement.activities[2].targets.map((t) => t.id)).toContain('c3+b3');
    const cast = act(s, { type: 'cast', spell: 'movement', activity: 3, target: 'c3+b3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(cast, 'u1').square).toEqual(parse('b3'));
    expect(unit(cast, 'u1').wounds).toBe(0);
    expect(unit(cast, 'u1').actions).toBe(ACTIONS_PER_ACTIVATION);
    expect(said(cast, 'strikes the')).toBe(false);
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
    expect(movePath(s, u, 'c5').map((p) => p.cell)).toEqual(['c3', 'c4', 'c5']);
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

  it('an unspent Fly crosses water but cannot end a Move there, unlike a native flier', () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    const { state } = battle([], board);
    const u = unit(state, 'u0');
    u.flies = true;
    u.actions = 2;
    const reach = moves(state, 'u0');
    expect(reach.has('c3')).toBe(false);
    expect(reach.get('c4')).toMatchObject({ feet: 20 });
  });

  it("carries the cheapest route to a hex beyond water whole, even though the water it crosses is not itself a destination", () => {
    const board = openBoard();
    board.squares[2][2].terrain = 'water';
    const { state } = battle([], board);
    const u = unit(state, 'u0');
    u.flies = true;
    u.actions = 2;
    expect(movePath(state, u, 'c4').map((p) => p.cell)).toEqual(['c2', 'c3', 'c4']);
    expect(moveReach(state, u).has('c3')).toBe(false);
  });

  it('a unit in contact leaves by withdrawing, not by striding', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    expect(moves(state, 'u0').size).toBe(0);
    expect(chargeTargets(state, unit(state, 'u0'))).toEqual([]);
  });

  it('a Charge is one action of movement, up to two Speeds, and the Fight it ends in', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c5');
    expect(chargeTargets(state, unit(state, 'u0'))).toEqual([{ unit: 'u2', cell: 'c4', feet: 20, actions: 1 }]);
    const s = act(state, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([20, 1]));
    expect(unit(s, 'u0').square).toEqual(parse('c4'));
    expect(unit(s, 'u0').actions).toBe(1);
    expect(unit(s, 'u0').exposed).toBe(true);
    expect(unit(s, 'u2').wounds).toBeGreaterThanOrEqual(1);
  });

  it('lands its +2 over open ground and loses it through forest', () => {
    const strikeMod = (s: BattleState) => s.log.find((e) => e.check)!.check!.modifier;
    const open = battle([]).state;
    place(open, 'u2', 'c4');
    expect(strikeMod(act(open, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([10, 5])))).toBe(13);

    const board = openBoard();
    board.squares[2][2].terrain = 'forest';
    const wooded = battle([], board).state;
    place(wooded, 'u2', 'c4');
    expect(strikeMod(act(wooded, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([10, 5])))).toBe(11);
  });

  it('a charge from a higher hex puts the target’s save at −2', () => {
    const board = openBoard();
    board.squares[1][2].elevation = 1;
    const { state } = battle([], board);
    place(state, 'u2', 'c4');
    const s = act(state, { type: 'charge', target: 'u2', unit: 'u0' }, scriptedRng([20, 10]));
    const save = s.log.find((e) => e.text.includes('braces against the wound'))!.check!;
    expect(save.modifier).toBe(unit(s, 'u2').stats.fortitude - 2);
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
    const s = act(engaged(), { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').attacked).toBe(true);
    expect(offer(s, 'fight', 'u0').activities.map((r) => r.legal)).toEqual([false, false, false]);
    expect(offer(s, 'fight', 'u0').activities[0].reason).toBe('already attacked this activation');
    expect(() => act(s, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5])))
      .toThrow(/already attacked/);
    // Everything that is not an attack is still on offer.
    expect(offer(s, 'guard', 'u0').activities[0].legal).toBe(true);
  });

  it('spends the same one attack on a shot or a blast', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    const shot = act(burn(state, 'u1'), { type: 'shoot', activity: 1, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(offer(shot, 'shoot', 'u2').activities[0].legal).toBe(false);

    const priest: UnitCard = { name: 'Priests', level: 9, role: 'infantry', caster: true, tactics: [] };
    const p0 = createBattle({
      units: [{ card: priest, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(p0, 'u1', 'c3');
    const blasted = act(p0, { type: 'cast', activity: 1, spell: 'blast', target: 'u1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(blasted, 'u0').attacked).toBe(true);
    expect(offer(blasted, 'fight', 'u0').activities[0].legal).toBe(false);
  });

  it('leaves Move buying ground, and a Strike affordable after it', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c4');
    let s = act(state, { type: 'move', to: 'c3', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').actions).toBe(2);
    expect(unit(s, 'u0').feet).toBe(0);
    expect(unit(s, 'u0').attacked).toBe(false);
    s = act(s, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(s)).toBe(11);
    expect(unit(s, 'u0').actions).toBe(1);
  });

  it('costs one action for a Strike, two for a Press and three for an Overrun, each the same roll', () => {
    expect(offer(engaged(), 'fight', 'u0').activities.map((r) => r.cost)).toEqual([1, 2, 3]);

    const strike = act(engaged(), { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(strike)).toBe(11);
    expect(unit(strike, 'u0').actions).toBe(2);

    const press = act(engaged(), { type: 'fight', activity: 2, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(strikeMod(press)).toBe(11);
    expect(unit(press, 'u0').actions).toBe(1);

    const overrun = act(engaged(), { type: 'fight', activity: 3, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    expect(overrun.log.some((e) => e.text.includes('overruns'))).toBe(true);
    expect(overrun.activated).toContain('u0');
  });

  it('prices every activity at its own index, for a levy and for an elite alike', () => {
    const levy: UnitCard = { name: 'Levy', level: 1, role: 'infantry', tactics: [] };
    const elite: UnitCard = {
      name: 'Einherjar', level: 12, role: 'infantry', fear: true,
      signals: ['melee-drill', 'shielded', 'formation'], tactics: ['raise-shields'],
    };
    const s = createBattle({
      units: [{ card: levy, side: 'attacker', square: 'c2' }, { card: elite, side: 'defender', square: 'c7' }],
      board: openBoard(),
    });
    place(s, 'u1', 'c3');
    for (const id of ['u0', 'u1']) {
      expect(offer(s, 'fight', id).activities.map((r) => r.cost), id).toEqual([1, 2, 3]);
      expect(offer(s, 'guard', id).activities.map((r) => r.cost), id).toEqual([1, 2, 3]);
    }
  });

  it('spends the rest on other acts: a Strike and then a Brace', () => {
    let s = act(engaged(), { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 5]));
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u0').guard).toEqual({ defence: 2, cap: false, holds: false });
    expect(unit(s, 'u0').actions).toBe(1);
  });
});

describe('activities carry effects', () => {
  const engaged = () => {
    const { state } = battle([]);
    place(state, 'u2', 'c3');
    return state;
  };

  it('Overrun drives a hit target back a hex and takes its ground; a miss moves nobody', () => {
    const state = engaged();
    const s = act(state, { type: 'fight', activity: 3, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(notation(unit(s, 'u0').square)).toBe('c3');
    expect(notation(unit(s, 'u2').square)).toBe('c4');
    expect(said(s, 'drives Kobolds back')).toBe(true);
    const miss = act(state, { type: 'fight', activity: 3, target: 'u2', unit: 'u0' }, scriptedRng([2, 10]));
    expect(notation(unit(miss, 'u0').square)).toBe('c2');
    expect(notation(unit(miss, 'u2').square)).toBe('c3');
  });

  it('Overrun takes the ground of a target it destroys; a Strike leaves it', () => {
    const state = engaged();
    unit(state, 'u2').wounds = MAX_WOUNDS - 1;
    const s = act(state, { type: 'fight', activity: 3, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(unit(s, 'u2').status).toBe('destroyed');
    expect(notation(unit(s, 'u0').square)).toBe('c3');
    const strike = act(state, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10]));
    expect(notation(unit(strike, 'u0').square)).toBe('c2');
  });

  it('Press skips the Fortitude save: a hit disorders outright, and a miss gives nothing extra', () => {
    const hit = act(engaged(), { type: 'fight', activity: 2, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(unit(hit, 'u2').wounds).toBe(1);
    expect(unit(hit, 'u2').disorder).toBe(1);
    expect(said(hit, 'no save')).toBe(true);
    // The same 20 on a Strike is a save made, and no disorder.
    const strike = act(engaged(), { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([10, 20]));
    expect(unit(strike, 'u2').disorder).toBe(0);
    const miss = act(engaged(), { type: 'fight', activity: 2, target: 'u2', unit: 'u0' }, scriptedRng([2, 20]));
    expect(unit(miss, 'u2').disorder).toBe(0);
  });

  // Defence off the activity: +2 for Brace and Dig in, +4 for Take cover. The +12 buffer keeps an
  // ordinary hit out of reach, so only a natural 20's degree shift can land one.
  const guarded = (activity: ActivityIndex) => {
    const state = engaged();
    unit(state, 'u0').stats.defence = strikeModifier(state, unit(state, 'u2'), unit(state, 'u0')) + 12;
    // Take cover spends all three actions, which ends the activation on its own.
    const s = act(state, { type: 'guard', activity, unit: 'u0' }, scriptedRng([10]));
    return s.active === 'u0' ? endActivation(s, scriptedRng([10]), 'u0') : s;
  };
  const struck = (s: BattleState, roll: number) =>
    unit(act(s, { type: 'fight', activity: 1, target: 'u0', unit: 'u2' }, scriptedRng([roll, 1])), 'u0').wounds;

  it('Brace and Dig in are +2 Defence; Take cover is +4', () => {
    const defenceByActivity: Record<ActivityIndex, 2 | 4> = { 1: 2, 2: 2, 3: 4 };
    for (const activity of [1, 2, 3] as ActivityIndex[]) {
      const s = guarded(activity);
      expect(unit(s, 'u0').guard?.defence).toBe(defenceByActivity[activity]);
      expect(defenceOf(s, unit(s, 'u0'), null, false)).toBe(unit(s, 'u0').stats.defence + defenceByActivity[activity]);
    }
  });

  it('caps a critical at one wound from Dig in up, and not at Brace', () => {
    // A natural 20 is a critical at that Defence, so it is exactly the hit the cap blunts.
    expect(struck(guarded(1), 20)).toBe(2);
    expect(struck(guarded(2), 20)).toBe(1);
    // An ordinary hit is untouched, and so is a miss.
    expect(struck(guarded(2), 19)).toBe(1);
    expect(struck(guarded(2), 13)).toBe(0);
  });

  it('Take cover holds against an Overrun: the shove fails and the attacker stays put', () => {
    const state = engaged();
    unit(state, 'u0').stats.defence = strikeModifier(state, unit(state, 'u2'), unit(state, 'u0')) + 5;
    const covered = act(state, { type: 'guard', activity: 3, unit: 'u0' }, scriptedRng([10]));
    const s = act(covered, { type: 'fight', activity: 3, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(notation(unit(s, 'u0').square)).toBe('c2');
    expect(notation(unit(s, 'u2').square)).toBe('c3');
    expect(unit(s, 'u0').wounds).toBe(1);
    expect(said(s, 'holds its ground under cover')).toBe(true);
  });

  it('a defend-allies Guard shares +2 Defence with a neighbour; a plain Guard shares nothing', () => {
    const shieldbearer: UnitCard = { name: 'Shieldbearer', level: 6, role: 'infantry', tactics: ['defend-allies'] };
    const spearman: UnitCard = { name: 'Spearman', level: 6, role: 'infantry', tactics: [] };
    const s = createBattle({
      units: [
        { card: shieldbearer, side: 'attacker', square: 'c2' },
        { card: spearman, side: 'attacker', square: 'c1' },
        { card: kobolds, side: 'defender', square: 'c7' },
      ],
      board: openBoard(),
    });
    const shared = act(s, { type: 'guard', activity: 1, unit: 'u0' }, scriptedRng([10]));
    expect(defenceOf(shared, unit(shared, 'u1'), null, false)).toBe(unit(shared, 'u1').stats.defence + ACTION_BONUS);

    const plain = act(s, { type: 'guard', activity: 1, unit: 'u1' }, scriptedRng([10]));
    expect(defenceOf(plain, unit(plain, 'u0'), null, false)).toBe(unit(plain, 'u0').stats.defence);
  });
});

describe('shooting', () => {
  it('every shoot activity reaches the same target, whatever the band', () => {
    const { state } = battle([]);
    unit(state, 'u1').status = 'destroyed';
    place(state, 'u0', 'c4');
    const s = offer(state, 'shoot', 'u2');
    expect(targets(s, 1)).toEqual(['u0']);
    expect(targets(s, 2)).toEqual(['u0']);
    expect(targets(s, 3)).toEqual(['u0']);
  });
  it('a shot two bands beyond effective range is at −4', () => {
    const { state } = battle([]);
    expect(rangeBetween(state, unit(state, 'u2'), unit(state, 'u0'))).toBe('long');
    expect(shootModifier(state, unit(state, 'u2'), unit(state, 'u0'))).toBe(unit(state, 'u2').stats.volley! - 4);
  });
  it('a shooter on higher ground counts the band one closer, so the penalty lifts', () => {
    const board = openBoard();
    board.squares[6][2].elevation = 1;
    const { state } = battle([], board);
    place(state, 'u0', 'c4');
    expect(shootModifier(state, unit(state, 'u2'), unit(state, 'u0'))).toBe(unit(state, 'u2').stats.volley);
  });
  it('is −4 into a melee and +1 from behind a standing wall', () => {
    const board = openBoard();
    board.walls[edgeKey(parse('c6'), parse('c7'))] = { tier: 2, boxes: 3, remaining: 3 };
    const { state } = battle([], board);
    place(state, 'u0', 'c5');
    const k = unit(state, 'u2');
    expect(shootModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley! + 1);
    place(state, 'u3', 'c6');
    expect(shootModifier(state, k, unit(state, 'u0'))).toBe(k.stats.volley! + 1 - 4);
  });
  it('caps the top band on hex, where a ring is true range', () => {
    const hex = battle([], openBoard('hex')).state;
    unit(hex, 'u1').status = 'destroyed';
    place(hex, 'u0', 'c2');
    const bandAt = (cell: string) => {
      place(hex, 'u2', cell);
      return rangeBetween(hex, unit(hex, 'u0'), unit(hex, 'u2'));
    };
    expect(bandAt('c4')).toBe('short');
    expect(bandAt('c6')).toBe('medium');
    expect(bandAt('c8')).toBe('long');
    expect(bandAt('c9')).toBe('extreme');
    // Every shoot activity reaches an extreme target now — the offset window is gone, and the
    // ceiling is the band itself. Beyond never occurs on this board: its own radius already
    // caps extreme at 8, the farthest two hexes can ever be.
    expect(targets(offer(hex, 'shoot', 'u2'), 1)).toEqual(['u0']);
    // Manhattan distance already over-counts a square diagonal, so square keeps no cap.
    const sq = battle([], openBoard('square')).state;
    place(sq, 'u0', 'a1');
    place(sq, 'u2', 'h8');
    expect(rangeBetween(sq, unit(sq, 'u0'), unit(sq, 'u2'))).toBe('extreme');
  });
  it('Suppress bites on a miss', () => {
    const { state } = battle([]);
    unit(state, 'u0').stats.defence = 99;
    const s = act(burn(state, 'u1'), { type: 'shoot', activity: 2, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    expect(unit(s, 'u0').wounds).toBe(0);
    expect(unit(s, 'u0').suppressedBy).toBe('u2');
  });
  it('a pinned unit cannot Move and its pinner is a holder', () => {
    const { state } = battle([]);
    const s = act(burn(state, 'u1'), { type: 'shoot', activity: 3, target: 'u0', unit: 'u2' }, scriptedRng([10]));
    const target = unit(s, 'u0');
    expect(target.pinnedBy).toBe('u2');
    expect(moveReach(s, target).size).toBe(0);
    expect(holdersOf(s, target).some((h) => h.id === 'u2')).toBe(true);
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
  const fight = (rolls: number[]) => act(engaged(), { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng(rolls));

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
    const miss = act(state, { type: 'fight', activity: 1, target: 'u2', unit: 'u0' }, scriptedRng([1, 20]));
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
  const breakOff = (state: BattleState, rolls: number[], to = 'c1', id = 'u0') =>
    act(state, { type: 'withdraw', activity: 1, to, unit: id }, scriptedRng(rolls));

  it('offers three activities at their own price, and one check against the highest holder', () => {
    const w = activation(held({ u2: 'c3', u3: 'b2' }), 'u0')!.withdraw!;
    expect(w.activities.map((r) => [r.label, r.cost])).toEqual([['Break off', 1], ['Disengage', 2], ['Fighting retreat', 3]]);
    expect(w.modifier).toBe(14);
    expect(w.dc).toBe(23);
    expect(w.holders).toEqual([
      { unit: 'u2', name: 'Kobolds', dc: 17, pinning: false, follows: false },
      { unit: 'u3', name: 'Trolls', dc: 23, pinning: false, follows: false },
    ]);
    // Disorder is −1 to everything, the escape included.
    const shaken = held();
    unit(shaken, 'u0').disorder = 2;
    expect(activation(shaken, 'u0')!.withdraw!.modifier).toBe(12);
  });

  it('resolves the four degrees of a Break off: away clean, struck, or held where it stands', () => {
    const away = breakOff(held(), [5]);
    expect(wounds(away)).toBe(0);
    expect(where(away)).toBe('c1');

    const struck = breakOff(held(), [2, 20]);
    expect(wounds(struck)).toBe(1);
    expect(where(struck)).toBe('c1');
    expect(unit(struck, 'u0').disorder).toBe(1);

    // A critical failure is the one degree that does not break contact at all.
    const pinned = breakOff(held(), [1, 20]);
    expect(where(pinned)).toBe('c2');
    expect(wounds(pinned)).toBe(1);
    expect(unit(pinned, 'u0').disorder).toBe(2);
  });

  it('reads the one roll for every holder, so a grip it cleared lands no free strike', () => {
    // 5 + 14 = 19: a failure against the Trolls' DC 23, a success against the Kobolds' 17.
    const s = breakOff(held({ u2: 'c3', u3: 'b2' }), [5, 20, 20]);
    expect(said(s, 'Trolls strikes the withdrawing')).toBe(true);
    expect(said(s, 'Kobolds strikes the withdrawing')).toBe(false);
    expect(wounds(s)).toBe(1);
    expect(where(s)).toBe('c1');
  });

  it('carries a free Move of the unit\'s Speed on a critical, and one hex toward it otherwise', () => {
    const state = held({ u2: 'e3' });
    // The Pace troop's Speed is two squares, so d1 is only ever reached by the clean break.
    expect(where(breakOff(state, [20], 'd1', 'u1'), 'u1')).toBe('d1');
    expect(where(breakOff(state, [5], 'd1', 'u1'), 'u1')).toBe('d2');
  });

  it('is no verb of the menu: nothing offers a Withdraw row', () => {
    expect(types(held(), 'u0')).not.toContain('withdraw');
  });

  it('is offered even with nowhere to go, so a cornered unit is never stuck', () => {
    const { state } = battle([]);
    place(state, 'u0', 'a1');
    place(state, 'u1', 'a2');
    place(state, 'u2', 'b1');
    const w = activation(state, 'u0')!.withdraw!;
    expect(w.holders).toHaveLength(1);
    expect(w.targets).toEqual([]);
    const s = act(state, { type: 'withdraw', activity: 1, unit: 'u0' }, scriptedRng([5]));
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
    const s = act(chased(), { type: 'withdraw', activity: 1, to: 'c1', unit: 'u0' }, scriptedRng([5]));
    expect(notation(unit(s, 'u0').square)).toBe('c1');
    expect(notation(unit(s, 'u1').square)).toBe('c2');
    expect(unit(s, 'u0').wounds).toBe(0);
    expect(unit(s, 'u0').disorder).toBe(0);
  });

  it('is shaken off outright by a critical success', () => {
    // Reflex +14 against the Line's DC 21 crits on 17 or better.
    const s = act(chased(), { type: 'withdraw', activity: 1, to: 'c1', unit: 'u0' }, scriptedRng([17]));
    expect(notation(unit(s, 'u0').square)).toBe('c1');
    expect(notation(unit(s, 'u1').square)).toBe('c3');
  });

  it('keeps its grip on a critical failure, on top of the free strike', () => {
    const pinned = act(chased(), { type: 'withdraw', activity: 1, to: 'c1', unit: 'u0' }, scriptedRng([1, 20]));
    expect(notation(unit(pinned, 'u0').square)).toBe('c2');
    expect(unit(pinned, 'u0').wounds).toBe(1);
  });

  it('is rooted and does not follow when it fails its own Disengage roll', () => {
    // The Line rolls Reflex +14 against the level-6 runner's DC 22: 8 or better holds on.
    const failed = act(chased(), { type: 'withdraw', activity: 2, to: 'c1', unit: 'u0' }, scriptedRng([1]));
    expect(unit(failed, 'u1').rooted).toBe(1);
    expect(notation(unit(failed, 'u1').square)).toBe('c3');
    expect(unit(failed, 'u0').wounds).toBe(0);

    const passed = act(chased(), { type: 'withdraw', activity: 2, to: 'c1', unit: 'u0' }, scriptedRng([10]));
    expect(unit(passed, 'u1').rooted).toBe(0);
    expect(notation(unit(passed, 'u1').square)).toBe('c2');

    const fighting = act(chased(), { type: 'withdraw', activity: 3, to: 'c1', unit: 'u0' }, scriptedRng([1]));
    expect(unit(fighting, 'u1').disorder).toBe(1);
  });
});

describe('disorder', () => {
  it('a wounding shot disorders the target, and Rally clears it', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    // 20 crits the shot; 1 auto-fails the Fortitude save against it, so the wound disorders.
    const hit = act(burn(state, 'u1'), { type: 'shoot', activity: 1, target: 'u0', unit: 'u2' }, scriptedRng([20, 1]));
    expect(unit(hit, 'u0').wounds).toBe(2);
    expect(unit(hit, 'u0').disorder).toBe(1);
    const rallied = act(endActivation(hit, scriptedRng([10])), { type: 'rally', activity: 1, unit: 'u0' }, scriptedRng([10]));
    expect(unit(rallied, 'u0').disorder).toBe(0);
  });
  it('a Fortitude save that succeeds shrugs the wound off with no disorder at all', () => {
    const { state } = battle([]);
    place(state, 'u0', 'c5');
    // 20 crits the shot; 20 also crit-succeeds the save, so the wound lands with no disorder.
    const hit = act(burn(state, 'u1'), { type: 'shoot', activity: 1, target: 'u0', unit: 'u2' }, scriptedRng([20]));
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
    const s = act(burn(state, 'u0'), { type: 'rally', activity: 1, unit: 'u2' }, scriptedRng([18]));
    expect(isShaken(unit(s, 'u2'))).toBe(false);
  });
  it('a success on a steady unit inspires it, and the +2 is spent by its next roll', () => {
    const { state } = battle([]);
    const steadied = act(state, { type: 'rally', activity: 1, unit: 'u0' }, scriptedRng([10]));
    const inspired = unit(steadied, 'u0');
    expect(inspired.inspired).toBe(true);
    expect(willModifier(inspired)).toBe(inspired.stats.will + ACTION_BONUS);
    const spent = act(steadied, { type: 'rally', activity: 1, unit: 'u0' }, scriptedRng([2]));
    const after = unit(spent, 'u0');
    expect(spent.log.slice(steadied.log.length).find((e) => e.check)!.check!.modifier)
      .toBe(after.stats.will + ACTION_BONUS);
    expect(after.inspired).toBe(false);
    expect(willModifier(after)).toBe(after.stats.will);
  });
  it('a critical failure costs the rallier 1 disorder', () => {
    const { state } = battle([]);
    const s = act(state, { type: 'rally', activity: 1, unit: 'u0' }, scriptedRng([1]));
    expect(unit(s, 'u0').disorder).toBe(1);
    expect(unit(s, 'u0').inspired).toBe(false);
  });
  it('a routed unit leaves the field at its own edge; a shaken one holds', () => {
    const { state } = battle([]);
    place(state, 'u2', 'c8');
    const shaken = structuredClone(state);
    unit(shaken, 'u2').disorder = unit(shaken, 'u2').quality;
    expect(unit(act(burn(shaken, 'u0'), { type: 'withdraw', activity: 1, unit: 'u2' }, scriptedRng([10])), 'u2').status).toBe('active');

    unit(state, 'u2').disorder = unit(state, 'u2').quality + 1;
    const s = act(burn(state, 'u0'), { type: 'withdraw', activity: 1, unit: 'u2' }, scriptedRng([10]));
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
      s = next.phase === 'battle' && next.active === u.id ? endActivation(next, scriptedRng([10])) : next;
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
