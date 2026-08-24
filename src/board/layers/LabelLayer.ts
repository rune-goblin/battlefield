import * as PIXI from 'pixi.js';
import { FILES, SIZE, type Grid } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { createMapText } from './MapTextUtils.js';

/** Coordinate labels (files below, ranks along the left) — a–h / 1–8 either grid. */
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

    for (let file = 0; file < SIZE; file++) {
      const c = grid.center({ file, rank: 0 }, size);
      const text = createMapText({ text: FILES[file], x: c.x, y: bounds.height + margin, style }, this.viewport);
      if (text) this.container.addChild(text);
    }
    for (let rank = 0; rank < SIZE; rank++) {
      const c = grid.center({ file: 0, rank }, size);
      const text = createMapText({ text: String(rank + 1), x: -margin, y: c.y, style, anchorX: 1 }, this.viewport);
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
