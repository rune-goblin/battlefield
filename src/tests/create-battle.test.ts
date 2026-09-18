import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type UnitCard } from '../engine/index.js';
import { createModuleApi } from '../adapters/foundry/moduleApi.js';
import {
  battleRequestProblems, createBattleThrough, sessionFromRequest,
  type BattleRequest,
} from '../runtime/campaign.js';
import type { BattleCommand, CommandEnvelope, CommandResult } from '../runtime/commands.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { PresencePort } from '../runtime/ports.js';
import { freshSession, reviveSession, type BattleSession } from '../runtime/session.js';
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

function request(overrides: Partial<BattleRequest> = {}): BattleRequest {
  return {
    board: { base: 'hills', size: 9, feature: 'river', seed: 7 },
    units: [
      {
        card: infantry,
        side: 'attacker',
        equipment: ['Battering Ram'],
        source: {
          actorUuid: 'Actor.abc123',
          campaignId: 'army-4',
          baseline: { hitPoints: 40, maxHitPoints: 60, demoralized: 1 },
        },
      },
      { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' },
    ],
    emplacements: [{ engine: 'Ballista', side: 'defender' }],
    ...overrides,
  };
}

function tableOf(session: BattleSession = freshSession()) {
  let stored = session;
  const runtime = createRuntime({
    repository: { async load() { return stored; }, async save(next) { stored = next; } },
    archive: fakeArchive(),
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
  return { runtime, as };
}

describe('the battle request validator', () => {
  it('accepts a request carrying cards, sides, equipment, sources, and a board', () => {
    expect(battleRequestProblems(request())).toEqual([]);
  });

  it('refuses a unit with no role, no side, and an engine nobody makes', () => {
    const problems = battleRequestProblems(request({
      units: [{
        card: { ...infantry, role: 'artillery' as UnitCard['role'] },
        side: 'neither' as BattleRequest['units'][number]['side'],
        equipment: ['Trebucket'],
      }],
    }));

    expect(problems).toEqual([
      'unit 0 is a artillery, which is no role',
      'unit 0 is on no side',
      'Trebucket is not an engine',
    ]);
  });

  it('refuses a board spec off the vocabulary', () => {
    const problems = battleRequestProblems(request({
      board: { base: 'tundra', size: 12, seed: 3 } as unknown as BattleRequest['board'],
    }));

    expect(problems).toEqual(['tundra is not a hex terrain', 'a board is 9 or 11 squares, not 12']);
  });

  it('refuses a source binding with no actor and a malformed baseline', () => {
    const problems = battleRequestProblems(request({
      units: [{
        card: infantry,
        side: 'attacker',
        source: { actorUuid: '', baseline: { hitPoints: -1, maxHitPoints: 0, demoralized: 0 } },
      }],
    }));

    expect(problems).toEqual([
      'unit 0 binds to no actor',
      'unit 0 baselines -1 hit points',
      'unit 0 baselines 0 maximum hit points',
    ]);
  });

  it('refuses a request with no units at all', () => {
    expect(battleRequestProblems(request({ units: [] }))).toEqual(['the request names no units']);
    expect(battleRequestProblems(null)).toEqual(['the request is not an object']);
  });
});

describe('a session built from a request', () => {
  it('stands in setup on a generated board with every piece off it', () => {
    const session = sessionFromRequest(request());

    expect(session.stage).toBe('setup');
    expect(session.battle).toBeNull();
    expect(session.setup.board?.spec.base).toBe('hills');
    expect(session.setup.units.map((u) => [u.card.name, u.side, u.square]))
      .toEqual([['Line Infantry', 'attacker', null], ['Kobold Warriors', 'defender', null]]);
    expect(session.setup.emplacements.map((e) => e.name)).toEqual(['Ballista']);
    expect(session.setup.units[0].engines.map((e) => e.name)).toEqual(['Battering Ram']);
  });

  it('binds each source to the unit ID it minted', () => {
    const session = sessionFromRequest(request());

    expect(session.sources).toEqual([{
      unitId: session.setup.units[0].id,
      actorUuid: 'Actor.abc123',
      campaignId: 'army-4',
      baseline: { hitPoints: 40, maxHitPoints: 60, demoralized: 1 },
    }]);
  });

  it('takes the battle ID it is given, so the caller records it before the commit', () => {
    expect(sessionFromRequest(request(), 'battle-xyz').battleId).toBe('battle-xyz');
  });

  it('throws every problem at once rather than building a broken setup', () => {
    expect(() => sessionFromRequest(request({ units: [] }))).toThrow('the request names no units');
  });
});

describe('installing a requested battle', () => {
  it('replaces the record and clears the source bindings of the unit that leaves', async () => {
    const { runtime } = tableOf();

    const result = await runtime.submit({ type: 'session.install', battleId: 'battle-1', request: request() });

    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(runtime.session.battleId).toBe('battle-1');
    expect(runtime.session.stage).toBe('setup');
    expect(runtime.session.sources).toHaveLength(1);

    const imported = runtime.session.setup.units[0].id;
    await runtime.submit({ type: 'army.removeUnit', unitId: imported });
    expect(runtime.session.sources).toEqual([]);
  });

  it('seats the GM on one army and the table on the other', async () => {
    const { runtime } = tableOf();

    await runtime.submit({ type: 'session.install', battleId: 'battle-1', request: request() });

    expect(runtime.session.control).toMatchObject({
      mode: 'auto', gmSide: 'defender', seats: { attacker: [PLAYER], defender: [GM] },
    });
    expect(runtime.session.turn).toBeNull();

    await runtime.submit({
      type: 'session.install', battleId: 'battle-2', request: request({ gmSide: 'attacker' }),
    });
    expect(runtime.session.control.seats).toEqual({ attacker: [GM], defender: [PLAYER] });
  });

  it('refuses a player and leaves the record where it stands', async () => {
    const { runtime, as } = tableOf();
    const before = runtime.session;

    const result = await runtime.execute(as(PLAYER, {
      type: 'session.install', battleId: 'battle-1', request: request(),
    }));

    expect(result).toMatchObject({ ok: false, reason: 'permission' });
    expect(runtime.session).toBe(before);
  });

  it('refuses a malformed request without touching the record', async () => {
    const { runtime } = tableOf();
    const before = runtime.session;

    const result = await runtime.submit({
      type: 'session.install', battleId: 'battle-1', request: request({ units: [] }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'engine', message: 'the request names no units' });
    expect(runtime.session).toBe(before);
  });

  it('never overwrites a battle under way', async () => {
    const running: BattleSession = {
      ...freshSession(),
      stage: 'battle',
      battle: createBattle({
        board: openBoard(),
        units: [
          { card: infantry, side: 'attacker', square: 'c2' },
          { card: infantry, side: 'defender', square: 'c7' },
        ],
      }),
    };
    const { runtime } = tableOf(running);

    const result = await runtime.submit({ type: 'session.install', battleId: 'battle-1', request: request() });

    expect(result).toMatchObject({ ok: false, reason: 'stage', message: 'a battle is already under way' });
    expect(runtime.session.battle).not.toBeNull();
  });
});

describe('the campaign seam', () => {
  it('answers with the battle ID it sent, and sends nothing when the request is bad', async () => {
    const sent: BattleCommand[] = [];
    const submit = async (command: BattleCommand): Promise<CommandResult> => {
      sent.push(command);
      return { ok: true, commandId: 'cmd-1', revision: 4 };
    };

    const created = await createBattleThrough(submit, request());
    expect(created).toMatchObject({ ok: true, revision: 4 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'session.install' });
    expect(created.ok && created.battleId).toBe((sent[0] as { battleId: string }).battleId);

    const refused = await createBattleThrough(submit, request({ units: [] }));
    expect(refused).toMatchObject({ ok: false, reason: 'invalid', problems: ['the request names no units'] });
    expect(sent).toHaveLength(1);
  });

  it('carries a refusal from the authority back to the caller', async () => {
    const submit = async (): Promise<CommandResult> =>
      ({ ok: false, commandId: 'cmd-1', revision: 2, reason: 'permission', message: 'only the GM can do that' });

    expect(await createBattleThrough(submit, request()))
      .toMatchObject({ ok: false, reason: 'permission', message: 'only the GM can do that' });
  });

  it('exposes createBattle and open on the module API', async () => {
    const { runtime } = tableOf();
    let opened = 0;
    const api = createModuleApi({
      submit: () => (command) => runtime.submit(command),
      open: async () => { opened += 1; },
      close: async () => {},
    });

    await api.open();
    const created = await api.createBattle(request());

    expect(opened).toBe(1);
    expect(created.ok).toBe(true);
    expect(created.ok && runtime.session.battleId).toBe(created.ok && created.battleId);
  });

  it('refuses createBattle before the host is built', async () => {
    const api = createModuleApi({ submit: () => null, open: async () => {}, close: async () => {} });

    expect(await api.createBattle(request())).toMatchObject({ ok: false, reason: 'battle' });
  });
});

describe('a record written before source bindings', () => {
  it('revives with no sources rather than failing to load', () => {
    const older = { ...freshSession() } as Partial<BattleSession>;
    delete older.sources;

    expect(reviveSession(older)?.sources).toEqual([]);
  });
});
