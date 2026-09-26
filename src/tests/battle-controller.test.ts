import { render } from 'svelte/server';
import ActivityChoices from '../app/battle/ActivityChoices.svelte';
import { reachableActivities } from '../app/battle/action-menu.js';
import { describe, expect, it, vi } from 'vitest';
import { createBattleController, type BattleDeps } from '../app/battle/battle-controller.svelte.js';
import { createNotificationService } from '../app/notifications.js';
import { act, activation, createBattle, engineLoaded, ENGINES, notation, parse, refOf, select, type BattleState, type UnitCard } from '../engine/index.js';
import { upgradeBattle } from '../engine/legacy.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };

function battle(): BattleState {
  const b = createBattle({ board: openBoard('square'), units: [
    { card: cavalry, side: 'attacker', square: 'e2' },
    { card: cavalry, side: 'defender', square: 'e7' },
    { card: cavalry, side: 'defender', square: 'b7' },
  ] });
  b.pending = 'attacker';
  b.units[0].speed = 20;
  b.units[1].square = parse('d4');
  b.units[2].square = parse('f4');
  return select(b, b.units[0].id);
}

function controllerOver(b: BattleState, resolveActions = false) {
  const accepted = () => Promise.resolve({ ok: true });
  const takeAction = vi.fn(async (action: Parameters<BattleDeps['takeAction']>[0]) => {
    if (resolveActions) deps.game.battle = act(deps.game.battle!, action, scriptedRng([1, 1, 1, 1]));
    return { ok: true } as const;
  });
  const deps = {
    game: { battle: b, turn: null, history: [] },
    viewer: { mayAct: true, isGm: true, isHolder: true, holderName: null },
    gameMap: { terrainAppearance: null, inkMap: null },
    presentation: { connect: () => () => {} },
    takeAction, selectUnit: accepted, deselectUnit: accepted, endActivation: accepted, undo: accepted,
    tableUsers: () => [], offTurnNote: () => '',
    notifications: createNotificationService(),
    board: () => undefined,
  } as unknown as BattleDeps;
  // Vitest loads Svelte's server build, where an effect never runs and needs no root.
  const c = createBattleController(deps);
  return { c, takeAction, dispose: c.close };
}

describe('the battle controller', () => {
  it('parks a drop with the move first and the charge from that cell after it', () => {
    const b = battle();
    const act = activation(b, b.active!)!;
    const charge = act.charges.find((x) => act.moves.has(x.cell))!;
    const { c, dispose } = controllerOver(b);

    c.board.ondrop!({ type: 'drop', id: b.active!, cell: charge.cell, exit: false });

    expect(c.drag.pending?.rows.map((row) => row.kind)).toEqual(['move', 'charge']);
    expect(c.drag.picked?.kind).toBe('move');
    dispose();
  });

  it('steps back from the popup to the arm, then to the ring, then to nothing', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.board.ontoken({ type: 'token', id: own.id });
    c.ring.pickProp('guard');
    expect(c.picker.aim?.cell).toBe(notation(own.square));

    c.stepBack();
    expect(c.picker.aim).toBeNull();
    expect(c.ring.radial).toBeNull();
    c.stepBack();
    expect(c.ring.radial).toEqual({ cell: notation(own.square) });
    c.stepBack();
    expect(c.ring.radial).toBeNull();
    dispose();
  });

  it('drops an arm and reopens the ring when the click lands off its targets', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.ring.pickProp('melee');
    expect(c.board.highlights[0].cells.length).toBeGreaterThan(1);

    c.board.oncell!({ type: 'cell', cell: 'a1' });
    expect(c.board.highlights[0].cells).toEqual([]);
    expect(c.ring.radial).toEqual({ cell: notation(own.square) });
    dispose();
  });

  it('steps back out of the Rally picker to the ring it came from', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.ring.pickProp('rally');
    expect(c.picker.activityPick).not.toBeNull();
    c.picker.choosePickerActivity(1);
    expect(c.picker.pickerActivity?.index).toBe(1);

    c.stepBack();
    expect(c.picker.pickerActivity).toBeNull();
    expect(c.picker.activityPick).not.toBeNull();
    c.stepBack();
    expect(c.picker.activityPick).toBeNull();
    expect(c.ring.radial).toEqual({ cell: notation(own.square) });
    dispose();
  });

  it('cancels a parked drop, an open melee choice and an arm in one call', () => {
    const b = battle();
    const act = activation(b, b.active!)!;
    const { c, dispose } = controllerOver(b);

    c.ring.pickProp('melee');
    c.board.oncell!({ type: 'cell', cell: 'd4' });
    expect(c.drag.meleeTarget).toBe(b.units[1].id);
    c.drag.chooseMelee('charge');
    expect(c.drag.pending?.rows[0].kind).toBe('charge');
    expect(act.charges.length).toBe(2);

    c.cancelAction();
    expect(c.drag.pending).toBeNull();
    expect(c.drag.meleeTarget).toBeNull();
    expect(c.board.highlights.every((h) => h.cells.length === 0)).toBe(true);
    dispose();
  });
});

function casterBattle(level = 5, enemyCell = 'e7') {
  const b = createBattle({ board: openBoard('square'), units: [
    { card: { name: 'Caster', level, role: 'infantry', caster: true, tradition: 'arcane', tactics: [] }, side: 'attacker', square: 'e2' },
    { card: cavalry, side: 'defender', square: 'e7' },
  ] });
  b.pending = 'attacker';
  b.units[1].square = parse(enemyCell);
  return select(b, b.units[0].id);
}

describe('action menu availability', () => {
  it('keeps known trees in place when their targets are out of range', () => {
    const { c, dispose } = controllerOver(casterBattle(5, 'a9'));
    c.ring.pickProp('cast');
    expect(c.ring.castRadialItems.map(item => item.key)).toEqual(['blast', 'controlling', 'movement']);
    expect(c.ring.castRadialItems.find(item => item.key === 'blast')).toMatchObject({ legal: false, reason: 'No target in range' });
    c.ring.pickCastTree('blast');
    expect(c.picker.blastOpen).toBe(false);
    expect(c.ring.castPick).not.toBeNull();
    c.ring.pickCastTree('movement');
    expect(c.picker.pickerOffer?.spell).toBe('movement');
    dispose();
  });

  it('allows inspection of the spell book when every known tree is spent', () => {
    const b = casterBattle();
    b.units[0].castTrees = ['blast', 'controlling', 'movement'];
    b.active = b.units[0].id;
    b.begun = true;
    const { c, dispose } = controllerOver(b);
    expect(c.ring.radialItems.find(item => item.key === 'cast')?.legal).toBe(true);
    c.ring.pickProp('cast');
    expect(c.ring.castRadialItems).toHaveLength(3);
    expect(c.ring.castRadialItems.every(item => !item.legal && item.reason === 'Already cast this activation')).toBe(true);
    c.ring.pickCastTree('movement');
    expect(c.picker.activityPick).toBeNull();
    dispose();
  });

  it('shows only an apprentice’s reachable spell tier in the dialog', () => {
    const { c, dispose } = controllerOver(casterBattle(5, 'e5'));
    c.ring.pickProp('cast');
    c.ring.pickCastTree('blast');
    expect(c.picker.blastOpen).toBe(true);
    expect(c.picker.blastLevel).toBe(1);
    expect(c.picker.targetMarkers.length).toBeGreaterThan(0);
    expect(reachableActivities(c.picker.blastOffer!.activities).map(option => option.label)).toEqual(['Missile']);
    c.picker.chooseBlastLevel(2);
    expect(c.picker.blastLevel).toBe(1);
    const html = render(ActivityChoices, { props: { options: c.picker.blastOffer!.activities, selected: c.picker.blastLevel, choose: c.picker.chooseBlastLevel } }).body;
    expect(html).toContain('Missile');
    expect(html).not.toContain('>Line<');
    expect(html).not.toContain('>Burst<');
    expect(html).not.toContain('>Storm<');
    dispose();
  });

  it('keeps unlocked tiers visible when the action budget cannot pay for them', () => {
    const b = casterBattle(11, 'e5');
    b.units[0].actions = 1;
    const { c, dispose } = controllerOver(b);
    c.ring.pickProp('cast');
    c.ring.pickCastTree('blast');
    const options = reachableActivities(c.picker.blastOffer!.activities);
    expect(options.map(option => option.label)).toEqual(['Missile', 'Line', 'Burst']);
    expect(options.map(option => option.legal)).toEqual([true, false, false]);
    const html = render(ActivityChoices, { props: { options: c.picker.blastOffer!.activities, selected: c.picker.blastLevel, choose: c.picker.chooseBlastLevel } }).body;
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Needs 2 actions');
    c.picker.chooseBlastLevel(2);
    expect(c.picker.blastLevel).toBe(1);
    c.picker.chooseBlastLevel(1);
    expect(c.picker.blastLevel).toBe(1);
    dispose();
  });

  it('starts a sole legal spell at targeting and returns directly to the spell trees', () => {
    const { c, takeAction, dispose } = controllerOver(casterBattle());
    c.ring.pickProp('cast');
    c.ring.pickCastTree('movement');
    expect(c.picker.pickerActivity?.index).toBe(1);
    expect(c.picker.targetMarkers.length).toBeGreaterThan(0);
    expect(takeAction).not.toHaveBeenCalled();
    c.stepBack();
    expect(c.picker.activityPick).toBeNull();
    expect(c.ring.castPick).not.toBeNull();
    dispose();
  });

  it('keeps the choice explicit when several spell tiers are legal', () => {
    const { c, dispose } = controllerOver(casterBattle(11, 'e5'));
    c.ring.pickProp('cast');
    c.ring.pickCastTree('blast');
    expect(c.picker.blastOffer!.activities.filter(option => option.legal).length).toBeGreaterThan(1);
    expect(c.picker.blastLevel).toBeNull();
    dispose();
  });
});

describe('siege targeting', () => {
  function siegeBattle(name = 'Kickback Spring') {
    const b = createBattle({ board: openBoard('hex', 11), units: [
      { card: cavalry, side: 'attacker', square: 'd2', engines: [{ card: ENGINES.find(e => e.name === name)! }] },
      { card: cavalry, side: 'defender', square: 'g10' },
    ] });
    b.units[0].square = parse('d6');
    b.units[0].engines[0].square = parse('d6');
    b.units[1].square = parse('f6');
    b.pending = 'attacker';
    return select(b, b.units[0].id);
  }

  it('opens the sole attack mode and submits only the area the player confirms', async () => {
    const b = siegeBattle();
    const { c, takeAction, dispose } = controllerOver(b);
    await c.openSiege(b.units[0].engines[0].id);
    await c.operateSiege('attack');
    expect(c.picker.activityPick).toMatchObject({ key: 'siege', index: 1 });
    expect(c.board.frozen).toBe(false);
    expect(c.picker.targetMarkers.length).toBeGreaterThan(0);
    c.board.ontoken({ type: 'token', id: b.units[1].id });
    expect(c.picker.pickerCandidates.every(target => target.cells.includes('f6'))).toBe(true);
    const target = c.picker.pickerCandidates[0];
    expect(target).toBeDefined();
    c.picker.chooseTargetMarker(target.id);
    expect(c.picker.activityPick?.target).toBe(target.id);
    expect(takeAction).not.toHaveBeenCalled();
    c.picker.confirmPicker();
    expect(takeAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'siege', operation: 'attack', engine: b.units[0].engines[0].id,
      unit: b.units[0].id, activity: 1, target: refOf(target),
    }));
    dispose();
  });

  it('selects a single siege target by clicking its unit', async () => {
    const b = siegeBattle('Heavy Ballista');
    const { c, takeAction, dispose } = controllerOver(b);
    await c.openSiege(b.units[0].engines[0].id);
    await c.operateSiege('attack');
    c.picker.choosePickerActivity(1);
    c.board.ontoken({ type: 'token', id: b.units[1].id });
    expect(c.picker.activityPick?.target).toBe(b.units[1].id);
    expect(takeAction).not.toHaveBeenCalled();
    dispose();
  });

  it('returns to siege controls after firing so the remaining action can load', async () => {
    const b = siegeBattle('Ballista');
    const { c, dispose } = controllerOver(b, true);
    await c.openSiege(b.units[0].engines[0].id);
    await c.operateSiege('attack');
    c.picker.choosePickerActivity(1);
    c.picker.choosePickerTarget(b.units[1].id);
    await c.picker.confirmPicker();
    expect(c.siegeOpen).toBe(true);
    expect(c.actionsLeft).toBe(1);
    expect(engineLoaded(c.siegeEngine!)).toBe(false);
    await c.operateSiege('load');
    expect(engineLoaded(c.b.units[0].engines[0])).toBe(true);
    expect(c.b.activated).toContain(b.units[0].id);
    dispose();
  });

  it('closes siege controls when firing spends the last action', async () => {
    const b = siegeBattle('Heavy Ballista');
    const { c, dispose } = controllerOver(b, true);
    await c.openSiege(b.units[0].engines[0].id);
    await c.operateSiege('attack');
    c.picker.choosePickerActivity(1);
    c.picker.choosePickerTarget(b.units[1].id);
    c.focus = 1;
    await c.picker.confirmPicker();
    expect(c.siegeOpen).toBe(false);
    expect(c.b.activated).toContain(b.units[0].id);
    dispose();
  });

  it('offers an occupied Kickback Spring after loading while an enemy is adjacent', async () => {
    const b = siegeBattle();
    b.units[1].square = parse('e6');
    const engine = b.units[0].engines.pop()!;
    engine.loaded = 0;
    engine.emplaced = true;
    b.engines.push(engine);
    const { c, dispose } = controllerOver(b, true);
    await c.openSiege(engine.id);
    expect(c.siegeOpen).toBe(true);
    await c.operateSiege('load');
    expect(c.actionsLeft).toBe(2);
    expect(c.siegeOffer?.activities[0].legal).toBe(true);
    await c.operateSiege('attack');
    expect(c.picker.activityPick).toMatchObject({ key: 'siege', index: 1 });
    const target = c.picker.pickerCandidates.find(t => t.cells.includes('e6'))!;
    expect(target).toBeDefined();
    c.picker.chooseTargetMarker(target.id);
    await c.picker.confirmPicker();
    expect(c.b.engines[0].fired).toBe(true);
    expect(c.b.activated).toContain(b.units[0].id);
    dispose();
  });

  it.each([false, true])('opens an occupied engine from its map badge, with stale ownership=%s', stale => {
    let b = createBattle({ board: openBoard(), units: [
      { card: cavalry, side: 'attacker', square: 'c2' },
      { card: cavalry, side: 'defender', square: 'c7' },
    ], engines: [{ card: ENGINES.find(e => e.name === 'Ballista')!, square: 'c4', side: 'defender' }] });
    b.pending = 'attacker';
    b = act(b, { type: 'move', unit: 'u0', to: 'c4' }, scriptedRng([]));
    const engine = b.engines[0];
    if (stale) {
      Object.assign(engine, { side: 'defender', status: 'abandoned' });
      upgradeBattle(b);
    }
    const { c, dispose } = controllerOver(b);
    expect(c.siegeEquipment.map(e => e.id)).toEqual([engine.id]);
    const token = c.board.tokens!.find(t => t.id === 'u0');
    expect(token).toMatchObject({ engineId: engine.id });
    c.board.ontoken({ type: 'token', id: engine.id });
    expect(c.siegeOpen).toBe(true);
    expect(c.siegeEngine?.id).toBe(engine.id);
    expect(c.siegeOffer?.activities.some(a => a.legal)).toBe(true);
    expect(c.siegeOffer?.activities[0].targets.map(t => t.id)).toEqual(['u1']);
    dispose();
  });
});
