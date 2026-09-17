import * as PIXI from 'pixi.js';
import { drawBridges } from './Bridges.js';
import { gridOf, type Board, type Cell, type Grid } from '../../engine/index.js';
import { FILL_CELL, type InkAtlas, type InkFrames } from '../ink-sheet.js';
import { inkPatch, type InkGrain, type InkMapSettings } from '../ink-map.js';
import { isPage, PAPER_TILE, type PaperTexture } from '../paper.js';
import { connectedCells } from '../terrain-regions.js';
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
 * The illustrated map: one faint wash per hex, and over each connected patch of a terrain,
 * treated as one canvas, a few pencil drawings standing on a scatter of small marks. The sprites
 * are alpha stencils on flat white (see `scripts/bake-ink.mjs`), so the ink's colour is a
 * sprite tint — a vertex colour, which keeps each atlas to a single draw call — rather than a
 * multiply blend, which would fix the ink at the graphite the art was drawn in.
 */
export class InkLayer {
  private readonly container: PIXI.Container;
  private atlas: InkAtlas | null = null;
  private paper: PIXI.Texture | null = null;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  setAtlas(atlas: InkAtlas | null): void {
    this.atlas = atlas;
  }

  /** The paper tile named by the settings, once it has loaded; null draws the wash alone. */
  setPaper(texture: PIXI.Texture | null): void {
    this.paper = texture;
  }

  draw(board: Board, size: number, appearance: InkMapAppearance): void {
    this.clear();
    const grid = gridOf(board);
    const { settings } = appearance;
    const texture = settings.grain.texture;
    const paper = !!this.paper && texture !== 'none' && settings.grain.strength > 0;
    const page = paper && isPage(texture as PaperTexture);
    const wash = new PIXI.Graphics();
    wash.name = 'Ink_wash';
    // On a page the terrain colour is a stain over the sheet, drawn apart from the opaque
    // paper under it. Multiply keeps every grain of the page under the colour; laid on as
    // translucent paint, the pale washes lightened the sheet to a flat pastel.
    const colour = new PIXI.Graphics();
    colour.name = 'Ink_colour';
    colour.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    const sprites = new PIXI.Container();
    sprites.name = 'Ink_sprites';
    const patches = new Map<TerrainGroup, Cell[]>();
    for (const cell of grid.cells()) {
      const group = appearance.groups?.[grid.key(cell)] ?? terrainGroup(board, cell);
      patches.set(group, [...(patches.get(group) ?? []), cell]);
    }
    for (const [group, cells] of patches) {
      const terrain = settings.terrains[group];
      const ground = page ? terrain.colour : mix(settings.paper, terrain.colour, settings.wash);
      const heroFrames = this.atlas?.hero[group];
      const fillFrames = this.atlas?.fill[group];
      for (const patch of connectedCells(grid, cells)) {
        const drawn = inkPatch(grid, patch, size, settings, terrain.scale, !!heroFrames?.length);
        const shaded = mix(ground, drawn.shade > 0 ? 0xffffff : 0x000000, settings.variation * Math.abs(drawn.shade));
        for (const cell of patch) {
          const vertices = grid.vertices(cell, size);
          if (page) {
            wash.beginFill(settings.paper, 1).drawPolygon(vertices).endFill();
            colour.beginFill(shaded, settings.wash).drawPolygon(vertices).endFill();
          } else {
            wash.beginFill(shaded, 1).drawPolygon(vertices).endFill();
          }
        }
        if (fillFrames?.length) {
          for (const mark of drawn.fills) {
            const sprite = this.sprite(pick(fillFrames, mark.variant), settings.ink.colour, settings.fill.opacity);
            sprite.position.copyFrom(mark.position);
            sprite.scale.set(mark.cell / FILL_CELL);
            sprites.addChild(sprite);
          }
        }
        if (!heroFrames?.length) continue;
        for (const hero of drawn.heroes) {
          const frame = pick(heroFrames, hero.variant);
          const sprite = this.sprite(frame, settings.ink.colour, settings.ink.opacity);
          sprite.position.copyFrom(hero.position);
          sprite.scale.set(hero.width / frame.width);
          sprites.addChild(sprite);
        }
      }
    }
    // Back to front, marks and drawings together, so a tree in front overlaps one behind
    // whichever kind each is.
    sprites.children.sort((a, b) => a.y - b.y);
    this.container.addChild(wash);
    if (paper) this.container.addChild(this.sheet(grid, size, settings.grain, page));
    if (page) this.container.addChild(colour);
    this.container.addChild(sprites);
    this.container.addChild(drawBridges(board, size));
    if (!appearance.elevationMarks) return;
    const tint = new PIXI.Graphics();
    tint.name = 'Ink_elevation';
    const style = elevationLabelStyle(settings.ink.colour, settings.paper, size);
    this.container.addChild(tint, drawElevationMarks(tint, grid, board, size, style));
  }

  /** The paper tile clipped to the hexes, under the pencil: a page laid over the paper colour
   * at its strength, or a grain multiplied over the opaque wash, where an alpha weighs the
   * grain rather than fading it to the mat behind. The tile spans a set count of hexes, so
   * the grain keeps its size against the drawing however the board is fitted. */
  private sheet(grid: Grid, size: number, { strength, hexes }: InkGrain, page: boolean): PIXI.Container {
    const bounds = grid.bounds(size);
    const paper = new PIXI.TilingSprite(this.paper!, bounds.width, bounds.height);
    paper.name = page ? 'Ink_page' : 'Ink_grain';
    paper.blendMode = page ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.MULTIPLY;
    paper.alpha = strength;
    paper.tileScale.set((size * hexes) / PAPER_TILE);
    const mask = new PIXI.Graphics();
    for (const cell of grid.cells()) mask.beginFill(0xffffff).drawPolygon(grid.vertices(cell, size)).endFill();
    paper.mask = mask;
    paper.addChild(mask);
    return paper;
  }

  private sprite(frame: PIXI.Texture, tint: number, alpha: number): PIXI.Sprite {
    const sprite = new PIXI.Sprite(frame);
    sprite.anchor.set(0.5);
    sprite.tint = tint;
    sprite.alpha = alpha;
    return sprite;
  }

  clear(): void {
    for (const child of this.container.removeChildren()) child.destroy({ children: true });
  }
}

const pick = (frames: NonNullable<InkFrames[TerrainGroup]>, variant: number): PIXI.Texture =>
  frames[Math.min(frames.length - 1, Math.floor(variant * frames.length))];
