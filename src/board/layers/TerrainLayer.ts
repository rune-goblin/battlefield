import * as PIXI from 'pixi.js';
import { allSquares, at, gridOf, type Board, type Grid, type Point, type Square, type SquareTerrain } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { shade } from './color.js';

const TEXTURE_TILE = 32;
// Elevation tint alpha per level (0 has none); level 3 clamps to the level-2 value.
const ELEVATION_ALPHA = [0, 0.12, 0.24];

function drawHatch(g: PIXI.Graphics, a: Point, b: Point, lowerCenter: Point, ink: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  let px = -dy / len;
  let py = dx / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((lowerCenter.x - mx) * px + (lowerCenter.y - my) * py < 0) { px = -px; py = -py; }
  const tickLength = 5;
  const step = 6;
  const count = Math.max(1, Math.round(len / step));
  g.lineStyle(1, ink, 0.5);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    g.moveTo(x, y).lineTo(x + px * tickLength, y + py * tickLength);
  }
}

/**
 * Cell fills, procedural texture overlays, elevation tint and slope hatching. One
 * `PIXI.Graphics` per terrain type present on the board, grouped the way Reignmaker's
 * `renderTerrainOverlay` groups hexes by type before drawing (services/map/renderers/
 * TerrainRenderer.ts) — cheaper than one Graphics per cell, and the texture overlay for a
 * type reuses that same fill Graphics as its mask instead of tracking per-cell clip paths.
 */
export class TerrainLayer {
  private readonly container: PIXI.Container;
  private readonly textureCache = new Map<SquareTerrain, PIXI.Texture>();

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  draw(app: PIXI.Application, board: Board, size: number, theme: BoardTheme): void {
    this.clear();
    const grid = gridOf(board);

    const byTerrain = new Map<SquareTerrain, Square[]>();
    for (const sq of allSquares()) {
      const terrain = at(board, sq).terrain;
      const list = byTerrain.get(terrain);
      if (list) list.push(sq); else byTerrain.set(terrain, [sq]);
    }

    for (const [terrain, squares] of byTerrain) {
      const fill = new PIXI.Graphics();
      fill.name = `Terrain_${terrain}`;
      fill.beginFill(theme.terrain[terrain], 1);
      for (const sq of squares) fill.drawPolygon(grid.vertices(sq, size));
      fill.endFill();
      this.container.addChild(fill);

      const texture = this.textureFor(app, terrain, theme);
      if (texture) {
        const bounds = grid.bounds(size);
        const tiling = new PIXI.TilingSprite(texture, bounds.width, bounds.height);
        tiling.name = `Terrain_${terrain}_texture`;
        // Reuses `fill`'s shape as the mask: it is already exactly the union of this
        // terrain's cells, rendered normally *and* referenced here — PIXI masks don't
        // require the mask object to be exclusively a mask.
        tiling.mask = fill;
        this.container.addChild(tiling);
      }
    }

    this.drawElevation(grid, board, size, theme);
  }

  private drawElevation(grid: Grid, board: Board, size: number, theme: BoardTheme): void {
    const tint = new PIXI.Graphics();
    tint.name = 'Terrain_elevation';
    for (const sq of allSquares()) {
      const elevation = at(board, sq).elevation;
      const alpha = ELEVATION_ALPHA[Math.min(elevation, ELEVATION_ALPHA.length - 1)];
      if (!alpha) continue;
      tint.beginFill(theme.ink, alpha).drawPolygon(grid.vertices(sq, size)).endFill();
    }
    this.container.addChild(tint);

    const hatch = new PIXI.Graphics();
    hatch.name = 'Terrain_slope';
    const seen = new Set<string>();
    for (const sq of allSquares()) {
      for (const n of grid.neighbours(sq)) {
        const key = grid.edgeKey(sq, n);
        if (seen.has(key)) continue;
        seen.add(key);
        if (board.walls[key]) continue; // the wall bar reads the drop; no need to hatch too
        const diff = at(board, sq).elevation - at(board, n).elevation;
        if (Math.abs(diff) !== 1) continue; // a 2+ drop is a cliff (EdgeLayer), not a hatch
        const lower = diff > 0 ? n : sq;
        const [a, b] = grid.edgeSegment(sq, n, size);
        drawHatch(hatch, a, b, grid.center(lower, size), theme.ink);
      }
    }
    this.container.addChild(hatch);
  }

  private textureFor(app: PIXI.Application, type: SquareTerrain, theme: BoardTheme): PIXI.Texture | null {
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

    const texture = app.renderer.generateTexture(g, { region: new PIXI.Rectangle(0, 0, TEXTURE_TILE, TEXTURE_TILE) });
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
