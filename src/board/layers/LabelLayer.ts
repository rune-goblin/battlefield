import * as PIXI from 'pixi.js';
import { FILES, type Cell, type Grid } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { createMapText } from './MapTextUtils.js';

/** Coordinate labels: files below, ranks along the left. */
export class LabelLayer {
  private readonly container: PIXI.Container;
  private readonly viewport: PIXI.Container;

  constructor(container: PIXI.Container, viewport: PIXI.Container) {
    this.container = container;
    this.viewport = viewport;
  }

  draw(grid: Grid, size: number, theme: BoardTheme): void {
    this.clear();
    const bounds = grid.bounds(size);
    const margin = size * 0.28;
    const style: Partial<PIXI.ITextStyle> = {
      fontFamily: 'Signika, sans-serif',
      fontSize: Math.max(10, Math.min(15, size * 0.32)),
      fill: theme.ink,
      stroke: theme.background,
      strokeThickness: 3,
      align: 'center',
    };

    // A hexagonal board has no full first rank or file, so each label hangs off the outermost
    // cell its own file or rank actually has.
    const cells = grid.cells();
    const outermost = (group: (c: Cell) => number, pick: (c: Cell) => number): Map<number, Cell> => {
      const best = new Map<number, Cell>();
      for (const c of cells) {
        const held = best.get(group(c));
        if (!held || pick(c) < pick(held)) best.set(group(c), c);
      }
      return best;
    };

    for (const [file, cell] of outermost((c) => c.file, (c) => c.rank)) {
      const c = grid.center(cell, size);
      const text = createMapText({ text: FILES[file], x: c.x, y: bounds.height + margin, style }, this.viewport);
      if (text) this.container.addChild(text);
    }
    for (const [rank, cell] of outermost((c) => c.rank, (c) => c.file)) {
      const c = grid.center(cell, size);
      const text = createMapText({ text: String(rank + 1), x: c.x - size * 0.62 - margin, y: c.y, style, anchorX: 1 }, this.viewport);
      if (text) this.container.addChild(text);
    }
  }

  /** Keep the labels a constant on-screen size as the viewport zooms. */
  rescale(): void {
    const inverse = 1 / Math.max(0.3, this.viewport.scale.x || 1);
    for (const child of this.container.children) child.scale.set(inverse);
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy());
  }
}
