import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, unit, movementSpeed, moveReach, siegeAttackOffer, siegeEngines, siegeReason, engineLoaded, endActivation } from '../engine/battle.js';
import { edgeKey, parse } from '../engine/board.js';
import { ENGINES } from '../engine/engines.js';
import { scriptedRng } from '../engine/rng.js';
import type { UnitCard } from '../engine/cards.js';
import { openBoard } from './helpers.js';
import type { BattleState } from '../engine/types.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };
const engine = (name: string) => ENGINES.find((e) => e.name === name)!;

function battle(engines: string[], wallTier?: number) {
  const board = openBoard();
  if (wallTier) board.walls[edgeKey(parse('c6'), parse('c7'))] = { tier: wallTier, boxes: wallTier + 1, remaining: wallTier + 1 };
  return createBattle({
    units: [
      { card: infantry, side: 'attacker', square: 'c2', engines: engines.map((name) => ({ card: engine(name) })) },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
    board,
  });
}

const offer = (state: BattleState, type: 'shoot' | 'fight', id = 'u0') =>
  availableActions(state, id).find((o) => o.type === type)!;

describe('siege engines', () => {
  it('imports all 59 Trooper weapons with launch bonuses', () => {
    expect(ENGINES).toHaveLength(59);
    expect(engine('Catapult')).toMatchObject({ kind: 'artillery', launch: 12, reach: 'extreme' });
    expect(engine('Battering Ram')).toMatchObject({ kind: 'ram', speed: null });
    expect(engine('Catapult').speed).toBe(5);
    expect(engine('Ballista').speed).toBe(10);
    expect(engine('Trebuchet').speed).toBe(0);
  });

  // A crewed engine replaces the unit's own shooting profile, effective range and all. It buys
  // no cheaper activity than anyone else: the piece is the profile, not the price.
  it('a catapult shoots at extreme range with no roll to reach it, once per round', () => {
    const s0 = battle(['Catapult']);
    const shoot = offer(s0, 'shoot');
    expect(shoot.activities.map((r) => r.cost)).toEqual([1, 2, 3]);
    expect(shoot.activities[2].targets.map((t) => t.id)).toEqual(['u1']);
    expect(shoot.activities[0].targets.map((t) => t.id)).toEqual(['u1']);
    const s1 = act(s0, { type: 'shoot', unit: 'u0', activity: 3, target: 'u1' }, scriptedRng([10]));
    expect(unit(s1, 'u1').wounds).toBe(1);
    expect(s1.log.find((e) => e.check)!.check!.modifier).toBe(engine('Catapult').launch);
    expect(unit(s1, 'u0').engines[0].fired).toBe(true);
  });

  it("a ballista's own reach carries the crew as far, once it is crewed", () => {
    const s0 = battle(['Ballista']);
    unit(s0, 'u1').square = parse('c5');
    expect(offer(s0, 'shoot').activities[2].targets.map((t) => t.id)).toEqual(['u1']);
  });

  it('a ram only works against a wall it stands beside, and adds +2', () => {
    const s0 = battle(['Battering Ram'], 2);
    expect(availableActions(s0, 'u0').some((o) => o.type === 'fight')).toBe(false);
    unit(s0, 'u0').square = parse('c5');
    expect(offer(s0, 'fight')).toBeUndefined();
    unit(s0, 'u0').square = parse('c6');
    const key = edgeKey(parse('c6'), parse('c7'));
    expect(offer(s0, 'fight').activities[0].targets.map((t) => t.id)).toContain(key);
    const s1 = act(s0, { type: 'fight', unit: 'u0', activity: 1, target: key }, scriptedRng([10]));
    expect(s1.log.find((e) => e.check)!.check!.modifier).toBe(unit(s0, 'u0').stats.strike! + 2);
    expect(s1.board.walls[key].remaining).toBe(2);
  });

  it('a catapult bombards a wall from anywhere in its band', () => {
    const s0 = battle(['Catapult'], 1);
    const key = edgeKey(parse('c6'), parse('c7'));
    expect(offer(s0, 'shoot').activities[2].targets.map((t) => t.id)).toContain(key);
    const s1 = act(s0, { type: 'shoot', unit: 'u0', activity: 3, target: key }, scriptedRng([20]));
    expect(s1.board.walls[key].remaining).toBe(0);
  });

  it('a routed unit abandons its engine and an adjacent enemy captures it when the battle ends', () => {
    const s0 = battle(['Catapult']);
    const u0 = unit(s0, 'u0');
    u0.disorder = 3;
    u0.engines[0].status = 'abandoned';
    u0.engines[0].square = parse('c2');
    unit(s0, 'u1').square = parse('c3');
    let s = s0;
    while (s.phase === 'battle') {
      const u = activeUnit(s)!;
      s = availableActions(s, u.id).some((o) => o.type === 'guard')
        ? act(s, { type: 'guard', activity: 1, unit: u.id }, scriptedRng([10]))
        : act(s, { type: 'maneuver', activity: 1, unit: u.id }, scriptedRng([1]));
    }
    expect(activeUnit(s)).toBeNull();
    expect(unit(s, 'u0').engines[0].status).toBe('captured');
  });
});


describe('siege operations', () => {
  const rng = () => scriptedRng([10, 10, 10, 10]);
  it('fires the selected engine and keeps the other engine loaded', () => {
    const s = battle(['Ballista', 'Catapult']);
    const e = unit(s, 'u0').engines[1];
    const shot = siegeAttackOffer(s, unit(s, 'u0'), e)!;
    expect(shot.activities[0].targets.some(t => t.id === 'u1')).toBe(true);
    const next = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', target: 'u1' }, rng());
    expect(unit(next, 'u0').engines.map(e => e.loaded)).toEqual([2, 0]);
    expect(next.log.find(e => e.check)?.check?.modifier).toBe(engine('Catapult').launch);
    expect(unit(next, 'u0').operatingEngine).toBeUndefined();
    expect(unit(s, 'u0').engines[1].loaded).toBe(2);
  });

  it('retains loading progress across turns and refuses an empty engine even with a troop volley', () => {
    let s = battle(['Ballista']);
    const id = unit(s, 'u0').engines[0].id;
    unit(s, 'u0').engines[0].loaded = 0;
    unit(s, 'u0').stats.volley = 20;
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'attack', target: 'u1' }, rng())).toThrow('Load');
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng());
    expect(unit(s, 'u0').actions).toBe(1);
    expect(unit(s, 'u0').engines[0].loaded).toBe(1);
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng())).toThrow('2 actions');
    s = endActivation(s, rng(), 'u0');
    s = endActivation(s, rng(), 'u1');
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng());
    expect(engineLoaded(unit(s, 'u0').engines[0])).toBe(true);
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng())).toThrow('loaded');
  });

  it('caps hauling movement, carries the engine, and restores speed on release', () => {
    let s = battle(['Catapult']);
    const id = unit(s, 'u0').engines[0].id;
    unit(s, 'u0').speed = 60;
    unit(s, 'u0').feet = 20;
    unit(s, 'u0').engines[0].speed = 15;
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'haul' }, rng());
    expect(movementSpeed(unit(s, 'u0'))).toBe(15);
    expect(unit(s, 'u0').feet).toBe(0);
    const reach = moveReach(s, unit(s, 'u0'));
    const [to, route] = [...reach].find(([to, route]) => to !== 'c2' && route.actions === 1)!;
    s = act(s, { type: 'move', unit: 'u0', to }, rng());
    expect(unit(s, 'u0').engines[0].square).toEqual(parse(to));
    expect(unit(s, 'u0').feet).toBe(15 - route.feet);
    const actions = unit(s, 'u0').actions;
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'release' }, rng());
    expect(unit(s, 'u0').actions).toBe(actions);
    expect(movementSpeed(unit(s, 'u0'))).toBe(60);
    expect(s.engines[0]).toMatchObject({ id, square: parse(to), hauling: false, emplaced: true });
    expect(siegeEngines(s, unit(s, 'u0')).map(e => e.id)).toEqual([id]);
    expect(unit(s, 'u0').engines).toHaveLength(0);
  });

  it('leaves an engine behind when its occupant moves without hauling', () => {
    let s = battle(['Trebuchet']);
    const id = unit(s, 'u0').engines[0].id;
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'haul' }, rng())).toThrow('fixed');
    s = act(s, { type: 'move', unit: 'u0', to: 'c3' }, rng());
    expect(s.engines[0]).toMatchObject({ id, square: parse('c2') });
    expect(unit(s, 'u0').engines).toHaveLength(0);
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng())).toThrow('hex');
  });

  it('lets the occupant take over an emplacement from an adjacent crew', () => {
    let s = battle([]);
    const source = battle(['Ballista']);
    s.engines.push({ ...unit(source, 'u0').engines[0], emplaced: true, square: parse('c3') });
    s.units.push({ ...structuredClone(unit(s, 'u0')), id: 'crew', square: parse('b3') });
    s = act(s, { type: 'move', unit: 'u0', to: 'c3' }, rng());
    const e = siegeEngines(s, unit(s, 'u0'))[0];
    expect(e.name).toBe('Ballista');
    s = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'haul' }, rng());
    expect(s.engines).toHaveLength(0);
    expect(unit(s, 'u0').engines[0].hauling).toBe(true);
  });

  it('blocks loading in contact, wrong-side operation, and a second engine in tow', () => {
    let s = battle(['Catapult', 'Ballista']);
    const u = unit(s, 'u0'), e = u.engines[0];
    e.loaded = 0;
    unit(s, 'u1').square = parse('c3');
    expect(siegeReason(s, u, e, 'load')).toContain('contact');
    expect(() => act(s, { type: 'siege', unit: 'u1', engine: e.id, operation: 'haul' }, rng())).toThrow();
    unit(s, 'u1').square = parse('c7');
    s = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'haul' }, rng());
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: u.engines[1].id, operation: 'haul' }, rng())).toThrow('Release');
  });

  it('offers a ram only wall targets and no loading', () => {
    const s = battle(['Battering Ram'], 2);
    const u = unit(s, 'u0'), e = u.engines[0];
    u.square = parse('c6'); e.square = parse('c6');
    expect(siegeAttackOffer(s, u, e)?.activities[0].targets.every(t => t.kind === 'wall')).toBe(true);
    expect(siegeReason(s, u, e, 'load')).toContain('ammunition');
    const next = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', target: edgeKey(parse('c6'), parse('c7')) }, rng());
    expect(unit(next, 'u0').engines[0].fired).toBe(true);
  });
});


it('spends two movement actions per open hex while hauling a slow engine', () => {
  let s = battle(['Catapult']);
  const id = unit(s, 'u0').engines[0].id;
  s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'haul' }, scriptedRng([]));
  expect(movementSpeed(unit(s, 'u0'))).toBe(5);
  expect(moveReach(s, unit(s, 'u0')).get('c3')?.actions).toBe(2);
  s = act(s, { type: 'move', unit: 'u0', to: 'c3' }, scriptedRng([]));
  expect(unit(s, 'u0').engines[0].square).toEqual(parse('c3'));
  s = endActivation(s, scriptedRng([]), 'u1');
  s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'release' }, scriptedRng([]));
  expect(movementSpeed(unit(s, 'u0'))).toBe(10);
  expect(moveReach(s, unit(s, 'u0')).get('c4')?.actions).toBe(1);
});

it('recovers a friendly engine after its original crew abandons it', () => {
  const s = battle(['Catapult']);
  const owner = unit(s, 'u0');
  const e = owner.engines[0];
  e.status = 'abandoned';
  e.hauling = false;
  owner.disorder = 3;
  owner.square = parse('c1');
  const crew = { ...structuredClone(owner), id: 'relief', disorder: 0, engines: [], square: parse('b2') };
  s.units.push(crew); s.order.push(crew.id);
  const next = act(s, { type: 'move', unit: crew.id, to: 'c2' }, scriptedRng([]));
  expect(siegeEngines(next, unit(next, crew.id)).map(e => e.id)).toEqual([e.id]);
  expect(unit(next, owner.id).engines).toHaveLength(0);
});
