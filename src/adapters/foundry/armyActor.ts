import { cardFromActor, troopActorProblems, type TroopActor } from '../pf2e/troopCard.js';

/** The actor behind a ReignMaker army, read once and shared by every caller that starts from
 * `army.actorId`: the troop-library and battle-site-picker readers both build on this. */
export function readArmyActor(actorId: string | undefined) {
  const actor = actorId ? game.actors.get(actorId) : undefined;
  if (!actor) return { problem: 'the army has no actor in this world' };
  const problems = troopActorProblems(actor);
  if (problems.length) return { problem: problems.join('; ') };
  const troop = actor as unknown as TroopActor;
  return { actor, troop, card: cardFromActor(troop) };
}
