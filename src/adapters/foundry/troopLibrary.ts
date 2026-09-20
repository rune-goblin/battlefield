import type { HostedTroops, TroopEntry, TroopSources } from '../../app/troop-library.svelte.js';
import { cardFromActor, troopActorProblems, type TroopActor } from '../pf2e/troopCard.js';
import { campaignTroopsFrom, type KingdomArmy, type KingdomArmyReader, type KingdomFaction } from '../reignmaker/kingdomArmies.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';
import { hostModule } from './hostModule.js';

// proto: an installed ReignMaker that predates `getArmies` keeps the kingdom on the party actor
// under these keys; see its `config/flagKeys.ts` and `types/ownership.ts`.
const KINGDOM_DATA_FLAG = 'kingdom-data';
const PLAYER_KINGDOM = 'player';
const UNASSIGNED = 'unassigned';

interface StoredArmy { id: string; name: string; level: number; ledBy: string | null; actorId?: string }
interface StoredKingdom { name?: string; armies?: StoredArmy[]; factions?: KingdomFaction[] }

interface ReignMakerArmyApi { getArmies(): KingdomArmy[]; getFactions(): KingdomFaction[] }

const armyApi = (api: unknown): ReignMakerArmyApi | null => {
  const a = api as Partial<ReignMakerArmyApi> | undefined;
  return typeof a?.getArmies === 'function' && typeof a.getFactions === 'function' ? a as ReignMakerArmyApi : null;
};

function storedKingdom(): ReignMakerArmyApi {
  const party = game.actors.contents.find((a) => a.type === 'party' && a.getFlag(REIGNMAKER_MODULE_ID, KINGDOM_DATA_FLAG));
  const kingdom = (party?.getFlag(REIGNMAKER_MODULE_ID, KINGDOM_DATA_FLAG) ?? {}) as StoredKingdom;
  const factions = [{ id: PLAYER_KINGDOM, name: kingdom.name || 'Player kingdom' }, ...(kingdom.factions ?? [])];
  return {
    getFactions: () => factions,
    getArmies: () => (kingdom.armies ?? []).map((army) => {
      const ledBy = army.ledBy || PLAYER_KINGDOM;
      const leaderName = ledBy === UNASSIGNED ? 'Unassigned' : factions.find((f) => f.id === ledBy)?.name ?? ledBy;
      return { armyId: army.id, name: army.name, level: army.level, actorId: army.actorId, ledBy, leaderName };
    }),
  };
}

const readArmy: KingdomArmyReader = (army) => {
  const actor = army.actorId ? game.actors.get(army.actorId) : undefined;
  if (!actor) return { problem: 'the army has no actor in this world' };
  const problems = troopActorProblems(actor);
  if (problems.length) return { problem: problems.join('; ') };
  return { card: cardFromActor(actor as unknown as TroopActor), art: actor.prototypeToken?.texture?.src ?? undefined };
};

const TROOPER_MODULE_ID = 'pf2e-trooper';

/** pf2e-trooper's `api.listTroops()` row: every troop-trait actor in the world and the compendia. */
interface TroopListing { uuid: string; name: string; level: number; source: string; pack: string | null; art: { token: string } | null }
type ListTroops = () => Promise<TroopListing[]>;

function entryOf(id: string, actor: unknown, source: string, art?: string): TroopEntry[] {
  if (!actor || troopActorProblems(actor).length) return [];
  const card = cardFromActor(actor as TroopActor);
  return [{ id, name: card.name, level: card.level, card, source, art }];
}

// A world actor is already in memory, so its card is free. A compendium troop is listed off
// the index row and its actor is read when the player adds it.
async function fromTrooper(list: ListTroops): Promise<HostedTroops> {
  const entries = (await list()).flatMap((t): TroopEntry[] => {
    const art = t.art?.token;
    if (t.pack === null) return entryOf(t.uuid, game.actors.get(t.uuid.split('.').at(-1)!), t.source, art);
    return [{
      id: t.uuid, name: t.name, level: t.level, source: t.source, art,
      load: async () => cardFromActor(await fromUuid(t.uuid) as TroopActor),
    }];
  });
  return { entries, coversOfficial: true };
}

// proto: a troop picked here joins the draft as a bare card. It carries no source binding, so
// the outcome writeback does not reach its actor; the module API's `createBattle` still does.
export const foundryTroopSources = (): TroopSources => ({
  world: async () => {
    const api = hostModule(TROOPER_MODULE_ID)?.api as { listTroops?: unknown } | undefined;
    if (typeof api?.listTroops === 'function') return fromTrooper(api.listTroops as ListTroops);
    return {
      coversOfficial: false,
      entries: game.actors.contents
        .filter((actor) => actor.type === 'npc')
        .flatMap((actor) => entryOf(`actor:${actor.id}`, actor, actor.folder?.name ?? 'World')),
    };
  },

  campaign: () => {
    const reignmaker = hostModule(REIGNMAKER_MODULE_ID);
    if (!reignmaker?.active) return null;
    const kingdom = armyApi(reignmaker.api) ?? storedKingdom();
    return campaignTroopsFrom(kingdom.getArmies(), kingdom.getFactions(), readArmy);
  },
});
