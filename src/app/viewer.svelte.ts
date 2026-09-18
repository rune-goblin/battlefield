import type { Side } from '../engine/index.js';
import { seatedOn } from '../runtime/control.js';
import { game, gmUserId, viewerId } from './game.svelte.js';

/**
 * This client's part in the record: the seats its user holds, whether the open activation is
 * theirs, and whether the table's authority is theirs. Every client shows the same board and
 * the same turn holder; what each one may do comes from here, and the executor rules on it
 * again when the command arrives.
 */
export const viewer = {
  userId: viewerId,

  /** The GM may issue any command for either side, which is how a player who drops
   * mid-activation is played out. */
  get isGm(): boolean { return gmUserId() === viewerId; },

  /** Whose activation is open, as every client shows it. */
  get holder(): string | null { return game.turn; },

  get isHolder(): boolean { return game.turn !== null && game.turn === viewerId; },

  /** Whether this client's tactical controls are live. */
  get mayAct(): boolean { return viewer.isHolder || viewer.isGm; },

  seatedOn: (side: Side): boolean => seatedOn(game.control, side, viewerId),

  /** A decision one army makes: readiness, recovery, surrender, next-day deployment. Any user
   * seated on that side may answer, and the last word before the side confirms stands. */
  decidesFor: (side: Side): boolean => viewer.isGm || viewer.seatedOn(side),
};

// proto: the turn and seat wording is reserved for review with the rest of the player-facing
// text. Wave 3.6 takes the same lines into the notices.
export const turnNote = (): string => {
  if (game.turn === null) return 'No turn is open';
  return viewer.isHolder ? 'Your turn' : `${game.turn} is playing`;
};

export const offTurnNote = (): string => (game.turn === null
  ? 'No turn is open yet.'
  : `This activation belongs to ${game.turn}.`);
