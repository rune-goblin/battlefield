import { siteEntryOf } from '../../runtime/memorySites.js';
import type { BattleSites, SiteEntry } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import { gameSettingStorage, SITES_SETTING, type WorldSettingStorage } from './worldSettings.js';

interface StoredSite extends SiteEntry { data: unknown }

function readAll(storage: WorldSettingStorage): Record<string, StoredSite> {
  try {
    const parsed: unknown = JSON.parse(storage.get() || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, StoredSite> : {};
  } catch {
    return {};
  }
}

/** `BattleSites` over the sites world setting: one parked record to a kingdom-map hex. */
// proto: every parked battle shares one setting, so each park rewrites them all. Reserved for
// review with the archive's own ten-slot cap.
export function createFoundrySites(storage: WorldSettingStorage = gameSettingStorage(SITES_SETTING)): BattleSites {
  return {
    async list() {
      return Object.values(readAll(storage)).map(({ data: _, ...entry }) => entry);
    },
    async park(session) {
      if (session.site === null) throw new Error('a battle on no site cannot be parked');
      const entry = siteEntryOf(session as BattleSession & { site: string }, Date.now());
      await storage.set(JSON.stringify({ ...readAll(storage), [session.site]: { ...entry, data: session } }));
    },
    async load(site) {
      return readAll(storage)[site]?.data ?? null;
    },
    async remove(site) {
      const { [site]: _, ...rest } = readAll(storage);
      await storage.set(JSON.stringify(rest));
    },
  };
}
