import { describe, expect, it } from 'vitest';
import { createBattle, movePath, parse, scriptedRng, statusesOf, unit, type Rng, type UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

/** The defender stands where the test wants it, which deployment ranks would forbid. */
function battleSession(defender = 'c7'): BattleSession {
  const battle = createBattle({
    board: openBoard(),
    units: [
      { card: infantry, side: 'attacker', square: 'c2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
  });
  unit(battle, 'u1').square = parse(defender);
  return { ...freshSession(), stage: 'battle', battle };
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return {
    async load() { return saved; },
    async save(next) { saved = structuredClone(next); },
  };
}

function runtimeOn(session: BattleSession, dice: Rng) {
  return createRuntime({ repository: fakeRepository(session), archive: fakeArchive(), session, dice });
}

describe('execution events', () => {
  it('yields one free strike event for a Move that critically fails to get away', async () => {
    const runtime = runtimeOn(battleSession('c3'), scriptedRng([1, 10]));

    const result = await runtime.submit({
      type: 'action.resolve', action: { type: 'move', to: 'c1', unit: 'u0' },
    });

    expect(result.ok).toBe(true);
    const { events } = runtime.session.lastCommit!;
    expect(events.filter((e) => e.type === 'freeStrikeResolved')).toMatchObject([
      { unit: 'u1', target: 'u0' },
    ]);
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => `${result.commandId}:${i}`));
  });

  it('records both faces a Sure Strike throws', async () => {
    const strike = { type: 'fight', activity: 1, target: 'u1', unit: 'u0' } as const;
    const plain = runtimeOn(battleSession('c3'), scriptedRng([7]));
    await plain.submit({ type: 'action.resolve', action: strike });

    const sure = battleSession('c3');
    unit(sure.battle!, 'u0').sureStrike = true;
    const runtime = runtimeOn(sure, scriptedRng([7]));
    await runtime.submit({ type: 'action.resolve', action: strike });

    // Both dice fall the same way, so the pair keeps what the single roll kept: one extra face
    // in front of an otherwise identical transition.
    expect(runtime.session.lastCommit!.dice.slice(0, 2)).toEqual([7, 7]);
    expect(runtime.session.lastCommit!.dice).toEqual([7, ...plain.session.lastCommit!.dice]);
  });

  it('lands an attack on its target and the brace against its wound on the piece that rolled it', async () => {
    // A 19 hits, and the Kobolds roll a 10 to brace against the wound.
    const runtime = runtimeOn(battleSession('c3'), scriptedRng([19, 10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'fight', activity: 1, target: 'u1', unit: 'u0' } });

    const checks = runtime.session.lastCommit!.events.filter((e) => e.type === 'checkResolved');
    expect(checks.map((e) => [e.unit, e.lands])).toEqual([
      ['u0', { unit: 'u1', reads: 'attack' }],
      ['u1', { unit: 'u1', reads: 'brace' }],
    ]);
  });

  it('lands a missed attack on its target and the repulse on the attacker', async () => {
    // A 2 misses, so the attacker rolls a 10 against the repulse.
    const runtime = runtimeOn(battleSession('c3'), scriptedRng([1, 10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'fight', activity: 1, target: 'u1', unit: 'u0' } });

    const checks = runtime.session.lastCommit!.events.filter((e) => e.type === 'checkResolved');
    expect(checks.map((e) => [e.unit, e.lands])).toEqual([
      ['u0', { unit: 'u1', reads: 'attack' }],
      ['u0', { unit: 'u0', reads: 'repulse' }],
    ]);
  });

  it('yields the stance a unit takes as a status gained, like any other', async () => {
    const runtime = runtimeOn(battleSession(), scriptedRng([10]));

    const result = await runtime.submit({ type: 'action.resolve', action: { type: 'guard', activity: 1, unit: 'u0' } });

    expect(result.ok).toBe(true);
    expect(runtime.session.lastCommit!.events.filter((e) => e.type === 'conditionGained')).toMatchObject([
      { unit: 'u0', condition: 'guard' },
    ]);
  });

  it('yields the condition a critical miss leaves on the attacker', async () => {
    // A natural 1 misses critically and exposes the attacker; the 10 is its repulse save.
    const runtime = runtimeOn(battleSession('c3'), scriptedRng([1, 10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'fight', activity: 1, target: 'u1', unit: 'u0' } });

    expect(runtime.session.lastCommit!.events.filter((e) => e.type === 'conditionGained')).toMatchObject([
      { unit: 'u0', condition: 'exposed' },
    ]);
  });

  it('yields each condition a shot leaves, and a second pin on a piece already pinned', () => {
    const service = createActionResolutionService({ dice: scriptedRng([]) });
    const before = battleSession();
    const pinned = structuredClone(before);
    Object.assign(unit(pinned.battle!, 'u1'), { suppressedBy: 'u0', pinnedBy: 'u0' });
    const again = structuredClone(pinned);
    Object.assign(unit(again.battle!, 'u1'), { pinnedBy: 'u9' });

    expect(service.events(before, pinned).filter((e) => e.type === 'conditionGained')).toEqual([
      { type: 'conditionGained', unit: 'u1', condition: 'pinned' },
      { type: 'conditionGained', unit: 'u1', condition: 'suppressed' },
    ]);
    expect(service.events(pinned, again).filter((e) => e.type === 'conditionGained')).toEqual([
      { type: 'conditionGained', unit: 'u1', condition: 'pinned' },
    ]);
  });

  it('yields a buff as a status gained, in the order the board stacks them', () => {
    const service = createActionResolutionService({ dice: scriptedRng([]) });
    const before = battleSession();
    const buffed = structuredClone(before);
    Object.assign(unit(buffed.battle!, 'u0'), { inspired: true, aegis: { dc: 20 }, frightened: true });

    expect(service.events(before, buffed).filter((e) => e.type === 'conditionGained').map((e) => e.condition))
      .toEqual(['frightened', 'aegis', 'inspired']);
    expect(statusesOf(unit(buffed.battle!, 'u0'))).toEqual(['frightened', 'aegis', 'inspired']);
  });

  it('yields the route a move walked', async () => {
    const runtime = runtimeOn(battleSession(), scriptedRng([10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'move', to: 'c4', unit: 'u0' } });

    expect(runtime.session.lastCommit!.events).toMatchObject([
      { type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c4', route: ['c2', 'c3', 'c4'] },
    ]);
    expect(runtime.session.lastCommit!.dice).toEqual([]);
  });

  it('yields the route a move walked through its waypoints', async () => {
    const session = battleSession();
    const road = movePath(session.battle!, unit(session.battle!, 'u0'), 'c3', ['d2']).map((step) => step.cell);
    const runtime = runtimeOn(session, scriptedRng([10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'move', to: 'c3', unit: 'u0', waypoints: ['d2'] } });

    expect(road).toContain('d2');
    expect(runtime.session.lastCommit!.events.filter((e) => e.type === 'unitMoved')).toMatchObject([
      { type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c3', route: road },
    ]);
  });
});
