import { COMBATANTS, OFFICIAL, ROSTER, type UnitCard } from '../engine/index.js';

export interface TroopEntry {
  id: string;
  name: string;
  level: number;
  /** The faction an army answers to, or the collection a published card came from. */
  faction: string;
  /** The host's own token art; the board's bundled art serves when it has none. */
  art?: string;
  /** Present when the card costs nothing to have. A compendium troop is listed off its index
   * and states only a name and a level until `load` reads the actor. */
  card?: UnitCard;
  load?: () => Promise<UnitCard>;
}

export interface HostedTroops {
  entries: TroopEntry[];
  /** The host lists the published Pathfinder troops itself, so the bundled copies stand down. */
  coversOfficial: boolean;
}

/** What a host adds to the picker. `kingdom` answers null while ReignMaker is absent, and is
 * asked again each time the picker opens, so a module enabled mid-session is found. */
export interface TroopSources {
  world?: () => Promise<HostedTroops>;
  kingdom?: () => TroopEntry[] | null;
}

let sources: TroopSources = {};
export function registerTroopSources(next: TroopSources): void { sources = next; }

const published = (cards: UnitCard[], faction: string): TroopEntry[] =>
  cards.map((card) => ({ id: `${faction}:${card.name}`, name: card.name, level: card.level, card, faction }));

const PUBLISHED: TroopEntry[] = [
  ...published(COMBATANTS, 'ReignMaker'),
  ...published(OFFICIAL, 'Pathfinder'),
  ...published(ROSTER, 'Generic'),
];

export async function allTroops(): Promise<TroopEntry[]> {
  // A host whose list fails still leaves the player the bundled cards to build an army from.
  const hosted = await sources.world?.().catch((error: unknown) => {
    console.warn('battlefield | the host troop list failed; showing the bundled cards', error);
    return undefined;
  });
  if (!hosted) return PUBLISHED;
  return [...hosted.entries, ...PUBLISHED.filter((e) => !(hosted.coversOfficial && e.faction === 'Pathfinder'))];
}
export const kingdomTroops = (): TroopEntry[] | null => sources.kingdom?.() ?? null;
