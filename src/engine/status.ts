import { wallsFor } from './walls.js';
import type { Board } from './board.js';
import type { Unit } from './types.js';

/** Everything a piece can be under until it lapses, in the order the board stacks it: the stance
 * it chose, its fortified position, what enemies did to it, then its own side's spells.
 * Art resolves each name to an icon. This list is the only one: events, board slots, popups
 * and their words are all typed against it. */
export const STATUSES = [
  'guard', 'fortified',
  'pinned', 'rooted', 'suppressed', 'stunned', 'frightened', 'exposed', 'persistent',
  'aegis', 'warded', 'stoneskin', 'sure-strike', 'wrath', 'hasted', 'sure-footing', 'burst-of-speed', 'inspired',
] as const;

export type Status = typeof STATUSES[number];

// Each reads the value that holds the status, so a second shooter's pin on a piece already
// pinned counts as a change.
const HOLDS: Record<Status, (u: Unit, board?: Board) => unknown> = {
  fortified: (u, board) => u.status === 'active' && board ? wallsFor(board).fortifiedAt(u.square)?.regions.join('|') : null,
  guard: (u) => u.guard !== null,
  pinned: (u) => u.pinnedBy,
  rooted: (u) => u.rooted > 0,
  suppressed: (u) => u.suppressedBy,
  stunned: (u) => u.stunned,
  frightened: (u) => u.frightened,
  exposed: (u) => u.exposed,
  persistent: (u) => u.persistent !== null,
  aegis: (u) => u.aegis !== null,
  warded: (u) => u.ward,
  stoneskin: (u) => u.stoneskin,
  'sure-strike': (u) => u.sureStrike,
  wrath: (u) => u.wrath,
  hasted: (u) => u.haste > 0,
  'sure-footing': (u) => u.sureFooting,
  'burst-of-speed': (u) => (u.movementBonus ?? 0) > 0,
  inspired: (u) => u.inspired,
};

export const statusesOf = (u: Unit, board?: Board): Status[] => STATUSES.filter((status) => HOLDS[status](u, board));

/** The statuses `after` holds that `before` did not, or holds from a new source. */
export const statusesGained = (before: Unit, after: Unit, beforeBoard?: Board, afterBoard?: Board): Status[] =>
  STATUSES.filter((status) => HOLDS[status](after, afterBoard) && HOLDS[status](after, afterBoard) !== HOLDS[status](before, beforeBoard));
