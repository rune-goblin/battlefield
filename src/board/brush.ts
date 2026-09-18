import type { SquareTerrain } from '../engine/index.js';
import type { BoardTheme } from './theme.js';

/**
 * What a paint stroke does to the cells and edges it covers. `wall-clear` and `erase` are
 * their own kinds rather than a flag on the event, so a `paint` event's `brush` alone
 * describes the whole operation — right-drag simply substitutes the erase form.
 */
export type Brush =
  | { kind: 'terrain'; terrain: SquareTerrain }
  | { kind: 'elevation'; level: number }
  | { kind: 'wall'; tier: number }
  | { kind: 'wall-clear' }
  | { kind: 'erase' };

export const isEdgeBrush = (brush: Brush | null): boolean =>
  brush?.kind === 'wall' || brush?.kind === 'wall-clear';

/** Right-drag erases with the same brush: open ground, elevation 0, or no wall. */
export function eraseForm(brush: Brush): Brush {
  switch (brush.kind) {
    case 'terrain': return { kind: 'terrain', terrain: 'open' };
    case 'elevation': return { kind: 'elevation', level: 0 };
    case 'wall':
    case 'wall-clear': return { kind: 'wall-clear' };
    case 'erase': return brush;
  }
}

export function brushColour(brush: Brush, theme: BoardTheme): number {
  switch (brush.kind) {
    case 'terrain': return theme.terrain[brush.terrain];
    case 'elevation': return brush.level ? theme.ink : theme.band;
    case 'wall': return theme.rule;
    case 'wall-clear':
    case 'erase': return theme.accent;
  }
}

export const sameBrush = (a: Brush | null, b: Brush | null): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Palette order, shared by the stage's buttons and the `1`–`7` keyboard brushes. */
export const BRUSH_TERRAINS: SquareTerrain[] = ['open', 'forest', 'swamp', 'shallows', 'water', 'settlement', 'bridge', 'rough'];
