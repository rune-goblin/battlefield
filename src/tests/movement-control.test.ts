import { describe, expect, it } from 'vitest';
import {
  act, at, chargePath, chargeTargets, createBattle, defenceOf, edgeKey, engagedEnemies,
  escapeModifier, fortitudeModifier, gridOf, maneuverOffer, maneuverTargets, movePath, moveReach,
  notation, parse, reachOf, select, shootModifier, strikeModifier, willModifier,
  type UnitCard,
} from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', salvo: 'medium', tactics: [] };
const state = (kind: 'hex' | 'square' = 'hex') => {
  const b = createBattle({board: openBoard(kind), units: [
  { card: troop, side: 'attacker', square: 'c2' },
  { card: troop, side: 'defender', square: 'e7' },
  { card: troop, side: 'defender', square: 'f7' },
]});
  b.pending = 'attacker';
  return b;
};

describe('wounds record survival without reducing performance', () => {
  it('preserves attacks, range, saves, defence and movement through the third wound', () => {
    const b = state();
    const [u, enemy] = b.units;
    const performance = () => ({
      strike: strikeModifier(b, u, enemy), volley: shootModifier(b, u, enemy), reach: reachOf(b, u),
      defence: defenceOf(b, u, enemy, true), reflex: escapeModifier(u), fortitude: fortitudeModifier(u), will: willModifier(u),
      moves: [...moveReach(b, u)], charges: chargeTargets(b, u),
    });
    const fresh = performance();
    for (const wounds of [1, 2, 3]) { u.wounds = wounds; expect(performance()).toEqual(fresh); }
  });

  it('keeps disorder penalties separate from wounds', () => {
    const b = state(); const [u, enemy] = b.units;
    const fresh = strikeModifier(b, u, enemy);
    u.wounds = 3; u.disorder = 2;
    expect(strikeModifier(b, u, enemy)).toBe(fresh - 2);
  });

  it.each(['fight', 'shoot'] as const)('preserves the %s modifier against a wall when wounded', type => {
    const b = state('square'); const u = b.units[0];
    const wall = edgeKey(u.square, parse('c3'));
    b.board.walls[wall] = {tier: 1, boxes: 2, remaining: 2};
    u.engines.push({id:'eq-bellows',name:'Flame Bellows',kind:'artillery',launch:14,reach:'short',fired:false,emplaced:false,status:'crewed',square:u.square,side:u.side});
    const modifier = (wounds: number) => {
      u.wounds = wounds;
      return act(select(b, u.id), {type,unit:u.id,activity:1,target:wall}, scriptedRng([10])).log.find(entry => entry.check)!.check!.modifier;
    };
    expect(modifier(3)).toBe(modifier(0));
  });
});

describe('routes respect enemy control', () => {
  it('prices a Maneuver step against terrain and rejects unaffordable climbs', () => {
    const b = state('square'); const [u, holder] = b.units;
    holder.square = parse('c3');
    at(b.board, parse('d2')).terrain = 'forest';
    const offer = maneuverOffer(b, u.id)!;
    expect(offer.activities[0].targets.map(t => t.id)).not.toContain('d2');
    expect(offer.activities[1].targets.map(t => t.id)).toContain('d2');
    expect(() => act(select(b, u.id), {type:'maneuver',unit:u.id,activity:1,to:'d2'},scriptedRng([20]))).toThrow(/cannot maneuver/);
    const moved = act(select(b, u.id), {type:'maneuver',unit:u.id,activity:2,to:'d2'},scriptedRng([10]));
    expect(notation(moved.units[0].square)).toBe('d2');
    expect(moved.units[0].actions).toBe(1);
    at(b.board, parse('d2')).terrain = 'swamp';
    at(b.board, parse('d2')).elevation = 1;
    expect(maneuverOffer(b, u.id)!.targets.map(t => t.id)).not.toContain('d2');
  });

  it('ends at first contact and rejects a long drag through a controlled corridor', () => {
    const b = state(); const [u, enemy, other] = b.units;
    u.square = parse('c1'); u.speed = 20; enemy.square = parse('e1'); other.status = 'destroyed';
    for (const cell of gridOf(b.board).cells()) at(b.board, cell).terrain = 'water';
    for (const key of ['c1', 'd1', 'd2', 'e2', 'f2', 'g1', 'e1']) at(b.board, parse(key)).terrain = 'open';
    expect(movePath(b, u, 'd1').map(p => p.cell)).toEqual(['c1', 'd1']);
    expect(moveReach(b, u).has('g1')).toBe(false);
    expect(() => act(select(b, u.id), {type: 'move', unit: u.id, to: 'g1'}, scriptedRng([10]))).toThrow(/cannot reach/);
    const entered = act(select(b, u.id), {type: 'move', unit: u.id, to: 'd1'}, scriptedRng([10]));
    expect(engagedEnemies(entered, entered.units[0]).map(e => e.id)).toEqual([enemy.id]);
    expect(moveReach(entered, entered.units[0]).size).toBe(0);
  });

  it('allows alternate routes around control, and walls interrupt control', () => {
    const b = state(); const [u, enemy, other] = b.units;
    u.square = parse('c1'); u.speed = 20; enemy.square = parse('e1'); other.status = 'destroyed';
    for (const [destination] of moveReach(b, u)) {
      const path = movePath(b, u, destination);
      for (const step of path.slice(1, -1)) expect(engagedEnemies(b, {...u, square: parse(step.cell)})).toHaveLength(0);
    }
    const key = edgeKey(parse('d1'), enemy.square);
    b.board.walls[key] = {tier: 1, boxes: 2, remaining: 2};
    expect(engagedEnemies(b, {...u, square: parse('d1')})).toHaveLength(0);
    expect(moveReach(b, u).has('d1')).toBe(true);
  });

  it('charges stop at the first contact hex on their route', () => {
    const b = state(); const [u, enemy, other] = b.units;
    u.speed = 40; enemy.square = parse('e4'); other.status = 'destroyed';
    const path = chargePath(b, u, enemy.id);
    expect(path.length).toBeGreaterThan(1);
    for (const cell of path.slice(1, -1)) expect(engagedEnemies(b, {...u, square: parse(cell)})).toHaveLength(0);
    expect(engagedEnemies(b, {...u, square: parse(path.at(-1)!)}).map(e => e.id)).toEqual([enemy.id]);
  });

  it('a critical Maneuver can clear its holder but must stop at a new enemy zone', () => {
    const b = state('square'); const [u, holder, blocker] = b.units;
    u.speed = 60; holder.square = parse('c3'); blocker.square = parse('f3');
    for (const cell of gridOf(b.board).cells()) at(b.board, cell).terrain = 'water';
    for (const key of ['c2', 'd2', 'e2', 'f2', 'g2', 'c3', 'f3']) at(b.board, parse(key)).terrain = 'open';
    const targets = maneuverTargets(b, u, u.speed).map(notation);
    expect(targets).toContain('f2'); expect(targets).not.toContain('g2');
    expect(() => act(select(b, u.id), {type:'maneuver',unit:u.id,activity:1,to:'g2'},scriptedRng([20]))).toThrow(/cannot maneuver/);
    const escaped = act(select(b, u.id), {type:'maneuver',unit:u.id,activity:1,to:'f2'},scriptedRng([20]));
    expect(notation(escaped.units[0].square)).toBe('f2');
    expect(escaped.log.some(entry => entry.check && entry.text.includes('breaks off'))).toBe(true);
    expect(engagedEnemies(escaped, escaped.units[0]).map(e => e.id)).toEqual([blocker.id]);
    expect(moveReach(escaped, escaped.units[0]).size).toBe(0);
  });
});
