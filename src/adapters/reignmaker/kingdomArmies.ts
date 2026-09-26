import type { UnitCard } from '../../engine/index.js';
import type { CampaignTroops, TroopEntry } from '../../app/troop-library.svelte.js';

/** ReignMaker's `api.getArmies()` row, and the element of `getBattleSite(...).armies`; see its
 * `src/api/armies.ts` and `src/api/battleSite.ts`. */
export interface KingdomArmy {
  armyId: string;
  name: string;
  level: number;
  actorId?: string;
  /** `"player"`, `"unassigned"`, or a faction ID. */
  ledBy: string;
  leaderName: string;
}

/** ReignMaker's `api.getFactions()` row. The player kingdom comes first. */
export interface KingdomFaction { id: string; name: string }

export const PLAYER_KINGDOM = 'player';

/** The card and token art the host read off an army's actor, or the reasons it could not. */
export type KingdomArmyReader = (army: KingdomArmy) => { card: UnitCard; art?: string } | { problem: string };

const SOURCE = 'ReignMaker';

export function campaignTroopsFrom(
  armies: KingdomArmy[], factions: KingdomFaction[], read: KingdomArmyReader,
): CampaignTroops {
  const entries = armies.map((army): TroopEntry => {
    const base = { id: `army:${army.armyId}`, name: army.name, level: army.level, source: SOURCE, faction: army.leaderName };
    const found = read(army);
    if ('problem' in found) return { ...base, problem: found.problem };
    return { ...base, level: found.card.level, card: { ...found.card, name: army.name }, art: found.art };
  });
  const known = factions.map((f) => f.name);
  // An unassigned army marches under no faction the service lists.
  const extra = [...new Set(entries.map((e) => e.faction!))].filter((name) => !known.includes(name));
  return { label: 'ReignMaker armies', entries, factions: [...known, ...extra] };
}
