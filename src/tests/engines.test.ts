import { describe, expect, it } from 'vitest';
import { act, activeUnit, availableActions, createBattle, unit, movementSpeed, moveReach, siegeAttackOffer, siegeEngines, siegeReason, engineLoaded, endActivation } from '../engine/index.js';
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
    expect(engine('Catapult')).toMatchObject({ kind: 'artillery', launch: 12, reach: 'long' });
    expect(engine('Battering Ram')).toMatchObject({ kind: 'ram', speed: null });
    expect(engine('Catapult').speed).toBe(10);
    expect(engine('Ballista').speed).toBe(20);
    expect(engine('Trebuchet').speed).toBe(0);
  });

  it('gives a catapult distinct bombard, crushing shot, and breach activities', () => {
    const s0 = battle(['Catapult']), u = unit(s0, 'u0'), e = u.engines[0];
    const siege = siegeAttackOffer(s0, u, e)!;
    expect(siege.activities.map(r => r.label)).toEqual(['Bombard', 'Crushing shot', 'Breach wall']);
    expect(siege.activities.map(r => r.cost)).toEqual([1, 2, 2]);
    expect(offer(s0, 'shoot')).toBeUndefined();
    const s1 = act(s0, { type: 'siege', engine: e.id, operation: 'attack', unit: u.id, activity: 2, target: 'u1' }, scriptedRng([10]));
    expect(unit(s1, 'u1').wounds).toBe(2);
    expect(unit(s1, 'u0').engines[0].fired).toBe(true);
    expect(siegeAttackOffer(s1, unit(s1, u.id), unit(s1, u.id).engines[0])).toBeNull();
  });

  it('uses the ram launch profile and penetration against adjacent walls', () => {
    const s0 = battle(['Battering Ram'], 2), u = unit(s0, 'u0'), e = u.engines[0];
    expect(siegeAttackOffer(s0, u, e)!.activities[0].targets).toEqual([]);
    u.square = parse('c6'); e.square = parse('c6');
    const key = edgeKey(parse('c6'), parse('c7'));
    const s1 = act(s0, { type: 'siege', engine: e.id, operation: 'attack', unit: u.id, activity: 1, target: key }, scriptedRng([10]));
    expect(s1.log.find(e => e.check)!.check!.modifier).toBe(e.launch);
    expect(s1.board.walls[key].remaining).toBe(1);
  });

  it('breaches a wall from range through the siege menu', () => {
    const s0 = battle(['Catapult'], 1), e = unit(s0, 'u0').engines[0];
    const key = edgeKey(parse('c6'), parse('c7'));
    const s1 = act(s0, { type: 'siege', engine: e.id, operation: 'attack', unit: 'u0', activity: 3, target: key }, scriptedRng([20]));
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
        : endActivation(s, scriptedRng([1]));
    }
    expect(activeUnit(s)).toBeNull();
    expect(unit(s, 'u0').engines[0].status).toBe('captured');
  });
});


describe('siege operations', () => {
  const rng = () => scriptedRng([10, 10, 10, 10]);
  it.each([null, 'defender', 'attacker'] as const)('claims an engine owned by %s as soon as a unit enters its hex', owner => {
    let s = createBattle({ board: openBoard(), units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ], engines: [{ card: engine('Ballista'), square: 'c4', side: 'defender' }] });
    s.pending = 'attacker';
    s.engines[0].side = owner;
    s.engines[0].loaded = 0;
    s.units[0].speed = 60;
    s = act(s, { type: 'move', unit: 'u0', to: 'c4' }, rng());
    expect(s.round).toBe(1);
    expect(s.units[0].actions).toBe(2);
    expect(s.engines[0]).toMatchObject({ side: 'attacker', status: 'crewed', loaded: 0, fired: false });
    expect(siegeEngines(s, s.units[0]).map(e => e.id)).toEqual([s.engines[0].id]);
    expect(siegeReason(s, s.units[0], s.engines[0], 'load')).toBeNull();
    s = act(s, { type: 'siege', unit: 'u0', engine: s.engines[0].id, operation: 'load' }, rng());
    expect(engineLoaded(s.engines[0])).toBe(true);
  });

  it('preserves partial loading and the shot limit when an occupant takes an enemy engine', () => {
    let s = createBattle({ board: openBoard(), units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ], engines: [{ card: engine('Heavy Ballista'), square: 'c4', side: 'defender' }] });
    s.pending = 'attacker';
    s.units[1].square = parse('d4'); // An adjacent former owner cannot override the occupant.
    Object.assign(s.engines[0], { side: 'defender', fired: true, loadSteps: 2, loaded: 1 });
    s = act(s, { type: 'move', unit: 'u0', to: 'c4' }, rng());
    expect(s.engines[0]).toMatchObject({ side: 'attacker', status: 'crewed', fired: true, loadSteps: 2, loaded: 1 });
    expect(siegeReason(s, s.units[0], s.engines[0], 'attack')).toBe('This engine has already attacked this round.');
    expect(siegeEngines(s, s.units[1])).toEqual([]);
  });

  it('repairs an occupied engine from an older save before hauling it', () => {
    let s = battle(['Ballista']);
    const e = s.units[0].engines.pop()!;
    Object.assign(e, { side: null, status: 'abandoned', emplaced: true, loaded: 0 });
    s.engines.push(e);
    s.pending = 'attacker';
    expect(siegeEngines(s, s.units[0])).toContain(e);
    s = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'haul' }, rng());
    expect(s.engines).toEqual([]);
    expect(s.units[0].engines[0]).toMatchObject({ side: 'attacker', status: 'crewed', hauling: true, loaded: 0 });
  });

  it('fires the selected engine and keeps the other engine loaded', () => {
    const s = battle(['Ballista', 'Catapult']);
    const e = unit(s, 'u0').engines[1];
    const shot = siegeAttackOffer(s, unit(s, 'u0'), e)!;
    expect(shot.activities[1].targets.some(t => t.id === 'u1')).toBe(true);
    const next = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', activity: 2, target: 'u1' }, rng());
    expect(unit(next, 'u0').engines.map(e => e.loaded)).toEqual([1, 0]);
    expect(next.log.find(e => e.check)?.check?.modifier).toBe(engine('Catapult').launch);
    expect(unit(s, 'u0').engines[1].loaded).toBe(1);
  });

  it('reloads in one activity and refuses an empty engine even with a troop volley', () => {
    let s = battle(['Ballista']);
    const id = unit(s, 'u0').engines[0].id;
    unit(s, 'u0').engines[0].loaded = 0;
    unit(s, 'u0').stats.volley = 20;
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'attack', target: 'u1' }, rng())).toThrow('Load');
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'load' }, rng());
    expect(unit(s, 'u0').actions).toBe(2);
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
    expect(movementSpeed(unit(s, 'u0'))).toBe(20);
    expect(unit(s, 'u0').feet).toBe(0);
    const reach = moveReach(s, unit(s, 'u0'));
    const [to, route] = [...reach].find(([to, route]) => to !== 'c2' && route.actions === 1)!;
    s = act(s, { type: 'move', unit: 'u0', to }, rng());
    expect(unit(s, 'u0').engines[0].square).toEqual(parse(to));
    expect(unit(s, 'u0').feet).toBe(20 - route.feet);
    const actions = unit(s, 'u0').actions;
    s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'release' }, rng());
    expect(unit(s, 'u0').actions).toBe(actions);
    expect(movementSpeed(unit(s, 'u0'))).toBe(60);
    expect(s.engines[0]).toMatchObject({ id, square: parse(to), hauling: false, emplaced: true });
    expect(siegeEngines(s, unit(s, 'u0')).map(e => e.id)).toEqual([id]);
    expect(unit(s, 'u0').engines).toHaveLength(0);
  });

  it('updates a saved Ballista to its source Speed on the faster movement scale', () => {
    const s = battle(['Ballista']); const u = unit(s, 'u0');
    u.speed = 30;
    u.engines[0].speed = 10;
    u.engines[0].hauling = true;
    u.actions = 1;
    expect(movementSpeed(u)).toBe(20);
    expect(moveReach(s, u).get('c4')?.actions).toBe(1);
    expect(moveReach(s, u).has('c5')).toBe(false);
  });

  it('leaves an engine behind when its occupant moves without hauling', () => {
    let s = battle(['Trebuchet']);
    const id = unit(s, 'u0').engines[0].id;
    expect(() => act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'haul' }, rng())).toThrow('cannot be moved during the battle');
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

  it('allows loading in contact but blocks hauling, wrong-side operation, and a second engine in tow', () => {
    let s = battle(['Catapult', 'Ballista']);
    const u = unit(s, 'u0'), e = u.engines[0];
    e.loaded = 0;
    unit(s, 'u1').square = parse('c3');
    expect(siegeReason(s, u, e, 'load')).toBeNull();
    expect(siegeReason(s, u, e, 'haul')).toContain('contact');
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
    expect(siegeReason(s, u, e, 'load')).toContain('no reload');
    const next = act(s, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', target: edgeKey(parse('c6'), parse('c7')) }, rng());
    expect(unit(next, 'u0').engines[0].fired).toBe(true);
  });
});


it('spends one movement action per open hex while hauling a slow engine', () => {
  let s = battle(['Catapult']);
  const id = unit(s, 'u0').engines[0].id;
  s = act(s, { type: 'siege', unit: 'u0', engine: id, operation: 'haul' }, scriptedRng([]));
  expect(movementSpeed(unit(s, 'u0'))).toBe(10);
  expect(moveReach(s, unit(s, 'u0')).get('c3')?.actions).toBe(1);
  s = act(s, { type: 'move', unit: 'u0', to: 'c3' }, scriptedRng([]));
  expect(unit(s, 'u0').engines[0].square).toEqual(parse('c3'));
  s = endActivation(s, scriptedRng([]), 'u0');
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
