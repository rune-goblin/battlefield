import { describe, expect, it } from 'vitest';
import { scriptedRng } from '../engine/index.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { createFoundryArchive, ARCHIVE_LIMIT, type DownloadFile } from '../adapters/foundry/worldArchive.js';
import { createFoundrySessionRepository } from '../adapters/foundry/worldSessionRepository.js';
import type { WorldSettingStorage } from '../adapters/foundry/worldSettings.js';
import { createStoreRecovery } from '../adapters/store-recovery.js';
import { createSessionWatcher, parseDeliveredSession } from '../adapters/foundry/sessionWatcher.js';
import { freshControl } from '../runtime/control.js';
import { freshSession, SCHEMA_VERSION, type BattleSession } from '../runtime/session.js';

function fakeStorage(initial = ''): WorldSettingStorage {
  let value = initial;
  return {
    get: () => value,
    async set(v) { value = v; },
  };
}

describe('the Foundry session repository', () => {
  it('loads a fresh session from an unset setting and round-trips a save', async () => {
    const storage = fakeStorage();
    const repo = createFoundrySessionRepository(storage);
    const first = await repo.load();
    expect(first.revision).toBe(0);

    const changed: BattleSession = { ...first, revision: 3 };
    await repo.save(changed);
    expect(JSON.parse(storage.get()).revision).toBe(3);
    expect((await repo.load()).revision).toBe(3);
  });

  it('opens a new world with the GM on one army and the players on the other', async () => {
    const session = await createFoundrySessionRepository(fakeStorage()).load();
    expect(session.control).toMatchObject({ mode: 'auto', gmSide: 'defender' });
  });

  it('loads a schema-1 setting value and saves over it', async () => {
    const { sources, site, ...older } = freshSession();
    const storage = fakeStorage(JSON.stringify({ ...older, schemaVersion: 1, revision: 4 }));
    const repo = createFoundrySessionRepository(storage);

    const session = await repo.load();

    expect(session).toMatchObject({ schemaVersion: SCHEMA_VERSION, battleId: older.battleId, revision: 4, sources: [], site: null });
    await repo.save(session);
    expect(JSON.parse(storage.get())).toMatchObject({ schemaVersion: SCHEMA_VERSION, battleId: older.battleId });
  });

  it('loads fresh over a corrupt setting value and refuses to save over it', async () => {
    const storage = fakeStorage('not json');
    const repo = createFoundrySessionRepository(storage);
    const session = await repo.load();

    expect(session.revision).toBe(0);
    await expect(repo.save(session)).rejects.toThrow('could not be read');
    expect(storage.get()).toBe('not json');
  });
});

describe('the Foundry archive', () => {
  it('saves, lists, loads, exports, imports, and removes a battle', async () => {
    const archive = createFoundryArchive(fakeStorage());
    const session = freshSession();

    const entry = await archive.save('Night one', session);
    expect(await archive.list()).toEqual([entry]);
    expect(await archive.load(entry.slot)).toEqual(session);

    const exported = await archive.export(entry.slot);
    const imported = await archive.import(exported);
    expect(imported.slot).not.toBe(entry.slot);
    expect(await archive.load(imported.slot)).toEqual(session);

    await archive.remove(entry.slot);
    expect((await archive.list()).map((e) => e.slot)).toEqual([imported.slot]);
  });

  it('evicts the oldest slot to a downloaded file once the cap is reached', async () => {
    const storage = fakeStorage();
    const downloaded: string[] = [];
    const download: DownloadFile = (filename) => downloaded.push(filename);
    const archive = createFoundryArchive(storage, download);

    let firstSlot = '';
    for (let i = 0; i < ARCHIVE_LIMIT; i++) {
      const entry = await archive.save(`Save ${i}`, freshSession());
      if (i === 0) firstSlot = entry.slot;
    }
    expect((await archive.list())).toHaveLength(ARCHIVE_LIMIT);
    expect(downloaded).toHaveLength(0);

    await archive.save('One too many', freshSession());
    const remaining = await archive.list();
    expect(remaining).toHaveLength(ARCHIVE_LIMIT);
    expect(remaining.some((e) => e.slot === firstSlot)).toBe(false);
    expect(downloaded).toHaveLength(1);
  });
});

describe('an unreadable world setting', () => {
  it('keeps the saved battles and a newer session byte for byte and refuses every write over them', async () => {
    const corrupt = '[{"slot": "slot-1", "name": "Keep", "data": {}}, 42]';
    const archiveSetting = fakeStorage(corrupt);
    const newer = JSON.stringify({ ...freshSession(), schemaVersion: SCHEMA_VERSION + 1 });
    const sessionSetting = fakeStorage(newer);
    const recovery = createStoreRecovery({ mayRepair: () => true });
    const archive = createFoundryArchive(archiveSetting, () => {}, recovery);
    const repository = createFoundrySessionRepository(sessionSetting, recovery);
    const session = await repository.load();
    const runtime = createRuntime({ repository, archive, session, dice: scriptedRng([10]) });

    await expect(archive.save('Night one', session)).rejects.toThrow('could not be read');
    await expect(archive.remove('slot-1')).rejects.toThrow('could not be read');
    await expect(archive.import(JSON.stringify({ name: 'x', data: session }))).rejects.toThrow('could not be read');
    expect(await runtime.submit({ type: 'session.load', slot: 'slot-1' })).toMatchObject({ ok: false, reason: 'storage' });
    expect(archiveSetting.get()).toBe(corrupt);

    const result = await runtime.submit({ type: 'control.assign', control: freshControl('attacker') });
    expect(result).toMatchObject({ ok: false, reason: 'storage', message: expect.stringContaining('battle session') });
    expect(sessionSetting.get()).toBe(newer);
    expect(recovery.unreadable()).toEqual(['session', 'archive']);
  });
});

describe('the session setting delivered through reconcile', () => {
  it('adopts a newer delivered session and ignores a stale one', () => {
    const initial = freshSession();
    const watcher = createSessionWatcher(initial);
    const seen: BattleSession[] = [];
    watcher.subscribe((s) => seen.push(s));

    const newer: BattleSession = { ...initial, revision: 1 };
    watcher.handleChange(JSON.stringify(newer));
    expect(watcher.session.revision).toBe(1);
    expect(seen).toHaveLength(1);

    // A replayed or out-of-order delivery — including the writer's own commit echoed back —
    // never moves the record backward.
    watcher.handleChange(JSON.stringify(initial));
    expect(watcher.session.revision).toBe(1);
    expect(seen).toHaveLength(1);
  });

  it('ignores an unset or corrupt setting value', () => {
    expect(parseDeliveredSession('')).toBeNull();
    expect(parseDeliveredSession('not json')).toBeNull();
    expect(parseDeliveredSession(42)).toBeNull();
  });
});
