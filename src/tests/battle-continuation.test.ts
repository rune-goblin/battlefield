import { describe, expect, it } from 'vitest';
import { createBattle, suggestDeployment, type BattleState, type UnitCard } from '../engine/index.js';
import { createRuntime, type Runtime } from '../runtime/createRuntime.js';
import type { DicePort, SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const card = (name: string, disorder: number): UnitCard =>
  ({ name, level: 6, role: 'infantry', disorder, wounds: 1, overrides: { will: 14, fortitude: 14 } });

function duskBattle(): BattleState {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: card('Line', 2), side: 'attacker', square: 'c2' },
      { card: card('Kobolds', 2), side: 'defender', square: 'c7' },
      { card: card('Trolls', 0), side: 'defender', square: 'e7' },
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

function countingDice(): DicePort & { rolls: number } {
  return { rolls: 0, d20() { this.rolls++; return 20; } };
}

function runtimeOn(battle = duskBattle()) {
  const session: BattleSession = { ...freshSession(), stage: 'battle', battle };
  const dice = countingDice();
  return { runtime: createRuntime({ repository: fakeRepository(session), session, dice }), dice };
}

const rally = (unit: string) => [{ unit, activity: 'rally' as const }];

/** Both sides declare recovery and hold, which is the state the deployment step opens in. */
async function nightAndHolds(runtime: Runtime) {
  await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: rally('u0') });
  await runtime.submit({ type: 'continuation.declareRecovery', side: 'defender', choices: rally('u1') });
  await runtime.submit({ type: 'continuation.declareDayOrder', side: 'attacker', order: 'hold' });
  await runtime.submit({ type: 'continuation.declareDayOrder', side: 'defender', order: 'hold' });
  await runtime.submit({ type: 'continuation.confirmDayOrders' });
}

describe('battle continuation', () => {
  it('rolls the night once, with both sides’ choices', async () => {
    const { runtime, dice } = runtimeOn();

    const first = await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: rally('u0') });

    expect(first.ok).toBe(true);
    expect(runtime.session.nightDeclarations.attacker).toEqual(rally('u0'));
    expect(runtime.session.battle!.night).toBeNull();
    expect(dice.rolls).toBe(0);

    await runtime.submit({ type: 'continuation.declareRecovery', side: 'defender', choices: rally('u1') });

    expect(runtime.session.battle!.night!.map((r) => r.unit)).toEqual(['u0', 'u1']);
    expect(dice.rolls).toBe(2);
    expect(runtime.session.nightDeclarations).toEqual({});

    const again = await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: rally('u0') });
    expect(again).toMatchObject({ ok: false, reason: 'engine' });
    expect(dice.rolls).toBe(2);
  });

  it('refuses recovery declared for the other side’s units', async () => {
    const { runtime } = runtimeOn();

    const result = await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: rally('u1') });

    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(runtime.session.nightDeclarations).toEqual({});
  });

  it('clears nextDeployment when a new battlefield is chosen', async () => {
    const { runtime } = runtimeOn();
    await nightAndHolds(runtime);
    const field = suggestDeployment(runtime.session.battle!);

    await runtime.submit({ type: 'continuation.declareDeployment', side: 'attacker', positions: { u0: field.u0 } });
    await runtime.submit({ type: 'continuation.declareDeployment', side: 'defender', positions: { u1: field.u1, u2: field.u2 } });
    expect(Object.keys(runtime.session.nextDeployment)).toEqual(['attacker', 'defender']);

    const chosen = await runtime.submit({ type: 'continuation.chooseBattlefield', spec: { base: 'forest', seed: 3 } });

    expect(chosen.ok).toBe(true);
    expect(runtime.session.battle!.nextBoard).not.toBeNull();
    expect(runtime.session.nextDeployment).toEqual({});
  });

  it('refuses a side’s deployment on a square it cannot take', async () => {
    const { runtime } = runtimeOn();
    await nightAndHolds(runtime);

    // c5 is the middle of the field: no side deploys there.
    const result = await runtime.submit({ type: 'continuation.declareDeployment', side: 'attacker', positions: { u0: 'c5' } });

    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(runtime.session.nextDeployment).toEqual({});
  });

  it('refuses the next day while a side is invalid, and starts it once both sides are in', async () => {
    const { runtime } = runtimeOn();
    await nightAndHolds(runtime);
    const field = suggestDeployment(runtime.session.battle!);

    await runtime.submit({ type: 'continuation.declareDeployment', side: 'attacker', positions: { u0: field.u0 } });
    const revision = runtime.session.revision;

    const silent = await runtime.submit({ type: 'continuation.startNextDay' });

    expect(silent).toMatchObject({ ok: false, reason: 'engine' });
    expect(silent.ok === false && silent.message).toMatch(/the defender has not chosen/);

    await runtime.submit({ type: 'continuation.declareDeployment', side: 'defender', positions: { u1: field.u1 } });
    const partial = await runtime.submit({ type: 'continuation.startNextDay' });

    expect(partial).toMatchObject({ ok: false, reason: 'engine' });
    expect(partial.ok === false && partial.message).toMatch(/every standing defender unit/);
    expect(runtime.session.revision).toBe(revision + 1);
    expect(runtime.session.battle!.day).toBe(1);

    await runtime.submit({ type: 'continuation.declareDeployment', side: 'defender', positions: { u1: field.u1, u2: field.u2 } });
    const started = await runtime.submit({ type: 'continuation.startNextDay' });

    expect(started.ok).toBe(true);
    expect(runtime.session.battle!.day).toBe(2);
    expect(runtime.session.battle!.phase).toBe('battle');
    expect(runtime.session.nextDeployment).toEqual({});
  });

  it('answers a surrender proposal and refuses a continuation command with no battle', async () => {
    const { runtime } = runtimeOn();
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: [] });
    await runtime.submit({ type: 'continuation.declareRecovery', side: 'defender', choices: [] });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'defender', order: 'hold' });
    await runtime.submit({ type: 'continuation.declareDayOrder', side: 'attacker', order: 'surrender' });

    await runtime.submit({ type: 'continuation.answerSurrender', side: 'defender', accept: true });
    expect(runtime.session.battle!.endedBy).toBe('surrender');
    expect(runtime.session.battle!.winner).toBe('defender');

    await runtime.change((s) => ({ ...s, battle: null }));
    const orphan = await runtime.submit({ type: 'continuation.confirmDayOrders' });
    expect(orphan).toMatchObject({ ok: false, reason: 'stage' });
  });
});
