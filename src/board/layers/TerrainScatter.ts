import * as PIXI from 'pixi.js';
import { seededRandom, type Cell, type Grid, type Point } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import type { ScatterKind, TerrainAtlas } from '../terrain-sheet.js';

/** How far a piece of scenery may hang over the edge of the area it belongs to. Scenery is
 * never masked — a tree cut in half by a straight line reads as a rendering fault, where the
 * same tree leaning a little over the boundary reads as a wood that spills into the field. */
const SPILL = 16;
// Ink, not bounds: every quadrant of the sheet is blob-shaped, so the frame's inscribed
// ellipse is a far closer stand-in for where the paint actually is than its corners, which are
// empty for a tree crown or a mound and would push scenery needlessly far off every boundary.
const OUTLINE_SAMPLES = 12;
const PLACEMENT_TRIES = 12;
// proto: one dial over every `foot` below, while the density is tuned by eye. Ground covered
// goes as its square, so the useful range is narrow: at 1 the sheets are drawn at the size
// they were authored for — a cell's worth of art per cell — and closed a canopy over the whole
// board, while 0.25 left a quarter of that in area and read as specks on bare fill.
const FOOT = 0.5;

/** Sheet 2's desert, water and plains quadrants are ground cover rather than props: whole
 * patches of surface, drawn to be laid down thickly and to overlap into a continuous field.
 * They go under everything else, and a group carries its own style so `shallows` can take the
 * water art at a thinner, smaller setting than open water does. */
export type ScatterStyle = ScatterKind | 'shallows';

interface KindStyle {
  /** Scenery per cell, before rejection. */
  count: number;
  /** Longest side of the art, as a fraction of the cell pitch. */
  foot: number;
  spread: number;
  /** Top-down art turns freely. The swamp reeds are drawn standing up and the badlands mesas
   * in three-quarter view, both lit from one side, so those stand as drawn. */
  turns: boolean;
  shadow: number;
  /** Minimum spacing between two pieces, as a fraction of their reach. Ground cover wants to
   * overlap into a field; props want air between them. */
  gap: number;
  ground?: boolean;
}

const STYLE: Record<ScatterStyle, KindStyle> = {
  trees: { count: 3, foot: 0.62, spread: 0.62, turns: true, shadow: 0.18, gap: 0.34 },
  swamp: { count: 3, foot: 0.46, spread: 0.66, turns: false, shadow: 0, gap: 0.3 },
  boulders: { count: 2, foot: 0.56, spread: 0.5, turns: true, shadow: 0.2, gap: 0.4 },
  mounds: { count: 1, foot: 0.92, spread: 0.22, turns: true, shadow: 0.1, gap: 0.5 },
  plains: { count: 2, foot: 0.88, spread: 0.42, turns: true, shadow: 0, gap: 0.22, ground: true },
  desert: { count: 2, foot: 0.88, spread: 0.42, turns: true, shadow: 0, gap: 0.22, ground: true },
  water: { count: 2, foot: 0.92, spread: 0.38, turns: true, shadow: 0, gap: 0.22, ground: true },
  shallows: { count: 1, foot: 0.66, spread: 0.5, turns: true, shadow: 0, gap: 0.3, ground: true },
  badlands: { count: 1, foot: 0.98, spread: 0.18, turns: false, shadow: 0.22, gap: 0.55 },
};

/** Ground cover paints before props, so a wood stands on its field rather than under it. */
export const isGround = (style: ScatterStyle): boolean => STYLE[style].ground === true;

export interface ScatterGroup {
  kind: ScatterKind;
  /** Defaults to `kind`. Only `shallows` differs, borrowing the water art. */
  style?: ScatterStyle;
  cells: Cell[];
}

/**
 * Scatters the sheet's art across the cells of one group — a terrain type, or an elevation
 * band — instead of tiling a pattern over them. Placement is seeded per cell, so the same wood
 * grows in the same shape on every redraw and simply scales with the board.
 */
export function scatterGroup(
  grid: Grid, size: number, group: ScatterGroup, atlas: TerrainAtlas, theme: BoardTheme,
): PIXI.Container | null {
  const frames = atlas[group.kind];
  if (!frames?.length || !group.cells.length) return null;
  const style = STYLE[group.style ?? group.kind];
  const keys = new Set(group.cells.map((c) => grid.key(c)));
  const inside = (p: Point): boolean => {
    const c = grid.fromPoint(p, size);
    return !!c && keys.has(grid.key(c));
  };
  // The area dilated by SPILL: a point is fair game if it is in the group, or within a
  // sprite's allowance of it. Eight probes stand in for the disc — SPILL is a fifth of a cell,
  // so nothing thinner than a probe's gap can hide between them.
  const allowed = (p: Point): boolean => {
    if (inside(p)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      if (inside({ x: p.x + SPILL * Math.cos(a), y: p.y + SPILL * Math.sin(a) })) return true;
    }
    return false;
  };

  const container = new PIXI.Container();
  container.name = `Scatter_${group.style ?? group.kind}`;
  const shadows = new PIXI.Graphics();
  const pieces = new PIXI.Container();
  container.addChild(shadows, pieces);
  const placed: { p: Point; r: number }[] = [];
  const dim = theme.mode === 'dark' ? 0.58 : 1;

  for (const cell of group.cells) {
    const centre = grid.center(cell, size);
    const random = seededRandom(hash(`${group.style ?? group.kind}:${grid.key(cell)}`));
    for (let i = 0; i < style.count; i++) {
      const frame = frames[Math.floor(random() * frames.length)];
      const scale = (size * style.foot * FOOT * (0.85 + 0.3 * random())) / Math.max(frame.width, frame.height);
      const hw = (frame.width * scale) / 2;
      const hh = (frame.height * scale) / 2;
      const turn = style.turns ? random() * Math.PI * 2 : 0;
      const reach = Math.max(hw, hh);

      let at: Point | null = null;
      for (let tries = 0; tries < PLACEMENT_TRIES && !at; tries++) {
        const a = random() * Math.PI * 2;
        const d = size * style.spread * 0.5 * Math.sqrt(random());
        const p = { x: centre.x + d * Math.cos(a), y: centre.y + d * Math.sin(a) };
        if (placed.some((q) => distance(q.p, p) < (q.r + reach) * style.gap)) continue;
        if (!outlineFits(p, hw, hh, turn, allowed)) continue;
        at = p;
      }
      if (!at) continue;
      placed.push({ p: at, r: reach });

      if (style.shadow > 0) {
        shadows.beginFill(0x000000, style.shadow)
          .drawEllipse(at.x + hw * 0.08, at.y + hh * 0.22, hw * 0.72, hh * 0.5)
          .endFill();
      }
      const sprite = new PIXI.Sprite(frame);
      sprite.anchor.set(0.5);
      sprite.position.set(at.x, at.y);
      sprite.rotation = turn;
      sprite.scale.set(scale, scale);
      sprite.tint = grey(dim * (0.92 + 0.14 * random()));
      pieces.addChild(sprite);
    }
  }

  if (!pieces.children.length) {
    container.destroy({ children: true });
    return null;
  }
  // Lower scenery draws last so a crown overlaps the trunk of the tree behind it.
  pieces.children.sort((a, b) => a.y - b.y);
  return container;
}

function outlineFits(p: Point, hw: number, hh: number, turn: number, allowed: (q: Point) => boolean): boolean {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  for (let i = 0; i < OUTLINE_SAMPLES; i++) {
    const a = (i * 2 * Math.PI) / OUTLINE_SAMPLES;
    const x = hw * Math.cos(a);
    const y = hh * Math.sin(a);
    if (!allowed({ x: p.x + x * cos - y * sin, y: p.y + x * sin + y * cos })) return false;
  }
  return true;
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const grey = (v: number): number => {
  const c = Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c << 16) | (c << 8) | c;
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
