import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';

export interface GridSettings { visible: boolean; width: number }
export const DEFAULT_GRID_SETTINGS: GridSettings = { visible: false, width: 1 };

/**
 * The faint reference hairline traced over every cell — off by default, opted into from the
 * map controls' settings dialog. Kept apart from `TerrainLayer` so toggling it, or dragging its
 * width slider, never re-touches terrain fills or regenerates procedural textures.
 */
export class GridLayer {
  private readonly container: PIXI.Container;
  private grid: Grid | null = null;
  private size = 0;
  private theme: BoardTheme | null = null;
  private settings: GridSettings = DEFAULT_GRID_SETTINGS;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  setGeometry(grid: Grid | null, size: number, theme: BoardTheme): void {
    this.grid = grid;
    this.size = size;
    this.theme = theme;
    this.redraw();
  }

  setSettings(settings: Partial<GridSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    if (!this.grid || !this.theme || !this.settings.visible || this.settings.width <= 0) return;
    const g = new PIXI.Graphics();
    g.name = 'Grid_hairline';
    g.lineStyle(this.settings.width, this.theme.rule, 0.4);
    for (const cell of this.grid.cells()) g.drawPolygon(this.grid.vertices(cell, this.size));
    this.container.addChild(g);
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy());
  }

  destroy(): void {
    this.clear();
  }
}
