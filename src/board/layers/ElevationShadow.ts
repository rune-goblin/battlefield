import type * as PIXI from 'pixi.js';
import { BevelFilter } from '@pixi/filter-bevel';
import { DropShadowFilter } from '@pixi/filter-drop-shadow';
import type { ElevationShadows, ShadowLevel } from '../terrain-textures.js';

// One filter per level, kept across redraws and re-tuned in place. A fresh filter for every tick
// of a slider leaves the renderer holding a uniform buffer per instance, none of which it frees.
const bevels = new Map<string, BevelFilter>();
const drops = new Map<string, DropShadowFilter>();

/**
 * The relief a step stands in, as filters over the level's own rendered shape — which is the
 * blend's irregular coverage, so both follow the edge the eye sees rather than the hex outline.
 *
 * The bevel lights the level's own edge: light along the edge facing the light, dark along the
 * one it leaves by, and nothing across the middle of the surface. The drop shadow falls behind
 * the level onto whatever is drawn below it, and never darkens the level itself. Each level is
 * drawn over the ones under it, so this is also what puts a pit in shadow: the ground standing
 * above the floor casts down into it.
 *
 * `step` is the rise this level makes over the one below it, which is what its shadow measures.
 */
export function reliefFilters(key: string, step: ShadowLevel, size: number, settings: ElevationShadows): PIXI.Filter[] {
  const filters: PIXI.Filter[] = [];
  const { bevel: shape, angle, opacity } = settings;
  if (shape.thickness > 0 && (shape.light > 0 || shape.shadow > 0)) {
    const bevel = bevels.get(key) ?? new BevelFilter();
    // The filter's rotation is where its light sits; `angle` is where the shadow falls.
    bevel.rotation = angle + 180;
    bevel.thickness = shape.thickness * size;
    bevel.lightAlpha = shape.light;
    bevel.shadowAlpha = shape.shadow;
    bevels.set(key, bevel);
    filters.push(bevel);
  }
  if (opacity > 0 && (step.distance > 0 || step.softness > 0)) {
    const radians = angle * Math.PI / 180;
    const drop = drops.get(key) ?? new DropShadowFilter();
    drop.offset = { x: Math.cos(radians) * step.distance * size, y: Math.sin(radians) * step.distance * size };
    drop.blur = step.softness * size;
    drop.alpha = opacity;
    drops.set(key, drop);
    filters.push(drop);
  }
  return filters;
}
