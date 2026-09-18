import { reconcile } from '../../runtime/reconcile.js';
import { migrateSession, type BattleSession } from '../../runtime/session.js';

/** Turns the session setting's raw `onChange` value into a session `reconcile` can compare
 * against. A foreign or corrupt value yields nothing to adopt, the same way a corrupt save
 * yields a fresh session elsewhere rather than a crash. */
export function parseDeliveredSession(raw: unknown): BattleSession | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    return migrateSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export interface SessionWatcher {
  readonly session: BattleSession;
  subscribe(listener: (session: BattleSession) => void): () => void;
  /**
   * The session setting's `onChange`, fed straight in. Every client adopts a delivered record
   * this way — the setting change is the one state channel the plan names, so even the client
   * that wrote it reaches its own next record through the same door as anybody else's.
   * `reconcile` is what keeps a stale or replayed delivery from moving it backward.
   */
  handleChange(raw: unknown): void;
}

export function createSessionWatcher(initial: BattleSession): SessionWatcher {
  let current = initial;
  const listeners = new Set<(session: BattleSession) => void>();
  return {
    get session() { return current; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    handleChange(raw) {
      const delivered = parseDeliveredSession(raw);
      if (!delivered) return;
      const next = reconcile(current, delivered);
      if (!next) return;
      current = next;
      for (const listener of [...listeners]) listener(current);
    },
  };
}
