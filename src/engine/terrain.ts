import type { SquareTerrain } from './board.js';

export interface TerrainEffect {
  /** Movement points to enter; `Infinity` bars the hex. */
  enter: number;
  defencePenalty: number;
  strikePenalty: number;
  /** Cover against shooting and Blast for a unit in it, and a screen for a unit beyond it. */
  cover: boolean;
  charge: boolean;
  /** Wet ground: Guard buys Brace alone. */
  braceOnly: boolean;
}

const dry = { defencePenalty: 0, strikePenalty: 0, cover: false, charge: true, braceOnly: false };

/** Section 10's terrain table. `public/rules.html` prints these rows. */
export const TERRAIN: Record<SquareTerrain, TerrainEffect> = {
  open: { ...dry, enter: 1 },
  settlement: { ...dry, enter: 1, cover: true, charge: false },
  bridge: { ...dry, enter: 1 },
  forest: { ...dry, enter: 2, cover: true, charge: false },
  rough: { ...dry, enter: 2, charge: false },
  shallows: { ...dry, enter: 2, strikePenalty: 1, charge: false, braceOnly: true },
  swamp: { ...dry, enter: 3, defencePenalty: 1, strikePenalty: 1, charge: false, braceOnly: true },
  // Only a flier enters water, and open water breaks no charge.
  water: { ...dry, enter: Infinity },
};

/** What standing in the hex means to the unit there, for its status line. */
export const TERRAIN_NOTE: Record<SquareTerrain, string> = {
  open: '', bridge: '', water: '',
  settlement: 'settlement +1 ranged cover',
  forest: 'forest +1 ranged cover',
  rough: 'rough ground: no charge crosses it',
  shallows: 'shallows −1 Strike, Brace only',
  swamp: 'swamp −1 Defence and Strike, Brace only',
};

/** Forest hexes along one line that close it. A settlement screens and never blocks. */
export const FOREST_BLOCKS_AT = 2;

/** +1 downhill, −1 uphill, flat however many levels apart. */
export const heightEdge = (from: number, to: number): number => Math.sign(from - to);

/** Hexes of shooting range a shooter gains: one for each level it stands above the target. */
export const heightRange = (from: number, to: number): number => Math.max(0, from - to);

/** An intervening hex blocks sight when it stands at least as high as the higher end and
 * higher than the lower, so two units on one plateau see each other across it. */
export const blocksSight = (between: number, from: number, to: number): boolean =>
  between >= Math.max(from, to) && between > Math.min(from, to);
