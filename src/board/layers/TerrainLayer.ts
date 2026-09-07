import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Grid, type Square, type SquareTerrain } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import type { ScatterKind, TerrainAtlas } from '../terrain-sheet.js';
import { isGround, scatterGroup, type ScatterStyle } from './TerrainScatter.js';
import { hsbMatrix, hue, isIdentityHsb, mix, type Hsb } from './color.js';

import { TerrainBlendMasks } from './TerrainBlendMasks.js';
import { MASK_PITCH } from '../terrain-blending.js';
import { terrainRegions } from '../terrain-regions.js';
import { reliefFilters } from './ElevationShadow.js';
import { areaTrees, forestTrees, type ForestTree } from '../forest-placement.js';
import { GROUP_TERRAIN, terrainGroup, TEXTURE_CHOICES, type TerrainAppearance, type TerrainGroup, type TreeTint } from '../terrain-textures.js';
import { drawElevationMarks, elevationLabelStyle } from '../map-lines.js';

const TEXTURE_TILE = 32;

// Which terrain reads as which quadrant of the scatter sheets. Shallows takes the water art at
// its own thinner setting — broken water over the pale bed, against open water's full cover.
// Boulders and mounds hang off elevation rather than terrain: this board has no mountain or
// hill terrain type, and height is what that art is drawing. The sheets' desert and badlands
// quadrants have no terrain to land on yet. proto: see docs/plans/pixi-board.todos.md.
interface Scenery { kind: ScatterKind; style?: ScatterStyle }
const SCATTER_TERRAIN: Partial<Record<SquareTerrain, Scenery>> = {
  open: { kind: 'plains' },
  forest: { kind: 'trees' },
  swamp: { kind: 'swamp' },
  water: { kind: 'water' },
  shallows: { kind: 'water', style: 'shallows' },
};
// A tree's own shadow, in the same light as the ground's: thrown a fraction of the crown's own
// width, so a bigger tree reaches further, and blurred by the cell pitch.
const TREE_SHADOW = { distance: 0.2, blur: 0.045, alpha: 0.38 };
// One filter for the layer, kept across redraws: a new BlurFilter per stroke leaves the
// renderer holding a uniform buffer it never frees.
let treeShadowBlur: PIXI.BlurFilter | null = null;
function treeBlur(strength: number): PIXI.BlurFilter {
  treeShadowBlur ??= new PIXI.BlurFilter(strength);
  treeShadowBlur.blur = strength;
  return treeShadowBlur;
}
// proto: the logs and the bare crowns on trees02.webp, keyed by where each sits on the sheet so
// a re-bake that reorders the frames still finds them. They are its eight shortest frames — a
// canopy spreads, a fallen trunk does not — and a wood full of them reads as a woodpile, so
// they are drawn a fifth as often as a tree in leaf.
const SPARSE_TREES = new Set(['176,192', '335,194', '643,647', '946,649', '492,651', '640,26', '482,490', '18,949']);
const SPARSE_TREE_WEIGHT = 0.2;
function treePicker(frames: PIXI.Texture[]): (variant: number) => PIXI.Texture {
  let total = 0;
  const cumulative = frames.map((frame) => {
    total += SPARSE_TREES.has(`${frame.frame.x},${frame.frame.y}`) ? SPARSE_TREE_WEIGHT : 1;
    return total;
  });
  return (variant) => frames[cumulative.findIndex(edge => variant * total < edge)] ?? frames[0];
}
/** A tree's own wash, as a multiply tint. Tint is a vertex colour in Pixi, so a wood of a
 * hundred differently-coloured crowns still batches into one draw call; a colour filter per
 * sprite would be a render pass per sprite. The cost is that a tint can only take colour away
 * — it darkens as it saturates, which is what a wash on foliage does anyway. */
function treeTint(tree: ForestTree, tint: TreeTint): number {
  if (tint.strength <= 0) return 0xffffff;
  return mix(0xffffff, hue(tint.hue + (tree.hue * 2 - 1) * tint.spread), tint.strength * tree.shade);
}
const scatterForElevation = (level: number): Scenery | null =>
  level >= 2 ? { kind: 'boulders' } : level === 1 ? { kind: 'mounds' } : null;

/**
 * Cell fills, procedural texture overlays, and elevation tint/outline/numerals. One
 * `PIXI.Graphics` per terrain type present on the board, grouped the way Reignmaker's
 * `renderTerrainOverlay` groups hexes by type before drawing (services/map/renderers/
 * TerrainRenderer.ts) — cheaper than one Graphics per cell. A textured type gets a second
 * Graphics of the same shape to mask its overlay, since PIXI stops rendering whatever it is
 * handed as a mask.
 */
export class TerrainLayer {
  private readonly container: PIXI.Container;
  private readonly textureCache = new Map<SquareTerrain, PIXI.Texture>();
  private atlas: TerrainAtlas | null = null;
  private appearance: TerrainAppearance | null = null;
  private readonly artTextures = new Map<string, PIXI.Texture>();
  private loadVersion = 0;
  private readonly blendMasks = new TerrainBlendMasks();
  // One colour-grade filter per terrain group, kept across redraws: a new ColorMatrixFilter
  // per stroke of a slider leaves the renderer holding uniform buffers it never frees.
  private readonly grades = new Map<TerrainGroup, PIXI.ColorMatrixFilter>();

  async setAppearance(appearance: TerrainAppearance | null): Promise<void> {
    this.appearance = appearance;
    const version = ++this.loadVersion;
    if (!appearance) return;
    await Promise.all(Object.entries(appearance.settings.terrains).map(async ([group, setting]) => {
      const choice = TEXTURE_CHOICES[group as TerrainGroup].find(t => t.id === setting.texture);
      if (!choice || this.artTextures.has(choice.id)) return;
      try {
        const texture = await PIXI.Assets.load<PIXI.Texture>(choice.url);
        if (version === this.loadVersion) this.artTextures.set(choice.id, texture);
      } catch (error) {
        console.warn(`Terrain texture unavailable: ${choice.name}`, error);
      }
    }));
  }

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  /** The scatter sheet, once it has loaded. Until then — and if it fails to load at all —
   * every terrain falls back to its procedural pattern. The caller redraws. */
  setAtlas(atlas: TerrainAtlas | null): void {
    this.atlas = atlas;
  }

  draw(renderer: PIXI.IRenderer, board: Board, size: number, theme: BoardTheme): void {
    this.clear();
    const grid = gridOf(board);
    if (this.appearance) {
      this.drawTextures(grid, board, size, theme, this.appearance);
      return;
    }

    const byTerrain = new Map<SquareTerrain, Square[]>();
    for (const sq of grid.cells()) {
      const terrain = at(board, sq).terrain;
      const list = byTerrain.get(terrain);
      if (list) list.push(sq); else byTerrain.set(terrain, [sq]);
    }

    const shapeOf = (squares: Square[], colour: number): PIXI.Graphics => {
      const g = new PIXI.Graphics();
      g.beginFill(colour, 1);
      for (const sq of squares) g.drawPolygon(grid.vertices(sq, size));
      g.endFill();
      return g;
    };

    for (const [terrain, squares] of byTerrain) {
      const fill = shapeOf(squares, theme.terrain[terrain]);
      fill.name = `Terrain_${terrain}`;
      this.container.addChild(fill);

      if (this.atlas && SCATTER_TERRAIN[terrain]) continue; // scenery replaces the pattern

      const texture = this.textureFor(renderer, terrain, theme);
      if (texture) {
        const bounds = grid.bounds(size);
        const tiling = new PIXI.TilingSprite(texture, bounds.width, bounds.height);
        tiling.name = `Terrain_${terrain}_texture`;
        // A second Graphics of the same shape: PIXI's mask setter sets renderable=false on
        // whatever it is given, so masking with `fill` itself would erase the terrain colour.
        const clip = shapeOf(squares, 0xffffff);
        clip.name = `Terrain_${terrain}_clip`;
        this.container.addChild(clip);
        tiling.mask = clip;
        this.container.addChild(tiling);
      }
    }

    const labels = this.drawElevation(grid, board, size, theme);
    // Over the elevation wash, under its numerals: a wood on high ground should still read as
    // a wood rather than as trees behind frosted glass, and the numeral has to stay findable.
    this.drawScatter(grid, board, size, theme);
    this.container.addChild(labels);
  }

  private drawTextures(grid: Grid, board: Board, size: number, theme: BoardTheme, appearance: TerrainAppearance): void {
    // A surface per terrain group per height, lowest first: the blend has to know which side
    // of a step each surface stands on, and a group painted across two heights is two
    // surfaces sharing one texture.
    const byKey = new Map<string, { group: TerrainGroup; level: number; cells: Square[] }>();
    for (const cell of grid.cells()) {
      const group = appearance.groups?.[grid.key(cell)] ?? terrainGroup(board, cell);
      const level = at(board, cell).elevation;
      const entry = byKey.get(`${group}:${level}`) ?? { group, level, cells: [] };
      entry.cells.push(cell);
      byKey.set(`${group}:${level}`, entry);
    }
    const entries = [...byKey.values()].sort((a, b) => a.level - b.level);
    const bounds = grid.bounds(size);
    const edge = appearance.settings.edges;
    const blended = !appearance.compareHard && edge.mode !== 'hard' && edge.width > 0;
    const shape = (cells: Square[], colour: number) => {
      const graphics = new PIXI.Graphics();
      for (const region of terrainRegions(grid, cells, size)) {
        graphics.beginFill(colour).drawPolygon(region.outline);
        for (const hole of region.holes) graphics.beginHole().drawPolygon(hole).endHole();
        graphics.endFill();
      }
      return graphics;
    };
    const surfaces = new PIXI.Container();
    this.container.addChild(surfaces);
    // Masks are wanted even under hard edges, since the shadows read their shape from the same
    // coverage — which with hard edges is simply the hex outline.
    const masks = this.blendMasks.get(grid, entries, blended ? edge : { ...edge, mode: 'hard' });
    if (blended) {
      const outline = shape(grid.cells(), 0xffffff);
      this.container.addChild(outline);
      surfaces.mask = outline;
    }
    masks.forEach((level, index) => {
      const layer = new PIXI.Container();
      layer.name = `Terrain_level_${level.level}`;
      entries.filter(entry => entry.level === level.level).forEach(({ group, cells }, index) => {
        const surface = new PIXI.Container();
        surface.name = `Terrain_${group}_${level.level}`;
        // Every material includes its opaque fill. Blend the whole material so transparent
        // shallows and plain terrain take part without leaving gaps in the board.
        surface.addChild(new PIXI.Graphics().beginFill(theme.terrain[GROUP_TERRAIN[group]]).drawRect(0, 0, bounds.width, bounds.height).endFill());
        const setting = appearance.settings.terrains[group];
        const texture = setting.texture ? this.artTextures.get(setting.texture) : null;
        if (texture) {
          const tiling = new PIXI.TilingSprite(texture, bounds.width, bounds.height);
          tiling.name = `Terrain_${group}_texture`;
          tiling.tileScale.set(size * setting.scale / texture.width);
          if (group === 'shallows') tiling.alpha = 0.65;
          // The grade is on the art alone: the opaque fill under it stays the terrain's own
          // colour, so dialling a texture grey leaves the ground it covers where it was.
          if (!isIdentityHsb(setting.hsb)) tiling.filters = [this.grade(group, setting.hsb)];
          surface.addChild(tiling);
        }
        layer.addChild(surface);
        if (!blended) {
          const clip = shape(cells, 0xffffff);
          this.container.addChild(clip);
          surface.mask = clip;
        } else if (index > 0) {
          // The first material of a level is its opaque backing; conditional masks compose all
          // later materials into the normalized mixture, with no dark seams at intersections.
          surface.mask = this.clipSprite(level.surfaces[index], size);
        }
      });
      // Height is stacking, not mixing: each level covers the ones below it outright, so
      // nothing lower can appear on top of it. Only the boundary itself is soft.
      if (blended && level.stack) layer.mask = this.clipSprite(level.stack, size);
      // The relief goes on a wrapper rather than on the level itself: a filter and a mask on the
      // same object leave the shadow clipped to the level's own shape, which is the one place a
      // drop shadow must never land. The rise over the level below is what the shadow measures,
      // so a mesa on a shelf throws the one-step shadow, not the two-step one.
      const rise = index === 0 ? 0 : Math.abs(level.level - masks[index - 1].level);
      const relief = rise === 0 ? [] : reliefFilters(
        `Elevation_${level.level}`,
        rise === 1 ? appearance.settings.shadows.level1 : appearance.settings.shadows.level2,
        size, appearance.settings.shadows,
      );
      if (!relief.length) { surfaces.addChild(layer); return; }
      const relieved = new PIXI.Container();
      relieved.name = `Elevation_relief_${level.level}`;
      relieved.addChild(layer);
      relieved.filters = relief;
      surfaces.addChild(relieved);
    });
    const labels = appearance.elevationMarks === false ? null : this.drawElevation(grid, board, size, theme);
    this.drawForest(grid, size, entries.filter(entry => entry.group === 'forest').flatMap(entry => entry.cells), appearance);
    if (labels) this.container.addChild(labels);
  }

  private grade(group: TerrainGroup, hsb: Hsb): PIXI.ColorMatrixFilter {
    const filter = this.grades.get(group) ?? new PIXI.ColorMatrixFilter();
    filter.matrix = hsbMatrix(hsb);
    this.grades.set(group, filter);
    return filter;
  }

  /** A mask sprite over the whole board. PIXI needs it in the display list to transform it,
   * so it is parked on the layer container rather than left loose. */
  private clipSprite(texture: PIXI.Texture, size: number): PIXI.Sprite {
    const clip = new PIXI.Sprite(texture);
    clip.scale.set(size / MASK_PITCH);
    this.container.addChild(clip);
    return clip;
  }

  /** The wood, and the shadow it throws. One blur over the whole shadow layer: a filter per
   * tree would be a render pass per tree. */
  private drawForest(grid: Grid, size: number, cells: Square[], appearance: TerrainAppearance): void {
    const frames = this.atlas?.trees;
    if (!frames?.length || !cells.length) return;
    const pick = treePicker(frames);
    const radians = appearance.settings.shadows.angle * Math.PI / 180;
    const dx = Math.cos(radians) * TREE_SHADOW.distance;
    const dy = Math.sin(radians) * TREE_SHADOW.distance;
    const shadows = new PIXI.Container();
    shadows.name = 'Scatter_tree_shadows';
    shadows.alpha = TREE_SHADOW.alpha;
    shadows.filters = [treeBlur(size * TREE_SHADOW.blur)];
    const trees = new PIXI.Container();
    trees.name = 'Scatter_trees';
    const settings = appearance.settings.trees;
    const placed: ForestTree[] = [];
    if (settings.area) placed.push(...areaTrees(grid, cells, size, settings));
    // Per hex, each cell is planted against every tree standing so far, so the wood spaces
    // itself across shared edges rather than clumping inside each hex.
    else for (const cell of cells) placed.push(...forestTrees(grid, cell, size, settings, placed));
    placed.forEach((tree, index) => {
      const frame = pick(tree.variant);
      const sprite = new PIXI.Sprite(frame);
      sprite.name = `Tree_${index}`;
      sprite.tint = treeTint(tree, settings.tint);
      sprite.anchor.set(0.5);
      sprite.position.copyFrom(tree.position);
      sprite.rotation = tree.rotation;
      sprite.scale.set(tree.size / Math.max(frame.width, frame.height));
      trees.addChild(sprite);
      const shadow = new PIXI.Sprite(frame);
      shadow.anchor.set(0.5);
      shadow.position.set(tree.position.x + dx * tree.size, tree.position.y + dy * tree.size);
      shadow.rotation = tree.rotation;
      shadow.scale.copyFrom(sprite.scale);
      shadow.tint = 0x000000;
      shadows.addChild(shadow);
    });
    trees.children.sort((a, b) => a.y - b.y);
    this.container.addChild(shadows, trees);
  }

  private drawScatter(grid: Grid, board: Board, size: number, theme: BoardTheme): void {
    const atlas = this.atlas;
    if (!atlas) return;
    const groups = new Map<ScatterStyle, { scenery: Scenery; cells: Square[] }>();
    const add = (scenery: Scenery, sq: Square) => {
      const style = scenery.style ?? scenery.kind;
      const group = groups.get(style);
      if (group) group.cells.push(sq); else groups.set(style, { scenery, cells: [sq] });
    };
    for (const sq of grid.cells()) {
      const cell = at(board, sq);
      const terrain = SCATTER_TERRAIN[cell.terrain];
      if (terrain) add(terrain, sq);
      const height = scatterForElevation(cell.elevation);
      if (height) add(height, sq);
    }
    // Ground cover first, then props: a wood should stand on its field, not under it.
    const ordered = [...groups].sort(([a], [b]) => Number(isGround(b)) - Number(isGround(a)));
    for (const [style, { scenery, cells }] of ordered) {
      const painted = scatterGroup(grid, size, { kind: scenery.kind, style, cells }, atlas, theme);
      if (painted) this.container.addChild(painted);
    }
  }

  private drawElevation(grid: Grid, board: Board, size: number, theme: BoardTheme): PIXI.Container {
    const tint = new PIXI.Graphics();
    tint.name = 'Terrain_elevation';
    const labels = drawElevationMarks(tint, grid, board, size, elevationLabelStyle(theme.ink, theme.background, size));
    this.container.addChild(tint);
    return labels;
  }

  private textureFor(renderer: PIXI.IRenderer, type: SquareTerrain, theme: BoardTheme): PIXI.Texture | null {
    if (type === 'open') return null; // proto: open ground stays a flat fill, no overlay
    const cached = this.textureCache.get(type);
    if (cached) return cached;

    const g = new PIXI.Graphics();
    const ink = theme.ink;
    switch (type) {
      case 'forest':
        for (const [x, y, r] of [[6, 9, 2.6], [19, 6, 2.2], [11, 21, 2.8], [25, 23, 2.2], [16, 15, 2.4]] as const) {
          g.beginFill(ink, 0.55).drawCircle(x, y, r).endFill();
        }
        break;
      case 'swamp':
        g.lineStyle(1.4, ink, 0.5);
        for (const [x, y] of [[5, 5], [15, 10], [26, 4], [9, 22], [22, 19], [29, 27]] as const) {
          g.moveTo(x, y + 6).lineTo(x - 1, y - 6);
        }
        break;
      case 'water':
      case 'shallows':
        g.lineStyle(1.2, ink, 0.4);
        for (const y of [6, 16, 26]) {
          g.moveTo(0, y).bezierCurveTo(8, y - 4, 8, y + 4, 16, y).bezierCurveTo(24, y - 4, 24, y + 4, 32, y);
        }
        break;
      case 'settlement':
        g.lineStyle(1, ink, 0.4);
        for (let row = 0; row < 4; row++) {
          const y = row * 8 + 2;
          const offset = row % 2 ? 8 : 0;
          for (let x = offset - 8; x < TEXTURE_TILE; x += 16) g.drawRect(x, y, 12, 5);
        }
        break;
      default:
        g.destroy();
        return null;
    }

    const texture = renderer.generateTexture(g, { region: new PIXI.Rectangle(0, 0, TEXTURE_TILE, TEXTURE_TILE) });
    g.destroy();
    this.textureCache.set(type, texture);
    return texture;
  }

  clear(): void {
    const children = this.container.removeChildren();
    // Null masks before destroying: a texture TilingSprite's mask is its terrain's fill
    // Graphics, which sits earlier in this same list — destroy order must not leave a mask
    // reference dangling on an object not yet destroyed.
    const releaseMasks = (object: PIXI.DisplayObject): void => {
      object.mask = null;
      if (object instanceof PIXI.Container) for (const child of object.children) releaseMasks(child);
    };
    for (const c of children) releaseMasks(c);
    for (const c of children) c.destroy({ children: true });
  }

  destroy(): void {
    this.loadVersion++;
    this.artTextures.clear();
    for (const filter of this.grades.values()) filter.destroy();
    this.grades.clear();
    this.clear();
    this.blendMasks.destroy();
    for (const texture of this.textureCache.values()) texture.destroy(true);
    this.textureCache.clear();
  }
}
