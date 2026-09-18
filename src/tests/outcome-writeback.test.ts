import { describe, expect, it } from 'vitest';
import { createBattle, type BattleState, type Side, type UnitCard } from '../engine/index.js';
import { createReignMakerPort } from '../adapters/reignmaker/outcomePort.js';
import { createRuntime, type Runtime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import {
  freshSession, type BattleSession, type BattleSetupDraft, type SourceBinding, type WritebackValues,
} from '../runtime/session.js';
import {
  operationIdFor, prepareOutcome,
  type ActorWritebackPort, type CampaignOutcomePort,
} from '../services/OutcomeApplicationService.js';
import { fakeArchive, openBoard } from './helpers.js';

const card = (name: string): UnitCard => ({ name, level: 6, role: 'infantry', tactics: [] });

interface Piece { id: string; name: string; side: Side; square: string }

const PIECES: Piece[] = [
  { id: 'unit-line', name: 'Line Infantry', side: 'attacker', square: 'c2' },
  { id: 'unit-lancers', name: 'Lancers', side: 'attacker', square: 'd2' },
  { id: 'unit-kobolds', name: 'Kobold Warriors', side: 'defender', square: 'c7' },
];

const SOURCES: SourceBinding[] = [
  { unitId: 'unit-line', actorUuid: 'Actor.line', baseline: { hitPoints: 60, maxHitPoints: 60, demoralized: 0 } },
  { unitId: 'unit-lancers', actorUuid: 'Actor.lancers', baseline: { hitPoints: 40, maxHitPoints: 40, demoralized: 1 } },
  { unitId: 'unit-kobolds', actorUuid: 'Actor.kobolds', baseline: { hitPoints: 24, maxHitPoints: 40, demoralized: 2 } },
];

function endedBattle(): BattleState {
  const battle = createBattle({
    board: openBoard(),
    units: PIECES.map((p) => ({ id: p.id, card: card(p.name), side: p.side, square: p.square, engines: [] })),
    engines: [],
  });
  battle.phase = 'ended';
  battle.endedBy = 'rout';
  battle.winner = 'attacker';
  // One wound apiece, so every desired value differs from its baseline and a skipped write shows.
  for (const unit of battle.units) unit.wounds = 1;
  return battle;
}

function draft(): BattleSetupDraft {
  const board = openBoard();
  return {
    spec: board.spec,
    board,
    units: PIECES.map((p) => ({ id: p.id, card: card(p.name), side: p.side, square: p.square, engines: [] })),
    emplacements: [],
  };
}

const finalSession = (): BattleSession => ({
  ...freshSession('battle-writeback'),
  stage: 'aftermath',
  setup: draft(),
  battle: endedBattle(),
  sources: SOURCES.map((s) => ({ ...s })),
});

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = structuredClone(session);
  return {
    async load() { return structuredClone(saved); },
    async save(next) { saved = structuredClone(next); },
  };
}

/** Actors this table holds, with every write it took, in order. */
function fakeActors(fail: (uuid: string) => string | null = () => null) {
  const held = new Map<string, WritebackValues>(SOURCES.map((s) => (
    [s.actorUuid, { hitPoints: s.baseline.hitPoints, demoralized: s.baseline.demoralized }]
  )));
  const writes: string[] = [];
  const port: ActorWritebackPort = {
    async read(uuid) { return held.get(uuid) ?? null; },
    async write(uuid, values) {
      const problem = fail(uuid);
      if (problem) throw new Error(problem);
      writes.push(uuid);
      held.set(uuid, { ...values });
    },
  };
  return { port, writes, held };
}

function runtimeOn(repository: SessionRepository, session: BattleSession, actors: ActorWritebackPort, campaign?: CampaignOutcomePort) {
  return createRuntime({ repository, archive: fakeArchive(), session, actors, campaign });
}

const apply = (runtime: Runtime) =>
  runtime.applyOutcome(prepareOutcome(runtime.session), runtime.session.revision);

const statusOf = (runtime: Runtime, unitId: string) =>
  runtime.session.writeback!.targets.find((t) => t.unitId === unitId)!.status;

describe('resumable writeback', () => {
  it('resumes at the first unfinished target and repeats no finished one', async () => {
    const repository = fakeRepository(finalSession());
    const broken = fakeActors((uuid) => (uuid === 'Actor.lancers' ? 'the connection dropped' : null));
    const first = runtimeOn(repository, await repository.load(), broken.port);

    const stopped = await apply(first);

    expect(stopped.ok).toBe(false);
    expect(broken.writes).toEqual(['Actor.line']);
    expect(statusOf(first, 'unit-line')).toBe('written');
    expect(statusOf(first, 'unit-lancers')).toBe('conflict');
    expect(statusOf(first, 'unit-kobolds')).toBe('pending');
    expect(first.session.stage).toBe('aftermath');

    // The run died here. A second client builds on the record the repository kept.
    const resumed: string[] = [];
    const working: ActorWritebackPort = {
      read: broken.port.read,
      async write(uuid, values) { resumed.push(uuid); broken.held.set(uuid, { ...values }); },
    };
    const second = runtimeOn(repository, await repository.load(), working);

    const finished = await apply(second);

    expect(finished.ok).toBe(true);
    expect(resumed).toEqual(['Actor.lancers', 'Actor.kobolds']);
    expect(second.session.stage).toBe('finalized');
    expect(second.session.writeback!.operationId).toBe(operationIdFor('battle-writeback'));
  });

  it('writes nothing on a second run with the same operation ID', async () => {
    const repository = fakeRepository(finalSession());
    const actors = fakeActors();
    const runtime = runtimeOn(repository, await repository.load(), actors.port);

    expect((await apply(runtime)).ok).toBe(true);
    expect(actors.writes).toHaveLength(3);
    const revision = runtime.session.revision;

    const again = await runtime.applyOutcome(prepareOutcome(runtime.session), revision);

    expect(again).toMatchObject({ ok: true, written: [], operationId: operationIdFor('battle-writeback') });
    expect(actors.writes).toHaveLength(3);
    expect(runtime.session.revision).toBe(revision);
  });

  it('raises a conflict for an actor edited outside the battle', async () => {
    const repository = fakeRepository(finalSession());
    const actors = fakeActors();
    // Neither the baseline nor the value the battle wants: somebody healed it at the table.
    actors.held.set('Actor.lancers', { hitPoints: 17, demoralized: 1 });
    const runtime = runtimeOn(repository, await repository.load(), actors.port);

    const result = await apply(runtime);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toEqual([{ unitId: 'unit-lancers', message: expect.stringContaining('17 hit points') }]);
    expect(actors.writes).toEqual(['Actor.line']);
    expect(runtime.session.stage).toBe('aftermath');
    expect(runtime.session.writeback!.targets[1].problem).toContain('has changed since the battle imported it');
  });

  it('closes undo and blocks loading while it runs', async () => {
    const repository = fakeRepository(finalSession());
    const actors = fakeActors((uuid) => (uuid === 'Actor.line' ? 'the connection dropped' : null));
    const runtime = runtimeOn(repository, await repository.load(), actors.port);

    await apply(runtime);

    expect(await runtime.submit({ type: 'session.undo' })).toMatchObject({ ok: false, reason: 'stage' });
    expect(await runtime.submit({ type: 'session.load', slot: 'any' })).toMatchObject({ ok: false, reason: 'stage' });
    expect(await runtime.submit({ type: 'battle.finalize' })).toMatchObject({ ok: false, reason: 'stage' });

    // The GM's way out: the record reopens, and the battle stays where it stands.
    expect(await runtime.submit({ type: 'outcome.abandon' })).toMatchObject({ ok: true });
    expect(runtime.session.writeback).toBeNull();
    expect(await runtime.submit({ type: 'battle.finalize' })).toMatchObject({ ok: false, reason: 'engine' });
  });

  it('hands the whole outcome to an installed campaign module, once', async () => {
    const calls: string[] = [];
    const campaign: CampaignOutcomePort = {
      available: () => true,
      async apply(_outcome, operationId) { calls.push(operationId); return { ok: true }; },
    };
    const repository = fakeRepository(finalSession());
    const actors = fakeActors();
    const runtime = runtimeOn(repository, await repository.load(), actors.port, campaign);

    expect((await apply(runtime)).ok).toBe(true);
    expect(calls).toEqual([operationIdFor('battle-writeback')]);
    expect(actors.writes).toEqual([]);
    expect(runtime.session.stage).toBe('finalized');

    expect(await runtime.applyOutcome(prepareOutcome(runtime.session), runtime.session.revision))
      .toMatchObject({ ok: true, written: [] });
    expect(calls).toHaveLength(1);
  });

  it('reports a campaign module that is not installed', async () => {
    const port = createReignMakerPort(() => undefined);

    expect(port.available()).toBe(false);
    expect(await port.apply({} as never, 'outcome-x'))
      .toEqual({ ok: false, message: 'pf2e-reignmaker is not installed' });
  });

  it('refuses to finalize an imported battle whose outcome never reached the campaign', async () => {
    const repository = fakeRepository(finalSession());
    const runtime = runtimeOn(repository, await repository.load(), fakeActors().port);

    expect(await runtime.submit({ type: 'battle.finalize' }))
      .toMatchObject({ ok: false, reason: 'engine', message: 'the campaign outcome has not been applied' });
  });
});
