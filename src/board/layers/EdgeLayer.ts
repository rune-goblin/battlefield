import * as PIXI from 'pixi.js';
import { allSquares, at, gridOf, type Board, type Point, type Wall } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { shade } from './color.js';

function perpendicular(a: Point, b: Point): { px: number; py: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { px: -dy / len, py: dx / len, len };
}

function drawWall(g: PIXI.Graphics, a: Point, b: Point, wall: Wall, theme: BoardTheme): void {
  const stone = shade(theme.rule, 0.65);
  const { px, py } = perpendicular(a, b);
  if (wall.remaining <= 0) {
    // Breached: a broken bar in the accent colour (distinct hue from standing stone) — a
    // grey stroke at the same low alpha nearly disappeared against terrain fills in testing.
    g.lineStyle(4, theme.accent, 0.75);
    g.moveTo(a.x, a.y).lineTo(a.x + (b.x - a.x) * 0.42, a.y + (b.y - a.y) * 0.42);
    g.moveTo(a.x + (b.x - a.x) * 0.58, a.y + (b.y - a.y) * 0.58).lineTo(b.x, b.y);
    return;
  }
  g.lineStyle(5, stone, 1).moveTo(a.x, a.y).lineTo(b.x, b.y);
  // Tier ticks: one per box in the wall's tier, evenly spaced along the bar.
  const ticks = wall.tier + 1;
  g.lineStyle(1.4, theme.background, 0.9);
  for (let i = 1; i <= ticks; i++) {
    const t = i / (ticks + 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    g.moveTo(x - px * 2, y - py * 2).lineTo(x + px * 2, y + py * 2);
  }
}

function drawCliff(g: PIXI.Graphics, a: Point, b: Point, theme: BoardTheme): void {
  const { px, py, len } = perpendicular(a, b);
  const jag = Math.min(4, len / 6);
  const segments = Math.max(2, Math.round(len / 6));
  g.lineStyle(3, shade(theme.ink, 0.55), 0.9);
  g.moveTo(a.x, a.y);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const jitter = i % 2 === 0 ? jag : -jag;
    g.lineTo(a.x + (b.x - a.x) * t + px * jitter, a.y + (b.y - a.y) * t + py * jitter);
  }
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

    const seen = new Set<string>();
    for (const [key, wall] of Object.entries(board.walls)) {
      seen.add(key);
      const [aKey, bKey] = key.split('|');
      const a = grid.parse(aKey);
      const b = grid.parse(bKey);
      if (!grid.inBounds(a) || !grid.inBounds(b)) continue;
      const [p, q] = grid.edgeSegment(a, b, size);
      drawWall(g, p, q, wall, theme);
    }

    // Cliffs: any edge not already carrying a wall bar, where elevation drops by 2+.
    for (const sq of allSquares()) {
      for (const n of grid.neighbours(sq)) {
        const key = grid.edgeKey(sq, n);
        if (seen.has(key)) continue;
        seen.add(key);
        if (Math.abs(at(board, sq).elevation - at(board, n).elevation) < 2) continue;
        const [p, q] = grid.edgeSegment(sq, n, size);
        drawCliff(g, p, q, theme);
      }
    }

    this.container.addChild(g);
  }

  clear(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
