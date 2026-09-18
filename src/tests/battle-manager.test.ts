import { describe, expect, it } from 'vitest';
import type { UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession, type BattleSetupDraft } from '../runtime/session.js';
import { openBoard } from './helpers.js';

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
    emplacements: [{ id: 'eq-1', name: 'Ballista', side: 'attacker', square: 'b1' }],
  };
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return {
    async load() { return saved; },
    async save(next) { saved = structuredClone(next); },
  };
}

function runtimeOn(setup = draft()) {
  const session: BattleSession = { ...freshSession(), setup };
  return createRuntime({ repository: fakeRepository(session), session });
}

describe('the battle manager', () => {
  it('deploys the whole setup in one commit', async () => {
    const runtime = runtimeOn();

    const result = await runtime.submit({ type: 'battle.start' });

    expect(result.ok).toBe(true);
    const battle = runtime.session.battle!;
    expect(runtime.session.stage).toBe('battle');
    expect(battle.units.map((u) => u.id)).toEqual(['unit-a', 'unit-d']);
    expect(battle.engines.map((e) => e.id)).toEqual(['eq-1']);
    expect(runtime.session.revision).toBe(1);
  });

  it('refuses to start while a side has a piece off the board', async () => {
    const setup = draft();
    setup.emplacements[0].square = null;
    const runtime = runtimeOn(setup);

    const result = await runtime.submit({ type: 'battle.start' });

    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(result.ok === false && result.message).toMatch(/attacker/);
    expect(runtime.session.battle).toBeNull();
  });

  it('drops the battle and its submissions on the way back to setup', async () => {
    const runtime = runtimeOn();
    await runtime.submit({ type: 'battle.start' });
    await runtime.submit({ type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'unit-a' } });
    expect(runtime.history).toHaveLength(1);

    const result = await runtime.submit({ type: 'battle.returnToSetup' });

    expect(result.ok).toBe(true);
    expect(runtime.session.battle).toBeNull();
    expect(runtime.session.stage).toBe('setup');
    expect(runtime.session.nightDeclarations).toEqual({});
    expect(runtime.session.nextDeployment).toEqual({});
    expect(runtime.history).toHaveLength(0);
    // Setup is open again, so a setup command is accepted where it was refused a moment ago.
    expect(await runtime.submit({ type: 'setup.rerollSeed' })).toMatchObject({ ok: true });
  });

  it('resets the draft to the example force', async () => {
    const runtime = runtimeOn();

    const result = await runtime.submit({ type: 'battle.reset' });

    expect(result.ok).toBe(true);
    expect(runtime.session.setup.board).toBeNull();
    expect(runtime.session.setup.units).toHaveLength(6);
    expect(runtime.session.setup.emplacements).toEqual([]);
  });

  it('finalizes a battle that is over and refuses one that can go on', async () => {
    const runtime = runtimeOn();
    await runtime.submit({ type: 'battle.start' });

    expect(await runtime.submit({ type: 'battle.finalize' })).toMatchObject({ ok: false, reason: 'engine' });

    const battle = structuredClone(runtime.session.battle!);
    battle.phase = 'ended';
    battle.endedBy = 'dusk';
    // One side standing alone: the day ended, and no night can continue it.
    battle.units[1].status = 'destroyed';
    const ended = createRuntime({
      repository: fakeRepository({ ...freshSession(), stage: 'battle', battle }),
      session: { ...freshSession(), stage: 'battle', battle },
    });

    expect(await ended.submit({ type: 'battle.finalize' })).toMatchObject({ ok: true });
    expect(ended.session.stage).toBe('finalized');
    // The outcome has been reported; only leaving the battle reopens the record.
    expect(await ended.submit({ type: 'session.undo' })).toMatchObject({ ok: false, reason: 'stage' });
    expect(await ended.submit({ type: 'battle.returnToSetup' })).toMatchObject({ ok: true });
    expect(ended.session.stage).toBe('setup');
  });
});
