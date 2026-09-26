import { HEX_TERRAINS, opponent, type BoardSpec, type HexTerrain, type Side, type UnitCard } from '../../engine/index.js';
import type { BattleRequest, BattleRequestUnit, UnitSource } from '../../runtime/campaign.js';
import { PLAYER_KINGDOM, type KingdomArmy } from './kingdomArmies.js';

export interface BattleSite {
  hexId: string;
  terrain: string | null;
  claimedBy: string | null;
  fortificationTier: number;
  armies: KingdomArmy[];
}

/**
 * A first guess at who attacks, for the GM to correct at the Sides step. Whoever holds the hex
 * defends it. On ground nobody holds, the player kingdom is the one that marched, so it attacks;
 * with no player army present the first banner found attacks. Every banner that is neither the
 * holder nor the attacker joins the side opposite the player, or opposite the holder.
 */
export function sideOf(site: BattleSite): (army: KingdomArmy) => Side {
  const banners = [...new Set(site.armies.map((a) => a.ledBy))];
  // ReignMaker's hexes name a holder by faction ID or by faction name.
  const holds = (a: KingdomArmy): boolean => site.claimedBy !== null
    && (a.ledBy === site.claimedBy || a.leaderName === site.claimedBy);
  const holder = site.armies.find(holds)?.ledBy ?? null;
  if (holder !== null) return (army) => (army.ledBy === holder ? 'defender' : 'attacker');
  const attacker = banners.includes(PLAYER_KINGDOM) ? PLAYER_KINGDOM : banners[0];
  return (army) => (army.ledBy === attacker ? 'attacker' : 'defender');
}

export function specFromSite(site: BattleSite, seed: number): BoardSpec {
  const known = HEX_TERRAINS.includes(site.terrain as HexTerrain);
  const tier = Math.min(4, Math.max(0, Math.trunc(site.fortificationTier)));
  return {
    base: known ? site.terrain as HexTerrain : 'plains',
    size: 15,
    // proto: a water hex is fought on its shore. Reserved for review with the terrain mapping.
    feature: site.terrain === 'water' ? 'lakeside' : 'none',
    construction: tier > 0 ? { kind: 'fort', tier } : null,
    seed,
  };
}

/** What the host could read off one army's actor, or null for an army with no usable actor. */
export type ArmyReader = (army: KingdomArmy) => { card: UnitCard; source: UnitSource } | null;

export interface SiteRequest {
  request: BattleRequest;
  /** Armies in the hex that could not be read, by name, for the GM to hear about. */
  skipped: string[];
}

export function requestFromSite(site: BattleSite, read: ArmyReader, seed: number): SiteRequest {
  const side = sideOf(site);
  const units: BattleRequestUnit[] = [];
  const skipped: string[] = [];
  for (const army of site.armies) {
    const found = read(army);
    if (!found) { skipped.push(army.name); continue; }
    units.push({
      card: { ...found.card, name: army.name },
      side: side(army),
      faction: army.leaderName,
      source: { ...found.source, campaignId: army.armyId },
    });
  }
  // The GM plays whichever army the player kingdom does not.
  const playerSide = site.armies.some((a) => a.ledBy === PLAYER_KINGDOM)
    ? side(site.armies.find((a) => a.ledBy === PLAYER_KINGDOM)!) : null;
  return {
    request: {
      board: specFromSite(site, seed),
      units,
      gmSide: playerSide === null ? 'both' : opponent(playerSide),
    },
    skipped,
  };
}
