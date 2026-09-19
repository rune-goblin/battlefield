import type { BattleSites, SiteEntry } from './ports.js';
import type { BattleSession } from './session.js';

export const siteEntryOf = (session: BattleSession & { site: string }, savedAt: number): SiteEntry => ({
  site: session.site, battleId: session.battleId, savedAt, stage: session.stage,
  day: session.battle?.day ?? null, round: session.battle?.round ?? null,
});

/** `BattleSites` held in memory: the browser's, which has no campaign map, and the tests'. */
export function memorySites(): BattleSites {
  const parked = new Map<string, { entry: SiteEntry; data: string }>();
  return {
    async list() { return [...parked.values()].map((p) => p.entry); },
    async park(session) {
      if (session.site === null) throw new Error('a battle on no site cannot be parked');
      parked.set(session.site, {
        entry: siteEntryOf(session as BattleSession & { site: string }, Date.now()), data: JSON.stringify(session),
      });
    },
    async load(site) {
      const found = parked.get(site);
      return found ? JSON.parse(found.data) as unknown : null;
    },
    async remove(site) { parked.delete(site); },
  };
}
