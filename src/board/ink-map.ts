import { seededRandom, type Cell, type Grid, type Point } from '../engine/index.js';

import { DEFAULT_GRID_SETTINGS, type GridSettings } from './layers/GridLayer.js';
import {
  DEFAULT_AREA_LINE, DEFAULT_ELEVATION_LINES, normalizeElevationLines, normalizeMapLine,
  type ElevationLines, type MapLine,
} from './map-lines.js';
import { TERRAIN_GROUPS, type TerrainGroup } from './terrain-textures.js';

/** How the ink itself is drawn: one colour and weight for every sprite on the board, since a
 * pencil map is drawn with one pencil. Size and jitter are in hex pitches. */
export interface InkStyle {
  colour: number;
  opacity: number;
  /** Sprite width as a fraction of the hex's own width, before the group's own multiplier. */
  scale: number;
  /** How far a sprite's width may fall either side of that, 0–1. */
  variation: number;
  /** How far a sprite may wander off its hex's centre, in hex pitches. */
  jitter: number;
  /** Raised off the centre, in hex pitches — positive lifts, so a peak sits above the hex it
   * stands on and its base reads as the near edge. */
  lift: number;
}
export interface InkTerrain { colour: number; scale: number }
export interface InkMapSettings {
  /** The page every wash is printed onto, and the ground of a hex with no colour of its own. */
  paper: number;
  /** How much of the terrain's colour reaches the page, 0–1. The whole point of the style is
   * that this stays low. */
  wash: number;
  /** Per-hex lightness wobble, 0–1, so a run of one terrain is not one flat plate. */
  variation: number;
  terrains: Record<TerrainGroup, InkTerrain>;
  ink: InkStyle;
  /** The same three lines the textured map draws, dialled separately: this style is drawn in
   * pencil and wants its own weights. */
  area: MapLine;
  elevation: ElevationLines;
  grid: GridSettings;
}

// Faint, warm and light: the colour says which terrain a hex is, the drawing says what is on
// it. Water and shallows are the only hues allowed any saturation, because they are the only
// terrain with no sprite to name it.
const TERRAIN_COLOURS: Record<TerrainGroup, number> = {
  plains: 0xcdd6a8, desert: 0xe0c893, forest: 0x9fbe8c, swamp: 0xb5b47c,
  water: 0x9cc9e2, shallows: 0xc4e0ec, hills: 0xc9a97a, mountain: 0xb6b3ac,
  settlement: 0xcfc3b0,
};
// Mountains and woods are drawn tall and want the whole hex; plains stipple and desert dunes
// are ground cover and read better small.
const TERRAIN_SCALES: Record<TerrainGroup, number> = {
  plains: 0.85, desert: 0.9, forest: 1, swamp: 0.9, water: 1, shallows: 1,
  hills: 1, mountain: 1.1, settlement: 1,
};
export const DEFAULT_INK_STYLE: InkStyle = {
  colour: 0x4a4038, opacity: 0.85, scale: 0.95, variation: 0.12, jitter: 0.06, lift: 0.04,
};

export function defaultInkSettings(): InkMapSettings {
  return {
    paper: 0xf4ece0,
    wash: 0.55,
    variation: 0.06,
    terrains: Object.fromEntries(TERRAIN_GROUPS.map(group =>
      [group, { colour: TERRAIN_COLOURS[group], scale: TERRAIN_SCALES[group] }])) as Record<TerrainGroup, InkTerrain>,
    ink: { ...DEFAULT_INK_STYLE },
    area: { ...DEFAULT_AREA_LINE },
    // Height is the terrain in this style — a hex at +1 draws hills — so its rings are off
    // until they are asked for. Ink, not the wash's white, when they are.
    elevation: {
      level1: { ...DEFAULT_ELEVATION_LINES.level1, visible: false, colour: 0x4a4038 },
      level2: { ...DEFAULT_ELEVATION_LINES.level2, visible: false, colour: 0x4a4038 },
    },
    grid: { ...DEFAULT_GRID_SETTINGS },
  };
}

export function normalizeInkSettings(value: unknown): InkMapSettings {
  const result = defaultInkSettings();
  if (!value || typeof value !== 'object') return result;
  const saved = value as Partial<InkMapSettings>;
  const clamp = (n: number | undefined, min: number, max: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, n as number)) : fallback;
  const colour = (n: number | undefined, fallback: number) =>
    Number.isFinite(n) ? Math.min(0xffffff, Math.max(0, Math.round(n as number))) : fallback;
  result.paper = colour(saved.paper, result.paper);
  result.wash = clamp(saved.wash, 0, 1, result.wash);
  result.variation = clamp(saved.variation, 0, 1, result.variation);
  for (const group of TERRAIN_GROUPS) {
    const terrain = saved.terrains?.[group];
    if (!terrain) continue;
    result.terrains[group].colour = colour(terrain.colour, result.terrains[group].colour);
    result.terrains[group].scale = clamp(terrain.scale, 0.2, 2.5, result.terrains[group].scale);
  }
  if (saved.ink) {
    const ink = saved.ink;
    result.ink.colour = colour(ink.colour, result.ink.colour);
    result.ink.opacity = clamp(ink.opacity, 0, 1, result.ink.opacity);
    result.ink.scale = clamp(ink.scale, 0.2, 2, result.ink.scale);
    result.ink.variation = clamp(ink.variation, 0, 1, result.ink.variation);
    result.ink.jitter = clamp(ink.jitter, 0, 0.5, result.ink.jitter);
    result.ink.lift = clamp(ink.lift, -0.4, 0.4, result.ink.lift);
  }
  result.area = normalizeMapLine(saved.area, result.area);
  result.elevation = normalizeElevationLines(saved.elevation, result.elevation);
  result.grid = normalizeMapLine(saved.grid, result.grid);
  return result;
}

export interface InkSprite {
  position: Point;
  /** On screen, in pixels. The sprite keeps its own aspect. */
  width: number;
  /** Which of the group's variants, 0–1. */
  variant: number;
  /** The hex's own lightness draw, −1 to 1, so its wash keeps its shade while the sliders
   * move. */
  shade: number;
}

/** One drawing per hex, placed from the cell's key alone: the same hex draws the same sprite
 * at the same angle whatever else on the board changes. */
export function inkSprite(grid: Grid, cell: Cell, size: number, style: InkStyle, groupScale: number): InkSprite {
  let seed = 2166136261;
  for (const char of `ink:${grid.key(cell)}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = seededRandom(seed >>> 0);
  const variant = random();
  const width = size * style.scale * groupScale * (1 + (random() * 2 - 1) * style.variation);
  const angle = random() * Math.PI * 2;
  const reach = Math.sqrt(random()) * style.jitter * size;
  const shade = random() * 2 - 1;
  const centre = grid.center(cell, size);
  return {
    position: { x: centre.x + Math.cos(angle) * reach, y: centre.y + Math.sin(angle) * reach - style.lift * size },
    width, variant, shade,
  };
}
