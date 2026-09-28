import { actionIconUrl } from '../../board/art.js';
import type { BattleSession } from '../../runtime/session.js';
import {
  describeBattle, MARKER_SOURCE, markerApiOf, type MapMarkerDescription,
} from '../reignmaker/mapMarkers.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import { hostModule } from './hostModule.js';
import { UnreadableStore } from '../json-store.js';

/**
 * Keeps ReignMaker's map markers on every unresolved battle's hex. Every client runs this: the
 * session and sites settings reach them all, and `describe` runs on whichever client clicks.
 * Returns the refresh to call when either record changes.
 */
export function syncBattleMarkers(standing: () => Promise<BattleSession[]> | null): () => void {
  let bySite = new Map<string, BattleSession>();
  let sent: string | null = null;
  let running = false;
  let again = false;
  const describe = (hexId: string): MapMarkerDescription | null => {
    const session = bySite.get(hexId);
    return session ? describeBattle(session) : null;
  };
  const refresh = async (): Promise<void> => {
    const read = standing();
    if (!read) return;
    const battles = await read;
    bySite = new Map(battles.map((s) => [s.site!, s]));
    const api = markerApiOf(hostModule(REIGNMAKER_MODULE_ID)?.api);
    if (!api) return;
    const hexIds = [...bySite.keys()].sort();
    const key = hexIds.join('|');
    // ReignMaker looks `describe` up at click time, so a changed battle on the same hexes needs
    // no resend: the closure reads `bySite`.
    if (key === sent) return;
    sent = key;
    api.setMapMarkers(MARKER_SOURCE, { icon: actionIconUrl('attack'), hexIds, describe });
  };
  // A refresh reads settings across an await; one that lands mid-read runs once more after it.
  const schedule = (): void => {
    if (running) { again = true; return; }
    running = true;
    refresh().catch((e: unknown) => {
      // The recovery notice already tells the GM a record is unreadable; the markers wait for it.
      if (!(e instanceof UnreadableStore)) console.error('Battlefield | battle markers', e);
    }).finally(() => {
      running = false;
      if (again) { again = false; schedule(); }
    });
  };
  Hooks.on('pf2e-reignmaker.apiReady', () => { sent = null; schedule(); });
  return schedule;
}
