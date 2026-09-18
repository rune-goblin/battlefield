import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, unit, type UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
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

interface FakeRepository extends SessionRepository {
  readonly saves: BattleSession[];
  failNextSave(message: string): void;
}

function fakeRepository(session: BattleSession): FakeRepository {
  const saves: BattleSession[] = [];
  let failure: string | null = null;
  return {
    saves,
    failNextSave(message) { failure = message; },
    async load() { return saves.at(-1) ?? session; },
    async save(next) {
      if (failure !== null) { const message = failure; failure = null; throw new Error(message); }
      saves.push(structuredClone(next));
    },
  };
}

function runtimeOn(session = battleSession()) {
  const repository = fakeRepository(session);
  const published: BattleSession[] = [];
  const runtime = createRuntime({ repository, session, dice: scriptedRng([10]) });
  runtime.subscribe((s) => published.push(s));
  return { runtime, repository, published };
}

const guard = { type: 'guard', activity: 1, unit: 'u0' } as const;

describe('the command executor', () => {
  it('leaves revision and history where they were when an action is rejected', async () => {
    const { runtime, repository, published } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });

    // u1 is the defender: its side is not pending, so the engine refuses the activation.
    const result = await runtime.submit({
      type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'u1' },
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'engine', revision: 1 });
    expect(runtime.session.revision).toBe(1);
    expect(runtime.history).toHaveLength(1);
    expect(repository.saves).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(unit(runtime.session.battle!, 'u1').guard).toBeNull();
  });

  it('runs two commands issued together in order', async () => {
    const { runtime, repository } = runtimeOn();

    const [action, end] = await Promise.all([
      runtime.submit({ type: 'action.resolve', action: guard }),
      runtime.submit({ type: 'activation.end', unitId: 'u0' }),
    ]);

    expect([action, end]).toMatchObject([{ ok: true, revision: 1 }, { ok: true, revision: 2 }]);
    expect(repository.saves.map((s) => s.revision)).toEqual([1, 2]);
    expect(unit(runtime.session.battle!, 'u0').guard).not.toBeNull();
    expect(runtime.session.battle!.activated).toEqual(['u0']);
  });

  it('holds the published state at the last commit when the save fails', async () => {
    const { runtime, repository, published } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });
    const committed = runtime.session;

    repository.failNextSave('quota exceeded');
    const result = await runtime.submit({ type: 'activation.end', unitId: 'u0' });

    expect(result).toMatchObject({ ok: false, reason: 'storage', message: 'quota exceeded', revision: 1 });
    expect(runtime.session).toBe(committed);
    expect(published.at(-1)).toBe(committed);
    expect(runtime.history).toHaveLength(1);
    expect(runtime.session.battle!.activated).toEqual([]);
  });

  it('records a resolved action in undo history and a selection not', async () => {
    const { runtime } = runtimeOn();

    await runtime.submit({ type: 'activation.select', unitId: 'u0' });
    expect(runtime.history).toHaveLength(0);
    expect(runtime.session.revision).toBe(1);

    await runtime.submit({ type: 'action.resolve', action: guard });
    expect(runtime.history).toHaveLength(1);
    expect(runtime.history[0].units[0].guard).toBeNull();
  });

  it('rewinds to the battle before the last undoable commit', async () => {
    const { runtime, published } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });

    const result = await runtime.undo();

    expect(result).toMatchObject({ ok: true, revision: 2 });
    expect(unit(runtime.session.battle!, 'u0').guard).toBeNull();
    expect(runtime.history).toHaveLength(0);
    expect(published.at(-1)).toBe(runtime.session);
    expect(await runtime.undo()).toMatchObject({ ok: false, reason: 'stage' });
  });

  it('commits a direct change through the same queue', async () => {
    const { runtime, repository } = runtimeOn();

    const [action, cleared] = await Promise.all([
      runtime.submit({ type: 'action.resolve', action: guard }),
      runtime.change((session) => ({ ...session, battle: null }), 'clear'),
    ]);

    expect([action, cleared]).toMatchObject([{ ok: true, revision: 1 }, { ok: true, revision: 2 }]);
    expect(repository.saves.map((s) => s.revision)).toEqual([1, 2]);
    expect(runtime.session.battle).toBeNull();
    expect(runtime.history).toHaveLength(0);
  });

  it('leaves the record and the history alone when a direct change throws', async () => {
    const { runtime, repository } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });
    const committed = runtime.session;

    const result = await runtime.change(() => { throw new Error('no board'); }, 'clear');

    expect(result).toMatchObject({ ok: false, reason: 'engine', message: 'no board', revision: 1 });
    expect(runtime.session).toBe(committed);
    expect(runtime.history).toHaveLength(1);
    expect(repository.saves).toHaveLength(1);
  });

  it('refuses a command built for another battle', async () => {
    const { runtime, repository } = runtimeOn();

    const result = await runtime.execute({
      battleId: 'battle-elsewhere', commandId: 'c1', expectedRevision: 0,
      command: { type: 'activation.select', unitId: 'u0' },
    });

    expect(result).toMatchObject({ ok: false, reason: 'battle', revision: 0 });
    expect(repository.saves).toHaveLength(0);
  });
});
