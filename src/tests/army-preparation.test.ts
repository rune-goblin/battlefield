import { describe, expect, it } from 'vitest';
import { createBattle, type UnitCard } from '../engine/index.js';
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

  it('attaches and detaches an engine on a unit', async () => {
    const runtime = runtimeOn();

    await runtime.submit({ type: 'army.attachEquipment', unitId: 'unit-1', engine: 'Ballista' });
    const [engine] = runtime.session.setup.units[0].engines;
    expect(engine.name).toBe('Ballista');

    await runtime.submit({ type: 'army.detachEquipment', unitId: 'unit-1', equipmentId: engine.id });
    expect(runtime.session.setup.units[0].engines).toEqual([]);
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

  it('reports a side ready once every piece it owns stands on a square', async () => {
    const runtime = runtimeOn();

    expect(sideReady(runtime.session.setup, 'attacker')).toBe(true);
    expect(sideReady(runtime.session.setup, 'defender')).toBe(false);

    await runtime.submit({ type: 'army.addEmplacement', side: 'attacker', engine: 'Catapult' });
    expect(sideReady(runtime.session.setup, 'attacker')).toBe(false);

    const id = runtime.session.setup.emplacements[0].id;
    await runtime.submit({ type: 'army.autoPlace', piece: { kind: 'engine', id } });
    expect(sideReady(runtime.session.setup, 'attacker')).toBe(true);
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
