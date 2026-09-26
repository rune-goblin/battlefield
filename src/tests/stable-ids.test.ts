import { describe, expect, it } from 'vitest';
import { createBattle, ENGINES, type BattleSetup, type UnitCard } from '../engine/index.js';
import { migrateLegacySave, reviveSession } from '../runtime/migrate.js';
import { randomMint, type BattleSetupDraft, type SetupUnit } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const card = (name: string, level: number): UnitCard => ({ name, level, role: 'infantry', tactics: [] });
const catapult = ENGINES.find((e) => e.name === 'Catapult')!;

function roster(): BattleSetupDraft {
  const unit = (name: string, level: number, square: string): SetupUnit =>
    ({ id: randomMint.id('unit'), card: card(name, level), side: 'attacker', square, engines: [] });
  return {
    spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 1 },
    board: openBoard(),
    units: [
      { ...unit('Vanguard', 4, 'b2'), engines: [{ id: randomMint.id('eq'), name: catapult.name }] },
      unit('Line', 3, 'c2'),
      unit('Reserve', 2, 'd2'),
      { ...unit('Kobolds', 3, 'c7'), side: 'defender' },
    ],
    emplacements: [{ id: randomMint.id('eq'), name: catapult.name, side: 'attacker', square: 'b1' }],
  };
}

function battleFrom(setup: BattleSetupDraft) {
  const battleSetup: BattleSetup = {
    board: setup.board!,
    units: setup.units.map((u) => ({
      id: u.id,
      card: u.card,
      side: u.side,
      square: u.square!,
      engines: u.engines.map((e) => ({ id: e.id, card: catapult })),
    })),
    engines: setup.emplacements.map((e) => ({ id: e.id, card: catapult, side: e.side, square: e.square! })),
  };
  return createBattle(battleSetup);
}

describe('stable piece IDs', () => {
  it('leaves every other ID unchanged when the first roster entry is removed', () => {
    const setup = roster();
    const before = battleFrom(setup);

    setup.units.splice(0, 1);
    const after = battleFrom(setup);

    expect(after.units.map((u) => u.id)).toEqual(before.units.slice(1).map((u) => u.id));
    expect(after.engines.map((e) => e.id)).toEqual(before.engines.map((e) => e.id));
  });

  it('carries the equipment ID of an attached engine from setup into the battle', () => {
    const setup = roster();
    const battle = battleFrom(setup);

    expect(battle.units[0].engines.map((e) => e.id)).toEqual(setup.units[0].engines.map((e) => e.id));
    expect(battle.engines[0].id).toBe(setup.emplacements[0].id);
  });

  it('keeps the u0… IDs of a migrated battle and gives its engines IDs', () => {
    const battle = createBattle({
      board: openBoard(),
      units: [
        { card: card('Line', 3), side: 'attacker', square: 'c2', engines: [{ card: catapult }] },
        { card: card('Kobolds', 3), side: 'defender', square: 'c7' },
      ],
    });
    for (const u of battle.units) for (const e of u.engines) delete (e as { id?: string }).id;
    const legacy = {
      stage: 'battle',
      setup: { spec: { base: 'plains', feature: 'none', construction: null, seed: 7 }, board: openBoard(), units: [], emplacements: [] },
      battle,
    };

    const session = migrateLegacySave(JSON.parse(JSON.stringify(legacy)))!;

    expect(session.battle!.units.map((u) => u.id)).toEqual(['u0', 'u1']);
    expect(session.battle!.units[0].engines[0].id).toMatch(/^eq-/);
  });

  it('gives a setup written without IDs one per piece, engines included', () => {
    const legacy = {
      schemaVersion: 1,
      rulesVersion: '2026-09-18',
      battleId: 'battle-old',
      revision: 3,
      stage: 'setup',
      setup: {
        spec: { base: 'plains', size: 9, feature: 'none', construction: null, seed: 7 },
        board: openBoard(),
        units: [
          { card: card('Line', 3), side: 'attacker', square: 'c2', engines: [catapult.name] },
          { card: card('Kobolds', 3), side: 'defender', square: 'c7', engines: [] },
        ],
        emplacements: [{ name: catapult.name, side: 'attacker', square: 'b1' }],
      },
      battle: null,
      lastCommit: null,
      recentCommandIds: [],
    };

    const session = reviveSession(JSON.parse(JSON.stringify(legacy)))!;

    const ids = [
      ...session.setup.units.map((u) => u.id),
      ...session.setup.units.flatMap((u) => u.engines.map((e) => e.id)),
      ...session.setup.emplacements.map((e) => e.id),
    ];
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(session.setup.units[0].engines[0].name).toBe(catapult.name);
  });
});
