import { CLOSE_PROMPT } from '../../app/close-prompt.js';
import { importBaselineOf } from '../pf2e/troopCard.js';
import type { SiteOpening } from '../../runtime/campaign.js';
import type { SiteEntry } from '../../runtime/ports.js';
import { requestFromSite, specFromSite, type ArmyReader, type BattleSite } from '../reignmaker/battleSite.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import { readArmyActor } from './armyActor.js';
import type { BattlefieldModuleApi } from './moduleApi.js';
import { hostModule } from './hostModule.js';

/** The part of ReignMaker's module API this reads; see its `src/index.ts`. */
interface ReignMakerMapApi {
  selectHexes(config: {
    title: string; count: number; colorType: 'battle'; broadcast?: boolean;
    getHexInfo?: (hexId: string) => string | null;
  }): Promise<unknown>;
  getBattleSite(hexId: string): BattleSite;
}

const mapApi = (api: unknown): ReignMakerMapApi | null => {
  const a = api as Partial<ReignMakerMapApi> | undefined;
  return typeof a?.selectHexes === 'function'
    && typeof a.getBattleSite === 'function' ? a as ReignMakerMapApi : null;
};

const readArmy: ArmyReader = (army) => {
  const r = readArmyActor(army.actorId);
  return 'problem' in r ? null : { card: r.card, source: { actorUuid: `Actor.${r.actor.id}`, baseline: importBaselineOf(r.troop) } };
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
  const active = battlefield.activeSite();
  if (active !== null && active !== hexId && !(await closeActive(battlefield, active))) return;
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

/** Close the battle the table holds before the pick opens another, asking first when it has
 * changes its site does not hold. False when the GM cancels or the close fails. */
async function closeActive(battlefield: BattlefieldModuleApi, active: string): Promise<boolean> {
  if (await battlefield.battleUnsaved()) {
    const choice: unknown = await foundry.applications.api.DialogV2.wait({
      window: { title: CLOSE_PROMPT.title(active) },
      content: `<p>${CLOSE_PROMPT.body}</p>`,
      buttons: [
        { action: 'save', label: CLOSE_PROMPT.save, default: true },
        { action: 'discard', label: CLOSE_PROMPT.discard },
        { action: 'cancel', label: CLOSE_PROMPT.cancel },
      ],
      rejectClose: false,
    });
    if (choice === 'save') {
      try {
        await battlefield.saveBattle();
      } catch (error) {
        ui.notifications.warn(`The battle was not saved: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    } else if (choice !== 'discard') return false;
  }
  const closed = await battlefield.closeBattle();
  if (!closed.ok) ui.notifications.warn(`The battle could not be closed: ${closed.message}`);
  return closed.ok;
}

export const reignMakerActive = (): boolean => hostModule(REIGNMAKER_MODULE_ID)?.active === true;

/** The pick from the GM's crossed-swords scene control. */
export function pickBattleSite(battlefield: BattlefieldModuleApi | null): void {
  const reignmaker = mapApi(hostModule(REIGNMAKER_MODULE_ID)?.api);
  if (!reignmaker) {
    ui.notifications.warn('This ReignMaker build has no battle-site API; update it and reload.');
    return;
  }
  if (battlefield) void pickBattle(reignmaker, battlefield);
}
