/** The piece's footprint, as a fraction of cell size: how wide the miniature draws and where
 * the markers hang off it. Clicks are answered by the hex, not the footprint — see `hit.ts`. */
export const TOKEN_FOOTPRINT_RATIO = 0.82;

// A pointy-top hex is only ~0.577 of a pitch tall above its centre, and a piece drawn to the
// full footprint width overshoots that; dropping the miniature (and the ground it stands on)
// keeps its head inside its own cell.
export const ART_DROP = 0.1;
/** The flag's height, as a fraction of cell size. */
export const FLAG_RATIO = 0.32;
/** How far out along the footprint radius the flag hangs, up and to the right. */
export const FLAG_OFFSET = 0.88;
/** A status icon's box, as a fraction of cell size. */
export const STATUS_RATIO = 0.3;
/** A status joining the column: large over the piece, growing as it fades in, held, then down
 * into its slot. Several joining at once take turns, each starting as the last begins to settle. */
export const STATUS_INTRO = { ratio: 0.85, from: 0.6, fadeMs: 300, holdMs: 500, settleMs: 400 };
/** The column hangs under the flag on the piece's right, since an engine's chip takes the left.
 * It fills downward, and a full column starts another to its right. */
export const STATUS_COLUMN = { rows: 3, pitch: 0.9, gap: 0.02 };
/** How far out along the footprint radius the engine chip sits, up and to the left. */
export const CHIP_OFFSET = 0.72;
/** The chip's framed square and the engine icon inside it, as fractions of cell size. */
export const CHIP_FRAME = 0.3;
export const CHIP_ICON = 0.24;
