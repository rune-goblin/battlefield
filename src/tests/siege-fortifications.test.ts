import { describe, expect, it } from 'vitest';
import {
  act, createBattle, defenceOf, endActivation, engineLoaded, engineLoadCost, ENGINES,
  gateReason, generateBoard, gridOf, makeWall, notation, parse, siegeAttackOffer, siegeReason,
  stepFeet, structuralDamage, unit, type BattleState, type UnitCard,
} from '../engine/index.js';
import { SIEGE_PROFILES, siegeModes } from '../engine/siege-profiles.js';
import { siegeTargets } from '../engine/siege-targets.js';
import { scriptedRng } from '../engine/rng.js';
import { applyStroke } from '../services/MapPreparationService.js';
import { TargetingService } from '../app/targeting.js';
import { openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Crew', level: 6, role: 'infantry', salvo: 'long', tactics: [] };
function setup(name = 'Catapult'): BattleState {
  const e = ENGINES.find(e => e.name === name)!;
  const b = createBattle({ board: openBoard('hex', 11), units: [
    { card: troop, side: 'attacker', square: 'd2', engines: [{ card: e }] },
    { card: { ...troop, name: 'Target' }, side: 'defender', square: 'g10' },
    { card: { ...troop, name: 'Ally' }, side: 'attacker', square: 'g2' },
  ] });
  b.units[0].square = parse('d6'); b.units[0].engines[0].square = parse('d6');
  b.units[1].square = parse('g6'); b.units[2].square = parse('g7');
  b.pending = 'attacker'; b.active = 'u0'; b.begun = false;
  return b;
}
const fire = (b: BattleState, activity: 1 | 2 | 3, target: string, focus = 0) => act(b,
  { type: 'siege', unit: 'u0', engine: b.units[0].engines[0].id, operation: 'attack', activity, target, focus }, scriptedRng([20, 20, 20, 20]));

describe('siege catalog and combat', () => {
  it('covers every source actor and imports bounded loading costs', () => {
    expect(Object.keys(SIEGE_PROFILES).sort()).toEqual(ENGINES.map(e => e.name).sort());
    for (const card of ENGINES) {
      expect(card.loadSteps).toBe(card.kind === 'ram' || card.name === 'Bolt Emitter' ? 0 : 1);
      expect(card.loadCost).toBeLessThanOrEqual(3);
      expect(siegeModes(card.name, card.kind).length).toBeGreaterThan(0);
    }
    expect(ENGINES.find(e => e.name === 'Wolf Fang')).toMatchObject({ kind: 'ram', speed: 5 });
  });
  it.each(ENGINES.map(e => e.name))('%s resolves every offered mode', name => {
    const b = setup(name), u = b.units[0], e = u.engines[0];
    b.board.walls[e.kind === 'ram' ? 'd6|e6' : 'g6|h6'] = makeWall(4);
    for (const [i, mode] of siegeModes(name, e.kind).entries()) {
      b.units[1].square = parse(mode.shape === 'cone' ? 'f6' : 'g6');
      if (mode.waterOnly) { b.board.squares[5][6].terrain = 'water'; }
      if (mode.cavalryOnly) b.units[1].role = 'cavalry';
      const targets = siegeTargets(b, e, mode);
      const target = targets.find(t => t.id.includes('g6')) ?? targets[0];
      expect(target, `${name}: ${mode.label}`).toBeDefined();
      const after = fire(b, (i + 1) as 1 | 2 | 3, target.id);
      expect(after.units[0].engines[0].fired).toBe(true);
      expect(b.units[0].engines[0].fired).toBe(false);
      expect(after.log.some(l => l.text.includes(mode.label))).toBe(true);
    }
  });
  it('damages allies in the selected area and previews the whole shape', () => {
    const b = setup(), u = b.units[0], e = u.engines[0];
    const offer = siegeAttackOffer(b, u, e)!;
    const target = offer.activities[0].targets.find(t => t.id.split('+').includes('g6') && t.id.split('+').includes('g7'))!;
    expect(target.label).toContain('(ally)');
    const service = new TargetingService(b, u, offer, offer.activities[0]);
    expect(service.preview(target.id)?.cells).toHaveLength(3);
    expect(service.choices.find(t => t.id === target.id)?.geometry).toBe('corner');
    const after = fire(b, 1, target.id);
    expect(after.units[1].wounds).toBe(2);
    expect(after.units[2].wounds).toBe(2);
  });
  it('caps heavy hits under stoneskin and keeps a troop volley separate', () => {
    const b = setup('Heavy Ballista'); b.units[1].stoneskin = true;
    expect(fire(b, 1, 'u1').units[1].wounds).toBe(1);
    const volley = act(b, { type: 'shoot', unit: 'u0', activity: 1, target: 'u1' }, scriptedRng([20]));
    expect(volley.units[0].engines[0].fired).toBe(false);
    expect(engineLoaded(volley.units[0].engines[0])).toBe(true);
  });
  it('rejects malformed shapes, extra commitment, close-range lobs, and firing in contact', () => {
    const b = setup();
    expect(() => fire(b, 1, 'a1+b1+c1')).toThrow('target');
    expect(() => fire(b, 2, 'u1', 2)).toThrow('actions');
    expect(() => fire(b, 2, 'u1', -1)).toThrow('Commit');
    const lob = setup('Trebuchet'); lob.units[1].square = parse('e6');
    expect(siegeReason(lob, lob.units[0], lob.units[0].engines[0], 'attack')).toContain('contact');
    const e = lob.units[0].engines[0];
    expect(siegeTargets(lob, e, siegeModes(e.name, e.kind)[0]).every(t => t.id.split('+').every(c => gridOf(lob.board).distance(e.square, parse(c)) >= 2))).toBe(true);
  });
  it('upgrades old loading counters without granting a free loaded shot', () => {
    const b = setup(), e = b.units[0].engines[0]; e.loadSteps = 2; e.loadCost = 2; e.loaded = 1;
    expect(engineLoaded(e)).toBe(false); expect(engineLoadCost(e)).toBe(1);
    const after = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'load' }, scriptedRng([]));
    expect(after.units[0].actions).toBe(2);
    expect(after.units[0].engines[0].loadSteps).toBe(1);
    expect(engineLoaded(after.units[0].engines[0])).toBe(true);
    e.loaded = 2; expect(engineLoaded(e)).toBe(true);
  });
  it('keeps the Bolt Emitter ready without reloading, but spends its round shot', () => {
    const b = setup('Bolt Emitter'), after = fire(b, 1, 'u1'), e = after.units[0].engines[0];
    expect(engineLoaded(e)).toBe(true); expect(e.fired).toBe(true);
    expect(siegeReason(after, after.units[0], e, 'attack')).toContain('already attacked');
  });
  it('marks without wounds and strips magical buffs on a nullifier hit', () => {
    for (const name of ['Marking Powder Cannon', 'Nullifier Sling']) {
      const b = setup(name), e = b.units[0].engines[0];
      b.units[1].stoneskin = true; b.units[1].haste = 2; b.units[1].sureStrike = true;
      const target = siegeTargets(b, e, siegeModes(name, e.kind)[0]).find(t => t.id.split('+').includes('g6'))!;
      const after = fire(b, 1, target.id), t = after.units[1];
      if (name === 'Marking Powder Cannon') { expect(t.wounds).toBe(0); expect(t.exposed).toBe(true); }
      else { expect(t.stoneskin).toBe(false); expect(t.haste).toBe(0); expect(t.sureStrike).toBe(false); }
    }
  });
  it('moves targets with a clear route and respects closed wall barriers', () => {
    const b = setup('Harpoon Cannon');
    expect(gridOf(b.board).distance(b.units[0].square, fire(b, 2, 'u1').units[1].square)).toBe(2);
    for (const n of gridOf(b.board).neighbours(b.units[1].square)) b.board.walls[gridOf(b.board).edgeKey(n, b.units[1].square)] = makeWall(3);
    expect(fire(b, 2, 'u1').units[1].square).toEqual(parse('g6'));
    const push = setup('Kickback Spring'); push.units[1].square = parse('f6');
    const e = push.units[0].engines[0], target = siegeTargets(push, e, siegeModes(e.name, e.kind)[0])[0];
    const next = fire(push, 1, target.id);
    expect(next.units[1].wounds).toBe(0);
    expect(gridOf(push.board).distance(e.square, next.units[1].square)).toBe(3);
  });
  it('clears only the web cells reached by fire and preserves webs under cold', () => {
    for (const name of ['Flame Bellows', 'Glacial Zephyr']) {
      const b = setup(name), e = b.units[0].engines[0], index = name === 'Flame Bellows' ? 1 : 2;
      const target = siegeTargets(b, e, siegeModes(e.name, e.kind)[index - 1])[0];
      b.board.siegeFields = [{ cells: ['g6', 'h6'], kind: 'web', expires: 2 }];
      const after = fire(b, index, target.id);
      expect(after.board.siegeFields?.[0].cells).toEqual(name === 'Flame Bellows' ? ['h6'] : ['g6', 'h6']);
    }
  });
  it('leaves empty ground available only for terrain-changing activities', () => {
    const b = setup(), e = b.units[0].engines[0];
    expect(siegeTargets(b, e, siegeModes(e.name, e.kind)[0]).every(t => t.id.includes('g6') || t.id.includes('g7'))).toBe(true);
    const web = setup('Web Launcher'), w = web.units[0].engines[0];
    expect(siegeTargets(web, w, siegeModes(w.name, w.kind)[0]).some(t => !t.id.includes('g6') && !t.id.includes('g7'))).toBe(true);
  });
  it('adds fire damage and holds a snared target through its activation', () => {
    const burning = setup('Glacial Zephyr');
    const e = burning.units[0].engines[0], target = siegeTargets(burning, e, siegeModes(e.name, e.kind)[1])[0];
    const hitCells = target.id.split('+'); burning.units[1].square = parse(hitCells.at(-1)!);
    const burned = fire(burning, 2, target.id);
    expect(burned.units[1].persistent).not.toBeNull();
    const paste = setup('Blob Paste Propulsor');
    let after = fire(paste, 1, 'u1'); expect(after.units[1].rooted).toBe(1);
    after = endActivation(after, scriptedRng([]), 'u0');
    expect(() => act(after, { type: 'move', unit: 'u1', to: 'h6' }, scriptedRng([]))).toThrow();
    after = endActivation(after, scriptedRng([]), 'u1'); expect(after.units[1].rooted).toBe(0);
  });
});

describe('fortifications and gates', () => {
  it('maps four ReignMaker tiers to increasing durability and hardness', () => {
    expect([1, 2, 3, 4].map(t => makeWall(t).boxes)).toEqual([2, 3, 4, 5]);
    expect([1, 2, 3, 4].map(t => structuralDamage(makeWall(t), 2))).toEqual([2, 1, 0, 0]);
    expect(structuralDamage(makeWall(4), 3, 2)).toBe(3);
    for (const tier of [1, 2, 3, 4]) {
      const board = generateBoard({ base: 'plains', seed: 4, construction: { kind: 'fort', tier } });
      const gates = Object.entries(board.walls).filter(([, w]) => w.gate);
      expect(gates).toHaveLength(1); expect(gates[0][0].split('|')).toContain(gates[0][1].inside);
    }
  });
  it('cycles a painted gate through its interior, the reverse, and plain wall', () => {
    const b = openBoard(); b.walls['c4|c5'] = makeWall(4, 'c5');
    const click = (board: typeof b) => applyStroke(board, { cells: [], edges: ['c4|c5', 'd4|d5'], brush: { kind: 'gate' } });
    const once = click(b), twice = click(once), thrice = click(twice);
    expect(once.walls['c4|c5']).toMatchObject({ tier: 4, inside: 'c5', gate: { open: false } });
    expect(twice.walls['c4|c5']).toMatchObject({ tier: 4, inside: 'c4', gate: { open: false } });
    expect(thrice.walls['c4|c5']).toEqual(makeWall(4, 'c5'));
    expect(once.walls['d4|d5']).toBeUndefined();
    expect(b.walls['c4|c5'].gate).toBeUndefined();
  });
  it('paints swamp at any height', () => {
    const raised = applyStroke(openBoard(), { cells: ['c4'], edges: [], brush: { kind: 'elevation', level: 2 } });
    const bog = applyStroke(raised, { cells: ['c4'], edges: [], brush: { kind: 'terrain', terrain: 'swamp' } });
    expect(bog.squares[3][2]).toEqual({ terrain: 'swamp', elevation: 2 });
    const lowered = applyStroke(bog, { cells: ['c4'], edges: [], brush: { kind: 'elevation', level: 1 } });
    expect(lowered.squares[3][2]).toEqual({ terrain: 'swamp', elevation: 1 });
  });
  it('opens and closes for one action and only from the interior', () => {
    const b = setup(), u = b.units[0]; b.board.walls['d6|e6'] = { ...makeWall(3, 'd6'), gate: { open: false } };
    expect(stepFeet(b.board, parse('d6'), parse('e6'))).toBe(Infinity);
    expect(gateReason(b, { ...u, square: parse('e6') }, 'd6|e6')).toContain('interior');
    const opened = act(b, { type: 'gate', unit: u.id, edge: 'd6|e6', open: true }, scriptedRng([]));
    expect(opened.units[0].actions).toBe(2); expect(stepFeet(opened.board, parse('d6'), parse('e6'))).toBe(10);
    const closed = act(opened, { type: 'gate', unit: u.id, edge: 'd6|e6', open: false }, scriptedRng([]));
    expect(closed.units[0].actions).toBe(1); expect(stepFeet(closed.board, parse('d6'), parse('e6'))).toBe(Infinity);
    expect(() => act(closed, { type: 'gate', unit: u.id, edge: 'd6|e6', open: false }, scriptedRng([]))).toThrow('already');
    closed.board.walls['d6|e6'].remaining = 0;
    expect(gateReason(closed, closed.units[0], 'd6|e6')).toContain('breached');
  });
  it('removes wall cover when a gate opens and bars operating in contact', () => {
    const b = setup(); b.board.walls['f6|g6'] = { ...makeWall(4, 'g6'), gate: { open: false } };
    const [u, t] = b.units;
    expect(defenceOf(b, t, u, true)).toBe(t.stats.defence + 2);
    b.board.walls['f6|g6'].gate!.open = true;
    expect(defenceOf(b, t, u, true)).toBe(t.stats.defence);
    b.board.walls['d6|e6'] = { ...makeWall(3, 'd6'), gate: { open: false } };
    t.square = parse('e6');
    const after = act(b, { type: 'gate', unit: 'u0', edge: 'd6|e6', open: true }, scriptedRng([]));
    expect(gateReason(after, after.units[0], 'd6|e6')).toContain('contact');
  });
  it('webs make temporary difficult ground and a crossing for infantry', () => {
    let b = setup('Web Launcher'); const e = b.units[0].engines[0];
    const target = siegeTargets(b, e, siegeModes(e.name, e.kind)[0]).find(t => t.id.includes('g6') && t.id.includes('g7'))!;
    b.board.walls['g6|g7'] = makeWall(3);
    b = fire(b, 1, target.id);
    expect(stepFeet(b.board, parse('g6'), parse('g7'), { climber: true })).toBe(20);
    expect(stepFeet(b.board, parse('g6'), parse('g7'))).toBe(Infinity);
    expect(JSON.parse(JSON.stringify(b)).board.siegeFields).toEqual(b.board.siegeFields);
    while (b.phase === 'battle' && b.round < 3) b = endActivation(b, scriptedRng([20]));
    expect(b.board.siegeFields).toEqual([]);
    expect(stepFeet(b.board, parse('g6'), parse('g7'), { climber: true })).toBe(Infinity);
  });
});
