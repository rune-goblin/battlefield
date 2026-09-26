import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type BattleState, type UnitCard } from '../engine/index.js';
import { createRuntime, type Runtime } from '../runtime/createRuntime.js';
import { interactionOf, submissionOf } from '../runtime/interactions.js';
import type { SeatPolicy } from '../runtime/policy.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession, type BattleSetupDraft } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

function draft(): BattleSetupDraft {
  return {
    spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 1 },
    board: openBoard('square', 9),
    units: [
      { id: 'unit-a', card: infantry, side: 'attacker', square: 'c1', engines: [] },
      { id: 'unit-d', card: kobolds, side: 'defender', square: 'c9', engines: [] },
    ],
    emplacements: [],
  };
}

function duskBattle(): BattleState {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
  });
  battle.phase = 'ended';
  battle.endedBy = 'dusk';
  battle.winner = 'draw';
  battle.round = 6;
  return battle;
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return {
    async load() { return saved; },
    async save(next) { saved = structuredClone(next); },
  };
}

function runtimeOn(session: BattleSession): Runtime {
  // Seated on both sides so the two armies can answer through one client, as a hot seat does.
  const policy: SeatPolicy = {
    userId: GM,
    presence: { online: () => true, gmUserId: () => GM, users: () => [GM], displayName: (id) => id },
  };
  return createRuntime({
    repository: fakeRepository(session), archive: fakeArchive(), session, dice: scriptedRng([10]), policy,
  });
}

const setupSession = () => runtimeOn({ ...freshSession(), setup: draft() });
const duskSession = () => runtimeOn({ ...freshSession(), stage: 'battle', battle: duskBattle() });

describe('shared interactions', () => {
  it('records who answered, for which sides, and in what scope', async () => {
    const runtime = setupSession();

    await runtime.submit({ type: 'army.declareReady', side: 'attacker', ready: true });

    const record = interactionOf(runtime.session.interactions, 'army.readiness')!;
    expect(record).toMatchObject({
      kind: 'army.readiness',
      initiator: GM,
      participants: ['attacker', 'defender'],
      scope: { stage: 'setup', day: null },
      status: 'open',
      submissions: { attacker: true },
    });
    expect(record.id).toMatch(/^int-/);
  });

  it('starts the battle on the GM’s word alone, with neither side declared ready', async () => {
    const runtime = setupSession();

    expect(await runtime.submit({ type: 'battle.start' })).toMatchObject({ ok: true });
  });

  it('clears the setup’s records in the commit that starts the battle', async () => {
    const runtime = setupSession();
    await runtime.submit({ type: 'army.declareReady', side: 'attacker', ready: true });
    await runtime.submit({ type: 'army.declareReady', side: 'defender', ready: true });
    const revision = runtime.session.revision;

    await runtime.submit({ type: 'battle.start' });

    expect(runtime.session.revision).toBe(revision + 1);
    expect(runtime.session.stage).toBe('battle');
    expect(runtime.session.interactions).toEqual([]);
  });

  it('clears the night’s records in the commit that opens the next day', async () => {
    const runtime = duskSession();
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: [] });
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'defender', choices: [] });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'attacker', order: 'hold' });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'defender', order: 'hold' });
    await runtime.submit({ type: 'continuation.confirmDayOrders' });
    await runtime.submit({ type: 'continuation.declareDeployment', side: 'attacker', positions: { u0: 'c2' } });
    await runtime.submit({ type: 'continuation.declareDeployment', side: 'defender', positions: { u1: 'c7' } });
    expect(runtime.session.interactions.map((i) => i.kind).sort())
      .toEqual(['nextDay.deployment', 'night.recovery']);
    expect(runtime.session.interactions.every((i) => i.scope.day === 1)).toBe(true);

    const started = await runtime.submit({ type: 'continuation.startNextDay' });

    expect(started.ok).toBe(true);
    expect(runtime.session.battle!.day).toBe(2);
    expect(runtime.session.interactions).toEqual([]);
  });

  it('takes back a side’s readiness when the force it agreed to changes', async () => {
    const runtime = setupSession();
    await runtime.submit({ type: 'army.declareReady', side: 'attacker', ready: true });
    await runtime.submit({ type: 'army.declareReady', side: 'defender', ready: true });

    await runtime.submit({ type: 'army.addUnit', side: 'defender', card: kobolds });

    expect(runtime.session.interactions).toEqual([]);
    const result = await runtime.submit({ type: 'battle.start' });
    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(result.ok === false && result.message).toMatch(/defender/);
  });

  it('records a surrender response beside the answer the engine gave', async () => {
    const runtime = duskSession();
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: [] });
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'defender', choices: [] });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'defender', order: 'hold' });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'attacker', order: 'surrender' });

    await runtime.submit({ type: 'continuation.answerSurrender', side: 'defender', accept: true });

    expect(submissionOf(runtime.session.interactions, 'day.surrender', 'defender')).toBe(true);
    expect(interactionOf(runtime.session.interactions, 'day.surrender')!.status).toBe('closed');
    expect(runtime.session.battle!.endedBy).toBe('surrender');
  });
});
