import { describe, expect, it } from 'vitest';
import { createBattle, type BattleState, type UnitCard } from '../engine/index.js';
import { submissionOf } from '../runtime/interactions.js';
import {
  freshSession, isBattleSession, migrateLegacySave, SCHEMA_VERSION, type BattleSession,
} from '../runtime/session.js';
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

  it('yields a fresh session for a corrupt save', async () => {
    const storage = fakeStorage({ [LEGACY_KEY]: '{"setup": ', [SESSION_KEY]: 'not json at all' });

    const session = await createLocalRepository(storage).load();

    expect(isBattleSession(session)).toBe(true);
    expect(session.stage).toBe('setup');
    expect(session.battle).toBeNull();
    expect(session.setup.units.length).toBeGreaterThan(0);
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
      lastCommit: { commandId: 'c1', events: [], dice: [] },
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
    storage.setItem(SESSION_KEY, JSON.stringify({ ...older, ...held, revision: 9 }));

    const loaded = loadSessionSync(storage);

    expect(loaded.revision).toBe(9);
    expect(loaded.interactions.map((i) => i.kind)).toEqual(['night.recovery']);
    expect(submissionOf(loaded.interactions, 'night.recovery', 'attacker')).toEqual([{ unit: 'u0', activity: 'rally' }]);
    expect(submissionOf(loaded.interactions, 'night.recovery', 'defender')).toBeUndefined();
  });

  it('refuses a record of another schema version', () => {
    expect(migrateLegacySave({ setup: null })).toBeNull();
    expect(isBattleSession({ ...freshSession(), schemaVersion: SCHEMA_VERSION + 1 })).toBe(false);
    expect(isBattleSession({ ...freshSession(), battleId: '' })).toBe(false);
  });
});
