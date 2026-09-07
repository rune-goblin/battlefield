import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import type { MapLine } from '../map-lines.js';

/** One weight for every hex on the board. Height is drawn by `MapLineLayer`'s own rings, so
 * the grid has nothing to say about it and is the same line everywhere. */
export type GridSettings = MapLine;
export type GridUpdate = Partial<MapLine>;

export const DEFAULT_GRID_SETTINGS: GridSettings = { visible: false, width: 1, opacity: 0.5, colour: 0x000000 };

/**
 * The reference hex outline — off by default, opted into from the map controls' settings
 * dialog or the texture lab. Kept apart from `TerrainLayer` so toggling it, or dragging a
 * slider, never re-touches terrain fills or regenerates procedural textures.
 */
export class GridLayer {
  private readonly container: PIXI.Container;
  private grid: Grid | null = null;
  private size = 0;
  private settings: GridSettings = DEFAULT_GRID_SETTINGS;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  setGeometry(grid: Grid | null, size: number): void {
    this.grid = grid;
    this.size = size;
    this.redraw();
  }

  setSettings(update: GridUpdate): void {
    this.settings = { ...this.settings, ...update };
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    const { grid, settings } = this;
    if (!grid || !settings.visible || settings.width <= 0 || settings.opacity <= 0) return;
    const g = new PIXI.Graphics();
    g.name = 'Grid';
    g.lineStyle(settings.width, settings.colour, settings.opacity);
    for (const cell of grid.cells()) g.drawPolygon(grid.vertices(cell, this.size));
    this.container.addChild(g);
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy());
  }

  destroy(): void {
    this.clear();
  }
}
