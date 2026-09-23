import { describe, expect, it } from 'vitest';
import {
  act, at, chargePath, chargeTargets, createBattle, defenceOf, edgeKey, engagedEnemies,
  escapeModifier, fortitudeModifier, gridOf, stepTargets, movePath, moveReach,
  notation, parse, reachOf, select, shootModifier, stepFeet, strikeModifier, TERRAIN_FEET, willModifier,
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

  it.each(['fight', 'siege'] as const)('preserves the %s modifier against a wall when wounded', type => {
    const b = state('square'); const u = b.units[0];
    const wall = edgeKey(u.square, parse('c3'));
    b.board.walls[wall] = {tier: 1, boxes: 2, remaining: 2};
    u.engines.push({id:'eq-bellows',name:'Ballista',kind:'artillery',launch:14,reach:'short',fired:false,emplaced:false,status:'crewed',square:u.square,side:u.side});
    const modifier = (wounds: number) => {
      u.wounds = wounds;
      return act(select(b, u.id), type === 'siege' ? {type,unit:u.id,activity:2,target:wall,engine:'eq-bellows',operation:'attack'} : {type,unit:u.id,activity:1,target:wall}, scriptedRng([10])).log.find(entry => entry.check)!.check!.modifier;
    };
    expect(modifier(3)).toBe(modifier(0));
  });
});

describe('routes respect enemy control', () => {
  it('prices a Move out of contact like any Move, and keeps a Step off difficult ground', () => {
    const b = state('square'); const [u, holder] = b.units;
    holder.square = parse('c3');
    at(b.board, parse('d2')).terrain = 'forest';
    expect(stepTargets(b, u)).not.toContain('d2');
    expect(stepTargets(b, u)).toContain('b2');
    const moved = act(select(b, u.id), {type:'move',unit:u.id,to:'d2'},scriptedRng([15]));
    expect(notation(moved.units[0].square)).toBe('d2');
    expect(moved.units[0].actions).toBe(3 - moveReach(b, u).get('d2')!.actions);
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
    expect(moveReach(entered, entered.units[0]).has('c1')).toBe(true);
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


});
