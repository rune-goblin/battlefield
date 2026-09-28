import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type BattleState, type UnitCard } from '../engine/index.js';
import type { SiteOpening } from '../runtime/campaign.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { memorySites } from '../runtime/memorySites.js';
import type { PresencePort } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { unsavedAgainst } from '../runtime/storedCopy.js';
import type { BattleOutcome, CampaignOutcomePort } from '../services/OutcomeApplicationService.js';
import { createSiteLifecycle } from '../services/SiteLifecycleService.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const presence: PresencePort = {
  online: () => true, gmUserId: () => GM, users: () => [GM, 'p1'], displayName: (id) => id,
};
const infantry: UnitCard = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };
const armies: SiteOpening = {
  request: {
    board: { base: 'hills', size: 9, feature: 'none', seed: 7 },
    units: [{ card: infantry, side: 'attacker' }, { card: { ...infantry, name: 'Kobolds', level: 3 }, side: 'defender' }],
  },
};

const fought = (patch: Partial<BattleState> = {}): BattleState => ({
  ...createBattle({
    board: openBoard(),
    units: [{ card: infantry, side: 'attacker', square: 'c2' }, { card: infantry, side: 'defender', square: 'c7' }],
  }),
  ...patch,
});

function tableOf(session: BattleSession = freshSession()) {
  const sites = memorySites();
  const applied: BattleOutcome[] = [];
  const campaign: CampaignOutcomePort = {
    available: () => true,
    apply: async (outcome) => { applied.push(outcome); return { ok: true }; },
  };
  let stored = session;
  const runtime = createRuntime({
    repository: { load: async () => stored, save: async (next) => { stored = next; } },
    archive: fakeArchive(), sites, session, dice: scriptedRng([10]), policy: { userId: GM, presence }, campaign,
  });
  const lifecycle = createSiteLifecycle({
    session: () => runtime.session,
    submit: (command) => runtime.submit(command),
    sites,
    applyOutcome: () => (outcome, revision) => runtime.applyOutcome(outcome, revision),
  });
  const open = (site: string) =>
    runtime.submit({ type: 'session.moveTo', site, battleId: `battle-${site}`, opening: armies });
  const removeFirst = () => runtime.submit({ type: 'army.removeUnit', unitId: runtime.session.setup.units[0].id });
  return { runtime, sites, lifecycle, open, removeFirst, applied };
}

describe('saving a battle to its site', () => {
  it('writes the live battle to the stored copy and leaves it active', async () => {
    const { runtime, sites, lifecycle, open, removeFirst } = tableOf();
    await open('a');
    await removeFirst();

    await lifecycle.save();

    const stored = await sites.load('a') as BattleSession;
    expect(stored.setup).toEqual(runtime.session.setup);
    expect(runtime.session.site).toBe('a');
    expect(await lifecycle.unsaved()).toBe(false);
  });

  it('refuses a battle on no site', async () => {
    const { lifecycle } = tableOf();

    await expect(lifecycle.save()).rejects.toThrow('no site');
  });
});

describe('unsaved detection', () => {
  it('reads a never-saved battle as unsaved and a battle on no site as saved', async () => {
    const { lifecycle, open } = tableOf();
    expect(await lifecycle.unsaved()).toBe(false);

    await open('a');

    expect(await lifecycle.unsaved()).toBe(true);
  });

  it('reads a battle opened from its stored copy as saved until the record changes', async () => {
    const { lifecycle, open, removeFirst, runtime } = tableOf();
    await open('a');
    await lifecycle.save();
    await lifecycle.close();
    await open('a');

    expect(await lifecycle.unsaved()).toBe(false);

    await removeFirst();

    expect(await lifecycle.unsaved()).toBe(true);
    expect(unsavedAgainst(runtime.session, JSON.parse(JSON.stringify(runtime.session)))).toBe(false);
  });

  it('ignores the seating, the turn and the revision, which every opening rewrites', () => {
    const live: BattleSession = { ...freshSession(), site: 'a' };
    const stored = { ...live, revision: 40, turn: 'p1', recentCommandIds: ['x'], control: { ...live.control, next: { attacker: 3, defender: 1 } } };

    expect(unsavedAgainst(live, stored)).toBe(false);
    expect(unsavedAgainst(live, { ...stored, stage: 'battle' })).toBe(true);
  });
});

describe('closing a battle', () => {
  it('drops the live changes, so the site reopens at its stored copy', async () => {
    const { runtime, lifecycle, open, removeFirst } = tableOf();
    await open('a');
    await lifecycle.save();
    const saved = runtime.session.setup;
    await removeFirst();

    expect((await lifecycle.close()).ok).toBe(true);
    expect(runtime.session.site).toBeNull();
    expect(runtime.session.battleId).not.toBe('battle-a');

    await open('a');
    expect(runtime.session.battleId).toBe('battle-a');
    expect(runtime.session.setup).toEqual(saved);
  });

  it('takes a never-saved battle off the map', async () => {
    const { sites, lifecycle, open } = tableOf();
    await open('a');

    await lifecycle.close();

    expect(await sites.list()).toEqual([]);
  });

  it('resumes a battle stored at dusk at overnight recovery', async () => {
    const dusk = fought({ phase: 'ended', endedBy: 'dusk', winner: 'draw' });
    const { runtime, lifecycle, open } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: dusk });
    await lifecycle.save();
    await lifecycle.close();

    await open('a');

    expect(runtime.session).toMatchObject({ site: 'a', stage: 'battle', battle: { phase: 'ended', endedBy: 'dusk', day: dusk.day } });
    expect(runtime.session.battle!.night).toBeFalsy();
    expect(lifecycle.awaitsRuling()).toBe(true);
    expect(await runtime.submit({ type: 'continuation.declareRecovery', side: 'attacker', choices: [] })).toMatchObject({ ok: true });
    expect(runtime.session.battle!.night?.attacker).toEqual([]);
  });

  it('leaves the stored copy untouched when the table moves to another site', async () => {
    const { sites, lifecycle, open, removeFirst } = tableOf();
    await open('a');
    await lifecycle.save();
    const saved = await sites.load('a');
    await removeFirst();

    await open('b');

    expect(await sites.load('a')).toEqual(saved);
    expect((await sites.list()).map((e) => e.site)).toEqual(['a']);
  });
});

describe('ending a battle', () => {
  it('takes the GM ruling on a battle under way to the campaign and off the map', async () => {
    const { runtime, sites, lifecycle, applied } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: fought() });
    await lifecycle.save();
    expect(lifecycle.awaitsRuling()).toBe(true);

    expect(await lifecycle.end('defender')).toEqual({ ok: true });

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ winner: 'defender', endedBy: 'ruling', fallback: { side: 'attacker' } });
    expect(runtime.session.stage).toBe('finalized');
    expect(await sites.list()).toEqual([]);
    expect(await lifecycle.unsaved()).toBe(false);
  });

  it('rules a draw at dusk, when the battle could go on', async () => {
    const dusk = fought({ phase: 'ended', endedBy: 'dusk', winner: 'draw' });
    const { lifecycle, applied } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: dusk });
    expect(lifecycle.awaitsRuling()).toBe(true);

    expect(await lifecycle.end('draw')).toEqual({ ok: true });

    expect(applied[0]).toMatchObject({ winner: 'draw', endedBy: 'ruling', fallback: null });
  });

  it('carries the winner of a battle the rules ended and takes no ruling', async () => {
    const routed = fought({ phase: 'ended', endedBy: 'rout', winner: 'attacker' });
    const { runtime, lifecycle, applied } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: routed });
    expect(lifecycle.awaitsRuling()).toBe(false);
    expect(await runtime.submit({ type: 'battle.rule', winner: 'defender' })).toMatchObject({ ok: false, reason: 'engine' });

    expect(await lifecycle.end()).toEqual({ ok: true });

    expect(applied[0]).toMatchObject({ winner: 'attacker', endedBy: 'rout' });
  });

  it('asks for a ruling rather than ending a battle under way on its own', async () => {
    const { runtime, lifecycle, applied } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: fought() });
    const before = runtime.session;

    expect(await lifecycle.end()).toEqual({ ok: false, message: 'the battle needs a ruling' });

    expect(runtime.session).toBe(before);
    expect(applied).toEqual([]);
  });

  it('keeps the stored copy when the finalize is refused', async () => {
    const { runtime, sites, lifecycle } = tableOf({ ...freshSession(), site: 'a', stage: 'battle', battle: fought() });
    await lifecycle.save();

    expect(await runtime.submit({ type: 'battle.finalize' })).toMatchObject({ ok: false, reason: 'engine' });

    expect((await sites.list()).map((e) => e.site)).toEqual(['a']);
  });
});
