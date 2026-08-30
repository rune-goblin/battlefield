import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Point, type Wall } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { mix, shade } from './color.js';

// One course of stone per damage box, laid across the edge rather than up it — the board is
// seen from above, so a stouter wall is a wider band, not a taller one. A battered wall loses
// courses, so it thins as its boxes go.
const COURSE = 0.062;      // course depth, as a fraction of the cell pitch
const BLOCK = 0.16;        // block length, as a fraction of the edge
const MORTAR = 0.22;       // mortar gap, as a fraction of a block
// Rubble left by a breach: [position along the edge, width as a fraction of the edge, spill
// across it in courses]. The middle is left clear — that gap is the way through.
const RUBBLE: [number, number, number][] = [
  [-0.46, 0.13, 0], [-0.34, 0.09, 0.7], [-0.22, 0.11, -0.6],
  [0.23, 0.1, 0.6], [0.35, 0.14, -0.5], [0.47, 0.09, 0.2],
];

function perpendicular(a: Point, b: Point): { px: number; py: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { px: -dy / len, py: dx / len, len };
}

function drawMasonry(g: PIXI.Graphics, len: number, size: number, courses: number, stone: number, shadow: number): void {
  const course = Math.max(2.4, size * COURSE);
  const thickness = courses * course;
  const count = Math.max(3, Math.round(1 / BLOCK));
  const block = len / count;
  g.beginFill(shadow, 0.5).drawRect(-len / 2 - 0.8, -thickness / 2 + course * 0.4, len + 1.6, thickness).endFill();
  for (let i = 0; i < courses; i++) {
    const y = -thickness / 2 + i * course;
    const stagger = i % 2 ? 0.5 : 0;
    const face = shade(stone, i % 2 ? 0.86 : 1);
    for (let b = -1; b <= count; b++) {
      const start = -len / 2 + (b + stagger) * block;
      const x0 = Math.max(-len / 2, start);
      const x1 = Math.min(len / 2, start + block * (1 - MORTAR));
      if (x1 - x0 < 1) continue;
      g.beginFill(face, 1).drawRect(x0, y, x1 - x0, course * 0.82).endFill();
    }
  }
}

function drawRubble(g: PIXI.Graphics, len: number, size: number, stone: number, shadow: number): void {
  const course = Math.max(2.4, size * COURSE) * 1.25;
  for (const [t, w, spill] of RUBBLE) {
    const x = t * len - (w * len) / 2;
    const y = spill * course - course / 2;
    g.beginFill(shadow, 0.5).drawRect(x, y + course * 0.45, w * len, course).endFill();
    g.beginFill(shade(stone, 0.82), 1).drawRect(x, y, w * len, course).endFill();
  }
}

/** A wall's own Graphics, laid out along its edge in local space and rotated onto the board. */
function wallGraphics(a: Point, b: Point, size: number, wall: Wall, theme: BoardTheme): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2);
  g.rotation = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Toward the ink colour, so stone lifts off the terrain in either theme.
  const stone = mix(theme.rule, theme.ink, 0.38);
  const shadow = shade(theme.ink, 0.42);
  if (wall.remaining <= 0) drawRubble(g, len, size, stone, shadow);
  else drawMasonry(g, len, size, wall.remaining, stone, shadow);
  return g;
}

/** A row of solid trapezoid teeth biting from the edge into `lowerCenter`'s side — a rock
 * outcrop rather than a stroked zigzag line, and alternating tall/short so it reads as broken
 * rock rather than a uniform castle parapet. */
function drawCliff(g: PIXI.Graphics, a: Point, b: Point, lowerCenter: Point, theme: BoardTheme): void {
  let { px, py, len } = perpendicular(a, b);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((lowerCenter.x - mx) * px + (lowerCenter.y - my) * py < 0) { px = -px; py = -py; }
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const teeth = Math.max(2, Math.round(len / 9));
  const toothLen = len / teeth;
  const tallDepth = Math.min(9, len / 3.5);
  const shortDepth = tallDepth * 0.45;
  const taper = toothLen * 0.22; // narrows the tip so the base (on the edge) reads wider than the point
  const rock = shade(theme.ink, 0.55);

  g.beginFill(rock, 0.9);
  for (let i = 0; i < teeth; i++) {
    const x0 = a.x + (b.x - a.x) * (i / teeth);
    const y0 = a.y + (b.y - a.y) * (i / teeth);
    const x1 = a.x + (b.x - a.x) * ((i + 1) / teeth);
    const y1 = a.y + (b.y - a.y) * ((i + 1) / teeth);
    const depth = i % 2 === 0 ? tallDepth : shortDepth;
    const tipLx = x0 + ux * taper + px * depth;
    const tipLy = y0 + uy * taper + py * depth;
    const tipRx = x1 - ux * taper + px * depth;
    const tipRy = y1 - uy * taper + py * depth;
    g.drawPolygon([x0, y0, x1, y1, tipRx, tipRy, tipLx, tipLy]);
  }
  g.endFill();
}

/** Walls (standing and breached) and cliffs, drawn along `grid.edgeSegment`. */
export class EdgeLayer {
  private readonly container: PIXI.Container;

  constructor(container: PIXI.Container) {
    this.container = container;
  }

  draw(board: Board, size: number, theme: BoardTheme): void {
    this.clear();
    const grid = gridOf(board);
    const g = new PIXI.Graphics();
    g.name = 'Edges';
    this.container.addChild(g);

    const seen = new Set<string>();
    for (const [key, wall] of Object.entries(board.walls)) {
      seen.add(key);
      const [aKey, bKey] = key.split('|');
      const a = grid.parse(aKey);
      const b = grid.parse(bKey);
      if (!grid.inBounds(a) || !grid.inBounds(b)) continue;
      const [p, q] = grid.edgeSegment(a, b, size);
      const bar = wallGraphics(p, q, size, wall, theme);
      bar.name = `Wall_${key}`;
      this.container.addChild(bar);
    }

    // Cliffs: any edge not already carrying a wall bar, where elevation drops by 2+.
    for (const sq of grid.cells()) {
      for (const n of grid.neighbours(sq)) {
        const key = grid.edgeKey(sq, n);
        if (seen.has(key)) continue;
        seen.add(key);
        if (Math.abs(at(board, sq).elevation - at(board, n).elevation) < 2) continue;
        const lower = at(board, sq).elevation < at(board, n).elevation ? sq : n;
        const [p, q] = grid.edgeSegment(sq, n, size);
        drawCliff(g, p, q, grid.center(lower, size), theme);
      }
    }
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
