import { freshControl } from '../../runtime/control.js';
import type { SessionRepository } from '../../runtime/ports.js';
import { migrateSession } from '../../runtime/migrate.js';
import { freshSession, type BattleSession } from '../../runtime/session.js';
import { createJsonStore, UnreadableStore } from '../json-store.js';
import type { StoreRecovery } from '../store-recovery.js';
import { gameSettingStorage, SESSION_SETTING, type WorldSettingStorage } from './worldSettings.js';

// proto: the GM's default army is the defender, as an imported battle's is.
/** A new world's table: the GM takes one army and every player the other, which the host seats
 * on its first roster read. */
const freshTable = (): BattleSession => ({ ...freshSession(), control: freshControl('defender') });

/** `SessionRepository` over the session world setting. `migrateSession` covers both the
 * current schema and the pre-session shape, since an archived or hand-edited slot can reach
 * this setting at either. */
export function createFoundrySessionRepository(
  storage: WorldSettingStorage = gameSettingStorage(SESSION_SETTING),
  recovery?: StoreRecovery,
): SessionRepository {
  const store = createJsonStore<BattleSession | null>(storage, {
    name: 'battle session', empty: () => null, accept: migrateSession, onUnreadable: () => recovery?.report('session'),
  });
  recovery?.track('session', store);
  return {
    async load() {
      try {
        return store.read() ?? freshTable();
      } catch (error) {
        // The fresh table lives in memory only: every save over the setting is refused.
        if (error instanceof UnreadableStore) return freshTable();
        throw error;
      }
    },
    save: (session) => store.write(session),
  };
}
