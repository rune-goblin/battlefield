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

interface LevelPixels { level: number; surfaces: Uint8Array[]; stack: Uint8Array | null }
interface Baked { field: BlendField; settingsKey: string; levels: LevelPixels[] }

// Every wizard step mounts a board of its own over the same ground, so the field and the mask
// pixels outlive the layer that asked for them. Textures belong to a renderer and stay with it.
const BAKED = new Map<string, Baked>();
const BAKED_KEPT = 4;
function bakedFor(key: string, build: () => BlendField): Baked {
  const baked = BAKED.get(key) ?? { field: build(), settingsKey: '', levels: [] };
  BAKED.delete(key);
  BAKED.set(key, baked);
  if (BAKED.size > BAKED_KEPT) BAKED.delete(BAKED.keys().next().value!);
  return baked;
}

function bakeLevels(field: BlendField, surfaces: Surface[], settings: EdgeBlending): LevelPixels[] {
  const weights = blendWeights(field, settings);
  // Everything at or above a level, which is what stacks that level over the ones below.
  // Its shadow and its bevel are filters over the shape this leaves, not masks of their own.
  const order = [...new Set(surfaces.map(s => s.level))].sort((a, b) => a - b);
  return order.map((level, index) => ({
    level,
    surfaces: blendMaskPixels(shareOf(weights, surfaces.flatMap((s, i) => s.level === level ? [i] : []))),
    stack: index === 0 ? null
      : maskPixels(coverage(field, settings, weights, surfaces.flatMap((s, i) => s.level >= level ? [i] : []))),
  }));
}

/** Keep distance fields and mask textures across texture, tree, scale, and viewport edits. */
export class TerrainBlendMasks {
  private geometryKey = '';
  private settingsKey = '';
  private levels: LevelMasks[] = [];

  /** `surfaces` must arrive sorted by level, lowest first — the order they are drawn in. */
  get(grid: Grid, surfaces: Surface[], settings: EdgeBlending): LevelMasks[] {
    const geometryKey = `${grid.kind}:${grid.bounds(1).width}:${surfaces.map(s => `${s.level}=${s.cells.map(grid.key).join(',')}`).join('|')}`;
    const settingsKey = JSON.stringify(settings);
    if (geometryKey === this.geometryKey && settingsKey === this.settingsKey) return this.levels;
    const baked = bakedFor(geometryKey, () => createBlendField(grid, surfaces.map(s => s.cells)));
    if (baked.settingsKey !== settingsKey) {
      baked.levels = bakeLevels(baked.field, surfaces, settings);
      baked.settingsKey = settingsKey;
    }
    this.destroyTextures();
    const { width, height } = baked.field;
    const texture = (pixels: Uint8Array) => PIXI.Texture.fromBuffer(pixels, width, height, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      alphaMode: PIXI.ALPHA_MODES.NPM,
    });
    this.levels = baked.levels.map(l => ({ level: l.level, surfaces: l.surfaces.map(texture), stack: l.stack && texture(l.stack) }));
    this.geometryKey = geometryKey;
    this.settingsKey = settingsKey;
    return this.levels;
  }

  private destroyTextures(): void {
    for (const level of this.levels) {
      for (const texture of level.surfaces) texture.destroy(true);
      level.stack?.destroy(true);
    }
    this.levels = [];
  }
  destroy(): void { this.destroyTextures(); this.geometryKey = ''; this.settingsKey = ''; }
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
