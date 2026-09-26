import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type UnitCard } from '../engine/index.js';
import { createModuleApi } from '../adapters/foundry/moduleApi.js';
import { createFoundrySites } from '../adapters/foundry/worldSites.js';
import type { WorldSettingStorage } from '../adapters/foundry/worldSettings.js';
import type { BattleRequest, SiteOpening } from '../runtime/campaign.js';
import type { BattleCommand, CommandEnvelope } from '../runtime/commands.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { memorySites } from '../runtime/memorySites.js';
import type { BattleSites, PresencePort } from '../runtime/ports.js';
import { reviveSession } from '../runtime/migrate.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const PLAYER = 'p1';

const infantry: UnitCard = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };

const presence: PresencePort = {
  online: () => true,
  gmUserId: () => GM,
  users: () => [GM, PLAYER],
  displayName: (userId) => `User ${userId}`,
};

const request: BattleRequest = {
  board: { base: 'hills', size: 9, feature: 'river', seed: 7 },
  units: [
    { card: infantry, side: 'attacker' },
    { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' },
  ],
};
const armies: SiteOpening = { request };
const ground: SiteOpening = { board: { base: 'forest', size: 9, feature: 'none', seed: 3 } };

const fought = (): BattleSession['battle'] => createBattle({
  board: openBoard(),
  units: [
    { card: infantry, side: 'attacker', square: 'c2' },
    { card: infantry, side: 'defender', square: 'c7' },
  ],
});

function tableOf(session: BattleSession = freshSession(), sites: BattleSites = memorySites()) {
  let stored = session;
  let failing = false;
  const runtime = createRuntime({
    repository: {
      async load() { return stored; },
      async save(next) { if (failing) throw new Error('disk full'); stored = next; },
    },
    archive: fakeArchive(),
    sites,
    session,
    dice: scriptedRng([10]),
    policy: { userId: GM, presence },
  });
  const as = (userId: string, command: BattleCommand): CommandEnvelope => ({
    battleId: runtime.session.battleId,
    commandId: `cmd-${userId}-${runtime.session.revision}`,
    expectedRevision: runtime.session.revision,
    userId,
    command,
  });
  const moveTo = (site: string, opening: SiteOpening = armies, battleId = `battle-${site}`) =>
    runtime.submit({ type: 'session.moveTo', site, battleId, opening });
  return { runtime, sites, as, moveTo, failSaves: () => { failing = true; } };
}

describe('moving the table to a site', () => {
  it('opens a site no battle stands on from its armies, under the battle ID sent', async () => {
    const { runtime, moveTo } = tableOf();

    expect(await moveTo('12.07')).toMatchObject({ ok: true, revision: 1 });

    expect(runtime.session).toMatchObject({ site: '12.07', battleId: 'battle-12.07', stage: 'setup', battle: null });
    expect(runtime.session.setup.units.map((u) => u.card.name)).toEqual(['Line Infantry', 'Kobold Warriors']);
    expect(runtime.session.control.seats).toEqual({ attacker: [PLAYER], defender: [GM] });
  });

  it('opens bare ground as an empty draft on a board drawn from the spec', async () => {
    const { runtime, moveTo } = tableOf();

    await moveTo('03.03', ground);

    expect(runtime.session.site).toBe('03.03');
    expect(runtime.session.setup.spec.base).toBe('forest');
    expect(runtime.session.setup.units).toEqual([]);
  });

  it('parks the battle it leaves and opens it again as it stood', async () => {
    const { runtime, sites, moveTo } = tableOf();
    await moveTo('12.07');
    await runtime.submit({ type: 'army.removeUnit', unitId: runtime.session.setup.units[0].id });
    const left = runtime.session;

    await moveTo('03.03', ground);

    expect((await sites.list()).map((e) => e.site)).toEqual(['12.07']);
    expect(runtime.session.site).toBe('03.03');

    const back = await moveTo('12.07', ground, 'battle-unused');

    expect(back.ok).toBe(true);
    expect(runtime.session.battleId).toBe(left.battleId);
    expect(runtime.session.setup).toEqual(left.setup);
    expect(runtime.session.revision).toBeGreaterThan(left.revision);
  });

  it('carries a battle under way across the move and back', async () => {
    const running: BattleSession = { ...freshSession(), site: '12.07', stage: 'battle', battle: fought() };
    const { runtime, moveTo } = tableOf(running);

    expect((await moveTo('03.03')).ok).toBe(true);
    expect(runtime.session.battle).toBeNull();

    await moveTo('12.07');
    expect(runtime.session.stage).toBe('battle');
    expect(runtime.session.battle?.units.map((u) => u.id)).toEqual(running.battle?.units.map((u) => u.id));
  });

  it('keeps every revision above the last, so a delivered record is always adopted', async () => {
    const { runtime, moveTo } = tableOf();
    const seen: number[] = [];
    runtime.subscribe((s) => seen.push(s.revision));

    await moveTo('a');
    await moveTo('b');
    await moveTo('a');

    expect(seen).toEqual([1, 2, 3]);
  });

  it('clears the undo history, which belongs to the battle left behind', async () => {
    const { runtime, moveTo } = tableOf();
    await moveTo('a');
    await runtime.submit({ type: 'setup.paint', stroke: { cells: ['a1'], edges: [], brush: { kind: 'erase' } } });
    expect(runtime.history.length).toBe(1);

    await moveTo('b');

    expect(runtime.history).toEqual([]);
  });

  it('refuses the site already open', async () => {
    const { runtime, moveTo } = tableOf();
    await moveTo('a');
    const before = runtime.session;

    expect(await moveTo('a')).toMatchObject({ ok: false, reason: 'stage', message: 'that battle is already open' });
    expect(runtime.session).toBe(before);
  });

  it('never overwrites a battle under way on no site', async () => {
    const { runtime, sites, moveTo } = tableOf({ ...freshSession(), stage: 'battle', battle: fought() });

    expect(await moveTo('a')).toMatchObject({ ok: false, reason: 'stage' });
    expect(runtime.session.battle).not.toBeNull();
    expect(await sites.list()).toEqual([]);
  });

  it('replaces a draft on no site without parking it', async () => {
    const { runtime, sites, moveTo } = tableOf();

    expect((await moveTo('a')).ok).toBe(true);
    expect(runtime.session.site).toBe('a');
    expect(await sites.list()).toEqual([]);
  });

  it('takes a finalized battle off the map as the table leaves it', async () => {
    const sites = memorySites();
    const resolved: BattleSession = { ...freshSession(), site: 'a', stage: 'finalized', battle: fought() };
    await sites.park({ ...resolved, stage: 'battle' });
    const { runtime, moveTo } = tableOf(resolved, sites);

    expect((await moveTo('b')).ok).toBe(true);

    expect(runtime.session.site).toBe('b');
    expect((await sites.list()).map((e) => e.site)).toEqual([]);
  });

  it('refuses a player', async () => {
    const { runtime, as } = tableOf();
    const before = runtime.session;

    const result = await runtime.execute(as(PLAYER, { type: 'session.moveTo', site: 'a', battleId: 'b', opening: armies }));

    expect(result).toMatchObject({ ok: false, reason: 'permission' });
    expect(runtime.session).toBe(before);
  });

  it('refuses a malformed opening and keeps the open battle', async () => {
    const { runtime, moveTo } = tableOf();
    await moveTo('a');
    const before = runtime.session;

    const result = await moveTo('b', { request: { ...request, units: [] } });

    expect(result).toMatchObject({ ok: false, reason: 'engine' });
    expect(runtime.session).toBe(before);
  });

  it('refuses a parked record it cannot read rather than opening a new battle over it', async () => {
    const sites = memorySites();
    const { runtime, moveTo } = tableOf(freshSession(), { ...sites, load: async () => ({ schemaVersion: 99 }) });
    const before = runtime.session;

    expect(await moveTo('a')).toMatchObject({ ok: false, reason: 'engine' });
    expect(runtime.session).toBe(before);
  });

  it('holds the open battle when the session write fails, with the parked copy spare', async () => {
    const { runtime, sites, moveTo, failSaves } = tableOf();
    await moveTo('a');
    const before = runtime.session;
    failSaves();

    expect(await moveTo('b')).toMatchObject({ ok: false, reason: 'storage' });

    expect(runtime.session).toBe(before);
    expect((await sites.list()).map((e) => e.site)).toEqual(['a']);
  });

  it('answers a failing sites store as a storage refusal', async () => {
    const broken: BattleSites = { ...memorySites(), park: async () => { throw new Error('setting refused'); } };
    const { runtime, moveTo } = tableOf({ ...freshSession(), site: 'a' }, broken);

    expect(await moveTo('b')).toMatchObject({ ok: false, reason: 'storage' });
    expect(runtime.session.site).toBe('a');
  });
});

describe('resetting to the example force', () => {
  it('leaves the site, since the example is no campaign battle', async () => {
    const { runtime, moveTo } = tableOf();
    await moveTo('a');

    await runtime.submit({ type: 'battle.reset' });

    expect(runtime.session.site).toBeNull();
  });
});

describe('a record written before sites', () => {
  it('revives on no site rather than failing to load', () => {
    const older = { ...freshSession(), schemaVersion: 1 } as Partial<BattleSession>;
    delete older.site;

    expect(reviveSession(older)?.site).toBeNull();
  });
});

describe('the sites world setting', () => {
  function fakeStorage(initial = '{}'): WorldSettingStorage {
    let value = initial;
    return { get: () => value, set: async (next) => { value = next; } };
  }

  it('parks one record to a site, lists it without the record, loads and removes it', async () => {
    const sites = createFoundrySites(fakeStorage());
    const first: BattleSession = { ...freshSession('battle-1'), site: 'a' };

    await sites.park(first);
    await sites.park({ ...first, battleId: 'battle-2' });
    await sites.park({ ...freshSession('battle-3'), site: 'b', stage: 'battle', battle: fought() });

    const listed = await sites.list();
    expect(listed.map((e) => [e.site, e.battleId, e.day])).toEqual([['a', 'battle-2', null], ['b', 'battle-3', 1]]);
    expect(listed[0]).not.toHaveProperty('data');
    expect(await sites.load('a')).toMatchObject({ battleId: 'battle-2' });
    expect(await sites.load('missing')).toBeNull();

    await sites.remove('a');
    expect((await sites.list()).map((e) => e.site)).toEqual(['b']);
  });

  it('refuses a battle on no site', async () => {
    await expect(createFoundrySites(fakeStorage()).park(freshSession())).rejects.toThrow();
  });

  it('refuses to read or park over a corrupt setting and leaves it as it was', async () => {
    const storage = fakeStorage('not json');
    const sites = createFoundrySites(storage);

    await expect(sites.list()).rejects.toThrow('could not be read');
    await expect(sites.park({ ...freshSession(), site: 'a' })).rejects.toThrow('could not be read');
    expect(storage.get()).toBe('not json');
  });
});

describe('the module API over sites', () => {
  function apiOver() {
    const table = tableOf();
    const api = createModuleApi({
      submit: () => (command) => table.runtime.submit(command),
      session: () => table.runtime.session, sites: table.sites,
      open: async () => {}, close: async () => {}, callTable: async () => {}, dismissTable: async () => {},
    });
    return { ...table, api };
  }

  it('lists the open battle with the parked ones, once each', async () => {
    const { api } = apiOver();
    await api.openBattleAt('a', armies);
    await api.openBattleAt('b', ground);
    await api.openBattleAt('a', ground);

    expect((await api.battles()).map((e) => e.site).sort()).toEqual(['a', 'b']);
  });

  it('answers the open site without sending a command', async () => {
    const { api, runtime } = apiOver();
    await api.openBattleAt('a', armies);
    const before = runtime.session;

    expect(await api.openBattleAt('a', armies)).toEqual({ ok: true, revision: before.revision });
    expect(runtime.session).toBe(before);
  });

  it('sends nothing for a malformed opening', async () => {
    const { api, runtime } = apiOver();

    expect(await api.openBattleAt('a', { request: { ...request, units: [] } })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(runtime.session.site).toBeNull();
  });

  it('removes a parked battle and leaves the open one', async () => {
    const { api } = apiOver();
    await api.openBattleAt('a', armies);
    await api.openBattleAt('b', ground);

    expect(await api.removeBattle('b')).toBe(false);
    expect(await api.removeBattle('a')).toBe(true);
    expect((await api.battles()).map((e) => e.site)).toEqual(['b']);
  });
});
