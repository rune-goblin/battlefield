import { describe, expect, it } from 'vitest';
import { createBattle, ENGINES, isFixedEngine, type UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { autoCell, cellsFor, deployableCells, sideReady } from '../services/ArmyPreparationService.js';
import { fakeArchive, openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const scouts: UnitCard = { name: 'Scouts', level: 4, role: 'cavalry', tactics: ['ambush'] };

function setupSession(): BattleSession {
  const board = openBoard('square', 9);
  board.squares[0][0].terrain = 'water';
  return {
    ...freshSession(),
    setup: {
      spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 1 },
      board,
      units: [{ id: 'unit-1', card: infantry, side: 'attacker', square: 'c1', engines: [] }],
      emplacements: [],
    },
  };
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return {
    async load() { return saved; },
    async save(next) { saved = structuredClone(next); },
  };
}

function runtimeOn(session = setupSession()) {
  return createRuntime({ repository: fakeRepository(session), archive: fakeArchive(), session });
}

describe('army preparation', () => {
  it('moves one unit to the other army, keeping its ID and lifting it off the board', async () => {
    const runtime = runtimeOn();

    const result = await runtime.submit({ type: 'army.setSide', unitId: 'unit-1', side: 'defender' });

    expect(result.ok).toBe(true);
    expect(runtime.session.setup.units).toEqual([
      expect.objectContaining({ id: 'unit-1', side: 'defender', square: null }),
    ]);
  });

  it('trades the two armies whole and leaves an emplacement where it stands', async () => {
    const session = setupSession();
    session.setup.units.push({ id: 'unit-2', card: scouts, side: 'defender', square: 'c9', engines: [] });
    session.setup.emplacements.push({ id: 'eq-1', name: ENGINES[0].name, side: 'defender', square: 'd9' });
    const runtime = runtimeOn(session);

    await runtime.submit({ type: 'army.swapSides' });

    const { units, emplacements } = runtime.session.setup;
    expect(units.map((u) => [u.id, u.side, u.square])).toEqual([['unit-1', 'defender', null], ['unit-2', 'attacker', null]]);
    expect(emplacements.map((e) => [e.id, e.side, e.square])).toEqual([['eq-1', 'attacker', 'd9']]);
  });

  it('refuses a side change from anyone but the GM', async () => {
    const runtime = runtimeOn();

    const result = await runtime.execute({
      battleId: runtime.session.battleId, commandId: 'cmd-side', expectedRevision: runtime.session.revision,
      userId: 'a-player', command: { type: 'army.swapSides' },
    });

    expect(result).toMatchObject({ ok: false, reason: 'permission' });
  });

  it('adds and removes pieces without disturbing the IDs beside them', async () => {
    const runtime = runtimeOn();

    await runtime.submit({ type: 'army.addUnit', side: 'attacker', card: scouts });
    await runtime.submit({ type: 'army.addEmplacement', side: 'attacker', engine: 'Catapult' });
    const added = runtime.session.setup.units[1].id;

    await runtime.submit({ type: 'army.removeUnit', unitId: 'unit-1' });

    expect(runtime.session.setup.units.map((u) => u.id)).toEqual([added]);
    expect(runtime.session.setup.units[0].card.name).toBe('Scouts');
    expect(runtime.session.setup.emplacements[0].name).toBe('Catapult');
  });

  it('lets either army\'s unit deploy on any engine and on no other piece', async () => {
    const session = setupSession();
    session.setup.emplacements.push(
      { id: 'eng-1', name: 'Catapult', side: 'attacker', square: 'd1' },
      { id: 'eng-2', name: 'Catapult', side: 'attacker', square: 'd9' },
    );
    session.setup.units.push({ id: 'unit-2', card: infantry, side: 'defender', square: null, engines: [] });

    expect(cellsFor(session.setup, { kind: 'unit', id: 'unit-1' })).toContain('d1');
    expect(cellsFor(session.setup, { kind: 'unit', id: 'unit-2' })).toContain('d9');
    expect(cellsFor(session.setup, { kind: 'engine', id: 'eng-1' })).toContain('c1');
    expect(cellsFor(session.setup, { kind: 'engine', id: 'eng-2' })).not.toContain('d1');
    expect(autoCell(session.setup, { kind: 'unit', id: 'unit-1' })).not.toBe('d1');
  });

  it('opens every dry square of the board to an engine', async () => {
    const session = setupSession();
    session.setup.emplacements.push({ id: 'eng-1', name: 'Catapult', side: 'attacker', square: null });
    const runtime = runtimeOn(session);

    const cells = cellsFor(session.setup, { kind: 'engine', id: 'eng-1' });
    expect(cells).toEqual(expect.arrayContaining(['c1', 'e5', 'e9']));
    expect(cells).not.toContain('a1');

    const placed = await runtime.submit({ type: 'army.place', piece: { kind: 'engine', id: 'eng-1' }, square: 'e9' });
    expect(placed.ok).toBe(true);
    const water = await runtime.submit({ type: 'army.place', piece: { kind: 'engine', id: 'eng-1' }, square: 'a1' });
    expect(water.ok).toBe(false);
  });

  it('gives an engine to the army whose unit is placed on it', async () => {
    const session = setupSession();
    session.setup.emplacements.push({ id: 'eng-1', name: 'Catapult', side: 'attacker', square: 'd9' });
    session.setup.units.push({ id: 'unit-2', card: infantry, side: 'defender', square: null, engines: [] });
    const runtime = runtimeOn(session);

    await runtime.submit({ type: 'army.place', piece: { kind: 'unit', id: 'unit-2' }, square: 'd9' });

    expect(runtime.session.setup.emplacements[0].side).toBe('defender');
  });

  it('hauls an engine only while a unit of its army stands on it', async () => {
    const session = setupSession();
    session.setup.emplacements.push({ id: 'eng-1', name: 'Battering Ram', side: 'attacker', square: 'd1' });
    const runtime = runtimeOn(session);
    const piece = { kind: 'unit' as const, id: 'unit-1' };

    const early = await runtime.submit({ type: 'army.setHauling', emplacementId: 'eng-1', hauling: true });
    expect(early.ok).toBe(false);

    await runtime.submit({ type: 'army.place', piece, square: 'd1' });
    await runtime.submit({ type: 'army.setHauling', emplacementId: 'eng-1', hauling: true });
    expect(runtime.session.setup.emplacements[0].hauled).toBe(true);

    await runtime.submit({ type: 'army.place', piece, square: 'c1' });
    expect(runtime.session.setup.emplacements[0].hauled).toBe(false);
  });

  it('refuses to haul a fixed engine', async () => {
    const session = setupSession();
    const fixed = ENGINES.find((e) => isFixedEngine(e))!;
    session.setup.emplacements.push({ id: 'eng-1', name: fixed.name, side: 'attacker', square: 'c1' });
    const runtime = runtimeOn(session);

    const result = await runtime.submit({ type: 'army.setHauling', emplacementId: 'eng-1', hauling: true });
    expect(result.ok).toBe(false);
  });

  it('starts the battle with the unit hauling the engine it deployed on', () => {
    const ram = ENGINES.find((e) => !isFixedEngine(e))!;
    const board = openBoard('square', 9);
    const battle = createBattle({
      board,
      units: [
        { id: 'a', card: infantry, side: 'attacker', square: 'c1' },
        { id: 'b', card: infantry, side: 'attacker', square: 'e1' },
        { id: 'd', card: infantry, side: 'defender', square: 'c9' },
      ],
      engines: [
        { id: 'hauled', card: ram, side: 'attacker', square: 'c1', hauled: true },
        { id: 'worked', card: ram, side: 'attacker', square: 'e1' },
      ],
    });

    const [a, b] = battle.units;
    expect(a.engines.map((e) => [e.id, e.hauling])).toEqual([['hauled', true]]);
    expect(b.engines).toEqual([]);
    expect(battle.engines.map((e) => [e.id, e.status])).toEqual([['worked', 'crewed']]);
  });

  it('starts the battle with each engine held by the unit deployed on or beside it', () => {
    const ram = ENGINES.find((e) => !isFixedEngine(e))!;
    const battle = createBattle({
      board: openBoard('square', 9),
      units: [{ id: 'a', card: infantry, side: 'attacker', square: 'c1' }, { id: 'd', card: infantry, side: 'defender', square: 'c9' }],
      engines: [
        { id: 'under', card: ram, side: 'attacker', square: 'c9' },
        { id: 'beside', card: ram, side: 'attacker', square: 'd9' },
        { id: 'alone', card: ram, side: 'attacker', square: 'e5' },
      ],
    });

    expect(battle.engines.map((e) => [e.id, e.side])).toEqual([['under', 'defender'], ['beside', 'defender'], ['alone', 'attacker']]);
  });

  it('refuses a square no piece can deploy on and leaves the record alone', async () => {
    const runtime = runtimeOn();
    const before = runtime.session.revision;

    const water = await runtime.submit({ type: 'army.place', piece: { kind: 'unit', id: 'unit-1' }, square: 'a1' });
    const farRank = await runtime.submit({ type: 'army.place', piece: { kind: 'unit', id: 'unit-1' }, square: 'e5' });

    expect(water.ok).toBe(false);
    expect(farRank.ok).toBe(false);
    expect(runtime.session.revision).toBe(before);
    expect(runtime.session.setup.units[0].square).toBe('c1');
  });

  it('places, unplaces, and auto-places nearest the home edge and the centre file', async () => {
    const runtime = runtimeOn();
    const piece = { kind: 'unit' as const, id: 'unit-1' };

    await runtime.submit({ type: 'army.place', piece, square: 'b2' });
    expect(runtime.session.setup.units[0].square).toBe('b2');

    await runtime.submit({ type: 'army.unplace', piece });
    expect(runtime.session.setup.units[0].square).toBeNull();

    await runtime.submit({ type: 'army.autoPlace', piece });
    expect(runtime.session.setup.units[0].square).toBe('e1');
  });

  it('opens a fourth rank to an ambusher and no square twice', async () => {
    const setup = setupSession().setup;
    setup.units.push({ id: 'unit-2', card: scouts, side: 'attacker', square: null, engines: [] });

    expect(deployableCells(setup, 'attacker', false)).not.toContain('e4');
    expect(cellsFor(setup, { kind: 'unit', id: 'unit-2' })).toContain('e4');
    // `unit-1` stands on c1, and no piece deploys on the water at a1.
    expect(cellsFor(setup, { kind: 'unit', id: 'unit-2' })).not.toContain('c1');
    expect(cellsFor(setup, { kind: 'unit', id: 'unit-1' })).toContain('c1');
    expect(autoCell(setup, { kind: 'unit', id: 'unit-2' })).toBe('e1');
  });

  it('reports a side ready once every unit stands on a square, whatever its engines do', async () => {
    const runtime = runtimeOn();

    expect(sideReady(runtime.session.setup, 'attacker')).toBe(true);
    expect(sideReady(runtime.session.setup, 'defender')).toBe(false);

    await runtime.submit({ type: 'army.addEmplacement', side: 'attacker', engine: 'Catapult' });
    expect(sideReady(runtime.session.setup, 'attacker')).toBe(true);

    await runtime.submit({ type: 'army.unplace', piece: { kind: 'unit', id: 'unit-1' } });
    expect(sideReady(runtime.session.setup, 'attacker')).toBe(false);
  });

  it('generates one side and leaves the other where it stands', async () => {
    const runtime = runtimeOn();

    const result = await runtime.submit({ type: 'army.generateForce', side: 'defender', seed: 7 });

    expect(result.ok).toBe(true);
    const units = runtime.session.setup.units;
    expect(units.filter((u) => u.side === 'attacker')).toEqual([
      { id: 'unit-1', card: infantry, side: 'attacker', square: 'c1', engines: [] },
    ]);
    const made = units.filter((u) => u.side === 'defender');
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((u) => u.square === null)).toBe(true);
    expect(new Set(units.map((u) => u.id)).size).toBe(units.length);
  });

  it('refuses every army command once the battle is under way', async () => {
    const runtime = runtimeOn({
      ...setupSession(),
      stage: 'battle',
      battle: createBattle({
        board: openBoard(),
        units: [{ card: infantry, side: 'attacker', square: 'c2' }, { card: scouts, side: 'defender', square: 'c7' }],
      }),
    });

    const result = await runtime.submit({ type: 'army.addUnit', side: 'attacker', card: scouts });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('stage');
  });
});
