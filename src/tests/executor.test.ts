import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, unit, type BattleState, type UnitCard } from '../engine/index.js';
import { createLocalArchive } from '../adapters/browser/localArchive.js';
import { createLocalRepository, loadSessionSync, type WebStorage } from '../adapters/browser/localRepository.js';
import { HOT_SEAT_USER } from '../runtime/control.js';
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
  const runtime = createRuntime({ repository, archive: createLocalArchive(fakeStorage()), session, dice: scriptedRng([10]) });
  runtime.subscribe((s) => published.push(s));
  return { runtime, repository, published };
}

function fakeStorage(): WebStorage {
  const items: Record<string, string> = {};
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
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

  it('commits nothing when a port read ahead of the edit fails', async () => {
    const session = freshSession();
    const repository = fakeRepository(session);
    const archive = { ...createLocalArchive(fakeStorage()), load: async () => { throw new Error('slot unreadable'); } };
    const runtime = createRuntime({ repository, archive, session });

    const result = await runtime.submit({ type: 'session.load', slot: 'slot-1' });

    expect(result).toMatchObject({ ok: false, reason: 'storage', message: 'slot unreadable', revision: session.revision });
    expect(runtime.session).toBe(session);
    expect(repository.saves).toEqual([]);
  });

  it('records a resolved action in undo history and a selection not', async () => {
    const { runtime } = runtimeOn();

    await runtime.submit({ type: 'activation.select', unitId: 'u0' });
    expect(runtime.history).toHaveLength(0);
    expect(runtime.session.revision).toBe(1);

    await runtime.submit({ type: 'action.resolve', action: guard });
    expect(runtime.history).toHaveLength(1);
    expect(runtime.history[0]).toMatchObject({ kind: 'battle' });
    expect((runtime.history[0] as { kind: 'battle'; battle: BattleState }).battle.units[0].guard).toBeNull();
  });

  it('rewinds to the battle before the last undoable commit', async () => {
    const { runtime, published } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });

    const result = await runtime.submit({ type: 'session.undo' });

    expect(result).toMatchObject({ ok: true, revision: 2 });
    expect(unit(runtime.session.battle!, 'u0').guard).toBeNull();
    expect(runtime.history).toHaveLength(0);
    expect(published.at(-1)).toBe(runtime.session);
    expect(await runtime.submit({ type: 'session.undo' })).toMatchObject({ ok: false, reason: 'stage' });
  });

  it('runs a lifecycle transition through the same queue', async () => {
    const { runtime, repository } = runtimeOn();

    const [action, cleared] = await Promise.all([
      runtime.submit({ type: 'action.resolve', action: guard }),
      runtime.submit({ type: 'battle.returnToSetup' }),
    ]);

    expect([action, cleared]).toMatchObject([{ ok: true, revision: 1 }, { ok: true, revision: 2 }]);
    expect(repository.saves.map((s) => s.revision)).toEqual([1, 2]);
    expect(runtime.session.battle).toBeNull();
    expect(runtime.session.stage).toBe('setup');
    expect(runtime.history).toHaveLength(0);
  });

  it('leaves the record and the history alone when a transition throws', async () => {
    const { runtime, repository } = runtimeOn();
    await runtime.submit({ type: 'action.resolve', action: guard });
    const committed = runtime.session;

    const result = await runtime.submit({ type: 'battle.finalize' });

    expect(result).toMatchObject({ ok: false, reason: 'engine', revision: 1 });
    expect(runtime.session).toBe(committed);
    expect(runtime.history).toHaveLength(1);
    expect(repository.saves).toHaveLength(1);
  });

  it('leaves a played activation where a reload finds it', async () => {
    const items: Record<string, string> = {};
    const storage: WebStorage = {
      getItem: (key) => items[key] ?? null,
      setItem: (key, value) => { items[key] = value; },
      removeItem: (key) => { delete items[key]; },
    };
    const session = battleSession();
    const runtime = createRuntime({
      repository: createLocalRepository(storage), archive: createLocalArchive(storage), session, dice: scriptedRng([10]),
    });

    await runtime.submit({ type: 'activation.select', unitId: 'u0' });
    await runtime.submit({ type: 'action.resolve', action: guard });
    await runtime.submit({ type: 'activation.end', unitId: 'u0' });

    const reloaded = loadSessionSync(storage);
    expect(reloaded.revision).toBe(3);
    expect(reloaded.battleId).toBe(session.battleId);
    expect(reloaded.battle!.activated).toEqual(['u0']);
    expect(unit(reloaded.battle!, 'u0').guard).not.toBeNull();
  });

  it('refuses a command built for another battle', async () => {
    const { runtime, repository } = runtimeOn();

    const result = await runtime.execute({
      battleId: 'battle-elsewhere', commandId: 'c1', expectedRevision: 0, userId: HOT_SEAT_USER,
      command: { type: 'activation.select', unitId: 'u0' },
    });

    expect(result).toMatchObject({ ok: false, reason: 'battle', revision: 0 });
    expect(repository.saves).toHaveLength(0);
  });
});

function setupSession(): BattleSession {
  return {
    ...freshSession(),
    setup: {
      spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 1 },
      board: openBoard(),
      units: [{ id: 'unit-1', card: infantry, side: 'attacker', square: 'c1', engines: [] }],
      emplacements: [],
    },
  };
}

describe('the pieces a commit reports', () => {
  it('names the unit army.addUnit minted', async () => {
    const { runtime } = runtimeOn(setupSession());

    const result = await runtime.submit({ type: 'army.addUnit', side: 'defender', card: kobolds });

    const minted = runtime.session.setup.units.find((u) => u.id !== 'unit-1')!;
    expect(result).toMatchObject({ ok: true, added: [{ kind: 'unit', id: minted.id }] });
  });

  it('names every unit army.generateForce minted, in record order', async () => {
    const session = setupSession();
    session.setup.units.push(
      { id: 'unit-2', card: infantry, side: 'attacker', square: 'd1', engines: [] },
      { id: 'unit-3', card: infantry, side: 'attacker', square: 'e1', engines: [] },
      { id: 'unit-old', card: kobolds, side: 'defender', square: null, engines: [] },
    );
    const { runtime } = runtimeOn(session);

    const result = await runtime.submit({ type: 'army.generateForce', side: 'defender', seed: 7 });

    const generated = runtime.session.setup.units.filter((u) => u.side === 'defender');
    expect(generated.length).toBeGreaterThan(1);
    expect(generated.map((u) => u.id)).not.toContain('unit-old');
    expect(result).toMatchObject({ ok: true, added: generated.map((u) => ({ kind: 'unit', id: u.id })) });
  });

  it('names the one engine army.addEmplacement minted', async () => {
    const { runtime } = runtimeOn(setupSession());

    const result = await runtime.submit({ type: 'army.addEmplacement', side: 'attacker', engine: 'Catapult' });

    expect(result).toMatchObject({ ok: true, added: [{ kind: 'engine', id: runtime.session.setup.emplacements[0].id }] });
  });

  it('names nothing for a command that replaces the whole setup', async () => {
    const { runtime } = runtimeOn(setupSession());

    const result = await runtime.submit({ type: 'battle.reset' });

    expect(result.ok).toBe(true);
    expect(runtime.session.setup.units.some((u) => u.id !== 'unit-1')).toBe(true);
    expect(result).not.toHaveProperty('added');
  });

  it('answers a resent command without the pieces its first reply named', async () => {
    const session = setupSession();
    const { runtime } = runtimeOn(session);
    const envelope = {
      battleId: session.battleId, commandId: 'c-add', expectedRevision: 0, userId: HOT_SEAT_USER,
      command: { type: 'army.addUnit', side: 'defender', card: kobolds },
    } as const;

    const first = await runtime.execute(envelope);
    const resent = await runtime.execute(envelope);

    expect(first).toMatchObject({ ok: true, added: [{ kind: 'unit' }] });
    expect(resent).toEqual({ ok: true, commandId: 'c-add', revision: 1 });
    expect(runtime.session.setup.units).toHaveLength(2);
  });
});
