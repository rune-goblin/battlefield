import type { BattleEvent } from '../../runtime/events.js';
import { MODULE_ID } from './module-id.js';

/** One chat card's content, apart from the Foundry globals the poster below touches. */
export interface CheckCard {
  eventId: string;
  content: string;
  /** Null for an ability that lands without a save. */
  face: number | null;
}

// proto: a free strike or a spell also carries a CheckResult but stays off-chat this wave.
/** Every check and every troop ability in a commit, one card each, in order. */
export function checkCardsOf(events: readonly BattleEvent[]): CheckCard[] {
  return events.flatMap((event) => {
    if (event.type === 'checkResolved') return [{ eventId: event.id, content: event.text, face: event.check.roll }];
    if (event.type === 'abilityResolved') return [{ eventId: event.id, content: event.text, face: event.check?.roll ?? null }];
    return [];
  });
}

export interface ChatPoster {
  post(card: CheckCard): Promise<void>;
}

/**
 * Builds one `Roll` per card from a `Die` term carrying the recorded face, so the card replays
 * the engine's own roll rather than asking Foundry for a new one. Mirrors ReignMaker's
 * `kingdomChatService`: a chat failure is caught and logged, never rethrown, since the battle
 * already committed.
 */
// The typedefs' `ChatMessage.create` takes a `DeepPartial` of the whole message source, which
// `tsc` gives up on ("excessively deep"), and types `rolls` as JSON where Foundry also takes
// `Roll` instances. This is the slice the poster uses.
interface ChatMessageCreator {
  create(data: { content: string; rolls: Roll[]; flags: Record<string, Record<string, unknown>> }): Promise<unknown>;
}

export function foundryChatPoster(): ChatPoster {
  return {
    async post({ eventId, content, face }) {
      try {
        // proto: the wave names the dice port's exact call but not this one; verified against
        // Foundry 14.365's own dice.mjs rather than taken from ReignMaker, whose players roll
        // their own PF2e checks and never rebuild a Roll from a recorded face. A `results`
        // entry marks the term evaluated in the constructor, and `evaluate()` throws on a term
        // that already is, so nothing evaluates this die; `Roll.fromTerms` reads `_evaluated`
        // off the term and totals it, which is what `ChatMessage` demands of a posted roll.
        const rolls = face === null ? [] : [Roll.fromTerms([new foundry.dice.terms.Die({ faces: 20, results: [{ result: face, active: true }] })])];
        await (ChatMessage as unknown as ChatMessageCreator).create({
          content,
          rolls,
          flags: { [MODULE_ID]: { eventId } },
        });
      } catch (error) {
        console.error(`battlefield | chat post failed for ${eventId}`, error);
      }
    },
  };
}

/** `host.ts` wires this to the primary GM's own executor alone, so the table gets one card per
 * check, not one per connected client. */
export async function publishCommit(events: readonly BattleEvent[], poster: ChatPoster): Promise<void> {
  for (const card of checkCardsOf(events)) await poster.post(card);
}
