import { wallsFor } from './walls.js';
import { CONDITIONS } from './conditions.js';
import type { Board } from './board.js';
import type { Unit } from './types.js';

/** Everything a piece can be under until it lapses, in the order the board stacks it: the stance
 * it chose, its fortified position, what enemies did to it, then its own side's spells.
 * Art resolves each name to an icon. This list is the only one: events, board slots, combat text
 * and their words are all typed against it. */
export const STATUSES = [
  'guard', 'fortified',
  'pinned', 'rooted', 'suppressed', 'stunned', 'frightened', 'exposed', 'persistent',
  'aegis', 'warded', 'stoneskin', 'sure-strike', 'wrath', 'hasted', 'sure-footing', 'burst-of-speed', 'inspired',
] as const;

export type Status = typeof STATUSES[number];

const HOLDS = {
  fortified: (u, board) => u.status === 'active' && board ? wallsFor(board).fortifiedAt(u.square)?.regions.join('|') : null,
} as Record<Status, (u: Unit, board?: Board) => unknown>;
for (const spec of Object.values(CONDITIONS)) if ('status' in spec) HOLDS[spec.status] = spec.holds;

export const statusesOf = (u: Unit, board?: Board): Status[] => STATUSES.filter((status) => HOLDS[status](u, board));

/** The statuses `after` holds that `before` did not, or holds from a new source. */
export const statusesGained = (before: Unit, after: Unit, beforeBoard?: Board, afterBoard?: Board): Status[] =>
  STATUSES.filter((status) => HOLDS[status](after, afterBoard) && HOLDS[status](after, afterBoard) !== HOLDS[status](before, beforeBoard));
