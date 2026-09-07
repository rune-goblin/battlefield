import * as PIXI from 'pixi.js';
import type { Cell, Grid } from '../../engine/grid.js';
import { blendMaskPixels, blendWeights, coverage, createBlendField, maskPixels, type BlendField, type EdgeBlending } from '../terrain-blending.js';

export interface LevelMasks {
  level: number;
  /** Within-level blending, one per surface at this level, in the order they are drawn. */
  surfaces: PIXI.Texture[];
  /** What stacks this level over everything below it. Null for the lowest, which is the base. */
  stack: PIXI.Texture | null;
}
export interface Surface { cells: Cell[]; level: number }

/** Keep distance fields and mask textures across texture, tree, scale, and viewport edits. */
export class TerrainBlendMasks {
  private geometryKey = '';
  private settingsKey = '';
  private field: BlendField | null = null;
  private levels: LevelMasks[] = [];

  /** `surfaces` must arrive sorted by level, lowest first — the order they are drawn in. */
  get(grid: Grid, surfaces: Surface[], settings: EdgeBlending): LevelMasks[] {
    const geometryKey = `${grid.kind}:${surfaces.map(s => `${s.level}=${s.cells.map(grid.key).join(',')}`).join('|')}`;
    if (geometryKey !== this.geometryKey) {
      this.field = createBlendField(grid, surfaces.map(s => s.cells));
      this.geometryKey = geometryKey;
      this.settingsKey = '';
    }
    const settingsKey = JSON.stringify(settings);
    if (settingsKey !== this.settingsKey) {
      this.destroyTextures();
      const field = this.field!;
      const weights = blendWeights(field, settings);
      const texture = (pixels: Uint8Array) => PIXI.Texture.fromBuffer(pixels, field.width, field.height, {
        scaleMode: PIXI.SCALE_MODES.LINEAR,
        alphaMode: PIXI.ALPHA_MODES.NPM,
      });
      // Everything at or above a level, which is what stacks that level over the ones below.
      // Its shadow and its bevel are filters over the shape this leaves, not masks of their own.
      const covered = new Map<number, Float32Array>();
      const atOrAbove = (level: number): Float32Array => {
        const known = covered.get(level);
        if (known) return known;
        const value = coverage(field, settings, weights, surfaces.flatMap((s, i) => s.level >= level ? [i] : []));
        covered.set(level, value);
        return value;
      };

      const order = [...new Set(surfaces.map(s => s.level))].sort((a, b) => a - b);
      this.levels = order.map((level, index) => {
        const members = surfaces.flatMap((s, i) => s.level === level ? [i] : []);
        return {
          level,
          surfaces: blendMaskPixels(shareOf(weights, members)).map(texture),
          stack: index === 0 ? null : texture(maskPixels(atOrAbove(level))),
        };
      });
      this.settingsKey = settingsKey;
    }
    return this.levels;
  }

  private destroyTextures(): void {
    for (const level of this.levels) {
      for (const texture of level.surfaces) texture.destroy(true);
      level.stack?.destroy(true);
    }
    this.levels = [];
  }
  destroy(): void { this.destroyTextures(); this.field = null; this.geometryKey = ''; this.settingsKey = ''; }
}

/** The members' shares of the mixture, taken alone: whatever the rest of the board holds at a
 * texel, these surfaces divide their own part of it between them. */
function shareOf(weights: Float32Array[], members: number[]): Float32Array[] {
  const own = members.map(member => weights[member]);
  const shares = own.map(weight => new Float32Array(weight.length));
  for (let i = 0; i < shares[0].length; i++) {
    let total = 0;
    for (const weight of own) total += weight[i];
    if (total <= 0) { shares[0][i] = 1; continue; }
    for (let m = 0; m < own.length; m++) shares[m][i] = own[m][i] / total;
  }
  return shares;
}
