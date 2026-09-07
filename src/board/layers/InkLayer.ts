import * as PIXI from 'pixi.js';
import { gridOf, type Board } from '../../engine/index.js';
import type { InkAtlas } from '../ink-sheet.js';
import { inkSprite, type InkMapSettings } from '../ink-map.js';
import { terrainGroup, type TerrainGroup } from '../terrain-textures.js';
import { mix } from './color.js';
import { drawElevationMarks, elevationLabelStyle } from '../map-lines.js';

export interface InkMapAppearance {
  settings: InkMapSettings;
  /** The lab exhibits art groups the engine has no terrain for — see `TerrainAppearance`. */
  groups?: Record<string, TerrainGroup>;
  /** The height wash and its numerals, drawn in the pencil on the page. Off unless asked for:
   * on this map the hills and peaks are drawn, and the marks are a reading aid over the top. */
  elevationMarks?: boolean;
}

/**
 * The illustrated map: one faint wash per hex and one pencil drawing standing on it. The
 * sprites are alpha stencils on flat white (see `scripts/bake-ink.mjs`), so the ink's colour is
 * a sprite tint — a vertex colour, which keeps the whole map to a single draw call — rather
 * than a multiply blend, which would fix the ink at the graphite the art was drawn in.
 */
export class InkLayer {
  private readonly container: PIXI.Container;
  private atlas: InkAtlas | null = null;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  setAtlas(atlas: InkAtlas | null): void {
    this.atlas = atlas;
  }

  draw(board: Board, size: number, appearance: InkMapAppearance): void {
    this.clear();
    const grid = gridOf(board);
    const { settings } = appearance;
    const wash = new PIXI.Graphics();
    wash.name = 'Ink_wash';
    const sprites = new PIXI.Container();
    sprites.name = 'Ink_sprites';
    sprites.alpha = settings.ink.opacity;
    for (const cell of grid.cells()) {
      const group = appearance.groups?.[grid.key(cell)] ?? terrainGroup(board, cell);
      const terrain = settings.terrains[group];
      const placed = inkSprite(grid, cell, size, settings.ink, terrain.scale);
      const ground = mix(settings.paper, terrain.colour, settings.wash);
      const shaded = mix(ground, placed.shade > 0 ? 0xffffff : 0x000000, settings.variation * Math.abs(placed.shade));
      wash.beginFill(shaded, 1).drawPolygon(grid.vertices(cell, size)).endFill();

      const frames = this.atlas?.[group];
      if (!frames?.length) continue;
      const frame = frames[Math.min(frames.length - 1, Math.floor(placed.variant * frames.length))];
      const sprite = new PIXI.Sprite(frame);
      sprite.name = `Ink_${grid.key(cell)}`;
      sprite.anchor.set(0.5);
      sprite.position.copyFrom(placed.position);
      sprite.tint = settings.ink.colour;
      const scale = placed.width / frame.width;
      sprite.scale.set(scale, scale);
      sprites.addChild(sprite);
    }
    // Back to front, so a peak drawn on one hex stands in front of whatever is behind it
    // rather than being sliced by it.
    sprites.children.sort((a, b) => a.y - b.y);
    this.container.addChild(wash, sprites);
    if (!appearance.elevationMarks) return;
    const tint = new PIXI.Graphics();
    tint.name = 'Ink_elevation';
    const style = elevationLabelStyle(settings.ink.colour, settings.paper, size);
    this.container.addChild(tint, drawElevationMarks(tint, grid, board, size, style));
  }

  clear(): void {
    for (const child of this.container.removeChildren()) child.destroy({ children: true });
  }
}
