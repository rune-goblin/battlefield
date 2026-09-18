import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type Side, type UnitCard } from '../engine/index.js';
import type { BattleCommand, CommandEnvelope } from '../runtime/commands.js';
import type { SideControl } from '../runtime/control.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SeatPolicy } from '../runtime/policy.js';
import type { PresencePort, SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

const control = (seats: Record<Side, string[]>): SideControl =>
  ({ mode: 'manual', gmSide: 'attacker', seats, next: { attacker: 0, defender: 0 } });

/** Two units a side, so each side takes two activations in a round. */
function tableSession(seats: Record<Side, string[]>): BattleSession {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: infantry, side: 'attacker', square: 'd2' },
      { card: kobolds, side: 'defender', square: 'c7' },
      { card: kobolds, side: 'defender', square: 'd7' },
    ],
  });
  return { ...freshSession(), stage: 'battle', battle, control: control(seats) };
}

function fakeRepository(): SessionRepository & { readonly saves: BattleSession[] } {
  const saves: BattleSession[] = [];
  return {
    saves,
    async load() { return saves[saves.length - 1]; },
    async save(next) { saves.push(structuredClone(next)); },
  };
}

function presenceOf(offline: string[] = []): PresencePort {
  return {
    online: (userId) => !offline.includes(userId), gmUserId: () => GM, users: () => [], displayName: (id) => id,
  };
}

function tableOf(session: BattleSession, offline: string[] = []) {
  const repository = fakeRepository();
  const policy: SeatPolicy = { userId: GM, presence: presenceOf(offline) };
  const runtime = createRuntime({ repository, archive: fakeArchive(), session, dice: scriptedRng([10]), policy });
  const envelope = (userId: string, commandId: string, command: BattleCommand, revision?: number): CommandEnvelope =>
    ({ battleId: session.battleId, commandId, expectedRevision: revision ?? runtime.session.revision, userId, command });
  return { runtime, repository, envelope };
}

describe('revision and command identity', () => {
  it('commits a resent command once', async () => {
    const { runtime, repository, envelope } = tableOf(tableSession({ attacker: ['A'], defender: ['D'] }));
    const resent = envelope(GM, 'c-1', { type: 'activation.end', unitId: 'u0' });

    const first = await runtime.execute(resent);
    const second = await runtime.execute(resent);

    expect(first).toMatchObject({ ok: true, revision: 1 });
    expect(second).toMatchObject({ ok: true, revision: 1 });
    expect(repository.saves).toHaveLength(1);
    expect(runtime.history).toHaveLength(1);
    expect(runtime.session.battle!.activated).toEqual(['u0']);
  });

  it('rejects a stale revision with the revision that stands', async () => {
    const { runtime, repository, envelope } = tableOf(tableSession({ attacker: ['A'], defender: ['D'] }));
    await runtime.execute(envelope(GM, 'c-1', { type: 'activation.end', unitId: 'u0' }, 0));

    const stale = await runtime.execute(envelope(GM, 'c-2', { type: 'activation.end', unitId: 'u1' }, 0));

    expect(stale).toMatchObject({ ok: false, reason: 'revision', revision: 1 });
    expect(repository.saves).toHaveLength(1);
    expect(runtime.session.battle!.activated).toEqual(['u0']);
  });
});

/** The holders of each successive turn, with a turn that stays put counted once. */
async function turnsThrough(
  seats: Record<Side, string[]>, commands: BattleCommand[], offline: string[] = [],
): Promise<string[]> {
  const { runtime } = tableOf(tableSession(seats), offline);
  const holders: string[] = [];
  for (const command of commands) {
    const result = await runtime.submit(command);
    expect(result.ok).toBe(true);
    const turn = runtime.session.turn!;
    if (holders[holders.length - 1] !== turn) holders.push(turn);
  }
  return holders;
}

/** Each side's two units end their turns in order, twice over, which carries the battle from
 * round 1 into round 2 and gives the attacker four activations. */
const twoRounds: BattleCommand[] = [
  { type: 'activation.select', unitId: 'u0' },
  { type: 'activation.end', unitId: 'u0' },
  { type: 'activation.end', unitId: 'u2' },
  { type: 'activation.end', unitId: 'u1' },
  { type: 'activation.end', unitId: 'u3' },
  { type: 'activation.end', unitId: 'u0' },
  { type: 'activation.end', unitId: 'u2' },
];

describe('turn rotation', () => {
  it('rotates three seats through two units and runs on into the next round', async () => {
    const holders = await turnsThrough({ attacker: ['A', 'B', 'C'], defender: ['D'] }, twoRounds);

    expect(holders.filter((h) => h !== 'D')).toEqual(['A', 'B', 'C', 'A']);
  });

  it('skips a seat whose user is offline', async () => {
    const holders = await turnsThrough({ attacker: ['A', 'B', 'C'], defender: ['D'] }, twoRounds, ['B']);

    expect(holders.filter((h) => h !== 'D')).toEqual(['A', 'C', 'A', 'C']);
  });

  it('gives a side with nobody online to the GM', async () => {
    const holders = await turnsThrough({ attacker: ['A'], defender: ['D'] }, twoRounds, ['D']);

    expect(holders).toEqual(['A', GM, 'A', GM, 'A', GM, 'A']);
  });

  it('refuses a tactical command from a player outside the turn', async () => {
    const { runtime, repository, envelope } = tableOf(tableSession({ attacker: ['A', 'B'], defender: ['D'] }));
    await runtime.submit({ type: 'activation.select', unitId: 'u0' });
    expect(runtime.session.turn).toBe('A');

    const result = await runtime.execute(envelope('B', 'c-2', {
      type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'u0' },
    }));

    expect(result).toMatchObject({ ok: false, reason: 'permission', revision: 1 });
    expect(repository.saves).toHaveLength(1);
    expect(runtime.session.battle!.units[0].guard).toBeNull();
  });

  it('hands the open turn to another seat on the pending side', async () => {
    const { runtime, envelope } = tableOf(tableSession({ attacker: ['A', 'B'], defender: ['D'] }));
    await runtime.submit({ type: 'activation.select', unitId: 'u0' });

    expect(await runtime.submit({ type: 'turn.reassign', userId: 'D' })).toMatchObject({ ok: false, reason: 'engine' });
    await runtime.submit({ type: 'turn.reassign', userId: 'B' });

    expect(runtime.session.turn).toBe('B');
    const result = await runtime.execute(envelope('B', 'c-9', {
      type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'u0' },
    }));
    expect(result.ok).toBe(true);
  });

  it('restores the turn holder and the pointers on undo', async () => {
    const { runtime } = tableOf(tableSession({ attacker: ['A', 'B'], defender: ['D'] }));
    await runtime.submit({ type: 'activation.select', unitId: 'u0' });
    await runtime.submit({ type: 'activation.end', unitId: 'u0' });
    expect(runtime.session.turn).toBe('D');

    await runtime.submit({ type: 'session.undo' });

    expect(runtime.session.turn).toBe('A');
    expect(runtime.session.control.next).toEqual({ attacker: 1, defender: 0 });
    expect(runtime.session.battle!.activated).toEqual([]);
  });
});

describe('side decisions and seating', () => {
  const setupSession = (seats: Record<Side, string[]>): BattleSession =>
    ({ ...freshSession(), control: control(seats) });

  it('accepts a side decision from any user seated on that side', async () => {
    const { runtime, envelope } = tableOf(setupSession({ attacker: ['A'], defender: ['D', 'E'] }));

    const own = await runtime.execute(envelope('E', 'c-1', { type: 'army.addUnit', side: 'defender', card: kobolds }));
    const other = await runtime.execute(envelope('E', 'c-2', { type: 'army.addUnit', side: 'attacker', card: infantry }));

    expect(own.ok).toBe(true);
    expect(other).toMatchObject({ ok: false, reason: 'permission' });
  });

  it('seats the table on the GM\'s assignment', async () => {
    const { runtime } = tableOf(setupSession({ attacker: ['A'], defender: ['D'] }));

    await runtime.submit({
      type: 'control.assign',
      control: { mode: 'auto', gmSide: 'defender', seats: { attacker: [], defender: [] } },
    });

    // `auto` rebuilds from the host's roster, which this table reports as empty but for the GM.
    expect(runtime.session.control).toMatchObject({ mode: 'auto', gmSide: 'defender', seats: { attacker: [], defender: [GM] } });
  });
});
