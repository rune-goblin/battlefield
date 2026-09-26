import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatPoster } from '../adapters/foundry/chat.js';
import { createBattlefieldHost, type BattlefieldHost } from '../adapters/foundry/host.js';
import { asSocketMessage, PROTOCOL_VERSION, type SocketChannel, type SocketMessage } from '../adapters/foundry/socket.js';
import { REPLY_TIMEOUT_MS } from '../adapters/foundry/socketTransport.js';
import { holdsAuthority, primaryGmRepository, type TableUsers } from '../adapters/foundry/table.js';
import { authorityStatus, commandsEnabled } from '../app/authority-notice.js';
import { createBattle, parse, scriptedRng, unit, type Side, type UnitCard } from '../engine/index.js';
import type { BattleCommand, CommandEnvelope } from '../runtime/commands.js';
import type { SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const PRIMARY = 'gm1';
const SECOND_GM = 'gm2';
const PLAYER = 'p1';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const select: BattleCommand = { type: 'activation.select', unitId: 'u0' };

/** A battle under way with the secondary GM holding the open turn, so its command is one the
 * policy accepts from a seat rather than from the GM's own override. */
function storedSession(): BattleSession {
  const seats: Record<Side, string[]> = { attacker: [SECOND_GM], defender: [PLAYER] };
  return {
    ...freshSession(),
    stage: 'battle',
    battle: createBattle({
      board: openBoard(),
      units: [
        { card: infantry, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'defender', square: 'c7' },
      ],
    }),
    control: { mode: 'manual', gmSide: 'attacker', seats, next: { attacker: 0, defender: 0 } },
    turn: SECOND_GM,
  };
}

/** Two adjacent units, so the primary GM can resolve an attack roll and draw a `checkResolved`
 * event for the chat publisher to read. The GM's own override needs no seat or open turn. The
 * defender deploys at its legal rank and is moved next to the attacker afterward, the way
 * `execution-events.test.ts` positions units `canDeploy` would otherwise refuse. */
function meleeSession(): BattleSession {
  const seats: Record<Side, string[]> = { attacker: [PRIMARY], defender: [PLAYER] };
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: infantry, side: 'defender', square: 'c7' },
    ],
  });
  unit(battle, 'u1').square = parse('c3');
  return {
    ...freshSession(),
    stage: 'battle',
    battle,
    control: { mode: 'manual', gmSide: 'attacker', seats, next: { attacker: 0, defender: 0 } },
    turn: PRIMARY,
  };
}

/** Foundry's socket: every client but the sender hears each message. */
function fakeBus() {
  const handlers = new Map<string, (message: unknown) => void>();
  const bus = {
    /** The wire loses replies while this is set, which is what a timeout is made of. */
    dropReplies: false,
    sent: [] as SocketMessage[],
    connect(userId: string): SocketChannel {
      return {
        emit(message) {
          bus.sent.push(message);
          if (bus.dropReplies && message.kind !== 'request') return;
          for (const [id, handler] of [...handlers]) if (id !== userId) handler(structuredClone(message));
        },
        on(handler) { handlers.set(userId, handler); },
      };
    },
  };
  return bus;
}

/** The world setting: one durable record, delivered to every client on each save. */
function fakeWorld(initial = storedSession()) {
  const listeners = new Set<(session: BattleSession) => void>();
  let stored = initial;
  let saves = 0;
  let held: Promise<void> | null = null;
  return {
    get saves() { return saves; },
    get stored() { return stored; },
    /** Hold the next load, so a request can arrive while the runtime is still being built. */
    hold(promise: Promise<void>) { held = promise; },
    /** The setting's current value, handed to every client as the module reaches `ready`. */
    publish() { for (const listener of [...listeners]) listener(structuredClone(stored)); },
    records: (listener: (session: BattleSession) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    repository: {
      async load() {
        if (held) { await held; held = null; }
        return structuredClone(stored);
      },
      async save(next) {
        saves += 1;
        stored = structuredClone(next);
        for (const listener of [...listeners]) listener(structuredClone(stored));
      },
    } as SessionRepository,
  };
}

interface FakeTable { primaryGm: string | null; active: string[]; world?: string[] }

const fakeUsers = (currentUserId: string, table: FakeTable): TableUsers => ({
  currentUserId: () => currentUserId,
  primaryGmId: () => table.primaryGm,
  isActive: (userId) => table.active.includes(userId),
  activeUserIds: () => [...table.active],
  worldUsers: () => (table.world ?? [PRIMARY, SECOND_GM, PLAYER]).map((id) => ({ id, name: id })),
});

interface Client { host: BattlefieldHost; status: string[] }

function clientOn(
  userId: string, bus: ReturnType<typeof fakeBus>, world: ReturnType<typeof fakeWorld>, table: FakeTable,
  chat?: ChatPoster,
): Client {
  const channel = bus.connect(userId);
  const status: string[] = [];
  const host = createBattlefieldHost({
    users: fakeUsers(userId, table),
    channel,
    repository: world.repository,
    archive: fakeArchive(),
    records: world.records,
    dice: scriptedRng([10]),
    chat,
    onAuthority: (report) => status.push(authorityStatus(report)),
  });
  channel.on((message) => host.handleMessage(message));
  return { host, status };
}

function table3(
  world = fakeWorld(), table: FakeTable = { primaryGm: PRIMARY, active: [PRIMARY, SECOND_GM, PLAYER] },
  chat?: ChatPoster,
) {
  const bus = fakeBus();
  const clients = {
    primary: clientOn(PRIMARY, bus, world, table, chat),
    second: clientOn(SECOND_GM, bus, world, table, chat),
    player: clientOn(PLAYER, bus, world, table, chat),
  };
  world.publish();
  const ready = Promise.all(Object.values(clients).map((c) => c.host.refresh()));
  return { bus, world, table, ...clients, ready };
}

afterEach(() => { vi.useRealTimers(); });

describe('the socket transport and the primary GM', () => {
  it('runs a secondary GM\'s command on the primary and nowhere else', async () => {
    const t = table3();
    await t.ready;
    expect(t.primary.host.runtime).not.toBeNull();
    expect(t.second.host.runtime).toBeNull();
    expect(t.player.host.runtime).toBeNull();

    const result = await t.second.host.submit(select);

    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect(t.world.saves).toBe(1);
    expect(t.world.stored.battle!.active).toBe('u0');
    expect(t.primary.host.runtime!.session.revision).toBe(1);
    // One request on the wire, one reply: the player's client heard both and executed neither.
    expect(t.bus.sent.map((m) => m.kind)).toEqual(['request', 'result']);
  });

  it('commits once when a lost reply is followed by a resend of the same command ID', async () => {
    vi.useFakeTimers();
    const t = table3();
    await t.ready;
    const envelope: CommandEnvelope = {
      battleId: t.world.stored.battleId,
      commandId: 'cmd-resent',
      expectedRevision: 0,
      userId: SECOND_GM,
      command: select,
    };

    t.bus.dropReplies = true;
    const lost = t.second.host.transport.request(envelope);
    await vi.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

    expect(await lost).toMatchObject({ ok: false, reason: 'timeout' });
    // The command itself reached the authority and committed; only the answer was lost.
    expect(t.world.saves).toBe(1);

    t.bus.dropReplies = false;
    const resent = await t.second.host.transport.request(envelope);

    expect(resent).toMatchObject({ ok: true, revision: 1 });
    expect(t.world.saves).toBe(1);
    expect(t.primary.host.runtime!.session.revision).toBe(1);
  });

  it('waits ten seconds for a reply', () => {
    expect(REPLY_TIMEOUT_MS).toBe(10_000);
  });

  it('holds a request until the runtime is built', async () => {
    const world = fakeWorld();
    let release = (): void => {};
    world.hold(new Promise<void>((resolve) => { release = resolve; }));
    const t = table3(world);

    const pending = t.second.host.submit(select);
    await Promise.resolve();
    expect(t.primary.host.runtime).toBeNull();
    expect(world.saves).toBe(0);

    release();
    await t.ready;

    expect(await pending).toMatchObject({ ok: true });
    expect(world.saves).toBe(1);
  });

  it('refuses a command while no GM is at the table', async () => {
    const t = table3(fakeWorld(), { primaryGm: null, active: [SECOND_GM, PLAYER] });
    await t.ready;

    expect(await t.player.host.submit(select)).toMatchObject({ ok: false, reason: 'permission' });
    expect(t.world.saves).toBe(0);
    expect(t.player.status.at(-1)).toBe('absent');
    expect(commandsEnabled('absent')).toBe(false);
  });

  it('refuses a command from a user the table does not know', async () => {
    const t = table3(fakeWorld(), { primaryGm: PRIMARY, active: [PRIMARY, SECOND_GM] });
    await t.ready;

    const result = await t.player.host.transport.request({
      battleId: t.world.stored.battleId, commandId: 'cmd-stranger', expectedRevision: 0,
      userId: PLAYER, command: select,
    });

    expect(result).toMatchObject({ ok: false, reason: 'permission' });
    expect(t.world.saves).toBe(0);
  });

  it('refuses to save once the authority has moved', async () => {
    const t = table3();
    await t.ready;

    // The GM's own connection drops between the command's arrival and its write.
    t.table.primaryGm = null;
    const result = await t.primary.host.submit(select);

    expect(result).toMatchObject({ ok: false, reason: 'storage' });
    expect(t.world.saves).toBe(0);
    expect(t.primary.host.runtime!.session.revision).toBe(0);
  });

  it('loads the committed session on the new primary and starts with empty history', async () => {
    const t = table3();
    await t.ready;
    await t.second.host.submit(select);
    expect(t.primary.host.runtime!.history).toHaveLength(0);
    await t.primary.host.submit({ type: 'activation.end', unitId: 'u0' });
    expect(t.primary.host.runtime!.history).toHaveLength(1);

    t.table.primaryGm = SECOND_GM;
    await Promise.all([t.primary.host.refresh(), t.second.host.refresh(), t.player.host.refresh()]);

    expect(t.primary.host.runtime).toBeNull();
    expect(t.second.host.runtime!.session.revision).toBe(t.world.stored.revision);
    expect(t.second.host.runtime!.history).toHaveLength(0);
    expect(t.player.status).toContain('handoff');
  });
});

describe('world seating on the primary GM', () => {
  const autoSession = (): BattleSession => ({
    ...storedSession(),
    control: { mode: 'auto', gmSide: 'attacker', seats: { attacker: [], defender: [] }, next: { attacker: 0, defender: 0 } },
  });

  it('rebuilds the player side when the world gains a user, and commits nothing when it has not changed', async () => {
    const table: FakeTable = { primaryGm: PRIMARY, active: [PRIMARY, PLAYER], world: [PRIMARY, PLAYER] };
    const t = table3(fakeWorld(autoSession()), table);
    await t.ready;
    expect(t.world.stored.control.seats).toEqual({ attacker: [PRIMARY], defender: [PLAYER] });
    const committed = t.world.saves;

    table.world = [PRIMARY, PLAYER, SECOND_GM];
    await t.primary.host.reseat();

    expect(t.world.stored.control.seats).toEqual({ attacker: [PRIMARY], defender: [PLAYER, SECOND_GM] });
    expect(t.world.saves).toBe(committed + 1);

    await t.primary.host.reseat();

    expect(t.world.saves).toBe(committed + 1);
  });

  it('leaves the seating to the primary GM', async () => {
    const table: FakeTable = { primaryGm: PRIMARY, active: [PRIMARY, PLAYER], world: [PRIMARY, PLAYER] };
    const t = table3(fakeWorld(autoSession()), table);
    await t.ready;
    const committed = t.world.saves;

    table.world = [PRIMARY, PLAYER, SECOND_GM];
    await Promise.all([t.second.host.reseat(), t.player.host.reseat()]);

    expect(t.world.saves).toBe(committed);
  });
});

describe('the primary GM\'s chat publisher', () => {
  it('posts one chat card per checkResolved event, stamped with its event ID', async () => {
    const posted: { eventId: string; face: number | null }[] = [];
    const chat: ChatPoster = { post: async (card) => { posted.push({ eventId: card.eventId, face: card.face }); } };
    const t = table3(fakeWorld(meleeSession()), undefined, chat);
    await t.ready;

    const result = await t.primary.host.submit({
      type: 'action.resolve', action: { type: 'fight', activity: 1, target: { kind: 'unit', ids: ['u1'] }, unit: 'u0' },
    });

    expect(result.ok).toBe(true);
    // A miss with this scripted roll also draws the repulsed-attacker Will save, so the melee
    // yields two real checks, and each posts its own card under its own event ID.
    const events = t.primary.host.runtime!.session.lastCommit!.events.filter((e) => e.type === 'checkResolved');
    expect(events).toHaveLength(2);
    expect(posted).toEqual(events.map((e) => ({ eventId: e.id, face: 10 })));
  });
});

describe('the envelope guard', () => {
  const request = {
    protocolVersion: PROTOCOL_VERSION, kind: 'request', requestId: 'r1', commandId: 'c1',
    battleId: 'b1', expectedRevision: 0, userId: PLAYER, command: select,
  };

  it('keeps this protocol and drops everything else', () => {
    expect(asSocketMessage(request)).toEqual(request);
    expect(asSocketMessage({ ...request, protocolVersion: 2 })).toBeNull();
    expect(asSocketMessage({ ...request, kind: 'broadcast' })).toBeNull();
    expect(asSocketMessage({ ...request, command: undefined })).toBeNull();
    expect(asSocketMessage({ ...request, expectedRevision: 'soon' })).toBeNull();
    expect(asSocketMessage({ action: 'kingdom:endTurn', data: {} })).toBeNull();
    expect(asSocketMessage(null)).toBeNull();
    expect(asSocketMessage('hello')).toBeNull();
  });

  it('executes nothing from foreign traffic', async () => {
    const t = table3();
    await t.ready;

    t.primary.host.handleMessage({ action: 'kingdom:endTurn', data: { unitId: 'u0' } });
    t.primary.host.handleMessage({ ...request, protocolVersion: 99 });
    await Promise.resolve();

    expect(t.world.saves).toBe(0);
  });
});

describe('the authority as one client reads it', () => {
  it('names the state of the table', () => {
    const held = { primaryGm: PRIMARY, handingOff: false, unanswered: false };
    expect(authorityStatus(held)).toBe('held');
    expect(authorityStatus({ ...held, primaryGm: null })).toBe('absent');
    expect(authorityStatus({ ...held, handingOff: true })).toBe('handoff');
    expect(authorityStatus({ ...held, unanswered: true })).toBe('unanswered');
    // A lost reply and a handoff both leave the table playable; nobody to execute does not.
    expect(commandsEnabled('unanswered')).toBe(true);
    expect(commandsEnabled('handoff')).toBe(true);
    expect(commandsEnabled('absent')).toBe(false);
  });

  it('holds the authority only where activeGM names this client', () => {
    const table: FakeTable = { primaryGm: PRIMARY, active: [PRIMARY, SECOND_GM] };
    expect(holdsAuthority(fakeUsers(PRIMARY, table))).toBe(true);
    expect(holdsAuthority(fakeUsers(SECOND_GM, table))).toBe(false);
    table.primaryGm = null;
    expect(holdsAuthority(fakeUsers(PRIMARY, table))).toBe(false);
  });

  it('rejects a save from a client that is no longer the primary', async () => {
    const table: FakeTable = { primaryGm: PRIMARY, active: [PRIMARY] };
    const world = fakeWorld();
    const guarded = primaryGmRepository(world.repository, fakeUsers(PRIMARY, table));
    await guarded.save(world.stored);
    expect(world.saves).toBe(1);

    table.primaryGm = SECOND_GM;
    await expect(guarded.save(world.stored)).rejects.toThrow();
    expect(world.saves).toBe(1);
  });
});
