import type { HostedTroops, TroopEntry, TroopSources } from '../../app/troop-library.svelte.js';
import { cardFromActor, troopActorProblems, type TroopActor } from '../pf2e/troopCard.js';
import { REIGNMAKER_MODULE_ID } from '../reignmaker/outcomePort.js';

// ReignMaker keeps the kingdom on the party actor under these keys; see its `config/flagKeys.ts`
// and `types/ownership.ts`.
const KINGDOM_DATA_FLAG = 'kingdom-data';
const PLAYER_KINGDOM = 'player';

interface KingdomArmy { id: string; name: string; ledBy: string | null; actorId?: string }
interface KingdomData { armies?: KingdomArmy[]; factions?: { id: string; name: string }[] }

const TROOPER_MODULE_ID = 'pf2e-trooper';

/** pf2e-trooper's `api.listTroops()` row: every troop-trait actor in the world and the compendia. */
interface TroopListing { uuid: string; name: string; level: number; source: string; pack: string | null; art: { token: string } | null }
type ListTroops = () => Promise<TroopListing[]>;

function entryOf(id: string, actor: unknown, faction: string, name?: string, art?: string): TroopEntry[] {
  if (!actor || troopActorProblems(actor).length) return [];
  const card = cardFromActor(actor as TroopActor);
  return [{ id, name: name ?? card.name, level: card.level, card: name ? { ...card, name } : card, faction, art }];
}

// A world actor is already in memory, so its card is free. A compendium troop is listed off
// the index row and its actor is read when the player adds it.
async function fromTrooper(list: ListTroops): Promise<HostedTroops> {
  const entries = (await list()).flatMap((t): TroopEntry[] => {
    const art = t.art?.token;
    if (t.pack === null) return entryOf(t.uuid, game.actors.get(t.uuid.split('.').at(-1)!), t.source, undefined, art);
    return [{
      id: t.uuid, name: t.name, level: t.level, faction: t.source, art,
      load: async () => cardFromActor(await fromUuid(t.uuid) as TroopActor),
    }];
  });
  return { entries, coversOfficial: true };
}

// proto: a troop picked here joins the draft as a bare card. It carries no source binding, so
// the outcome writeback does not reach its actor; the module API's `createBattle` still does.
export const foundryTroopSources = (): TroopSources => ({
  world: async () => {
    const api = game.modules.get(TROOPER_MODULE_ID)?.api as { listTroops?: unknown } | undefined;
    if (typeof api?.listTroops === 'function') return fromTrooper(api.listTroops as ListTroops);
    return {
      coversOfficial: false,
      entries: game.actors.contents
        .filter((actor) => actor.type === 'npc')
        .flatMap((actor) => entryOf(`actor:${actor.id}`, actor, actor.folder?.name ?? 'World')),
    };
  },

  kingdom: () => {
    if (!game.modules.get(REIGNMAKER_MODULE_ID)?.active) return null;
    const party = game.actors.contents.find((a) => a.type === 'party' && a.getFlag(REIGNMAKER_MODULE_ID, KINGDOM_DATA_FLAG));
    const kingdom = party?.getFlag(REIGNMAKER_MODULE_ID, KINGDOM_DATA_FLAG) as KingdomData | undefined;
    if (!kingdom) return [];
    const factionName = (ledBy: string | null): string =>
      ledBy === null || ledBy === PLAYER_KINGDOM ? 'Player kingdom'
        : kingdom.factions?.find((f) => f.id === ledBy)?.name ?? ledBy;
    return (kingdom.armies ?? []).flatMap((army) =>
      entryOf(`army:${army.id}`, army.actorId ? game.actors.get(army.actorId) : undefined, factionName(army.ledBy), army.name));
  },
});
