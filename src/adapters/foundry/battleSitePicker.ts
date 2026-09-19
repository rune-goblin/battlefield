import { cardFromActor, importBaselineOf, troopActorProblems, type TroopActor } from '../pf2e/troopCard.js';
import { requestFromSite, type ArmyReader, type BattleSite } from '../reignmaker/battleSite.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import type { BattlefieldModuleApi } from './moduleApi.js';

/** The part of ReignMaker's module API this reads; see its `src/index.ts`. */
interface ReignMakerMapApi {
  registerMapToolbarButton(button: {
    id: string; icon: string; label: string; title?: string; gmOnly?: boolean; onClick: () => void;
  }): () => void;
  selectHexes(config: { title: string; count: number; colorType: 'battle'; broadcast?: boolean }): Promise<unknown>;
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

async function pickBattle(reignmaker: ReignMakerMapApi, battlefield: BattlefieldModuleApi): Promise<void> {
  const picked = await reignmaker.selectHexes({ title: 'Pick a hex for battle', count: 1, colorType: 'battle', broadcast: false });
  // The worksite pick answers with an object; a plain pick answers with the IDs, or null.
  const hexId = Array.isArray(picked) ? picked[0] : null;
  if (typeof hexId !== 'string') return;
  const site = reignmaker.getBattleSite(hexId);
  if (!site.armies.length) {
    // proto: the builder opens on whatever draft the table holds; the hex's ground is not
    // carried over, since a battle request with no units is refused. Reserved for review.
    ui.notifications.info(`No army stands in hex ${hexId}. Choose the armies in the builder.`);
    await battlefield.open();
    return;
  }
  const { request, skipped } = requestFromSite(site, readArmy, Math.floor(Math.random() * 1e9));
  if (skipped.length) ui.notifications.warn(`No troop actor could be read for ${skipped.join(', ')}.`);
  if (!request.units.length) {
    await battlefield.open();
    return;
  }
  const result = await battlefield.createBattle(request);
  if (!result.ok) {
    ui.notifications.warn(`The battle could not be set up: ${result.message}`);
    return;
  }
  await battlefield.open();
}

export const reignMakerActive = (): boolean => game.modules.get(REIGNMAKER_MODULE_ID)?.active === true;

/** The pick from Battlefield's own scene control, which needs no ReignMaker toolbar on screen. */
export function pickBattleSite(battlefield: BattlefieldModuleApi | null): void {
  const reignmaker = mapApi(game.modules.get(REIGNMAKER_MODULE_ID)?.api);
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
  const module = game.modules.get(REIGNMAKER_MODULE_ID);
  if (module?.active) register(module.api);
}
