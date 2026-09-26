import { actionIconUrl } from '../../board/art.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import { hostModule } from './hostModule.js';
import type { BattlefieldModuleApi } from './moduleApi.js';

/** The part of ReignMaker's module API this writes; see its `src/api/battleMarkers.ts`. */
type SetBattleMarkers = (markers: { icon: string; hexIds: string[] }) => void;

const setterOf = (api: unknown): SetBattleMarkers | null => {
  const set = (api as { setBattleMarkers?: unknown } | undefined)?.setBattleMarkers;
  return typeof set === 'function' ? set as SetBattleMarkers : null;
};

/**
 * Keeps ReignMaker's battle markers on every unresolved battle's hex. ReignMaker draws them on
 * its Fortifications overlay, so each viewer shows or hides them with the forts. Every client
 * runs this: the sites and session settings reach them all. Returns the refresh to call when
 * either record changes.
 */
export function syncBattleMarkers(battlefield: () => BattlefieldModuleApi | null): () => void {
  let sent: string | null = null;
  let running = false;
  let again = false;
  const refresh = async (): Promise<void> => {
    const set = setterOf(hostModule(REIGNMAKER_MODULE_ID)?.api);
    const api = battlefield();
    if (!set || !api) return;
    const hexIds = (await api.battles()).map((b) => b.site).sort();
    const key = hexIds.join('|');
    if (key === sent) return;
    sent = key;
    set({ icon: actionIconUrl('attack'), hexIds });
  };
  // A refresh reads settings across an await; one that lands mid-read runs once more after it.
  const schedule = (): void => {
    if (running) { again = true; return; }
    running = true;
    refresh().catch((e: unknown) => console.error('Battlefield | battle markers', e)).finally(() => {
      running = false;
      if (again) { again = false; schedule(); }
    });
  };
  Hooks.on('pf2e-reignmaker.apiReady', () => { sent = null; schedule(); });
  return schedule;
}
