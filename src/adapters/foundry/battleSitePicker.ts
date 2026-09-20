import { cardFromActor, importBaselineOf, troopActorProblems, type TroopActor } from '../pf2e/troopCard.js';
import type { SiteOpening } from '../../runtime/campaign.js';
import type { SiteEntry } from '../../runtime/ports.js';
import { requestFromSite, specFromSite, type ArmyReader, type BattleSite } from '../reignmaker/battleSite.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import type { BattlefieldModuleApi } from './moduleApi.js';
import { hostModule } from './hostModule.js';

/** The part of ReignMaker's module API this reads; see its `src/index.ts`. */
interface ReignMakerMapApi {
  registerMapToolbarButton(button: {
    id: string; icon: string; label: string; title?: string; gmOnly?: boolean; onClick: () => void;
  }): () => void;
  selectHexes(config: {
    title: string; count: number; colorType: 'battle'; broadcast?: boolean;
    getHexInfo?: (hexId: string) => string | null;
  }): Promise<unknown>;
  getBattleSite(hexId: string): BattleSite;
}

const mapApi = (api: unknown): ReignMakerMapApi | null => {
  const a = api as Partial<ReignMakerMapApi> | undefined;
  return typeof a?.registerMapToolbarButton === 'function' && typeof a.selectHexes === 'function'
    && typeof a.getBattleSite === 'function' ? a as ReignMakerMapApi : null;
};

const readArmy: ArmyReader = (army) => {
  const actor = army.actorId ? game.actors.get(army.actorId) : undefined;
  if (!actor || troopActorProblems(actor).length) return null;
  const troop = actor as unknown as TroopActor;
  return { card: cardFromActor(troop), source: { actorUuid: `Actor.${actor.id}`, baseline: importBaselineOf(troop) } };
};

const standingLabel = ({ stage, day, round }: SiteEntry): string => (day === null
  ? stage === 'setup' ? 'A battle is being prepared here.' : 'A battle stands here.'
  : `A battle stands here: day ${day}, round ${round ?? 1}.`);

/** What opens the hex if no battle stands there: its armies, or its bare ground. */
function openingFor(site: BattleSite): SiteOpening {
  const seed = Math.floor(Math.random() * 1e9);
  const { request, skipped } = requestFromSite(site, readArmy, seed);
  if (skipped.length) ui.notifications.warn(`No troop actor could be read for ${skipped.join(', ')}.`);
  if (request.units.length) return { request };
  ui.notifications.info(`No army stands in hex ${site.hexId}. Choose the armies in the builder.`);
  return { board: specFromSite(site, seed) };
}

async function pickBattle(reignmaker: ReignMakerMapApi, battlefield: BattlefieldModuleApi): Promise<void> {
  const standing = new Map((await battlefield.battles()).map((b) => [b.site, b]));
  const picked = await reignmaker.selectHexes({
    title: 'Pick a hex for battle', count: 1, colorType: 'battle', broadcast: false,
    getHexInfo: (hexId) => { const battle = standing.get(hexId); return battle ? standingLabel(battle) : null; },
  });
  // The worksite pick answers with an object; a plain pick answers with the IDs, or null.
  const hexId = Array.isArray(picked) ? picked[0] : null;
  if (typeof hexId !== 'string') return;
  // A hex that holds a battle opens it and reads nothing off the map.
  const opening = standing.has(hexId)
    ? { board: specFromSite(reignmaker.getBattleSite(hexId), 0) } : openingFor(reignmaker.getBattleSite(hexId));
  const result = await battlefield.openBattleAt(hexId, opening);
  if (!result.ok) {
    ui.notifications.warn(`The battle could not be opened: ${result.message}`);
    return;
  }
  await battlefield.open();
}

export const reignMakerActive = (): boolean => hostModule(REIGNMAKER_MODULE_ID)?.active === true;

/** The pick from Battlefield's own scene control, which needs no ReignMaker toolbar on screen. */
export function pickBattleSite(battlefield: BattlefieldModuleApi | null): void {
  const reignmaker = mapApi(hostModule(REIGNMAKER_MODULE_ID)?.api);
  if (!reignmaker) {
    ui.notifications.warn('This ReignMaker build has no battle-site API; update it and reload.');
    return;
  }
  if (battlefield) void pickBattle(reignmaker, battlefield);
}

/**
 * The Crossed Swords button on ReignMaker's kingdom-map toolbar. ReignMaker finishes its API
 * late in an async `ready`, so this registers now if the API is there and on its `apiReady`
 * hook otherwise. The toolbar exists on the kingdom scene alone, which is the guard.
 */
export function registerBattleSitePicker(battlefield: () => BattlefieldModuleApi | null): void {
  let registered = false;
  const register = (api: unknown): void => {
    const reignmaker = mapApi(api);
    if (registered || !reignmaker) return;
    registered = true;
    // proto: a line to find in the console while the two modules are first being fitted.
    console.info('Battlefield | Battle button registered on the ReignMaker map toolbar');
    reignmaker.registerMapToolbarButton({
      id: 'battlefield-pick-hex',
      icon: 'fa-swords',
      label: 'Battle',
      title: 'Pick a hex for battle',
      gmOnly: true,
      onClick: () => {
        const api = battlefield();
        if (api) void pickBattle(reignmaker, api);
      },
    });
  };
  Hooks.on('pf2e-reignmaker.apiReady', register);
  const module = hostModule(REIGNMAKER_MODULE_ID);
  if (module?.active) register(module.api);
}
