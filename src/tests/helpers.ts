import { SIZE, type Board, type SquareTerrain } from '../engine/board.js';

export function openBoard(): Board {
  return {
    spec: { base: 'plains', seed: 0 },
    squares: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ terrain: 'open' as SquareTerrain, elevation: 0 }))),
    walls: {},
  };
}
