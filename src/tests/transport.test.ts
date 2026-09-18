import { describe, expect, it } from 'vitest';
import { createMemoryNetwork, type LinkFaults, type MemoryNetwork } from '../adapters/memory/memoryTransport.js';
import { createPresentation, type PresentationSink } from '../app/presentation.js';
import { createBattle, scriptedRng, unit, type Side, type UnitCard } from '../engine/index.js';
import type { CommandResult, TacticalAction } from '../runtime/commands.js';
import { createRuntime, type Runtime } from '../runtime/createRuntime.js';
import type { SeatPolicy } from '../runtime/policy.js';
import type { PresencePort, SessionRepository } from '../runtime/ports.js';
import { createClientStore, reconcile, type ClientStore } from '../runtime/reconcile.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const SEATED = ['A', 'B', 'D'];
const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

const presence: PresencePort = { online: () => true, gmUserId: () => GM, users: () => [GM, ...SEATED] };
const policy: SeatPolicy = { userId: GM, presence };

const guard = (unitId: string): TacticalAction => ({ type: 'guard', activity: 1, unit: unitId });

/** Two units a side, so each side takes two activations in a round and the attacker's two
 * seats each hold a turn. */
function tableSession(): BattleSession {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: infantry, side: 'attacker', square: 'd2' },
      { card: kobolds, side: 'defender', square: 'c7' },
      { card: kobolds, side: 'defender', square: 'd7' },
    ],
  });
  const seats: Record<Side, string[]> = { attacker: ['A', 'B'], defender: ['D'] };
  return {
    ...freshSession(), stage: 'battle', battle,
    control: { mode: 'manual', gmSide: 'attacker', seats, next: { attacker: 0, defender: 0 } },
  };
}

function fakeRepository(): SessionRepository {
  let last: BattleSession | null = null;
  return {
    async load() { return last ?? freshSession(); },
    async save(next) { last = structuredClone(next); },
  };
}

interface Table {
  authority: Runtime;
  net: MemoryNetwork;
  clients: ClientStore[];
  /** The revisions each client adopted, in order. */
  adopted: Map<string, number[]>;
}

function table(faultsFor: (index: number) => LinkFaults = () => ({})): Table {
  const session = tableSession();
  const authority = createRuntime({
    repository: fakeRepository(), archive: fakeArchive(), session, dice: scriptedRng([10]), policy,
  });
  const net = createMemoryNetwork(authority);
  const adopted = new Map<string, number[]>();
  const clients = SEATED.map((userId, index) => {
    const client = createClientStore({
      transport: net.connect(faultsFor(index)), userId, session: structuredClone(session),
    });
    const seen: number[] = [];
    adopted.set(userId, seen);
    client.subscribe((record) => seen.push(record.revision));
    return client;
  });
  return { authority, net, clients, adopted };
}

const sinkInto = (played: string[]): PresentationSink => ({
  route: (id) => played.push(`route:${id}`),
  flash: (id) => played.push(`flash:${id}`),
  burst: (cell) => played.push(`burst:${cell}`),
  resolved: () => played.push('resolved'),
});

/**
 * A round played from the seats. The GM opens the turn, each holder acts and ends, and the GM
 * closes the round with two commits back to back — a link holding both can hand them over in
 * either order. Every delivery is released before the next command, so each submitter builds
 * its command from the record it can see.
 */
async function play({ authority, net, clients }: Table): Promise<void> {
  const as = (userId: string) => clients.find((c) => c.userId === userId)!;
  const done = async (result: Promise<CommandResult>) => {
    expect(await result).toMatchObject({ ok: true });
    net.flush();
  };

  await done(authority.submit({ type: 'activation.select', unitId: 'u0' }));
  await done(as('A').submit({ type: 'action.resolve', action: guard('u0') }));
  await done(as('A').submit({ type: 'activation.end', unitId: 'u0' }));
  await done(as('D').submit({ type: 'activation.end', unitId: 'u2' }));
  await done(as('B').submit({ type: 'activation.end', unitId: 'u1' }));
  expect(await authority.submit({ type: 'activation.select', unitId: 'u3' })).toMatchObject({ ok: true });
  expect(await authority.submit({ type: 'activation.end', unitId: 'u3' })).toMatchObject({ ok: true });
  net.flush();
}

const rising = (revisions: number[]) => revisions.every((r, i) => i === 0 || r > revisions[i - 1]);

/** Client A misses one record in the middle of the round and asks for nothing afterwards. */
const LOST_REVISION = 5;

const FAULTS: Record<string, (index: number) => LinkFaults> = {
  'a sound link': () => ({}),
  'delayed deliveries': () => ({ delay: true }),
  'duplicated deliveries': () => ({ duplicate: true }),
  'records out of order': () => ({ delay: true, reorder: true }),
  'a dropped record': (index) => (index === 0 ? { drop: (revision) => revision === LOST_REVISION } : {}),
};

describe('three clients and one authority', () => {
  for (const [fault, faultsFor] of Object.entries(FAULTS)) {
    it(`converges under ${fault}`, async () => {
      const t = table(faultsFor);

      await play(t);

      expect(t.authority.session.revision).toBe(7);
      for (const client of t.clients) {
        expect(client.session).toEqual(t.authority.session);
        const seen = t.adopted.get(client.userId)!;
        expect(seen.at(-1)).toBe(t.authority.session.revision);
        expect(rising(seen)).toBe(true);
      }
    });
  }

  it('repairs a dropped record from the next one rather than replaying it', async () => {
    const t = table(FAULTS['a dropped record']);

    await play(t);

    expect(t.net.links[0].delivered).not.toContain(LOST_REVISION);
    expect(t.adopted.get('A')).not.toContain(LOST_REVISION);
    expect(t.clients[0].session).toEqual(t.authority.session);
  });

  it('adopts a duplicated record once', async () => {
    const t = table(FAULTS['duplicated deliveries']);

    await play(t);

    expect(t.net.links[0].delivered).toHaveLength(14);
    expect(t.adopted.get('A')).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('reconciliation', () => {
  it('adopts a newer record and ignores an older or equal one', () => {
    const current = { ...freshSession(), revision: 4 };

    expect(reconcile(current, { ...current, revision: 5 })?.revision).toBe(5);
    expect(reconcile(current, { ...current, revision: 4 })).toBeNull();
    expect(reconcile(current, { ...current, revision: 3 })).toBeNull();
  });

  it('refuses a delayed action rather than letting it reach another activation', async () => {
    const { authority, net, clients } = table();
    const a = clients[0];
    await authority.submit({ type: 'activation.select', unitId: 'u0' });
    net.flush();
    expect(a.session).toMatchObject({ revision: 1, turn: 'A' });

    // A hears nothing from here on, so its copy stands at the activation it can see while the
    // GM plays that activation out and opens the defender's.
    net.links[0].faults.delay = true;
    await authority.submit({ type: 'activation.end', unitId: 'u0' });
    await authority.submit({ type: 'activation.select', unitId: 'u2' });

    const late = await a.submit({ type: 'action.resolve', action: guard('u0') });

    expect(late).toMatchObject({ ok: false, reason: 'revision', revision: 3 });
    expect(unit(authority.session.battle!, 'u0').guard).toBeNull();
    expect(authority.session.battle!.active).toBe('u2');
    expect(a.session.revision).toBe(1);

    net.flush();
    expect(a.session.revision).toBe(3);
  });

  it('adopts the record on joining and presents nothing', async () => {
    const { authority, net, clients } = table();
    await authority.submit({ type: 'activation.select', unitId: 'u0' });
    net.flush();

    const joining = createClientStore({ transport: net.connect(), userId: 'B', session: freshSession() });
    const joined: string[] = [];
    const watching: string[] = [];
    const seated = createPresentation(clients[0].session);
    const arrived = createPresentation(joining.session);
    arrived.connect(sinkInto(joined));
    seated.connect(sinkInto(watching));
    joining.subscribe((record) => arrived.observe(record));
    clients[0].subscribe((record) => seated.observe(record));

    expect(await clients[0].submit({ type: 'action.resolve', action: { type: 'move', unit: 'u0', to: 'c3' } }))
      .toMatchObject({ ok: true });
    net.flush();

    expect(joining.session).toEqual(authority.session);
    expect(joining.session.revision).toBe(2);
    expect(joined).toEqual([]);
    // The same commit plays for the client that watched it happen.
    expect(watching).toEqual(['route:u0']);
  });
});
