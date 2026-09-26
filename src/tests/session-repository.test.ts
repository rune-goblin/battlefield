import { describe, expect, it } from 'vitest';
import { createBattle, COMBATANTS, ENGINES, OFFICIAL, type BattleState, type UnitCard } from '../engine/index.js';
import { hotSeatControl } from '../runtime/control.js';
import { submissionOf } from '../runtime/interactions.js';
import { migrateLegacySave, migrateSession, reviveSession, STEPS } from '../runtime/migrate.js';
import { freshSession, isBattleSession, SCHEMA_VERSION, type BattleSession } from '../runtime/session.js';
import {
  createLocalRepository, loadSessionSync, LEGACY_KEY, SESSION_KEY, type WebStorage,
} from '../adapters/browser/localRepository.js';
import { openBoard } from './helpers.js';

const card: UnitCard = { name: 'Line', level: 3, role: 'infantry', salvo: 'medium', tactics: [] };

const battleState = (): BattleState => createBattle({ board: openBoard(), units: [
  { card, side: 'attacker', square: 'c2' },
  { card, side: 'defender', square: 'c7' },
] });

const legacySave = (battle: BattleState | null) => JSON.stringify({
  stage: battle ? 'battle' : 'defenders',
  setup: {
    spec: { base: 'plains', feature: 'none', construction: null, seed: 7 },
    board: openBoard(),
    emplacements: [],
    units: [{ card, side: 'attacker', square: 'c2', engines: [] }],
  },
  battle,
});

function fakeStorage(seed: Record<string, string> = {}): WebStorage & { items: Record<string, string> } {
  const items = { ...seed };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
}

describe('the browser session repository', () => {
  it('restores source movement modes in old catalogue saves and preserves a custom battle Speed', () => {
    const session = { ...freshSession(), schemaVersion: 1 };
    const old = structuredClone(COMBATANTS.find(c => c.name === 'Wyvern Flight')!);
    delete old.sheet!.otherSpeeds;
    session.setup.units = [{ id: 'flyer', card: old, side: 'attacker', square: 'c2', engines: [] }];
    session.battle = createBattle({ board: openBoard(), units: [{ id: 'flyer', card: old, side: 'attacker', square: 'c2' }] });
    delete session.battle.units[0].movementRates;
    delete session.battle.units[0].sourceSpeed;
    session.battle.units[0].speed = 10;
    const custom = structuredClone(session);
    custom.battle!.units[0].speed = 40;
    expect(reviveSession(custom)!.battle!.units[0].speed).toBe(40);
    const restored = reviveSession(session)!;
    expect(restored.battle!.units[0]).toMatchObject({ speed: 40, flying: true,
      movementRates: { land: 20, fly: 40, swim: 0 },
      sourceSpeed: { speed: 20, otherSpeeds: [{ type: 'fly', value: 60 }] } });
    expect(reviveSession(structuredClone(restored))).toEqual(restored);
  });

  it('upgrades the previous movement scale once and preserves the fraction of a Move in reserve', () => {
    const session = { ...freshSession(), schemaVersion: 1 };
    const army = structuredClone(COMBATANTS.find(c => c.name === 'Wyvern Flight')!);
    session.setup.units = [{ id: 'flyer', card: army, side: 'attacker', square: 'c2', engines: [] }];
    session.battle = createBattle({ board: openBoard(), units: [{ id: 'flyer', card: army, side: 'attacker', square: 'c2' }] });
    Object.assign(session.battle.units[0], { speed: 20, feet: 10, movementRates: { land: 10, fly: 20, swim: 0 } });
    const fixed = reviveSession(session)!;
    expect(fixed.battle!.units[0]).toMatchObject({ speed: 40, feet: 20, movementRates: { land: 20, fly: 40, swim: 0 } });
    expect(reviveSession(structuredClone(fixed))).toEqual(fixed);
  });
  it('repairs old catalogue spell stats without changing morale, wounds or custom overrides', () => {
    const session = { ...freshSession(), schemaVersion: 1 };
    const old = structuredClone(OFFICIAL.find(c => c.name === 'Apprentice Magician Clique')!);
    delete old.sheet!.spellAttack;
    delete old.sheet!.spellDc;
    delete old.sheet!.battleName;
    delete old.sheet!.salvoName;
    session.setup.units = [{ id: 'mage', card: old, side: 'attacker', square: 'c2', engines: [] }];
    session.battle = createBattle({ board: openBoard(), units: [{ id: 'mage', card: old, side: 'attacker', square: 'c2' }] });
    const unit = session.battle.units[0];
    unit.wounds = 3;
    unit.disorder = 1;
    expect(unit.stats.spellAttack).toBe(9);
    const custom = structuredClone(session);
    custom.setup.units[0].card.overrides!.spellAttack = 17;
    custom.battle!.units[0].stats.spellAttack = 17;
    expect(reviveSession(custom)!.battle!.units[0].stats.spellAttack).toBe(17);
    const changedSheet = structuredClone(session);
    changedSheet.setup.units[0].card.sheet!.ac = 30;
    expect(reviveSession(changedSheet)!.battle!.units[0].stats.spellAttack).toBe(9);
    const fixed = reviveSession(session)!;
    expect(fixed.battle!.units[0]).toMatchObject({ wounds: 3, disorder: 1, stats: { spellAttack: 15, spellDc: 22 },
      attackSources: { strike: 'Sparking Wands', volley: 'Barrage of Force' } });
    expect(reviveSession(structuredClone(fixed))).toEqual(fixed);
  });

  it('migrates a v4 save with its unit IDs and log intact', async () => {
    const battle = battleState();
    const storage = fakeStorage({ [LEGACY_KEY]: legacySave(battle) });

    const session = await createLocalRepository(storage).load();

    expect(session.schemaVersion).toBe(SCHEMA_VERSION);
    expect(session.stage).toBe('battle');
    expect(session.battleId).not.toBe('');
    expect(session.revision).toBe(0);
    expect(session.battle!.units.map((u) => u.id)).toEqual(battle.units.map((u) => u.id));
    expect(session.battle!.log).toEqual(battle.log);
    expect(session.setup.units[0].card.name).toBe('Line');
    expect(session.setup.spec.size).toBe(openBoard().squares.length);
  });

  it('keeps the v4 save until a session written from it has loaded once', async () => {
    const storage = fakeStorage({ [LEGACY_KEY]: legacySave(battleState()) });
    const repository = createLocalRepository(storage);

    const migrated = await repository.load();
    expect(storage.items[LEGACY_KEY]).toBeDefined();

    await repository.save(migrated);
    expect(storage.items[LEGACY_KEY]).toBeDefined();

    const reloaded = await repository.load();
    expect(storage.items[LEGACY_KEY]).toBeUndefined();
    expect(reloaded.battleId).toBe(migrated.battleId);
    expect(typeof storage.items[SESSION_KEY]).toBe('string');
  });

  it('loads fresh over a corrupt save and refuses to save over it', async () => {
    const storage = fakeStorage({ [LEGACY_KEY]: '{"setup": ', [SESSION_KEY]: 'not json at all' });
    const repository = createLocalRepository(storage);

    const session = await repository.load();

    expect(isBattleSession(session)).toBe(true);
    expect(session.stage).toBe('setup');
    expect(session.battle).toBeNull();
    await expect(repository.save(session)).rejects.toThrow('could not be read');
    expect(storage.items[SESSION_KEY]).toBe('not json at all');
    expect(storage.items[LEGACY_KEY]).toBe('{"setup": ');
  });

  it('drops a battle missing a field the board reads and keeps the setup', async () => {
    const battle = battleState();
    for (const u of battle.units) delete (u as Partial<typeof u>).selfBuffs;
    const storage = fakeStorage({ [LEGACY_KEY]: legacySave(battle) });

    const session = await createLocalRepository(storage).load();

    expect(session.battle).toBeNull();
    expect(session.stage).toBe('setup');
    expect(session.setup.spec.seed).toBe(7);
  });

  it('rejects when the store fails to write', async () => {
    const storage = fakeStorage();
    storage.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };

    await expect(createLocalRepository(storage).save(freshSession())).rejects.toThrow('quota');
  });

  it('reads a stored session back unchanged', async () => {
    const storage = fakeStorage();
    const repository = createLocalRepository(storage);
    const session: BattleSession = {
      ...freshSession(),
      revision: 4,
      stage: 'battle',
      battle: battleState(),
      lastCommit: { commandId: 'c1', events: [], dice: [], userId: 'gm' },
      recentCommandIds: ['c1'],
    };

    await repository.save(session);

    expect(await repository.load()).toEqual(session);
  });

  it('seeds without waiting on the promise', () => {
    const storage = fakeStorage({ [LEGACY_KEY]: legacySave(null) });
    expect(loadSessionSync(storage).setup.spec.seed).toBe(7);
  });
});

describe('the session record', () => {
  it('folds the per-side submissions of an older record into its interactions', () => {
    const storage = fakeStorage();
    const { interactions, ...older } = freshSession();
    const held = { nightDeclarations: { attacker: [{ unit: 'u0', activity: 'rally' }] }, nextDeployment: {} };
    storage.setItem(SESSION_KEY, JSON.stringify({ ...older, ...held, schemaVersion: 1, revision: 9 }));

    const loaded = loadSessionSync(storage);

    expect(loaded.revision).toBe(9);
    expect(loaded.interactions.map((i) => i.kind)).toEqual(['night.recovery']);
    expect(submissionOf(loaded.interactions, 'night.recovery', 'attacker')).toEqual([{ unit: 'u0', activity: 'rally' }]);
    expect(submissionOf(loaded.interactions, 'night.recovery', 'defender')).toBeUndefined();
  });

  it('refuses a record of a newer schema rather than rebuilding it from its setup', () => {
    expect(migrateSession({ ...freshSession(), schemaVersion: SCHEMA_VERSION + 1 })).toBeNull();
  });

  it('refuses a record of another schema version', () => {
    expect(migrateLegacySave({ setup: null })).toBeNull();
    expect(isBattleSession({ ...freshSession(), schemaVersion: SCHEMA_VERSION + 1 })).toBe(false);
    expect(isBattleSession({ ...freshSession(), battleId: '' })).toBe(false);
  });
});

function halfHexBattle(): BattleState {
  const battle = createBattle({ board: openBoard(), units: [
    { card, side: 'attacker', square: 'c2', engines: [{ card: ENGINES.find((e) => e.name === 'Catapult')! }] },
    { card, side: 'defender', square: 'c7' },
  ] });
  battle.units[0].engines[0].speed = 5;
  return battle;
}

/** A schema-1 record written before the fields that schema gained without a bump. */
function schemaOneRecord() {
  const { site, sources, writeback, turn, recentCommandIds, control, ...older } = freshSession();
  return { ...older, schemaVersion: 1, stage: 'battle', battle: halfHexBattle(), lastCommit: { commandId: 'c1' } };
}

describe('schema migration', () => {
  it('steps a schema-1 record up to the current schema with its backfills', () => {
    const revived = reviveSession(schemaOneRecord())!;

    expect(revived).toMatchObject({
      schemaVersion: SCHEMA_VERSION, site: null, sources: [], writeback: null, turn: null, recentCommandIds: [],
      control: hotSeatControl(), lastCommit: { commandId: 'c1', events: [], dice: [], userId: '' },
    });
    expect(revived.battle!.units[0].engines[0].speed).toBe(10);
  });

  it('validates a current record and repairs nothing in it', () => {
    const current: BattleSession = { ...freshSession(), stage: 'battle', battle: halfHexBattle() };

    expect(reviveSession(structuredClone(current))).toEqual(current);
  });

  it('refuses a current record that lacks a field rather than backfilling it', () => {
    const { sources, ...lacking } = freshSession();

    expect(reviveSession(lacking)).toBeNull();
  });

  it('has a step from every older schema', () => {
    for (let version = 1; version < SCHEMA_VERSION; version++) expect(STEPS[version]).toBeTypeOf('function');
  });

  it('loads a schema-1 browser save and saves over it', async () => {
    const storage = fakeStorage({ [SESSION_KEY]: JSON.stringify({ ...schemaOneRecord(), revision: 5 }) });

    const loaded = loadSessionSync(storage);

    expect(loaded).toMatchObject({ schemaVersion: SCHEMA_VERSION, revision: 5 });
    await expect(createLocalRepository(storage).save(loaded)).resolves.toBeUndefined();
    expect(JSON.parse(storage.items[SESSION_KEY])).toMatchObject({ schemaVersion: SCHEMA_VERSION, revision: 5 });
  });
});

describe('fortification tier alignment', () => {
  it('migrates barricades across saved maps, preserves breaches, and leaves tiers 1–4 intact', () => {
    const session = { ...freshSession(), schemaVersion: 1 };
    const oldBoard = () => {
      const board = openBoard();
      board.spec.construction = { kind: 'fort', tier: 0 };
      board.walls = {
        'c4|c5': { tier: 0, boxes: 1, remaining: 1, inside: 'c5', gate: { open: true } },
        'd4|d5': { tier: 0, boxes: 1, remaining: 0 },
        'e4|e5': { tier: 4, boxes: 5, remaining: 3 },
      };
      return board;
    };
    session.setup.spec.construction = { kind: 'fort', tier: 0 };
    session.setup.board = oldBoard();
    session.battle = battleState();
    session.battle.board = oldBoard();
    session.battle.nextBoard = oldBoard();
    session.battle.previousBattlefields = [{ day: 1, board: oldBoard(), engines: [] }];
    const migrated = reviveSession(structuredClone(session))!;
    expect(migrated.setup.spec.construction?.tier).toBe(1);
    for (const board of [migrated.setup.board!, migrated.battle!.board, migrated.battle!.nextBoard!, migrated.battle!.previousBattlefields![0].board]) {
      expect(board.spec.construction?.tier).toBe(1);
      expect(board.walls['c4|c5']).toEqual({ tier: 1, boxes: 2, remaining: 2, inside: 'c5', gate: { open: true } });
      expect(board.walls['d4|d5']).toEqual({ tier: 1, boxes: 2, remaining: 0 });
      expect(board.walls['e4|e5']).toEqual({ tier: 4, boxes: 5, remaining: 3 });
    }
    expect(reviveSession(structuredClone(migrated))).toEqual(migrated);
  });
});
