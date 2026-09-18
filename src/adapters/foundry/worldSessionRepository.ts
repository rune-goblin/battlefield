import type { SessionRepository } from '../../runtime/ports.js';
import { freshSession, migrateSession, type BattleSession } from '../../runtime/session.js';
import { gameSettingStorage, SESSION_SETTING, type WorldSettingStorage } from './worldSettings.js';

/** `SessionRepository` over the session world setting. `migrateSession` covers both the
 * current schema and the pre-session shape, since an archived or hand-edited slot can reach
 * this setting at either. */
export function createFoundrySessionRepository(
  storage: WorldSettingStorage = gameSettingStorage(SESSION_SETTING),
): SessionRepository {
  return {
    async load() {
      const raw = storage.get();
      if (!raw) return freshSession();
      try {
        return migrateSession(JSON.parse(raw)) ?? freshSession();
      } catch {
        return freshSession();
      }
    },
    async save(session: BattleSession) {
      await storage.set(JSON.stringify(session));
    },
  };
}
