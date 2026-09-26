import * as PIXI from 'pixi.js';
import { gridOf, type Board, type Square } from '../../engine/index.js';
import {
  DEFAULT_AREA_LINE, DEFAULT_ELEVATION_LINES, drawAreaLines, elevationAreas,
  type ElevationLines, type MapLine,
} from '../map-lines.js';
import { terrainGroup, type TerrainGroup } from '../terrain-textures.js';
import { clearChildren, type BoardLayer, type LayerContext } from './BoardLayer.js';

export interface MapLineSettings {
  area: MapLine;
  elevation: ElevationLines;
  /** The lab exhibits art groups the engine has no terrain for — see `TerrainAppearance`. */
  groups?: Record<string, TerrainGroup>;
}
export const DEFAULT_MAP_LINES: MapLineSettings = {
  area: DEFAULT_AREA_LINE,
  elevation: DEFAULT_ELEVATION_LINES,
};

/**
 * The outlines over the map: one around each terrain area, one around ground standing at each
 * height. Both are the same drawing — a ring around a connected patch — so a raised wood is
 * two rings and not a line that stops where its edge happens to be the board's own rim.
 *
 * Kept above every other layer with the hex grid, and apart from the terrain: these lines are
 * read against the pieces standing on them, and dragging one of their sliders never re-touches
 * a terrain fill or a texture.
 */
export class MapLineLayer implements BoardLayer {
  private readonly container: PIXI.Container;
  private board: Board | null = null;
  private size = 0;
  private settings: MapLineSettings = DEFAULT_MAP_LINES;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  setGeometry(context: LayerContext | null): void {
    this.board = context?.board ?? null;
    this.size = context?.size ?? 0;
    this.redraw();
  }

  setSettings(settings: MapLineSettings): void {
    this.settings = settings;
    this.redraw();
  }

  private redraw(): void {
    this.clear();
    const { board, size, settings } = this;
    if (!board || size <= 0) return;
    const grid = gridOf(board);
    const graphics = new PIXI.Graphics();
    graphics.name = 'Map_lines';

    const areas = new Map<TerrainGroup, Square[]>();
    for (const cell of grid.cells()) {
      const group = settings.groups?.[grid.key(cell)] ?? terrainGroup(board, cell);
      const patch = areas.get(group);
      if (patch) patch.push(cell); else areas.set(group, [cell]);
    }
    drawAreaLines(graphics, grid, size, [...areas.values()], settings.area);

    // Level 2 last: where a mesa's ring runs alongside the shelf's, the higher step is the one
    // that should be on top.
    const bands = elevationAreas(grid, board);
    drawAreaLines(graphics, grid, size, [bands.level1], settings.elevation.level1);
    drawAreaLines(graphics, grid, size, [bands.level2], settings.elevation.level2);

    this.container.addChild(graphics);
  }

  clear(): void {
    clearChildren(this.container);
  }

  destroy(): void {
    this.clear();
  }
}
