import { describe, expect, it } from 'vitest';
import { createBattle, parse, scriptedRng, unit, type Rng, type UnitCard } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { SessionRepository } from '../runtime/ports.js';
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
  it('yields one free strike event for a maneuver that fails its escape', async () => {
    // Reflex +14 against the Kobolds' DC 17: a 2 misses the grip, so the holder strikes free.
    const runtime = runtimeOn(battleSession('c3'), scriptedRng([2, 10]));

    const result = await runtime.submit({
      type: 'action.resolve', action: { type: 'maneuver', activity: 1, to: 'c1', unit: 'u0' },
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

  it('yields the route a move walked', async () => {
    const runtime = runtimeOn(battleSession(), scriptedRng([10]));

    await runtime.submit({ type: 'action.resolve', action: { type: 'move', to: 'c4', unit: 'u0' } });

    expect(runtime.session.lastCommit!.events).toMatchObject([
      { type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c4', route: ['c2', 'c3', 'c4'] },
    ]);
    expect(runtime.session.lastCommit!.dice).toEqual([]);
  });
});
