import { STORED_NAMES, type SessionRepository } from '../../runtime/ports.js';
import { migrateLegacySave, reviveSession } from '../../runtime/migrate.js';
import { freshSession, type BattleSession } from '../../runtime/session.js';
import { createJsonStore, UnreadableStore, type JsonStore, type TextCell } from '../json-store.js';
import type { StoreRecovery } from '../store-recovery.js';

/** The pre-session save: `{ stage, setup, battle }`, written by the app before Wave 1.1. */
export const LEGACY_KEY = 'battlefield.v4';
export const SESSION_KEY = 'battlefield.session.v1';

export interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const webCell = (storage: WebStorage, key: string): TextCell => ({
  get: () => storage.getItem(key),
  set: (value) => storage.setItem(key, value),
});

function read(storage: WebStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

const sessionStore = (storage: WebStorage, onUnreadable?: () => void): JsonStore<BattleSession | null> =>
  createJsonStore(webCell(storage, SESSION_KEY), { name: STORED_NAMES.session, empty: () => null, accept: reviveSession, onUnreadable });

function loadFrom(store: JsonStore<BattleSession | null>, storage: WebStorage): BattleSession {
  let current: BattleSession | null;
  try {
    current = store.read();
  } catch (error) {
    // Both keys stay as they are, and the fresh session lives in memory: the store refuses
    // every save over the unreadable one.
    if (error instanceof UnreadableStore) return freshSession();
    throw error;
  }
  if (current) {
    // The pre-session save stands until one written from it has come back intact.
    try { storage.removeItem(LEGACY_KEY); } catch { /* read-only store */ }
    return current;
  }
  return migrateLegacySave(read(storage, LEGACY_KEY)) ?? freshSession();
}

/** The store answers without waiting, and the app is seeded before its first render, so the
 * read stays synchronous under the promise the port asks for. */
export const loadSessionSync = (storage: WebStorage = globalThis.localStorage): BattleSession =>
  loadFrom(sessionStore(storage), storage);

export function createLocalRepository(
  storage: WebStorage = globalThis.localStorage, recovery?: StoreRecovery,
): SessionRepository {
  const store = sessionStore(storage, () => recovery?.report('session'));
  recovery?.track('session', store);
  return {
    async load() {
      return loadFrom(store, storage);
    },
    save: (session) => store.write(session),
  };
}
