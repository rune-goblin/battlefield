import { freshControl } from '../../runtime/control.js';
import type { SessionRepository } from '../../runtime/ports.js';
import { freshSession, migrateSession, type BattleSession } from '../../runtime/session.js';
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
): SessionRepository {
  return {
    async load() {
      const raw = storage.get();
      if (!raw) return freshTable();
      try {
        return migrateSession(JSON.parse(raw)) ?? freshTable();
      } catch {
        return freshTable();
      }
    },
    async save(session: BattleSession) {
      await storage.set(JSON.stringify(session));
    },
  };
}
