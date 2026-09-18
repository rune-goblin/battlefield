import type { WritebackValues } from '../../runtime/session.js';
import type { ActorWritebackPort } from '../../services/OutcomeApplicationService.js';
import { demoralizedItems, demoralizedOf, type TroopActor, type TroopItem } from './troopCard.js';

/** The slice of a PF2e actor document the writeback changes. Structural, as the card reader's
 * shape is, so a live document and a fake both satisfy it and no Foundry global lands here. */
export interface WritableTroopActor extends TroopActor {
  update(data: Record<string, unknown>): Promise<unknown>;
  deleteEmbeddedDocuments(type: 'Item', ids: string[]): Promise<unknown>;
}

export interface WritableTroopItem extends TroopItem {
  _id?: string;
  update(data: Record<string, unknown>): Promise<unknown>;
}

export interface TroopWritebackOptions {
  /** The actor behind a UUID, or null when this table does not hold it. */
  actor(actorUuid: string): Promise<WritableTroopActor | null>;
}

const idsOf = (items: WritableTroopItem[]): string[] =>
  items.map((i) => i._id).filter((id): id is string => !!id);

// proto: the Demoralized effect is the campaign's own document, so this sets the badge on one
// the actor already carries and removes it at zero. It creates none where none stands: without
// the campaign module there is no effect to copy. Reserved with the rest of the mappings.
async function writeDemoralized(actor: WritableTroopActor, stacks: number): Promise<void> {
  const [first, ...extra] = demoralizedItems(actor) as WritableTroopItem[];
  if (!first) return;
  if (stacks <= 0) {
    const ids = idsOf([first, ...extra]);
    if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
    return;
  }
  await first.update({ 'system.badge.value': stacks });
  // One effect carries the whole track. Duplicates would stack a second penalty on every check.
  const ids = idsOf(extra);
  if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
}

/**
 * Hit points and Demoralized on a troop actor, written as absolute values so a resumed run puts
 * the same numbers on the actor the interrupted one meant to. Routed and disbanding are the
 * campaign's own consequences: without a campaign module the report names them for the GM.
 */
export function createTroopWriteback({ actor }: TroopWritebackOptions): ActorWritebackPort {
  return {
    async read(actorUuid): Promise<WritebackValues | null> {
      const document = await actor(actorUuid);
      if (!document) return null;
      return {
        hitPoints: document.system?.attributes?.hp?.value ?? 0,
        demoralized: demoralizedOf(document),
      };
    },

    async write(actorUuid, values): Promise<void> {
      const document = await actor(actorUuid);
      if (!document) throw new Error(`${actorUuid} is not on this table`);
      await document.update({ 'system.attributes.hp.value': values.hitPoints });
      await writeDemoralized(document, values.demoralized);
    },
  };
}
