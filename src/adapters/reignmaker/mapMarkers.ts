import { briefingOf } from '../../app/briefing.js';
import { ARMY_TITLE } from '../../app/presentation.js';
import { migrateSession } from '../../runtime/migrate.js';
import type { BattleSites } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';

/** ReignMaker's map-marker API; see its `src/api/mapMarkers.ts`. */
export interface MapMarkerSection { heading: string; lines: string[] }
export interface MapMarkerDescription { title: string; sections: MapMarkerSection[] }
export interface MapMarkers {
  icon: string;
  hexIds: string[];
  /** Runs on the clicking client at click time; null opens nothing. */
  describe(hexId: string): MapMarkerDescription | null;
}
export interface ReignMakerMarkerApi { setMapMarkers(source: string, markers: MapMarkers): void }

export const MARKER_SOURCE = 'battlefield';

export const markerApiOf = (api: unknown): ReignMakerMarkerApi | null =>
  typeof (api as { setMapMarkers?: unknown } | undefined)?.setMapMarkers === 'function'
    ? api as ReignMakerMarkerApi : null;

/** The open battle and every parked one, unresolved and on a site. A parked record that no
 * longer reads is left off the map. */
export async function standingBattles(open: BattleSession, sites: BattleSites): Promise<BattleSession[]> {
  const parked = (await sites.list()).filter((e) => e.site !== open.site && e.stage !== 'finalized');
  const loaded = await Promise.all(parked.map(async (e) => migrateSession(await sites.load(e.site), e.battleId)));
  const standing = loaded.filter((s): s is BattleSession => s !== null && s.stage !== 'finalized');
  return open.site !== null && open.stage !== 'finalized' ? [...standing, open] : standing;
}

/** The popup a marker opens: each side's armies, grouped under their factions. Seats stay off
 * it; the sides' players already know them. */
export function describeBattle(session: BattleSession): MapMarkerDescription {
  const briefing = briefingOf(session, []);
  return {
    title: 'Battle',
    sections: [
      { heading: 'Standing', lines: [briefing.standing] },
      ...briefing.armies.map((army) => ({
        heading: ARMY_TITLE[army.side],
        lines: [army.line, ...army.factions.map((f) => `${f.name}: ${f.units.map((u) => u.state ? `${u.name} (${u.state})` : u.name).join(', ')}`)],
      })),
    ],
  };
}
