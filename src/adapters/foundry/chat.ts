import type { BattleEvent } from '../../runtime/events.js';
import { MODULE_ID } from './module-id.js';

/** One chat card's content, apart from the Foundry globals the poster below touches. */
export interface CheckCard {
  eventId: string;
  content: string;
  face: number;
}

// proto: only checkResolved events post a chat card, per the DoD's literal wording. A free
// strike or a spell also carries a CheckResult but stays off-chat this wave.
/** Every `checkResolved` event in a commit, one card each, in order. */
export function checkCardsOf(events: readonly BattleEvent[]): CheckCard[] {
  return events
    .filter((event): event is BattleEvent & { type: 'checkResolved' } => event.type === 'checkResolved')
    .map((event) => ({ eventId: event.id, content: event.text, face: event.check.roll }));
}

export interface ChatPoster {
  post(card: CheckCard): Promise<void>;
}

/**
 * Builds one `Roll` per card from a `Die` term carrying the recorded face — a pre-filled
 * `results` entry leaves nothing for `evaluate()` to draw, so this replays the engine's own
 * roll rather than asking Foundry for a new one. Mirrors ReignMaker's `kingdomChatService`:
 * a chat failure is caught and logged, never rethrown, since the battle already committed.
 */
export function foundryChatPoster(): ChatPoster {
  return {
    async post({ eventId, content, face }) {
      try {
        // proto: the wave names the dice port's exact call but not this one; verified against
        // Foundry 14.365's own dice.mjs rather than taken from ReignMaker, whose players roll
        // their own PF2e checks and never rebuild a Roll from a recorded face.
        const die = new foundry.dice.terms.Die({ faces: 20, results: [{ result: face, active: true }] });
        await die.evaluate();
        await ChatMessage.create({
          content,
          rolls: [Roll.fromTerms([die])],
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
