import { describe, expect, it, vi } from 'vitest';
import { archiveStore, createJsonStore, type TextCell } from '../adapters/json-store.js';
import { createLocalArchive } from '../adapters/browser/localArchive.js';
import { createLocalRepository, type WebStorage } from '../adapters/browser/localRepository.js';
import { createStoreRecovery } from '../adapters/store-recovery.js';
import type { StoredRecord, StoreRecoveryPort } from '../runtime/ports.js';
import { createNotificationService, type Notification } from '../app/notifications.js';
import { bindRecovery, connectRecovery } from '../app/store-recovery.js';

function cell(initial: string | null): TextCell & { value: string | null } {
  const c = { value: initial, get: () => c.value, set: (v: string) => { c.value = v; } };
  return c;
}

function webStorage(items: Record<string, string>): WebStorage {
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
}

describe('a JSON store over an unreadable cell', () => {
  it('hands back the corrupt bytes, clears to absent, and takes the next write', async () => {
    const stored = cell('{"broken": ');
    const store = createJsonStore<number[]>(stored, {
      name: 'numbers', empty: () => [], accept: (p) => Array.isArray(p) ? p as number[] : null,
    });
    expect(store.readable()).toBe(false);
    expect(store.raw()).toBe('{"broken": ');

    await store.clear();
    expect(stored.value).toBe('');
    expect(store.readable()).toBe(true);
    await store.write([1, 2]);
    expect(stored.value).toBe('[1,2]');
  });
});

describe('the archive store', () => {
  it('reads an entry with no name as unreadable and reports it', () => {
    const stored = cell(JSON.stringify([{ slot: 's', data: {} }]));
    const recovery = createStoreRecovery({ mayRepair: () => true });
    const store = archiveStore(stored, recovery);
    recovery.probe();

    expect(store.readable()).toBe(false);
    expect(() => store.read()).toThrow();
    expect(recovery.unreadable()).toEqual(['archive']);
  });
});

describe('the store recovery', () => {
  it('clears one unreadable record and leaves the other flagged byte for byte', async () => {
    const items: Record<string, string> = {
      'battlefield.session.v1': '{"not": "a session"',
      'battlefield.archive.v1': '{"not": "a list"}',
    };
    const storage = webStorage(items);
    const recovery = createStoreRecovery({ mayRepair: () => true });
    createLocalRepository(storage, recovery);
    createLocalArchive(storage, recovery);
    recovery.probe();
    expect([...recovery.unreadable()].sort()).toEqual(['archive', 'session']);

    await recovery.clear('archive');
    expect(recovery.unreadable()).toEqual(['session']);
    expect(items['battlefield.session.v1']).toBe('{"not": "a session"');
    expect(recovery.raw('session')).toBe('{"not": "a session"');
  });
});

function fakePort(mayRepair: boolean, records: StoredRecord[]): StoreRecoveryPort & { clear: ReturnType<typeof vi.fn> } {
  let unreadable = records;
  const listeners = new Set<() => void>();
  return {
    unreadable: () => unreadable,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    mayRepair,
    raw: () => 'broken',
    clear: vi.fn(async (record: StoredRecord) => {
      unreadable = unreadable.filter((r) => r !== record);
      for (const listener of listeners) listener();
    }),
  };
}

function watch(port: StoreRecoveryPort) {
  bindRecovery(port);
  const notifications = createNotificationService();
  let shown: readonly Notification[] = [];
  notifications.subscribe((messages) => { shown = messages; });
  const disconnect = connectRecovery(notifications);
  const notice = (id: string) => shown.find((n) => n.id === id);
  const press = (id: string, label: string) => notice(id)!.actions!.find((a) => a.label === label)!.run();
  return { notice, press, disconnect };
}

describe('the unreadable save notice', () => {
  it('asks before it clears, and clears once on confirmation', async () => {
    const port = fakePort(true, ['session']);
    const { notice, press, disconnect } = watch(port);
    expect(notice('unreadable-session')?.dismissible).toBe(false);

    press('unreadable-session', 'Start fresh');
    expect(port.clear).not.toHaveBeenCalled();
    expect(notice('unreadable-session')?.title).toBe('Clear the stored battle session?');

    press('unreadable-session', 'Clear and start fresh');
    await vi.waitFor(() => expect(notice('unreadable-session')).toBeUndefined());
    expect(port.clear).toHaveBeenCalledOnce();
    disconnect();
  });

  it('offers a viewer who may not repair nothing to press', () => {
    const { notice, disconnect } = watch(fakePort(false, ['archive']));
    expect(notice('unreadable-archive')).toMatchObject({ tone: 'warning' });
    expect(notice('unreadable-archive')?.actions).toBeUndefined();
    disconnect();
  });

  it('clears once even when the confirm action is pressed twice while a clear is in flight', async () => {
    const port = fakePort(true, ['session']);
    let resolveClear!: () => void;
    port.clear.mockImplementation(() => new Promise<void>((resolve) => { resolveClear = resolve; }));
    const { notice, press, disconnect } = watch(port);

    press('unreadable-session', 'Start fresh');
    press('unreadable-session', 'Clear and start fresh');
    press('unreadable-session', 'Clear and start fresh');
    expect(port.clear).toHaveBeenCalledOnce();

    resolveClear();
    await vi.waitFor(() => expect(notice('unreadable-session')).toBeUndefined());
    expect(port.clear).toHaveBeenCalledOnce();
    disconnect();
  });
});
