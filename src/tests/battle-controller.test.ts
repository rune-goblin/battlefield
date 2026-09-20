import { describe, expect, it } from 'vitest';
import { createBattleController, type BattleDeps } from '../app/battle/battle-controller.svelte.js';
import { createNotificationService } from '../app/notifications.js';
import { activation, createBattle, notation, parse, select, type BattleState, type UnitCard } from '../engine/index.js';
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

function controllerOver(b: BattleState) {
  const accepted = () => Promise.resolve({ ok: true });
  const deps = {
    game: { battle: b, turn: null, history: [] },
    viewer: { mayAct: true, isGm: true, isHolder: true, holderName: null },
    gameMap: { terrainAppearance: null, inkMap: null },
    presentation: { connect: () => () => {} },
    takeAction: accepted, selectUnit: accepted, deselectUnit: accepted, endActivation: accepted, undo: accepted,
    tableUsers: () => [], offTurnNote: () => '',
    notifications: createNotificationService(),
    board: () => undefined,
  } as unknown as BattleDeps;
  // Vitest loads Svelte's server build, where an effect never runs and needs no root.
  const c = createBattleController(deps);
  return { c, dispose: c.close };
}

describe('the battle controller', () => {
  it('parks a drop with the move first and the charge from that cell after it', () => {
    const b = battle();
    const act = activation(b, b.active!)!;
    const charge = act.charges.find((x) => act.moves.has(x.cell))!;
    const { c, dispose } = controllerOver(b);

    c.board.ondrop!({ type: 'drop', id: b.active!, cell: charge.cell, exit: false });

    expect(c.pending?.rows.map((row) => row.kind)).toEqual(['move', 'charge']);
    expect(c.picked?.kind).toBe('move');
    dispose();
  });

  it('steps back from the popup to the arm, then to the ring, then to nothing', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.board.ontoken({ type: 'token', id: own.id });
    c.pickProp('guard');
    expect(c.aim?.cell).toBe(notation(own.square));

    c.stepBack();
    expect(c.aim).toBeNull();
    expect(c.radial).toBeNull();
    c.stepBack();
    expect(c.radial).toEqual({ cell: notation(own.square) });
    c.stepBack();
    expect(c.radial).toBeNull();
    dispose();
  });

  it('drops an arm and reopens the ring when the click lands off its targets', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.pickProp('melee');
    expect(c.board.highlights[0].cells.length).toBeGreaterThan(1);

    c.board.oncell!({ type: 'cell', cell: 'a1' });
    expect(c.board.highlights[0].cells).toEqual([]);
    expect(c.radial).toEqual({ cell: notation(own.square) });
    dispose();
  });

  it('steps back out of the Rally picker to the ring it came from', () => {
    const b = battle();
    const own = b.units[0];
    const { c, dispose } = controllerOver(b);

    c.pickProp('rally');
    expect(c.activityPick).not.toBeNull();
    c.choosePickerActivity(1);
    expect(c.pickerActivity?.index).toBe(1);

    c.stepBack();
    expect(c.pickerActivity).toBeNull();
    expect(c.activityPick).not.toBeNull();
    c.stepBack();
    expect(c.activityPick).toBeNull();
    expect(c.radial).toEqual({ cell: notation(own.square) });
    dispose();
  });

  it('cancels a parked drop, an open melee choice and an arm in one call', () => {
    const b = battle();
    const act = activation(b, b.active!)!;
    const { c, dispose } = controllerOver(b);

    c.pickProp('melee');
    c.board.oncell!({ type: 'cell', cell: 'd4' });
    expect(c.meleeTarget).toBe(b.units[1].id);
    c.chooseMelee('charge');
    expect(c.pending?.rows[0].kind).toBe('charge');
    expect(act.charges.length).toBe(2);

    c.cancelAction();
    expect(c.pending).toBeNull();
    expect(c.meleeTarget).toBeNull();
    expect(c.board.highlights.every((h) => h.cells.length === 0)).toBe(true);
    dispose();
  });
});
