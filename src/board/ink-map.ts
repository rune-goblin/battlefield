import { seededRandom, type Cell, type Grid, type Point } from '../engine/index.js';

import { DEFAULT_GRID_SETTINGS, type GridSettings } from './layers/GridLayer.js';
import {
  DEFAULT_AREA_LINE, DEFAULT_ELEVATION_LINES, normalizeElevationLines, normalizeMapLine,
  type ElevationLines, type MapLine,
} from './map-lines.js';
import { PAPER_TEXTURES, type PaperTexture } from './paper.js';
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
  /** Unused since drawings took the whole patch as their canvas; kept so saved settings
   * still normalize. */
  jitter: number;
  /** Raised off the centre, in hex pitches — positive lifts, so a peak sits above the hex it
   * stands on and its base reads as the near edge. */
  lift: number;
}
export interface InkTerrain { colour: number; scale: number }
/** The small marks scattered over every patch of a terrain, under its drawings. */
export interface InkFill {
  /** Marks per hex of the patch. */
  density: number;
  /** A fill cell's width as a fraction of the hex's, before the terrain's own multiplier. */
  scale: number;
  /** How far a mark's size may fall either side of that, 0–1. */
  variation: number;
  opacity: number;
}
export interface InkHeroes {
  /** Hexes of a patch per drawing, on average: every hex has one chance in this many of
   * standing one, so a nine-hex wood stands three trees or so. A patch always gets at least
   * one. */
  perHexes: number;
}
/** The paper's texture, one of the baked tiles or none. A page cut is laid over the paper
 * colour at `strength` and the terrain colours are washed over it at the wash strength; a
 * grain cut is multiplied at `strength` over the opaque wash. `hexes` is how many hexes one
 * tile spans, so a higher count is a finer grain. */
export interface InkGrain { texture: PaperTexture | 'none'; strength: number; hexes: number }
export interface InkMapSettings {
  /** Bumped when a default is retuned; a saved set behind it takes the retuned defaults. */
  version: number;
  /** The page every wash is printed onto, and the ground of a hex with no colour of its own. */
  paper: number;
  grain: InkGrain;
  /** How much of the terrain's colour reaches the page, 0–1: the mix into the paper colour,
   * or the wash's opacity over a page cut. */
  wash: number;
  /** Per-patch lightness wobble, 0–1, so two woods are not one flat plate. */
  variation: number;
  terrains: Record<TerrainGroup, InkTerrain>;
  ink: InkStyle;
  fill: InkFill;
  heroes: InkHeroes;
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
};export const DEFAULT_INK_STYLE: InkStyle = {
  colour: 0x000000, opacity: 1, scale: 0.95, variation: 0.08, jitter: 0.06, lift: 0,
};
// 0.28 would be the fills' own pixel scale against the hero art — a 96-pixel fill cell is a
// quarter of a 384-pixel hero cell — but at that size the marks are dust on a 60-pixel hex,
// and at 0.6 a reed stood as tall as a tree.
export const DEFAULT_INK_FILL: InkFill = { density: 11, scale: 0.44, variation: 0.27, opacity: 1 };
export const DEFAULT_INK_HEROES: InkHeroes = { perHexes: 2 };
export const INK_SETTINGS_VERSION = 5;

export function defaultInkSettings(): InkMapSettings {
  return {
    version: INK_SETTINGS_VERSION,
    paper: 0xfdebef,
    grain: { texture: 'mottled-page', strength: 0.36, hexes: 64 },
    wash: 1,
    variation: 0,
    terrains: Object.fromEntries(TERRAIN_GROUPS.map(group =>
      [group, { colour: TERRAIN_COLOURS[group], scale: TERRAIN_SCALES[group] }])) as Record<TerrainGroup, InkTerrain>,
    ink: { ...DEFAULT_INK_STYLE },
    fill: { ...DEFAULT_INK_FILL },
    heroes: { ...DEFAULT_INK_HEROES },
    area: { ...DEFAULT_AREA_LINE },
    // Height is the terrain in this style — a hex at +1 draws hills — so its rings are off
    // until they are asked for. Ink, not the wash's white, when they are.
    elevation: {
      level1: { ...DEFAULT_ELEVATION_LINES.level1, visible: false, colour: 0x4a4038 },
      level2: { ...DEFAULT_ELEVATION_LINES.level2, visible: false, colour: 0x4a4038 },
    },
    grid: { ...DEFAULT_GRID_SETTINGS, visible: true, opacity: 0.1 },
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
  // Colours and lines are the user's; the scatter's dials are retuned by version and a saved
  // set from before keeps the new defaults for those alone.
  const stale = (saved.version ?? 1) < INK_SETTINGS_VERSION;
  result.paper = colour(saved.paper, result.paper);
  if (saved.grain && !stale) {
    const texture = saved.grain.texture;
    if (texture === 'none' || (PAPER_TEXTURES as readonly string[]).includes(texture)) result.grain.texture = texture;
    result.grain.strength = clamp(saved.grain.strength, 0, 1, result.grain.strength);
    result.grain.hexes = clamp(saved.grain.hexes, 4, 64, result.grain.hexes);
  }
  result.wash = clamp(saved.wash, 0, 1, result.wash);
  if (!stale) result.variation = clamp(saved.variation, 0, 1, result.variation);
  for (const group of TERRAIN_GROUPS) {
    const terrain = saved.terrains?.[group];
    if (!terrain) continue;
    result.terrains[group].colour = colour(terrain.colour, result.terrains[group].colour);
    result.terrains[group].scale = clamp(terrain.scale, 0.2, 2.5, result.terrains[group].scale);  }
  if (saved.ink) {
    const ink = saved.ink;
    result.ink.colour = colour(ink.colour, result.ink.colour);
    result.ink.opacity = clamp(ink.opacity, 0, 1, result.ink.opacity);
    result.ink.scale = clamp(ink.scale, 0.2, 2, result.ink.scale);
    result.ink.variation = clamp(ink.variation, 0, 1, result.ink.variation);
    result.ink.jitter = clamp(ink.jitter, 0, 0.5, result.ink.jitter);
    result.ink.lift = clamp(ink.lift, -0.4, 0.4, result.ink.lift);
  }
  if (saved.fill && !stale) {
    const fill = saved.fill;
    result.fill.density = clamp(fill.density, 0, 20, result.fill.density);
    result.fill.scale = clamp(fill.scale, 0.05, 1, result.fill.scale);
    result.fill.variation = clamp(fill.variation, 0, 1, result.fill.variation);
    result.fill.opacity = clamp(fill.opacity, 0, 1, result.fill.opacity);
  }
  if (saved.heroes && !stale) result.heroes.perHexes = Math.round(clamp(saved.heroes.perHexes, 1, 12, result.heroes.perHexes));
  result.area = normalizeMapLine(saved.area, result.area);
  result.elevation = normalizeElevationLines(saved.elevation, result.elevation);
  result.grid = normalizeMapLine(saved.grid, result.grid);
  return result;
}

export interface InkFillSprite {
  position: Point;
  /** The width a whole fill cell takes on screen, in pixels; the mark inside it keeps its own
   * size and aspect. */
  cell: number;
  /** Which of the group's variants, 0–1. */
  variant: number;
}
export interface InkHero {
  position: Point;
  /** On screen, in pixels. The sprite keeps its own aspect. */
  width: number;
  /** Which of the group's variants, 0–1; no two heroes of a patch share one. */
  variant: number;
}
export interface InkPatch {
  /** The patch's own lightness draw, −1 to 1, so its wash keeps its shade while the sliders
   * move. */
  shade: number;
  heroes: InkHero[];
  fills: InkFillSprite[];
}

const HERO_CANDIDATES = 16;
const HERO_VARIANTS = 16;
const FILL_CANDIDATES = 20;
// A mark's radius as a fraction of its cell, for keeping marks off each other: the ink sits
// in the middle three-fifths of a cell or so, and a shared corner of empty page is no overlap.
const FILL_RADIUS = 0.36;
// How far in from a hex's edge a fill's centre stays, as a fraction of the way to the middle,
// so a mark spills over a patch's boundary by no more than half of itself.
const FILL_INSET = 0.85;
// A drawing's ground, as an ellipse of its width: the hero sheets are drawn wider than tall.
// The whole ellipse must lie inside the patch — a dune cut by the board's edge or leaning
// into the lake beside it reads as a fault — and the fills keep out of it so no pebble runs
// through a peak's base.
const HERO_FOOT = { x: 0.5, y: 0.32 };
// The whole drawing, for keeping fills off it: the tallest hero frames are as high as wide.
const HERO_BODY = { x: 0.5, y: 0.5 };
const FOOT_PROBES = 12;
// Rings of probes, in hex pitches, that measure how deep a point sits in its patch.
const DEPTH_RINGS = [0.3, 0.6, 0.9, 1.2, 1.5];

function seedOf(text: string): number {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

/** Uniform over the hex, pulled in by `inset`: a random edge, a point along it, and a
 * square-root radius toward it from the centre. */
function pointIn(grid: Grid, cell: Cell, size: number, inset: number, random: () => number): Point {
  const centre = grid.center(cell, size);
  const vertices = grid.vertices(cell, size);
  const edge = Math.floor(random() * vertices.length);
  const a = vertices[edge], b = vertices[(edge + 1) % vertices.length];
  const radius = Math.sqrt(random()) * inset, along = random();
  return {
    x: centre.x + radius * ((1 - along) * a.x + along * b.x - centre.x),
    y: centre.y + radius * ((1 - along) * a.y + along * b.y - centre.y),
  };
}

/** One draw over a connected patch of one terrain, treated as one canvas: drawings, roughly
 * one for every `perHexes` hexes, stand deep in the patch and as far apart as it allows, with
 * no foot over its boundary, and a scatter of small marks covers the rest, kept out from
 * under the drawings. Seeded by the
 * patch's lowest key, so a patch keeps its scatter while the board resizes and no two patches
 * share one. */
/** `drawn` says whether the terrain has standing drawings at all: water and shallows have
 * none, and a patch of them fills right across, with no ground kept clear. */
export function inkPatch(grid: Grid, cells: Cell[], size: number, settings: InkMapSettings, groupScale: number, drawn = true): InkPatch {
  const ordered = [...cells].sort((a, b) => (grid.key(a) < grid.key(b) ? -1 : 1));
  const random = seededRandom(seedOf(`ink-patch:${grid.key(ordered[0])}`));
  const gap = (p: Point, others: readonly Point[]): number =>
    others.reduce((least, q) => Math.min(least, Math.hypot(p.x - q.x, p.y - q.y)), Infinity);
  const somewhere = (inset: number): Point =>
    pointIn(grid, ordered[Math.floor(random() * ordered.length)], size, inset, random);
  // The lowest key seeds the draw; the rest of the patch decides where things may stand.
  const { ink, fill } = settings;
  const shade = random() * 2 - 1;

  const keys = new Set(ordered.map((cell) => grid.key(cell)));
  const inside = (p: Point): boolean => {
    const cell = grid.fromPoint(p, size);
    return !!cell && keys.has(grid.key(cell));
  };
  const ring = (p: Point, rx: number, ry: number): boolean => {
    for (let i = 0; i < FOOT_PROBES; i++) {
      const a = (i / FOOT_PROBES) * Math.PI * 2;
      if (!inside({ x: p.x + rx * Math.cos(a), y: p.y + ry * Math.sin(a) })) return false;
    }
    return true;
  };
  const depth = (p: Point): number => {
    let deepest = 0;
    for (const r of DEPTH_RINGS) {
      if (!ring(p, r * size, r * size)) break;
      deepest = r;
    }
    return deepest;
  };

  let heroCount = 0;
  for (let i = 0; i < ordered.length; i++) if (random() * settings.heroes.perHexes < 1) heroCount++;
  heroCount = drawn ? Math.max(1, heroCount) : 0;
  const heroes: InkHero[] = [];
  const stood: Point[] = [];
  const slots = Array.from({ length: HERO_VARIANTS }, (_, i) => i);
  for (let i = 0; i < heroCount; i++) {
    const width = size * ink.scale * groupScale * (1 + (random() * 2 - 1) * ink.variation);
    // The first drawing takes the deepest point of the patch; the rest take the point farthest
    // from those standing. Either way its whole foot must be on the patch. A patch too thin
    // for any foot — a single hex under a wide drawing — takes the deepest point regardless.
    let position: Point | null = null, best = -Infinity, fallback: Point | null = null, deepest = -Infinity;
    for (let attempt = 0; attempt < HERO_CANDIDATES; attempt++) {
      const candidate = somewhere(1);
      const clear = depth(candidate);
      if (clear > deepest) { deepest = clear; fallback = candidate; }
      if (!ring(candidate, width * HERO_FOOT.x, width * HERO_FOOT.y)) continue;
      const score = stood.length ? gap(candidate, stood) : clear;
      if (score > best) { best = score; position = candidate; }
    }
    if (!position && i > 0) break;
    position ??= fallback!;
    if (!slots.length) slots.push(...Array.from({ length: HERO_VARIANTS }, (_, i) => i));
    const slot = slots.splice(Math.floor(random() * slots.length), 1)[0];
    stood.push(position);
    heroes.push({
      position: { x: position.x, y: position.y - ink.lift * size },
      width, variant: (slot + random()) / HERO_VARIANTS,
    });
  }
  // Grown by the mark's own radius, so the mark's edge clears the drawing's, not just its
  // centre.
  const underfoot = (p: Point, half: number): boolean => heroes.some(({ position, width }) =>
    ((p.x - position.x) / (width * HERO_BODY.x + half)) ** 2 + ((p.y - position.y) / (width * HERO_BODY.y + half)) ** 2 < 1);

  const fills: InkFillSprite[] = [];
  const placed: Point[] = [];
  const radii: number[] = [];
  const count = Math.round(ordered.length * fill.density);
  for (let i = 0; i < count; i++) {
    const cell = size * fill.scale * groupScale * (1 + (random() * 2 - 1) * fill.variation);
    const variant = random();
    const radius = cell * FILL_RADIUS;
    // Poisson-disc: a candidate that meets a standing mark or a drawing is refused, and of
    // those that clear everything the most open wins. A mark with no clear candidate is
    // dropped, so density is a ceiling and a crowded patch fills to what fits.
    let position: Point | null = null, bestGap = -Infinity;
    for (let attempt = 0; attempt < FILL_CANDIDATES; attempt++) {
      const candidate = somewhere(FILL_INSET);
      if (underfoot(candidate, radius)) continue;
      if (placed.some((q, j) => Math.hypot(candidate.x - q.x, candidate.y - q.y) < radius + radii[j])) continue;
      const spacing = gap(candidate, placed);
      if (spacing > bestGap) { bestGap = spacing; position = candidate; }
    }
    if (!position) continue;
    placed.push(position);
    radii.push(radius);
    fills.push({ position, cell, variant });
  }
  return { shade, heroes, fills };
}
