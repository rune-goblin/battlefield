import terrainTextureFiles from 'virtual:terrain-textures';

import { assetUrl } from './asset-base.js';
import {
  at, edgeKey, generateBoard, gridOf, seededRandom,
  type Board, type Cell, type Grid, type Random, type SquareTerrain, type Wall,
} from '../engine/index.js';

import { IDENTITY_HSB, type Hsb } from './layers/color.js';
import {
  DEFAULT_AREA_LINE, DEFAULT_ELEVATION_LINES, normalizeElevationLines, normalizeMapLine,
  type ElevationLines, type MapLine,
} from './map-lines.js';
import { DEFAULT_EDGE_BLENDING, type EdgeBlending } from './terrain-blending.js';
import { DEFAULT_GRID_SETTINGS, type GridSettings } from './layers/GridLayer.js';

export const TERRAIN_GROUPS = ['plains', 'desert', 'forest', 'swamp', 'water', 'shallows', 'hills', 'mountain', 'settlement'] as const;
export type TerrainGroup = typeof TERRAIN_GROUPS[number];
export const TERRAIN_LABELS: Record<TerrainGroup, string> = {
  plains: 'Plains', desert: 'Desert', forest: 'Forest', swamp: 'Swamp', water: 'Water',
  shallows: 'Shallows', hills: 'Hills', mountain: 'Mountain', settlement: 'Settlement',
};
export interface TextureChoice { id: string; name: string; url: string }
/** Distance and softness in hex pitches, so a shadow keeps its shape through zoom. */
export interface ShadowLevel { distance: number; softness: number }
/** The bevel along a step's own edge, drawn by `BevelFilter`: `thickness` in hex pitches, and
 * the two intensities the light gives it — `light` on the edge facing the light, `shadow` on the
 * edge away from it. Neither touches the middle of the surface. */
export interface BevelSettings { thickness: number; light: number; shadow: number }
/** How a step is shown: one light for the board, the bevel on the edge itself, and the shadow
 * the step drops on the ground below, at `opacity` and at each rise's own distance and softness. */
export interface ElevationShadows { angle: number; opacity: number; bevel: BevelSettings; level1: ShadowLevel; level2: ShadowLevel }
export const DEFAULT_ELEVATION_SHADOWS: ElevationShadows = {
  angle: 55, opacity: 0.45,
  bevel: { thickness: 0.02, light: 0.5, shadow: 0.35 },
  level1: { distance: 0.07, softness: 0.05 }, level2: { distance: 0.15, softness: 0.08 },
};
/** `hsb` grades the texture art itself — the fill under it keeps the theme's own terrain
 * colour, so a desaturated desert is a duller sand over the same ground. */
export interface TerrainSetting { texture: string | null; scale: number; hsb: Hsb }
/** The wood's colour spread, applied as a per-sprite tint. `hue` is the wash's own hue in
 * degrees, `spread` how far either side of it a tree may fall, `strength` how much of the
 * wash the deepest-tinted tree takes. At strength 0 the art is left alone. */
export interface TreeTint { hue: number; spread: number; strength: number }
/** `area` scatters each connected patch as a whole instead of hex by hex; the counts stay
 * per hex either way, so the two modes plant the same number of trees. */
export interface TreeSettings { min: number; max: number; area: boolean; size: number; variation: number; tint: TreeTint }
export const DEFAULT_TREES: TreeSettings = {
  min: 3, max: 8, area: false, size: 1, variation: 0.1, tint: { hue: 110, spread: 25, strength: 0 },
};
export interface TerrainTextureSettings {
  terrains: Record<TerrainGroup, TerrainSetting>;
  trees: TreeSettings;
  edges: EdgeBlending;
  shadows: ElevationShadows;
  /** The three lines over the map, each drawn and dialled on its own: the terrain areas'
   * outline, the ring around ground at each height, and the reference hex grid. */
  area: MapLine;
  elevation: ElevationLines;
  /** The lab's hex grid. Read by the board view rather than by `TerrainLayer`; it rides in
   * this blob so one saved settings object covers everything the lab can be left set to. */
  grid: GridSettings;
}
export interface TerrainAppearance {
  settings: TerrainTextureSettings;
  compareHard?: boolean;
  /** The elevation wash and its numerals. The lab hides them to judge the cast shadow
   * on its own; anything that leaves this unset keeps them. */
  elevationMarks?: boolean;
  /** The lab can exhibit art groups without adding terrain rules to the game engine. */
  groups?: Record<string, TerrainGroup>;
}
export const TEXTURE_CHOICES = Object.fromEntries(TERRAIN_GROUPS.map(group => [group,
  terrainTextureFiles.filter(path => path.startsWith(`${group === 'shallows' ? 'water' : group}/`)).map(id => ({
    id, name: id.split('/').pop()!.replace(/\.[^.]+$/, '').replaceAll('_', ' '),
    url: assetUrl(`art/terrain/textures/${id.split('/').map(encodeURIComponent).join('/')}`),
  })),
])) as Record<TerrainGroup, TextureChoice[]>;
export function defaultTextureSettings(): TerrainTextureSettings {
  return {
    terrains: Object.fromEntries(TERRAIN_GROUPS.map(group =>
      [group, { texture: TEXTURE_CHOICES[group][0]?.id ?? null, scale: 2, hsb: { ...IDENTITY_HSB } }])) as Record<TerrainGroup, TerrainSetting>,
    trees: { ...DEFAULT_TREES, tint: { ...DEFAULT_TREES.tint } },
    edges: { ...DEFAULT_EDGE_BLENDING },
    shadows: {
      ...DEFAULT_ELEVATION_SHADOWS,
      bevel: { ...DEFAULT_ELEVATION_SHADOWS.bevel },
      level1: { ...DEFAULT_ELEVATION_SHADOWS.level1 },
      level2: { ...DEFAULT_ELEVATION_SHADOWS.level2 },
    },
    area: { ...DEFAULT_AREA_LINE },
    elevation: { level1: { ...DEFAULT_ELEVATION_LINES.level1 }, level2: { ...DEFAULT_ELEVATION_LINES.level2 } },
    grid: { ...DEFAULT_GRID_SETTINGS },
  };
}
export function normalizeTextureSettings(value: unknown): TerrainTextureSettings {
  const result = defaultTextureSettings();
  if (!value || typeof value !== 'object') return result;
  const saved = value as Partial<TerrainTextureSettings>;
  for (const group of TERRAIN_GROUPS) {
    const setting = saved.terrains?.[group];
    if (!setting) continue;
    if (setting.texture === null || TEXTURE_CHOICES[group].some(t => t.id === setting.texture)) result.terrains[group].texture = setting.texture;
    if (Number.isFinite(setting.scale)) result.terrains[group].scale = Math.min(8, Math.max(0.25, setting.scale));
    const hsb = setting.hsb;
    if (hsb) {
      const grade = result.terrains[group].hsb;
      if (Number.isFinite(hsb.hue)) grade.hue = ((((hsb.hue + 180) % 360) + 360) % 360) - 180;
      if (Number.isFinite(hsb.saturation)) grade.saturation = Math.min(2, Math.max(0, hsb.saturation));
      if (Number.isFinite(hsb.brightness)) grade.brightness = Math.min(2, Math.max(0, hsb.brightness));
    }
  }
  if (saved.trees) {
    const count = (n: number, fallback: number) => Number.isFinite(n) ? Math.min(20, Math.max(0, Math.round(n))) : fallback;
    const clamp = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    result.trees.min = count(saved.trees.min, 3);
    result.trees.max = Math.max(result.trees.min, count(saved.trees.max, 8));
    result.trees.area = saved.trees.area === true;
    result.trees.size = clamp(saved.trees.size, 0.4, 2.5, 1);
    result.trees.variation = clamp(saved.trees.variation, 0, 1, result.trees.variation);
    const tint = saved.trees.tint;
    if (tint) {
      result.trees.tint.hue = Number.isFinite(tint.hue) ? ((tint.hue % 360) + 360) % 360 : result.trees.tint.hue;
      result.trees.tint.spread = clamp(tint.spread, 0, 180, result.trees.tint.spread);
      result.trees.tint.strength = clamp(tint.strength, 0, 1, result.trees.tint.strength);
    }
  }
  if (saved.edges) {
    const edge = saved.edges;
    if (['hard', 'soft', 'natural'].includes(edge.mode)) result.edges.mode = edge.mode;
    const clamp = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    result.edges.width = clamp(edge.width, 0, 0.5, result.edges.width);
    result.edges.irregularity = clamp(edge.irregularity, 0, 1, result.edges.irregularity);
    result.edges.patchSize = clamp(edge.patchSize, 0.05, 1.5, result.edges.patchSize);
  }
  if (saved.shadows) {
    const shadow = saved.shadows;
    const clamp = (n: number, max: number, fallback: number) => Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
    result.shadows.angle = Number.isFinite(shadow.angle) ? ((shadow.angle % 360) + 360) % 360 : result.shadows.angle;
    result.shadows.opacity = clamp(shadow.opacity, 1, result.shadows.opacity);
    result.shadows.bevel.thickness = clamp(shadow.bevel?.thickness, 0.1, result.shadows.bevel.thickness);
    result.shadows.bevel.light = clamp(shadow.bevel?.light, 1, result.shadows.bevel.light);
    result.shadows.bevel.shadow = clamp(shadow.bevel?.shadow, 1, result.shadows.bevel.shadow);
    for (const level of ['level1', 'level2'] as const) {
      result.shadows[level].distance = clamp(shadow[level]?.distance, 0.6, result.shadows[level].distance);
      result.shadows[level].softness = clamp(shadow[level]?.softness, 0.5, result.shadows[level].softness);
    }
  }
  result.area = normalizeMapLine(saved.area, result.area);
  result.elevation = normalizeElevationLines(saved.elevation, result.elevation);
  result.grid = normalizeMapLine(saved.grid, result.grid);
  return result;
}
// The engine has no desert, hills or mountain: all three are art over open ground, and the
// two heights are elevation rather than terrain.
export const GROUP_TERRAIN: Record<TerrainGroup, SquareTerrain> = {
  plains: 'open', desert: 'open', hills: 'open', mountain: 'open',
  forest: 'forest', swamp: 'swamp', water: 'water', shallows: 'shallows', settlement: 'settlement',
};

export function terrainGroup(board: Board, cell: Cell): TerrainGroup {
  const state = at(board, cell);
  if (state.terrain === 'bridge') return 'water';
  if (state.terrain !== 'open') return state.terrain;
  return state.elevation >= 2 ? 'mountain' : state.elevation === 1 ? 'hills' : 'plains';
}

// Hills and mountain are terrain groups in the lab and elevation on the board, so the sample
// gives them their height: a level 1 shelf beside a level 2 mass, which is what the cast
// shadow, the elevation rings and EdgeLayer's cliff teeth all draw from.
const GROUP_ELEVATION: Partial<Record<TerrainGroup, number>> = { hills: 1, mountain: 2 };

/** The nine patch centres of the reference layout, in `TERRAIN_GROUPS` order: the arrangement
 * the lab has always opened on, and the fallback when a random draw will not settle. */
const REFERENCE_SEEDS = ['b8', 'd8', 'f8', 'g6', 'g3', 'e2', 'c3', 'b5', 'e5'];
/** Shallows belong against water and the mountain against its hills. The other five patches
 * fall wherever the draw puts them. */
const PAIRED: [TerrainGroup, TerrainGroup][] = [['water', 'shallows'], ['hills', 'mountain']];
const SEED_SEPARATION = 2;  // hexes between two patch centres, so no patch is squeezed out
const MIN_PATCH = 3;        // hexes a patch needs before it is worth exhibiting
const DRAW_ATTEMPTS = 40;

function shuffled<T>(items: readonly T[], rnd: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Patch centres spread over the board, each at least `SEED_SEPARATION` from the rest, or null
 * when the draw crowded itself out of room. */
function drawCentres(grid: Grid, rnd: Random, count: number): Cell[] | null {
  const taken: Cell[] = [];
  for (const cell of shuffled(grid.cells(), rnd)) {
    if (!taken.every(t => grid.distance(cell, t) >= SEED_SEPARATION)) continue;
    taken.push(cell);
    if (taken.length === count) return taken;
  }
  return null;
}

/** One centre per group in `TERRAIN_GROUPS` order, with each paired group moved onto the centre
 * nearest its anchor — water finds its shallows however the rest of the draw fell. */
function assignCentres(grid: Grid, points: Cell[], rnd: Random): Cell[] {
  const centre = new Map<TerrainGroup, Cell>();
  shuffled(TERRAIN_GROUPS, rnd).forEach((group, i) => centre.set(group, points[i]));
  for (const [anchor, partner] of PAIRED) {
    const home = centre.get(anchor)!;
    let closest = partner;
    for (const [group, point] of centre) {
      if (group !== anchor && grid.distance(point, home) < grid.distance(centre.get(closest)!, home)) closest = group;
    }
    const held = centre.get(partner)!;
    centre.set(partner, centre.get(closest)!);
    centre.set(closest, held);
  }
  return TERRAIN_GROUPS.map(group => centre.get(group)!);
}

function voronoi(grid: Grid, centres: Cell[]): Record<string, TerrainGroup> {
  const groups: Record<string, TerrainGroup> = {};
  for (const cell of grid.cells()) {
    let nearest = 0;
    for (let i = 1; i < centres.length; i++) if (grid.distance(cell, centres[i]) < grid.distance(cell, centres[nearest])) nearest = i;
    groups[grid.key(cell)] = TERRAIN_GROUPS[nearest];
  }
  return groups;
}

/** Every group one patch of at least `MIN_PATCH` hexes, which is what the lab is for. A
 * nearest-centre split can strand a cell behind a tie or starve a crowded patch, so a draw
 * that does either is thrown back. */
function exhibitsEveryGroup(grid: Grid, groups: Record<string, TerrainGroup>): boolean {
  for (const group of TERRAIN_GROUPS) {
    const cells = grid.cells().filter(cell => groups[grid.key(cell)] === group);
    if (cells.length < MIN_PATCH) return false;
    const reached = new Set([grid.key(cells[0])]);
    const queue = [cells[0]];
    while (queue.length) {
      for (const n of grid.neighbours(queue.pop()!)) {
        if (groups[grid.key(n)] !== group || reached.has(grid.key(n))) continue;
        reached.add(grid.key(n));
        queue.push(n);
      }
    }
    if (reached.size !== cells.length) return false;
  }
  return true;
}

/** A hex's neighbours in the order they ring it, so consecutive entries give edges that share
 * a vertex — an arc of them is one bent wall rather than a scatter of bars. */
function ringOrder(grid: Grid, cell: Cell): Cell[] {
  const home = grid.center(cell, 1);
  const angle = (c: Cell) => { const p = grid.center(c, 1); return Math.atan2(p.y - home.y, p.x - home.x); };
  return grid.neighbours(cell).sort((a, b) => angle(a) - angle(b));
}

/** The ring around the settlement with one stretch breached, and a few free-standing arcs out
 * in the open — bent runs with two loose ends each, which is what the mitred joins and the end
 * caps are drawn for. */
function layWalls(board: Board, grid: Grid, groups: Record<string, TerrainGroup>, rnd: Random): void {
  board.walls = {};
  const raise = (key: string, remaining: number) => { board.walls[key] = { tier: 2, boxes: 3, remaining }; };
  const ring = grid.cells().filter(cell => groups[grid.key(cell)] === 'settlement')
    .flatMap(cell => grid.neighbours(cell).filter(n => groups[grid.key(n)] !== 'settlement').map(n => edgeKey(cell, n)));
  const breach = Math.floor(rnd() * ring.length);
  ring.forEach((key, i) => raise(key, i === breach ? 0 : 3));

  // Only a hex holding all six neighbours: on the rim of the board the missing ones break the
  // arc, and edges that share no vertex are not a run.
  const inland = grid.cells().filter(cell => groups[grid.key(cell)] !== 'settlement' && grid.neighbours(cell).length === 6);
  for (const cell of shuffled(inland, rnd).slice(0, 3)) {
    const around = ringOrder(grid, cell);
    const start = Math.floor(rnd() * around.length);
    const length = 2 + Math.floor(rnd() * 3);
    // One damage state for the whole run. A wall's width is its remaining courses, so battering
    // a single edge of a run pinches the band to a scratch halfway along an unbroken wall.
    const remaining = rnd() < 0.25 ? 2 : 3;
    for (let i = 0; i < length; i++) {
      const key = edgeKey(cell, around[(start + i) % around.length]);
      if (!board.walls[key]) raise(key, remaining);
    }
  }
}

/** Nine adjoining patches, each of several hexes, on the same 91-cell game board. Seed 0 is the
 * hand-placed reference layout; any other seed draws the patches, the heights and the walls
 * afresh, so the art can be judged on ground it was not tuned over. */
export function createTextureSample(seed = 0): { board: Board; groups: Record<string, TerrainGroup> } {
  const board = generateBoard({ base: 'plains', seed: 1, grid: 'hex' });
  const grid = gridOf(board);
  const rnd = seededRandom(seed);
  let groups = voronoi(grid, REFERENCE_SEEDS.map(key => grid.parse(key)));
  for (let attempt = 0; seed !== 0 && attempt < DRAW_ATTEMPTS; attempt++) {
    const points = drawCentres(grid, rnd, TERRAIN_GROUPS.length);
    if (!points) continue;
    const drawn = voronoi(grid, assignCentres(grid, points, rnd));
    if (exhibitsEveryGroup(grid, drawn)) { groups = drawn; break; }
  }
  for (const cell of grid.cells()) {
    const group = groups[grid.key(cell)];
    at(board, cell).terrain = GROUP_TERRAIN[group];
    at(board, cell).elevation = GROUP_ELEVATION[group] ?? 0;
  }
  layWalls(board, grid, groups, rnd);
  return { board, groups };
}

/** A run of edges along the boundary above `rank`, zigzagging east. Consecutive edges pivot on
 * the cell between them, so they share a vertex and the run is one bent wall. */
function boundaryRun(grid: Grid, rank: number, from: Cell, edges: number): string[] {
  const keys: string[] = [];
  let cell = from;
  for (let i = 0; i < edges; i++) {
    const up = i % 2 === 0;
    const ahead = grid.neighbours(cell).filter(n => n.rank === (up ? rank + 1 : rank)).sort((a, b) => a.file - b.file);
    const next = ahead[ahead.length - 1];
    if (!next) break;
    keys.push(edgeKey(cell, next));
    cell = next;
  }
  return keys;
}

const filesIn = (grid: Grid, rank: number): Cell[] => grid.cells().filter(c => c.rank === rank).sort((a, b) => a.file - b.file);

/** Three cells that all touch each other, taken from the east end of `rank` so they stand clear
 * of the runs, which start in the west. The three edges between them meet at one vertex. */
function triple(grid: Grid, rank: number): [Cell, Cell, Cell] | null {
  const row = filesIn(grid, rank);
  for (let i = row.length - 1; i > 0; i--) {
    const west = row[i - 1];
    const east = row[i];
    if (!grid.neighbours(east).some(n => grid.key(n) === grid.key(west))) continue;
    const apex = grid.neighbours(east).find(n => n.rank === rank + 1 && grid.neighbours(west).some(m => grid.key(m) === grid.key(n)));
    if (apex) return [west, east, apex];
  }
  return null;
}

/** Every state a wall can be drawn in, laid out so the lab can show them at once: three runs of
 * five edges down the west of the board, one to a rank, and out east a lone edge and a three-way
 * junction. Cliffs are not walls — they come from the two heights the sample already puts on the
 * board. */
export function wallStates(board: Board): Record<string, Wall> {
  const grid = gridOf(board);
  const walls: Record<string, Wall> = {};
  const lay = (keys: string[], boxes: number, remaining: number) => {
    for (const key of keys) walls[key] = { tier: boxes - 1, boxes, remaining };
  };
  // One run per state, and only three states: whole, battered, down.
  const runs: [number, number, number][] = [[7, 3, 3], [5, 3, 2], [3, 3, 0]];
  for (const [rank, boxes, remaining] of runs) {
    const start = filesIn(grid, rank)[0];
    if (start) lay(boundaryRun(grid, rank, start, 5), boxes, remaining);
  }
  // A lone edge is two free ends and nothing else; the junction is three walls on one vertex.
  const row = filesIn(grid, 6);
  const alone = row[row.length - 1];
  if (alone) lay(boundaryRun(grid, 6, alone, 1), 3, 3);
  const meeting = triple(grid, 1);
  if (meeting) {
    const [west, east, apex] = meeting;
    lay([edgeKey(west, east), edgeKey(east, apex), edgeKey(west, apex)], 3, 3);
  }
  return walls;
}
