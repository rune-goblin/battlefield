import { type Board, type GridKind, type SquareTerrain } from '../engine/board.js';

export function openBoard(grid: GridKind = 'square', SIZE = 9): Board {
  return {
    spec: { base: 'plains', grid, seed: 0 },
    grid,
    squares: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ terrain: 'open' as SquareTerrain, elevation: 0 }))),
    walls: {},
  };
}
