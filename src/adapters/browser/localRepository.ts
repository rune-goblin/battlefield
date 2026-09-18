import type { SessionRepository } from '../../runtime/ports.js';
import { freshSession, migrateLegacySave, reviveSession, type BattleSession } from '../../runtime/session.js';

/** The pre-session save: `{ stage, setup, battle }`, written by the app before Wave 1.1. */
export const LEGACY_KEY = 'battlefield.v4';
export const SESSION_KEY = 'battlefield.session.v1';

export interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function read(storage: WebStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The store answers without waiting, and the app is seeded before its first render, so the
 * read stays synchronous under the promise the port asks for. */
export function loadSessionSync(storage: WebStorage = globalThis.localStorage): BattleSession {
  const current = reviveSession(read(storage, SESSION_KEY));
  if (current) {
    // The pre-session save stands until one written from it has come back intact.
    try { storage.removeItem(LEGACY_KEY); } catch { /* read-only store */ }
    return current;
  }
  return migrateLegacySave(read(storage, LEGACY_KEY)) ?? freshSession();
}

export function createLocalRepository(storage: WebStorage = globalThis.localStorage): SessionRepository {
  return {
    async load() {
      return loadSessionSync(storage);
    },
    async save(session: BattleSession) {
      storage.setItem(SESSION_KEY, JSON.stringify(session));
    },
  };
}
