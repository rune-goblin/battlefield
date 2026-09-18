import { describe, expect, it } from 'vitest';
import { createBattle, scriptedRng, type Side, type UnitCard } from '../engine/index.js';
import type { CommandEnvelope } from '../runtime/commands.js';
import { openTurn, reseatAssignment, type SideControl } from '../runtime/control.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { BattleArchive, PresencePort } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const GM = 'gm';
const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };

const presenceOf = (users: string[], offline: string[] = []): PresencePort => ({
  online: (userId) => !offline.includes(userId),
  gmUserId: () => GM,
  users: () => users,
  displayName: (userId) => `User ${userId}`,
});

const controlOf = (mode: 'auto' | 'manual', seats: Record<Side, string[]>): SideControl =>
  ({ mode, gmSide: 'attacker', seats, next: { attacker: 0, defender: 0 } });

function battleSession(control: SideControl): BattleSession {
  return {
    ...freshSession(),
    stage: 'battle',
    control,
    battle: createBattle({
      board: openBoard(),
      units: [
        { card: infantry, side: 'attacker', square: 'c2' },
        { card: infantry, side: 'defender', square: 'c7' },
      ],
    }),
  };
}

function tableOf(session: BattleSession, presence: PresencePort, archive: BattleArchive = fakeArchive()) {
  let stored = session;
  const runtime = createRuntime({
    repository: { async load() { return stored; }, async save(next) { stored = next; } },
    archive,
    session,
    dice: scriptedRng([10]),
    policy: { userId: GM, presence },
  });
  const as = (userId: string, commandId: string, command: CommandEnvelope['command']): CommandEnvelope =>
    ({ battleId: session.battleId, commandId, expectedRevision: runtime.session.revision, userId, command });
  return { runtime, as };
}

describe('world seating', () => {
  it('seats every user but the GM on the player side', () => {
    const control = controlOf('auto', { attacker: [], defender: [] });

    const assignment = reseatAssignment(control, presenceOf([GM, 'A', 'B']));

    expect(assignment).toMatchObject({ mode: 'auto', seats: { attacker: [GM], defender: ['A', 'B'] } });
  });

  it('seats the GM alone on both sides when the GM plays both', () => {
    const control: SideControl = { ...controlOf('auto', { attacker: [GM], defender: ['A', 'B'] }), gmSide: 'both' };

    const assignment = reseatAssignment(control, presenceOf([GM, 'A', 'B']));

    expect(assignment).toMatchObject({ mode: 'auto', gmSide: 'both', seats: { attacker: [GM], defender: [GM] } });
  });

  it('opens every turn to the GM when the GM plays both', async () => {
    const presence = presenceOf([GM, 'A']);
    const { runtime } = tableOf(battleSession(controlOf('auto', { attacker: [GM], defender: ['A'] })), presence);

    const result = await runtime.submit({
      type: 'control.assign', control: { mode: 'auto', gmSide: 'both', seats: { attacker: [], defender: [] } },
    });

    expect(result.ok).toBe(true);
    expect(openTurn(runtime.session.control, 'attacker', presence).holder).toBe(GM);
    expect(openTurn(runtime.session.control, 'defender', presence).holder).toBe(GM);
  });

  it('asks for no change when the seating already fits the table', () => {
    const control = controlOf('auto', { attacker: [GM], defender: ['A', 'B'] });

    expect(reseatAssignment(control, presenceOf([GM, 'A', 'B']))).toBeNull();
  });

  it('seats a user the world has just gained', () => {
    const control = controlOf('auto', { attacker: [GM], defender: ['A'] });

    const assignment = reseatAssignment(control, presenceOf([GM, 'A', 'B']));

    expect(assignment?.seats.defender).toEqual(['A', 'B']);
  });

  it('keeps an offline seat, and drops one the world no longer holds', () => {
    const away = controlOf('manual', { attacker: [GM], defender: ['A', 'B'] });

    expect(reseatAssignment(away, presenceOf([GM, 'A', 'B'], ['B']))).toBeNull();
    expect(reseatAssignment(away, presenceOf([GM, 'A']))?.seats.defender).toEqual(['A']);
  });

  it('commits the rebuilt seating through the executor', async () => {
    const presence = presenceOf([GM, 'A']);
    const { runtime } = tableOf(battleSession(controlOf('auto', { attacker: [], defender: [] })), presence);

    const control = reseatAssignment(runtime.session.control, presence)!;
    const result = await runtime.submit({ type: 'control.assign', control });

    expect(result.ok).toBe(true);
    expect(runtime.session.control.seats).toEqual({ attacker: [GM], defender: ['A'] });
  });

  it('names each seated user for the GM\'s seating controls', () => {
    const { runtime } = tableOf(battleSession(controlOf('auto', { attacker: [GM], defender: ['A'] })), presenceOf([GM, 'A'], ['A']));

    expect(runtime.tableUsers()).toEqual([
      { id: GM, name: 'User gm', online: true },
      { id: 'A', name: 'User A', online: false },
    ]);
  });
});

describe('the GM alone undoes and loads', () => {
  const seated = controlOf('manual', { attacker: ['A'], defender: ['D'] });

  it('refuses undo from a seated player and takes it from the GM', async () => {
    const { runtime, as } = tableOf(battleSession(seated), presenceOf([GM, 'A', 'D']));
    await runtime.submit({ type: 'activation.end', unitId: 'u0' });
    expect(runtime.history).toHaveLength(1);

    const refused = await runtime.execute(as('A', 'c-undo', { type: 'session.undo' }));

    expect(refused).toMatchObject({ ok: false, reason: 'permission' });
    expect(runtime.history).toHaveLength(1);
    expect(runtime.session.battle!.activated).toEqual(['u0']);

    expect(await runtime.submit({ type: 'session.undo' })).toMatchObject({ ok: true });
    expect(runtime.session.battle!.activated).toEqual([]);
  });

  it('refuses a load from a seated player and takes it from the GM', async () => {
    const archive = fakeArchive();
    const saved = await archive.save('yesterday', battleSession(seated));
    const { runtime, as } = tableOf(battleSession(seated), presenceOf([GM, 'A', 'D']), archive);

    const refused = await runtime.execute(as('A', 'c-load', { type: 'session.load', slot: saved.slot }));

    expect(refused).toMatchObject({ ok: false, reason: 'permission' });
    expect(runtime.session.revision).toBe(0);

    expect(await runtime.submit({ type: 'session.load', slot: saved.slot })).toMatchObject({ ok: true });
    expect(runtime.session.revision).toBe(1);
  });
});
