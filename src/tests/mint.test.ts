import { describe, expect, it } from 'vitest';
import { createBattle, type UnitCard } from '../engine/index.js';
import { sessionAtSite, sessionFromRequest } from '../runtime/campaign.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { interactionOf } from '../runtime/interactions.js';
import type { MintPort, SessionRepository } from '../runtime/ports.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { fakeArchive, openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

/** Every draw takes the next number, so a value in the record names the draw that wrote it. */
function countingMint(): MintPort {
  let n = 0;
  return { seed: () => ++n, id: (kind) => `${kind}-${++n}` };
}

/** Every draw is written down by kind, in order. */
function recordingMint(): { mint: MintPort; draws: string[] } {
  const draws: string[] = [];
  let n = 0;
  return {
    draws,
    mint: {
      seed: () => { draws.push('seed'); return ++n; },
      id: (kind) => { draws.push(kind); return `${kind}-${++n}`; },
    },
  };
}

function setupSession(): BattleSession {
  return {
    ...freshSession(),
    setup: {
      spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 0 },
      board: openBoard('square', 9),
      units: [{ id: 'first', card: infantry, side: 'attacker', square: 'c1', engines: [] }],
      emplacements: [],
    },
  };
}

function duskSession(): BattleSession {
  const battle = createBattle({
    board: openBoard(),
    units: [{ card: infantry, side: 'attacker', square: 'c2' }, { card: kobolds, side: 'defender', square: 'c7' }],
  });
  battle.phase = 'ended';
  battle.endedBy = 'dusk';
  battle.winner = 'draw';
  return { ...freshSession(), stage: 'battle', battle };
}

function fakeRepository(session: BattleSession): SessionRepository {
  let saved = session;
  return {
    async load() { return saved; },
    async save(next) { saved = structuredClone(next); },
  };
}

const runtimeOn = (session: BattleSession, mint?: MintPort) =>
  createRuntime({ repository: fakeRepository(session), archive: fakeArchive(), session, mint });

describe('the authority mint', () => {
  it('names an added unit and an added emplacement', async () => {
    const runtime = runtimeOn(setupSession(), countingMint());
    await runtime.submit({ type: 'army.addUnit', side: 'defender', card: kobolds });
    await runtime.submit({ type: 'army.addEmplacement', side: 'attacker', engine: 'Catapult' });
    expect(runtime.session.setup.units.map((u) => u.id)).toEqual(['first', 'unit-1']);
    expect(runtime.session.setup.emplacements.map((e) => e.id)).toEqual(['eq-2']);
  });

  it('seeds and names a generated force that names no seed', async () => {
    const minted = runtimeOn(setupSession(), countingMint());
    const seeded = runtimeOn(setupSession());
    await minted.submit({ type: 'army.generateForce', side: 'defender' });
    await seeded.submit({ type: 'army.generateForce', side: 'defender', seed: 1 });
    const force = (runtime: typeof minted) => runtime.session.setup.units.filter((u) => u.side === 'defender');
    expect(force(minted)).not.toHaveLength(0);
    expect(force(minted).map((u) => u.card)).toEqual(force(seeded).map((u) => u.card));
    expect(force(minted).map((u) => u.id)).toEqual(force(minted).map((_, i) => `unit-${i + 2}`));
  });

  it('seeds a rerolled field', async () => {
    const runtime = runtimeOn(setupSession(), countingMint());
    await runtime.submit({ type: 'setup.rerollSeed' });
    expect(runtime.session.setup.spec.seed).toBe(1);
    expect(runtime.session.setup.board!.spec.seed).toBe(1);
  });

  it('names the readiness interaction a declaration opens', async () => {
    const runtime = runtimeOn(setupSession(), countingMint());
    expect(await runtime.submit({ type: 'army.declareReady', side: 'attacker', ready: true })).toMatchObject({ ok: true });
    expect(interactionOf(runtime.session.interactions, 'army.readiness')!.id).toBe('int-1');
  });

  it('seeds and names the example force a reset brings back', async () => {
    const runtime = runtimeOn(setupSession(), countingMint());
    await runtime.submit({ type: 'battle.reset' });
    expect(runtime.session.setup.spec.seed).toBe(1);
    expect(runtime.session.setup.units.map((u) => u.id))
      .toEqual(['unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7']);
  });

  it('draws a fresh session\'s battle ID before its example setup', () => {
    const { mint, draws } = recordingMint();
    freshSession(undefined, mint);
    expect(draws).toEqual(['battle', 'seed', 'unit', 'unit', 'unit', 'unit', 'unit', 'unit']);
  });

  it('draws for a requested battle only its battle ID and the IDs of the pieces it names', () => {
    const { mint, draws } = recordingMint();
    sessionFromRequest({
      board: { base: 'plains', size: 9, feature: 'none', seed: 7 },
      units: [
        { card: infantry, side: 'attacker', equipment: ['Battering Ram'] },
        { card: kobolds, side: 'defender' },
      ],
      emplacements: [{ engine: 'Ballista', side: 'defender' }],
    }, undefined, mint);
    expect([...draws].sort()).toEqual(['battle', 'eq', 'eq', 'unit', 'unit']);
  });

  it('draws for bare ground at a site only its battle ID', () => {
    const { mint, draws } = recordingMint();
    sessionAtSite('hex-1', { board: { base: 'plains', size: 9, feature: 'none', seed: 7 } }, undefined, mint);
    expect(draws).toEqual(['battle']);
  });

  it('seeds a fresh field for the next day', async () => {
    const runtime = runtimeOn(duskSession(), countingMint());
    expect(await runtime.submit({ type: 'continuation.chooseBattlefield', spec: { base: 'forest' } })).toMatchObject({ ok: true });
    expect(runtime.session.battle!.nextBoard!.spec.seed).toBe(1);
  });
});
