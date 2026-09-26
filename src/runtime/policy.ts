import { SIDES } from '../engine/index.js';
import { descriptorOf } from './commandTable.js';
import type { BattleCommand } from './commands.js';
import { seatedOn, HOT_SEAT_USER } from './control.js';
import type { PresencePort } from './ports.js';
import type { BattleSession } from './session.js';

// proto: the wording a player reads when a seat or a turn refuses them is reserved for review.
/** Why this user may not issue this command, or null when they may. */
export function refuseCommand(
  session: BattleSession, command: BattleCommand, userId: string, presence: PresencePort,
): string | null {
  if (userId === presence.gmUserId()) return null;
  const descriptor = descriptorOf(command);
  if (descriptor.scope === 'gm') return 'only the GM can do that';
  if (descriptor.scope !== 'side') return session.turn === userId ? null : 'it is not your turn';
  const side = descriptor.side(session, command);
  if (side === 'either') {
    return SIDES.some((s) => seatedOn(session.control, s, userId)) ? null : 'you hold no seat in this battle';
  }
  if (!side) return 'that piece belongs to no side';
  return seatedOn(session.control, side, userId) ? null : `you hold no seat on the ${side} side`;
}

/** Which user a client acts as, and the table it acts at. */
export interface SeatPolicy {
  userId: string;
  presence: PresencePort;
}

/** One local user, seated on both sides and GM of the table. The browser plays this way; a
 * hosted table reads its own users instead. */
export const hotSeatPolicy = (userId = HOT_SEAT_USER): SeatPolicy => ({
  userId,
  presence: {
    online: () => true,
    gmUserId: () => userId,
    users: () => [userId],
    // proto: the hot seat's own label, reserved for review with the rest of the seat wording.
    displayName: () => 'This browser',
  },
});
