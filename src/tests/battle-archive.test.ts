import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type UnitCard } from '../engine/index.js';
import { createLocalArchive } from '../adapters/browser/localArchive.js';
import type { WebStorage } from '../adapters/browser/localRepository.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, SCHEMA_VERSION, type BattleSession } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

function battleSession(): BattleSession {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
  });
  return { ...freshSession(), stage: 'battle', battle };
}

function fakeStorage(): WebStorage {
  const items: Record<string, string> = {};
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return { async load() { return saved; }, async save(next) { saved = next; } };
}

describe('the local archive', () => {
  it('saves, lists, loads, exports, imports, and removes a battle', async () => {
    const archive = createLocalArchive(fakeStorage());
    const session = battleSession();

    const entry = await archive.save('Night one', session);
    expect(entry.day).toBe(session.battle!.day);
    expect(entry.round).toBe(session.battle!.round);
    expect(await archive.list()).toEqual([entry]);
    expect(await archive.load(entry.slot)).toEqual(session);

    const exported = await archive.export(entry.slot);
    const imported = await archive.import(exported);
    expect(imported.slot).not.toBe(entry.slot);
    expect(await archive.load(imported.slot)).toEqual(session);

    await archive.remove(entry.slot);
    expect((await archive.list()).map((e) => e.slot)).toEqual([imported.slot]);
  });
});

describe('loading a save', () => {
  it('takes the next revision', async () => {
    const archive = createLocalArchive(fakeStorage());
    const running = battleSession();
    const runtime = createRuntime({ repository: fakeRepository(running), archive, session: running, dice: scriptedRng([10]) });
    await runtime.submit({ type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'u0' } });
    expect(runtime.session.revision).toBe(1);
    expect(runtime.history).toHaveLength(1);

    const saved = await archive.save('Elsewhere', freshSession());
    const result = await runtime.submit({ type: 'session.load', slot: saved.slot });

    expect(result).toMatchObject({ ok: true, revision: 2 });
    expect(runtime.session.revision).toBe(2);
    expect(runtime.session.battleId).not.toBe(running.battleId);
    expect(runtime.session.interactions).toEqual([]);
    expect(runtime.history).toHaveLength(0);
  });

  it('migrates an older schema', async () => {
    const archive = createLocalArchive(fakeStorage());
    const legacy = {
      stage: 'defenders',
      setup: {
        spec: { base: 'plains', feature: 'none', construction: null, seed: 3 },
        board: openBoard(),
        emplacements: [],
        units: [{ card: infantry, side: 'attacker', square: 'c2', engines: [] }],
      },
      battle: null,
    };
    const imported = await archive.import(JSON.stringify({
      slot: 'ignored', name: 'Old save', savedAt: 1, day: null, round: null, data: legacy,
    }));
    const runtime = createRuntime({ repository: fakeRepository(freshSession()), archive, session: freshSession(), dice: scriptedRng([10]) });

    const result = await runtime.submit({ type: 'session.load', slot: imported.slot });

    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(runtime.session.schemaVersion).toBe(SCHEMA_VERSION);
    expect(runtime.session.stage).toBe('setup');
    expect(runtime.session.setup.units[0].card.name).toBe('Infantry');
    expect(runtime.session.setup.units[0].id).toBeTruthy();
  });
});
