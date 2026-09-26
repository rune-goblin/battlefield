import { describe, expect, it } from 'vitest';
import { canEmplace, generateBoard, gridOf, notation, type UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { PaintStroke } from '../runtime/commands.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, randomMint, type BattleSession } from '../runtime/session.js';
import { createMapPreparationService } from '../services/MapPreparationService.js';
import { fakeArchive, openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };

function setupSession(): BattleSession {
  return {
    ...freshSession(),
    setup: {
      spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 1 },
      board: openBoard('square', 9),
      units: [{ id: 'unit-1', card: infantry, side: 'attacker', square: 'a1', engines: [] }],
      emplacements: [{ id: 'eq-1', name: 'Ballista', side: 'attacker', square: 'b1' }],
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

const waterStroke: PaintStroke = { cells: ['a1', 'b1'], edges: [], brush: { kind: 'terrain', terrain: 'water' } };

describe('map preparation', () => {
  it('unplaces a unit and an emplacement painted underwater', async () => {
    const runtime = runtimeOn();

    const result = await runtime.submit({ type: 'setup.paint', stroke: waterStroke });

    expect(result.ok).toBe(true);
    expect(runtime.session.setup.units[0].square).toBeNull();
    expect(runtime.session.setup.emplacements[0].square).toBeNull();
    expect(runtime.session.setup.board!.squares[0][0].terrain).toBe('water');
  });

  it('restores terrain and both kinds of placement on undo', async () => {
    const runtime = runtimeOn();

    await runtime.submit({ type: 'setup.paint', stroke: waterStroke });
    const result = await runtime.submit({ type: 'session.undo' });

    expect(result.ok).toBe(true);
    expect(runtime.session.setup.units[0].square).toBe('a1');
    expect(runtime.session.setup.emplacements[0].square).toBe('b1');
    expect(runtime.session.setup.board!.squares[0][0].terrain).toBe('open');
    expect(runtime.session.setup.board!.squares[0][1].terrain).toBe('open');
  });

  it('turns a bridge deck on each further bridge stroke, and forgets the turn when the cell changes', async () => {
    const runtime = runtimeOn();
    const bridge: PaintStroke = { cells: ['a1'], edges: [], brush: { kind: 'terrain', terrain: 'bridge' } };
    const cell = () => runtime.session.setup.board!.squares[0][0];

    await runtime.submit({ type: 'setup.paint', stroke: bridge });
    expect(cell().terrain).toBe('bridge');
    expect(cell().bridgeTurns).toBeUndefined();

    await runtime.submit({ type: 'setup.paint', stroke: bridge });
    expect(cell().bridgeTurns).toBe(1);

    // Two axes through a square, so the second turn comes back round.
    await runtime.submit({ type: 'setup.paint', stroke: bridge });
    expect(cell().bridgeTurns).toBe(0);

    await runtime.submit({ type: 'setup.paint', stroke: { ...bridge, brush: { kind: 'terrain', terrain: 'water' } } });
    await runtime.submit({ type: 'setup.paint', stroke: bridge });
    expect(cell().bridgeTurns).toBeUndefined();
  });

  it('settles a stale hauled flag when the board regenerates under an unattended engine', () => {
    const spec = { base: 'plains' as const, size: 9 as const, feature: 'none' as const, construction: null, seed: 1 };
    const board = generateBoard(spec);
    const cell = notation(gridOf(board).cells().find((sq) => canEmplace(board, sq))!);
    const session: BattleSession = {
      ...freshSession(),
      setup: {
        spec, board, units: [],
        emplacements: [{ id: 'eq-1', name: 'Ballista', side: 'attacker', square: cell, hauled: true }],
      },
    };

    const result = createMapPreparationService({ mint: randomMint }).generate(session);

    expect(result.setup.emplacements[0].hauled).toBe(false);
  });
});
