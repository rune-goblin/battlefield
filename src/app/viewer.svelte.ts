import type { Side } from '../engine/index.js';
import { seatedOn } from '../runtime/control.js';
import { authority } from './authority.svelte.js';
import { game, gmUserId, tableUsers, viewerId } from './game.svelte.js';

/**
 * This client's part in the record: the seats its user holds, whether the open activation is
 * theirs, and whether the table's authority is theirs. Every client shows the same board and
 * the same turn holder; what each one may do comes from here, and the executor rules on it
 * again when the command arrives.
 */
export const viewer = {
  get userId(): string { return viewerId(); },

  /** The GM may issue any command for either side, which is how a player who drops
   * mid-activation is played out. */
  get isGm(): boolean { return gmUserId() === viewerId(); },

  /** Whose activation is open, as every client shows it. */
  get holder(): string | null { return game.turn; },

  /** The holder as the table knows them. A host's user ID is an opaque string, so the ID stands
   * in only for a user the roster no longer lists. */
  get holderName(): string | null {
    return game.turn === null ? null : tableUsers().find((u) => u.id === game.turn)?.name ?? game.turn;
  },

  /** The character the turn holder plays, falling back to their own name. */
  get holderCharacter(): string | null {
    if (game.turn === null) return null;
    const user = tableUsers().find((u) => u.id === game.turn);
    return user?.character ?? user?.name ?? game.turn;
  },

  get isHolder(): boolean { return game.turn !== null && game.turn === viewerId(); },

  /** Whether this client's tactical controls are live. With no primary GM at the table there
   * is nobody to execute a command, so every client reads and none of them acts. */
  get mayAct(): boolean { return authority.mayCommand && (viewer.isHolder || viewer.isGm); },

  seatedOn: (side: Side): boolean => seatedOn(game.control, side, viewerId()),

  /** A decision one army makes: readiness, recovery, surrender, next-day deployment. Any user
   * seated on that side may answer, and the last word before the side confirms stands. */
  decidesFor: (side: Side): boolean => authority.mayCommand && (viewer.isGm || viewer.seatedOn(side)),
};

// proto: the turn and seat wording is reserved for review with the rest of the player-facing
// text. Wave 3.6 takes the same lines into the notices.
export const turnNote = (): string => {
  if (game.turn === null) return 'No turn is open';
  return viewer.isHolder ? 'Your turn' : `${viewer.holderName} is playing`;
};

export const offTurnNote = (): string => (game.turn === null
  ? 'No turn is open yet.'
  : `This activation belongs to ${viewer.holderName}.`);
