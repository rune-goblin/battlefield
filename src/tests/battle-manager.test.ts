import { describe, expect, it } from 'vitest';
import { createBattle, engineLoaded, type UnitCard } from '../engine/index.js';
import type { BattleRequest } from '../runtime/campaign.js';
import type { BattleCommand } from '../runtime/commands.js';
import { freshControl } from '../runtime/control.js';
import { createRuntime, type Runtime } from '../runtime/createRuntime.js';
import { submitTo } from '../runtime/interactions.js';
import type { PresencePort, SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession, type BattleSetupDraft } from '../runtime/session.js';
import { createBattleManager } from '../services/BattleManager.js';
import { fakeArchive, openBoard } from './helpers.js';

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
  return createRuntime({ repository: fakeRepository(session), archive: fakeArchive(), session });
}

/** Both armies call themselves ready, which `battle.start` waits for. */
async function bothReady(runtime: Runtime) {
  for (const side of ['attacker', 'defender'] as const) {
    expect(await runtime.submit({ type: 'army.declareReady', side, ready: true })).toMatchObject({ ok: true });
  }
}

describe('the battle manager', () => {
  it.each([undefined, true, false])('starts engines with their saved setup load of %s', async loaded => {
    const session = { ...freshSession(), setup: draft() };
    const repository = fakeRepository(session);
    const runtime = createRuntime({ repository, archive: fakeArchive(), session });
    if (loaded !== undefined) {
      expect(await runtime.submit({ type: 'army.setEngineLoaded', emplacementId: 'eq-1', loaded })).toMatchObject({ ok: true });
    }
    const saved = (await repository.load())!;
    expect(saved.setup.emplacements[0].loaded).toBe(loaded);
    const resumed = createRuntime({ repository, archive: fakeArchive(), session: saved });
    await bothReady(resumed);
    expect(await resumed.submit({ type: 'battle.start' })).toMatchObject({ ok: true });
    const engine = resumed.session.battle!.engines[0];
    expect(engineLoaded(engine)).toBe(loaded !== false);
    expect(engine.loaded).toBe(loaded === false ? 0 : 1);
  });

  it('deploys the whole setup in one commit', async () => {
    const runtime = runtimeOn();
    await bothReady(runtime);

    const result = await runtime.submit({ type: 'battle.start' });

    expect(result.ok).toBe(true);
    const battle = runtime.session.battle!;
    expect(runtime.session.stage).toBe('battle');
    // The battle stage is a scope of its own: the readiness both armies declared is gone.
    expect(runtime.session.interactions).toEqual([]);
    expect(battle.units.map((u) => u.id)).toEqual(['unit-a', 'unit-d']);
    expect(battle.engines.map((e) => e.id)).toEqual(['eq-1']);
    // Two readiness declarations, then the deployment itself.
    expect(runtime.session.revision).toBe(3);
  });

  it('leaves an engine that stands on no square out of the battle', async () => {
    const setup = draft();
    setup.emplacements[0].square = null;
    const runtime = runtimeOn(setup);
    await bothReady(runtime);

    expect(await runtime.submit({ type: 'battle.start' })).toMatchObject({ ok: true });
    expect(runtime.session.battle!.engines).toEqual([]);
  });

  it('refuses to start while a side has a unit off the board', async () => {
    const setup = draft();
    setup.units[0].square = null;
    const runtime = runtimeOn(setup);

    const declared = await runtime.submit({ type: 'army.declareReady', side: 'attacker', ready: true });
    expect(declared).toMatchObject({ ok: false, reason: 'engine' });

    const result = await runtime.submit({ type: 'battle.start' });

    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(result.ok === false && result.message).toMatch(/attacker/);
    expect(runtime.session.battle).toBeNull();
  });

  it('drops the battle and its submissions on the way back to setup', async () => {
    const runtime = runtimeOn();
    await bothReady(runtime);
    await runtime.submit({ type: 'battle.start' });
    await runtime.submit({ type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'unit-a' } });
    expect(runtime.history).toHaveLength(1);

    const result = await runtime.submit({ type: 'battle.returnToSetup' });

    expect(result.ok).toBe(true);
    expect(runtime.session.battle).toBeNull();
    expect(runtime.session.stage).toBe('setup');
    expect(runtime.session.interactions).toEqual([]);
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
    expect(runtime.session.setup.units.every(unit => unit.square === null)).toBe(true);
    expect(runtime.session.setup.emplacements).toEqual([]);
  });

  it('finalizes a battle that is over and refuses one that can go on', async () => {
    const runtime = runtimeOn();
    await bothReady(runtime);
    await runtime.submit({ type: 'battle.start' });

    expect(await runtime.submit({ type: 'battle.finalize' })).toMatchObject({ ok: false, reason: 'engine' });

    const battle = structuredClone(runtime.session.battle!);
    battle.phase = 'ended';
    battle.endedBy = 'dusk';
    // One side standing alone: the day ended, and no night can continue it.
    battle.units[1].status = 'destroyed';
    const ended = createRuntime({
      repository: fakeRepository({ ...freshSession(), stage: 'battle', battle }),
      archive: fakeArchive(),
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

describe('the lifecycle transitions', () => {
  const manager = createBattleManager();
  const presence: PresencePort = {
    online: () => true, gmUserId: () => 'gm', users: () => ['gm', 'p1'], displayName: (id) => id,
  };
  const table = (): BattleSession => ({ ...freshSession(), revision: 7 });
  const saved = (record: BattleSession): unknown => JSON.parse(JSON.stringify(record));
  const request: BattleRequest = {
    board: { base: 'plains', size: 9, feature: 'none', seed: 1 },
    units: [{ card: infantry, side: 'attacker' }, { card: kobolds, side: 'defender' }],
  };
  const fought = (): BattleSession => ({
    ...freshSession(), stage: 'battle',
    battle: createBattle({
      board: openBoard(),
      units: [{ card: infantry, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
    }),
  });
  const moveTo = (site: string): Extract<BattleCommand, { type: 'session.moveTo' }> => ({
    type: 'session.moveTo', site, battleId: `battle-${site}`, opening: { board: request.board },
  });

  it('loads a save at the table\'s revision and seating, with nothing pending', () => {
    const record: BattleSession = {
      ...submitTo(freshSession(), 'army.readiness', 'attacker', true, 'someone'),
      revision: 42, control: freshControl('defender'), turn: 'someone', recentCommandIds: ['cmd-old'],
    };

    const loaded = manager.load(table(), saved(record), 'slot-1', presence);

    expect(loaded).toMatchObject({
      battleId: record.battleId, revision: 7, interactions: [], recentCommandIds: [], turn: null,
    });
    expect(loaded.control.seats).toEqual({ attacker: ['p1'], defender: ['gm'] });
  });

  it('refuses to load a slot that holds no battlefield save', () => {
    expect(() => manager.load(table(), { nonsense: true }, 'slot-9', presence)).toThrow('slot-9 is not a battlefield save');
  });

  it('installs a campaign battle over a draft or a finalized battle and never over one under way', () => {
    expect(manager.installRefusal(table())).toBeNull();
    expect(manager.installRefusal({ ...fought(), stage: 'finalized' })).toBeNull();
    expect(manager.installRefusal(fought())).toBe('a battle is already under way');
  });

  it('installs the requested battle under its own ID, seated at this table', () => {
    const installed = manager.install(table(), 'battle-1', request, presence);

    expect(installed).toMatchObject({ battleId: 'battle-1', revision: 7, stage: 'setup' });
    expect(installed.setup.units.map((u) => u.card.name)).toEqual(['Infantry', 'Kobolds']);
    expect(installed.control.seats).toEqual({ attacker: ['p1'], defender: ['gm'] });
  });

  it('refuses the site already open and a battle under way on no site', () => {
    expect(manager.moveToRefusal({ ...table(), site: 'a' }, 'a')).toBe('that battle is already open');
    expect(manager.moveToRefusal(fought(), 'a')).toBe('a battle on no site is under way; save or end it first');
    expect(manager.moveToRefusal({ ...fought(), stage: 'finalized' }, 'a')).toBeNull();
    expect(manager.moveToRefusal({ ...fought(), site: 'b' }, 'a')).toBeNull();
  });

  it('takes a finalized battle off the map, parks a live one and leaves a record on no site alone', () => {
    expect(manager.departure({ ...fought(), site: 'a', stage: 'finalized' })).toBe('remove');
    expect(manager.departure({ ...fought(), site: 'a' })).toBe('park');
    expect(manager.departure({ ...table(), site: 'a' })).toBe('park');
    expect(manager.departure(fought())).toBeNull();
  });

  it('opens new ground at a site nothing is parked on', () => {
    const opened = manager.moveTo(table(), null, moveTo('b'), presence);

    expect(opened).toMatchObject({ site: 'b', battleId: 'battle-b', revision: 7, turn: null, stage: 'setup' });
    expect(opened.setup.units).toEqual([]);
  });

  it('reopens a parked battle with the answers it was waiting on', () => {
    const parked: BattleSession = {
      ...submitTo({ ...freshSession(), site: 'b' }, 'army.readiness', 'attacker', true, 'p1'),
      recentCommandIds: ['cmd-old'], turn: 'p1',
    };

    const opened = manager.moveTo({ ...table(), site: 'a' }, saved(parked), moveTo('b'), presence);

    expect(opened).toMatchObject({ site: 'b', battleId: parked.battleId, revision: 7, recentCommandIds: [], turn: null });
    expect(opened.interactions).toEqual(parked.interactions);
  });

  it('refuses a parked record it cannot read', () => {
    expect(() => manager.moveTo(table(), { schemaVersion: 99 }, moveTo('b'), presence))
      .toThrow('the battle parked at b cannot be read');
  });
});
