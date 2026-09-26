import { siteEntryOf } from '../../runtime/memorySites.js';
import type { BattleSites, SiteEntry } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import { createJsonStore } from '../json-store.js';
import type { StoreRecovery } from '../store-recovery.js';
import { gameSettingStorage, SITES_SETTING, type WorldSettingStorage } from './worldSettings.js';

interface StoredSite extends SiteEntry { data: unknown }

type StoredSites = Record<string, StoredSite>;

const acceptSites = (parsed: unknown): StoredSites | null =>
  parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as StoredSites : null;

/** `BattleSites` over the sites world setting: one parked record to a kingdom-map hex. */
// proto: every parked battle shares one setting, so each park rewrites them all. Reserved for
// review with the archive's own ten-slot cap.
export function createFoundrySites(
  storage: WorldSettingStorage = gameSettingStorage(SITES_SETTING),
  recovery?: StoreRecovery,
): BattleSites {
  const store = createJsonStore<StoredSites>(storage, {
    name: 'battle sites', empty: () => ({}), accept: acceptSites, onUnreadable: () => recovery?.report('sites'),
  });
  recovery?.track('sites', store);
  return {
    async list() {
      return Object.values(store.read()).map(({ data: _, ...entry }) => entry);
    },
    async park(session) {
      if (session.site === null) throw new Error('a battle on no site cannot be parked');
      const entry = siteEntryOf(session as BattleSession & { site: string }, Date.now());
      await store.write({ ...store.read(), [session.site]: { ...entry, data: session } });
    },
    async load(site) {
      return store.read()[site]?.data ?? null;
    },
    async remove(site) {
      const { [site]: _, ...rest } = store.read();
      await store.write(rest);
    },
  };
}
