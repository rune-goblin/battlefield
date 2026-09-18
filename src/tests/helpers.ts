import { type Board, type GridKind, type SquareTerrain } from '../engine/board.js';
import { createLocalArchive } from '../adapters/browser/localArchive.js';
import type { WebStorage } from '../adapters/browser/localRepository.js';
import type { BattleArchive } from '../runtime/ports.js';

export function openBoard(grid: GridKind = 'square', SIZE = 9): Board {
  return {
    spec: { base: 'plains', grid, seed: 0 },
    grid,
    squares: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({ terrain: 'open' as SquareTerrain, elevation: 0 }))),
    walls: {},
  };
}

export function memoryStorage(): WebStorage {
  const items: Record<string, string> = {};
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => { items[key] = value; },
    removeItem: (key) => { delete items[key]; },
  };
}

/** A working archive over throwaway storage, for tests whose commands never touch it. */
export const fakeArchive = (): BattleArchive => createLocalArchive(memoryStorage());
