import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Grid, type Square, type SquareTerrain } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { shade } from './color.js';

const TEXTURE_TILE = 32;
// Elevation reads as a fill wash plus a contour outline drawn only where elevation actually
// changes between neighbours (see the edge walk in `drawElevation`), not on every cell's own
// perimeter — a same-level pair of cells shares a seamless interior instead of a doubled-up
// internal line. Fill scales linearly with |level| (0 has none — it's the unlit base terrain):
// 10% per level, capped at 60%. The outline holds at a flat 2px and scales only its alpha
// (25% per level) — a widening line at level 2 read as "just another heavy line"
// indistinguishable from a cliff's own weight, where alpha alone still separates the levels
// without competing with it. A fixed white wash for high ground and a fixed black wash for low
// ground, rather than theme.ink, so a level always reads the same direction (lighter above,
// darker below) on every terrain (including water) in both light and dark theme.
function elevationFillAlpha(level: number): number {
  return level === 0 ? 0 : Math.min(0.6, 0.1 * Math.abs(level));
}
function elevationOutline(level: number): { width: number; alpha: number; colour: number } {
  return { width: 2, alpha: Math.min(1, 0.25 * Math.abs(level)), colour: elevationColour(level) };
}
function elevationColour(level: number): number {
  return level >= 0 ? ELEVATION_HIGH : ELEVATION_LOW;
}
const ELEVATION_HIGH = 0xffffff;
const ELEVATION_LOW = 0x000000;
// The in-cell elevation numeral, styled like LabelLayer's coordinate labels (ink fill, a
// background-coloured stroke halo so the digit holds up against any terrain hue in either
// theme) rather than MapTextUtils' drop-shadow presets, which assume a light-on-dark banner.
function elevationLabelStyle(theme: BoardTheme, size: number): Partial<PIXI.ITextStyle> {
  return {
    fontFamily: 'Signika, sans-serif',
    fontWeight: '600',
    fontSize: Math.max(11, Math.min(20, size * 0.34)),
    fill: theme.ink,
    stroke: theme.background,
    strokeThickness: 3,
    align: 'center',
  };
}

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

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  draw(renderer: PIXI.IRenderer, board: Board, size: number, theme: BoardTheme): void {
    this.clear();
    const grid = gridOf(board);

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

    this.drawElevation(grid, board, size, theme);
  }

  private drawElevation(grid: Grid, board: Board, size: number, theme: BoardTheme): void {
    const tint = new PIXI.Graphics();
    tint.name = 'Terrain_elevation';
    const labels = new PIXI.Container();
    labels.name = 'Terrain_elevation_labels';
    const labelStyle = new PIXI.TextStyle(elevationLabelStyle(theme, size));
    for (const sq of grid.cells()) {
      const elevation = at(board, sq).elevation;
      if (elevation === 0) continue;
      tint.beginFill(elevationColour(elevation), elevationFillAlpha(elevation)).drawPolygon(grid.vertices(sq, size)).endFill();

      // A number, not just the wash: level 1 and 2 read close on a busy terrain hue, so the
      // digit is the part that actually answers "how high" — the wash and outline are there
      // for the at-a-glance skim.
      const c = grid.center(sq, size);
      const label = new PIXI.Text(String(elevation), labelStyle);
      label.anchor.set(0.5);
      // Shifted off-centre so a token standing on the cell doesn't fully bury it.
      label.position.set(c.x, c.y - size * 0.32);
      labels.addChild(label);
    }

    // The raised area's own boundary, not every hex inside it: a stroke only where elevation
    // actually changes between neighbours, styled by the higher side's level. Two same-level
    // cells share a seamless interior instead of each drawing its own full hex outline, which
    // doubled up on every internal edge and read as a hex-grid pattern rather than one shape.
    const seen = new Set<string>();
    for (const sq of grid.cells()) {
      for (const n of grid.neighbours(sq)) {
        const key = grid.edgeKey(sq, n);
        if (seen.has(key)) continue;
        seen.add(key);
        if (board.walls[key]) continue; // the wall bar reads the drop; no need to outline too
        const diff = at(board, sq).elevation - at(board, n).elevation;
        if (diff === 0) continue;
        // Drawn on a cliff edge too (on top of EdgeLayer's rock teeth), not just a single-level
        // drop — otherwise a raised area's contour had a gap exactly where its edge happened to
        // be a cliff, instead of wrapping the whole shape. Styled by whichever side is further
        // from 0 — the more extreme of a rise and a pit sharing an edge is the one that reads.
        const sqE = at(board, sq).elevation;
        const nE = at(board, n).elevation;
        const outline = elevationOutline(Math.abs(sqE) >= Math.abs(nE) ? sqE : nE);
        const [a, b] = grid.edgeSegment(sq, n, size);
        tint.lineStyle(outline.width, outline.colour, outline.alpha).moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
    }

    this.container.addChild(tint);
    this.container.addChild(labels);
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
    for (const c of children) if (c instanceof PIXI.DisplayObject) c.mask = null;
    for (const c of children) c.destroy({ children: true });
  }

  destroy(): void {
    this.clear();
    for (const texture of this.textureCache.values()) texture.destroy(true);
    this.textureCache.clear();
  }
}
