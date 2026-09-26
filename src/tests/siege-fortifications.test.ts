import { describe, expect, it } from 'vitest';
import {
  act, createBattle, defenceOf, endActivation, engineLoaded, engineLoadCost, engineLoadProgress, engineLoading, ENGINES,
  gateReason, generateBoard, gridOf, makeWall, notation, parse, siegeAttackOffer, siegeReason,
  stepFeet, structuralDamage, unit, type BattleState, type UnitCard,
} from '../engine/index.js';
import { upgradeEngine } from '../engine/legacy.js';
import { SIEGE_PROFILES, siegeDetail, siegeModes } from '../engine/siege-profiles.js';
import { siegeCellReason, siegeTargets } from '../engine/siege-targets.js';
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
    expect(ENGINES.find(e => e.name === 'Wolf Fang')).toMatchObject({ kind: 'ram', speed: 10 });
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
      if (mode.shape !== 'wall') {
        expect(after.units[1].wounds, `${name}: ${mode.label} critical damage`)
          .toBe(mode.damage ? Math.min(4, mode.damage + 1) : 0);
      } else {
        expect(after.board.walls[target.id].remaining, `${name}: ${mode.label} damages a fortress on a critical hit`)
          .toBeLessThan(b.board.walls[target.id].remaining);
      }
    }
  });

  it('reserves zero damage for explicitly designated support modes', () => {
    const support = Object.entries(SIEGE_PROFILES).flatMap(([name, modes]) =>
      modes.filter(mode => mode.damage === 0).map(mode => `${name}: ${mode.label}`));
    expect(support.sort()).toEqual([
      'Blob Paste Propulsor: Binding paste',
      'Marking Powder Cannon: Mark targets',
      'Pheromone Sprayer: Disorient mounts',
      'Pheromone Sprayer: Scatter mounts',
    ]);
    for (const modes of Object.values(SIEGE_PROFILES)) for (const mode of modes) {
      expect(mode.damage).toBeGreaterThanOrEqual(0);
      expect(mode.damage).toBeLessThanOrEqual(3);
      if (mode.damage === 0) {
        expect(mode.effect).toBeDefined();
        expect(siegeDetail(mode)).toContain('No damage');
      }
    }
  });

  it.each([
    ['Anesthetizing Jaws', 1, 2, 'snare'],
    ['Anesthetizing Jaws', 2, 2, 'stun'],
    ['Web Launcher', 1, 1, 'web'],
    ['Cyclonic Cannon', 1, 2, undefined],
    ['Ribauldequin', 1, 2, undefined],
    ['Great Bronze Cannon', 1, 2, undefined],
    ['Heavy Bombard', 1, 2, undefined],
    ['Long Cannon', 1, 2, undefined],
  ] as const)('%s mode %i deals %i on an ordinary hit and preserves its effect', (name, activity, damage, effect) => {
    const b = setup(name), e = b.units[0].engines[0], mode = siegeModes(name, e.kind)[activity - 1];
    b.units[1].square = parse(mode.shape === 'cone' ? 'f6' : 'g6');
    // A roll of ten lands exactly on Defence; separate later rolls keep morale stable.
    b.units[1].stats.defence = e.launch + 10;
    const cell = notation(b.units[1].square);
    const target = siegeTargets(b, e, mode).find(t => t.kind === 'unit' ? t.id === 'u1' : t.id.split('+').includes(cell))!;
    const after = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', activity, target: target.id }, scriptedRng([10, 20, 20, 20]));
    expect(after.units[1].wounds).toBe(damage);
    if (effect === 'snare' || effect === 'web') expect(after.units[1].rooted).toBe(1);
    if (effect === 'stun') expect(after.units[1].stunned).toBe(true);
    if (effect === 'web') expect(after.board.siegeFields).toContainEqual(expect.objectContaining({ kind: 'web', cells: target.id.split('+') }));
    expect(siegeDetail(mode)).toContain(`${damage}/${damage + 1} damage on hit/critical`);
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
  it('rejects malformed shapes, extra commitment, and lobs inside their minimum range', () => {
    const b = setup();
    expect(() => fire(b, 1, 'a1+b1+c1')).toThrow('target');
    expect(() => fire(b, 2, 'u1', 2)).toThrow('actions');
    expect(() => fire(b, 2, 'u1', -1)).toThrow('Commit');
    const lob = setup('Trebuchet'); lob.units[1].square = parse('e6');
    expect(siegeReason(lob, lob.units[0], lob.units[0].engines[0], 'attack')).toBeNull();
    const e = lob.units[0].engines[0];
    expect(siegeTargets(lob, e, siegeModes(e.name, e.kind)[0]).every(t => t.id.split('+').every(c => gridOf(lob.board).distance(e.square, parse(c)) >= 2))).toBe(true);
  });

  it.each([
    ['Kickback Spring', false], ['Kickback Spring', true],
    ['Ballista', false], ['Ballista', true],
  ] as const)('loads and fires %s beside an enemy with emplacement=%s', (name, emplaced) => {
    let b = setup(name);
    b.units[1].square = parse('e6');
    const e = b.units[0].engines[0];
    e.loaded = 0;
    if (emplaced) {
      b.units[0].engines = [];
      b.engines.push(e);
      e.emplaced = true;
    }
    expect(siegeReason(b, b.units[0], e, 'load')).toBeNull();
    expect(siegeReason(b, b.units[0], e, 'attack')).toBe('Load this engine before attacking.');
    b = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'load' }, scriptedRng([]));
    const loaded = emplaced ? b.engines[0] : b.units[0].engines[0];
    const option = siegeAttackOffer(b, b.units[0], loaded)!.activities[0];
    expect(option.legal).toBe(true);
    const target = option.targets.find(t => t.kind === 'unit' ? t.id === 'u1' : t.id.split('+').includes('e6'))!;
    expect(target).toBeDefined();
    b = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', activity: 1, target: target.id }, scriptedRng([20, 20, 20, 20]));
    expect(b.units[1].wounds).toBe(name === 'Kickback Spring' ? 2 : 3);
    expect(b.activated).toContain('u0');
    expect((emplaced ? b.engines[0] : b.units[0].engines[0]).fired).toBe(true);
  });
  it('upgrades old loading counters without granting a free loaded shot', () => {
    const b = setup(), e = b.units[0].engines[0], legacy = { loadSteps: 2, loadCost: 2 };
    Object.assign(e, legacy, { loaded: 1 });
    upgradeEngine(e);
    expect(engineLoaded(e)).toBe(false); expect(engineLoadCost(e)).toBe(1);
    const after = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'load' }, scriptedRng([]));
    expect(after.units[0].actions).toBe(2);
    expect(after.units[0].engines[0].loadSteps).toBe(1);
    expect(engineLoaded(after.units[0].engines[0])).toBe(true);
    const full = { ...e, ...legacy, loaded: 2 };
    upgradeEngine(full);
    expect(engineLoaded(full)).toBe(true);
  });
  it('keeps the Bolt Emitter ready without reloading, but spends its round shot', () => {
    const b = setup('Bolt Emitter'), after = fire(b, 1, 'u1'), e = after.units[0].engines[0];
    expect(engineLoaded(e)).toBe(true); expect(e.fired).toBe(true);
    expect(siegeReason(after, after.units[0], e, 'attack')).toContain('already attacked');
  });
  it.each(['fire first', 'load first'])('allows firing and loading in one activation: %s', order => {
    let b = setup('Ballista');
    const engine = b.units[0].engines[0].id;
    const load = () => { b = act(b, { type: 'siege', unit: 'u0', engine, operation: 'load' }, scriptedRng([])); };
    const shoot = () => { b = act(b, { type: 'siege', unit: 'u0', engine, operation: 'attack', activity: 1, target: 'u1' }, scriptedRng([1])); };
    if (order === 'load first') {
      b.units[0].engines[0].loaded = 0;
      load();
      expect(b.units[0].actions).toBe(2);
      shoot();
    } else {
      shoot();
      expect(b.units[0].actions).toBe(1);
      expect(siegeReason(b, b.units[0], b.units[0].engines[0], 'load')).toBeNull();
      load();
    }
    expect(b.activated).toContain('u0');
    expect(b.units[0].engines[0].fired).toBe(true);
    expect(engineLoaded(b.units[0].engines[0])).toBe(order === 'fire first');
  });

  it('rejects loading when the shot and boost spend the whole action budget', () => {
    const b = fire(setup('Heavy Ballista'), 1, 'u1', 1);
    expect(b.activated).toContain('u0');
    expect(engineLoaded(b.units[0].engines[0])).toBe(false);
    expect(() => act(b, { type: 'siege', unit: 'u0', engine: b.units[0].engines[0].id, operation: 'load' }, scriptedRng([]))).toThrow();
  });

  it('spends the final action on partial loading after firing', () => {
    const b = fire(setup('Heavy Ballista'), 1, 'u1');
    const e = b.units[0].engines[0];
    expect(b.units[0].actions).toBe(1);
    expect(siegeReason(b, b.units[0], e, 'load')).toBeNull();
    const after = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'load' }, scriptedRng([]));
    expect(after.activated).toContain('u0');
    expect(engineLoading(after.units[0].engines[0])).toMatchObject({ total: 2, completed: 1, label: '1/2 loaded' });
    expect(engineLoaded(after.units[0].engines[0])).toBe(false);
  });

  it.each([1, 2, 3, 6])('accumulates %i loading actions across turns', total => {
    let b = setup();
    Object.assign(b.units[0].engines[0], { name: 'Custom engine', loadCost: total, loadSteps: total, loaded: 0 });
    for (let progress = 1; progress <= total; progress++) {
      if (b.activated.includes('u0')) {
        while (b.round === 1) b = endActivation(b, scriptedRng([]));
      }
      b = act(b, { type: 'siege', unit: 'u0', engine: b.units[0].engines[0].id, operation: 'load' }, scriptedRng([]));
      expect(engineLoadProgress(b.units[0].engines[0])).toBe(progress);
      expect(engineLoaded(b.units[0].engines[0])).toBe(progress === total);
    }
    expect(engineLoading(b.units[0].engines[0]).label).toBe('Ready to fire');
  });

  it('reads legacy full-load counters without discarding a loaded shot', () => {
    const b = setup('Heavy Ballista');
    const saved = (loadSteps: number | undefined, loaded: number) => {
      const e = { ...b.units[0].engines[0], loadSteps, loaded };
      upgradeEngine(e);
      return e;
    };
    expect(engineLoading(saved(1, 1))).toEqual({ total: 2, completed: 2, label: 'Ready to fire' });
    expect(engineLoaded(saved(undefined, 1))).toBe(true);
    expect(engineLoadProgress(saved(undefined, 0))).toBe(0);
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
    expect(next.units[1].wounds).toBe(2);
    expect(gridOf(push.board).distance(e.square, next.units[1].square)).toBe(3);
  });

  it.each([
    { roll: 1, damage: 0, distance: 2 },
    { roll: 15, damage: 1, distance: 3 },
    { roll: 20, damage: 2, distance: 3 },
  ])('Repulsing blast deals $damage damage with roll $roll and pushes only on a hit', ({ roll, damage, distance }) => {
    const b = setup('Kickback Spring');
    b.units[1].square = parse('f6');
    const e = b.units[0].engines[0], mode = siegeModes(e.name, e.kind)[0];
    const target = siegeTargets(b, e, mode).find(t => t.id.split('+').includes('f6'))!;
    const after = act(b, { type: 'siege', unit: 'u0', engine: e.id, operation: 'attack', activity: 1, target: target.id }, scriptedRng([roll, 20, 20, 20]));
    expect(after.units[1].wounds).toBe(damage);
    expect(gridOf(b.board).distance(e.square, after.units[1].square)).toBe(distance);
    expect(siegeDetail(mode)).toContain('1/2 damage on hit/critical');
    expect(siegeDetail(mode)).toContain('A hit pushes 1 hex away');
  });

  it('Repulsing blast still damages a target whose knockback route is blocked', () => {
    const b = setup('Kickback Spring');
    b.units[1].square = parse('f6');
    b.units[1].rooted = 1;
    const e = b.units[0].engines[0];
    const target = siegeTargets(b, e, siegeModes(e.name, e.kind)[0]).find(t => t.id.split('+').includes('f6'))!;
    const after = fire(b, 1, target.id);
    expect(after.units[1].wounds).toBe(2);
    expect(notation(after.units[1].square)).toBe('f6');
  });
  it('a push with no legal hex behind the target leaves Hold Ground unspent', () => {
    const pushed = (blocked: boolean) => {
      const b = setup('Kickback Spring'), grid = gridOf(b.board), f6 = parse('f6'), e = b.units[0].engines[0];
      b.units[1].square = f6;
      b.units[1].abilities = [{ version: 1, kind: 'resolve', key: 'no-retreat', label: 'No Retreat', delivery: 'passive', mode: 'ground' }];
      if (blocked) for (const n of grid.neighbours(f6)) {
        if (grid.distance(e.square, n) > grid.distance(e.square, f6)) b.board.walls[grid.edgeKey(n, f6)] = makeWall(3);
      }
      const target = siegeTargets(b, e, siegeModes(e.name, e.kind)[0]).find(t => t.id.split('+').includes('f6'))!;
      return fire(b, 1, target.id).units[1];
    };
    const held = pushed(false);
    expect(notation(held.square)).toBe('f6');
    expect(held.abilityState?.shovedRound).toBe('1:1');
    const blocked = pushed(true);
    expect(notation(blocked.square)).toBe('f6');
    expect(blocked.abilityState?.shovedRound).toBe('');
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
  it('offers no area that catches allies alone, and says why', () => {
    const b = setup(), e = b.units[0].engines[0];
    b.units[1].square = parse('k1'); e.reach = 'short';
    expect(siegeTargets(b, e, siegeModes(e.name, e.kind)[0])).toEqual([]);
    expect(siegeCellReason(b, e, 1, 'g7')).toContain('ally');
    expect(siegeCellReason(b, e, 1, 'k1')).toContain('Out of range');
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
  it('cycles open A, closed A, open B, closed B, plain wall, then repeats', () => {
    const b = openBoard(); b.walls['c4|c5'] = makeWall(4, 'c5');
    const click = (board: typeof b) => applyStroke(board, { cells: [], edges: ['c4|c5', 'd4|d5'], brush: { kind: 'gate' } });
    let board = b;
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [inside, open, flipped] of [['c5', true, false], ['c5', false, false], ['c4', true, true], ['c4', false, true]] as const) {
        board = click(board);
        expect(board.walls['c4|c5']).toEqual({ ...makeWall(4, inside), gate: { open, flipped, facing: inside } });
        expect(board.walls['d4|d5']).toBeUndefined();
      }
      board = click(board);
      expect(board.walls['c4|c5']).toEqual(makeWall(4, 'c5'));
    }
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
    expect(defenceOf(b, t, u, true)).toBe(t.stats.defence + 4);
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
