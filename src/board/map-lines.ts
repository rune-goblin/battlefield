import * as PIXI from 'pixi.js';
import { at, type Board, type Grid, type Point, type Square } from '../engine/index.js';
import { terrainRegions } from './terrain-regions.js';

/** One drawn line, wherever it is drawn: the outline around a terrain area, the ring around
 * ground at a height, the hex grid. Width in pixels, so a line keeps its weight through zoom. */
export interface MapLine { visible: boolean; width: number; opacity: number; colour: number }

export const DEFAULT_AREA_LINE: MapLine = { visible: false, width: 1.5, opacity: 0.45, colour: 0x33302b };

/** The ring around ground standing at a height. Two bands, mirrored: a pit two levels down is
 * as much of a step as a mesa two up, and takes the same line. */
export interface ElevationLines { level1: MapLine; level2: MapLine }
export const DEFAULT_ELEVATION_LINES: ElevationLines = {
  level1: { visible: true, width: 2, opacity: 0.25, colour: 0xffffff },
  level2: { visible: true, width: 2, opacity: 0.5, colour: 0xffffff },
};

// The elevation wash's own colour, which still says which way a step goes: a fixed white for
// high ground and a fixed black for low, rather than theme.ink, so a level reads the same
// direction on every terrain — water included — in both themes.
export const elevationColour = (level: number): number => (level >= 0 ? 0xffffff : 0x000000);

// The elevation wash scales linearly with |level| (0 has none — it's the unlit base terrain):
// 10% per level, capped at 60%. The line around raised ground is `MapLineLayer`'s, drawn over
// everything rather than under the pieces standing on the step.
export function elevationFillAlpha(level: number): number {
  return level === 0 ? 0 : Math.min(0.6, 0.1 * Math.abs(level));
}

/** The in-cell elevation numeral: `fill` over a
 * `halo` stroke, so the digit holds up against any ground under it — rather than MapTextUtils'
 * drop-shadow presets, which assume a light-on-dark banner. Both maps draw the same mark, each
 * out of its own two colours: the theme's ink on its paper, or the pencil on the page. */
export function elevationLabelStyle(fill: number, halo: number, size: number): Partial<PIXI.ITextStyle> {
  return {
    fontFamily: 'Signika, sans-serif',
    fontWeight: '600',
    fontSize: Math.max(11, Math.min(20, size * 0.34)),
    fill,
    stroke: halo,
    strokeThickness: 3,
    align: 'center',
  };
}

/** The wash and the numeral for every cell off the base level. The caller places the returned
 * labels; the tint is drawn straight into `tint`. */
export function drawElevationMarks(
  tint: PIXI.Graphics, grid: Grid, board: Board, size: number, style: Partial<PIXI.ITextStyle>,
): PIXI.Container {
  const labels = new PIXI.Container();
  labels.name = 'Elevation_labels';
  const labelStyle = new PIXI.TextStyle(style);
  for (const cell of grid.cells()) {
    const elevation = at(board, cell).elevation;
    if (elevation === 0) continue;
    tint.beginFill(elevationColour(elevation), elevationFillAlpha(elevation)).drawPolygon(grid.vertices(cell, size)).endFill();

    // A number, not just the wash: level 1 and 2 read close on a busy terrain hue, so the digit
    // is the part that actually answers "how high" — the wash is there for the at-a-glance skim.
    const c = grid.center(cell, size);
    const label = new PIXI.Text(String(elevation), labelStyle);
    label.anchor.set(0.5);
    // Shifted off-centre so a token standing on the cell doesn't fully bury it.
    label.position.set(c.x, c.y - size * 0.32);
    labels.addChild(label);
  }
  return labels;
}

const clamp = (n: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n as number)) : fallback;

export function normalizeMapLine(saved: Partial<MapLine> | undefined, fallback: MapLine): MapLine {
  if (!saved) return { ...fallback };
  return {
    // Absent from a blob saved before the line had a switch, in which case it was drawn.
    visible: saved.visible ?? fallback.visible,
    width: clamp(saved.width, 0, 8, fallback.width),
    opacity: clamp(saved.opacity, 0, 1, fallback.opacity),
    colour: Number.isFinite(saved.colour) ? Math.min(0xffffff, Math.max(0, Math.round(saved.colour as number))) : fallback.colour,
  };
}

export function normalizeElevationLines(saved: Partial<ElevationLines> | undefined, fallback: ElevationLines): ElevationLines {
  return {
    level1: normalizeMapLine(saved?.level1, fallback.level1),
    level2: normalizeMapLine(saved?.level2, fallback.level2),
  };
}

/** Which band a height is outlined in. Level 2 holds everything higher: the board has two
 * steps of art, and a third would have no line of its own to be drawn with. */
export const elevationBand = (elevation: number): keyof ElevationLines | null => {
  const level = Math.abs(elevation);
  return level >= 2 ? 'level2' : level === 1 ? 'level1' : null;
};

/** The cells standing in each band, ready to be outlined the way a terrain area is. */
export function elevationAreas(grid: Grid, board: Board): ElevationBands {
  const bands: ElevationBands = { level1: [], level2: [] };
  for (const cell of grid.cells()) {
    const band = elevationBand(at(board, cell).elevation);
    if (band) bands[band].push(cell);
  }
  return bands;
}
export type ElevationBands = Record<keyof ElevationLines, Square[]>;

const segmentKey = (a: Point, b: Point) => {
  const one = `${Math.round(a.x * 100)},${Math.round(a.y * 100)}`;
  const two = `${Math.round(b.x * 100)},${Math.round(b.y * 100)}`;
  return one < two ? `${one}|${two}` : `${two}|${one}`;
};

/**
 * One stroke around each connected patch, holes and the board's own rim included. `areas` is
 * one entry per group — per terrain for the area outline, per height band for the elevation
 * rings. Two patches meeting share a boundary and each of them traces it, so every segment is
 * drawn once and the border between a wood and a field comes out the same weight as the wood's
 * edge against open board.
 */
export function drawAreaLines(graphics: PIXI.Graphics, grid: Grid, size: number, areas: Square[][], line: MapLine): void {
  if (!line.visible || line.width <= 0 || line.opacity <= 0) return;
  graphics.lineStyle(line.width, line.colour, line.opacity);
  const drawn = new Set<string>();
  for (const cells of areas) {
    if (!cells.length) continue;
    for (const region of terrainRegions(grid, cells, size)) {
      for (const ring of [region.outline, ...region.holes]) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          if (!drawn.add(segmentKey(a, b))) continue;
          graphics.moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
      }
    }
  }
}
