import { targetAnchor, type TargetArrow } from '../target-point.js';
import * as PIXI from 'pixi.js';
import type { Grid, Point } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';

// The shot's flight, in fractions of cell size: how high the arc rises over the straight
// line, how thin it leaves the shooter, how thick it lands, and the head it lands with.
const LIFT_MIN = 0.5;
const LIFT_MAX = 1.3;
const LIFT_SPAN = 0.34;
const TAIL_HALF = 0.02;
const NOCK_HALF = 0.055;
const HEAD_LENGTH = 0.3;
const HEAD_HALF = 0.15;
const TARGET_RADIUS = 0.22;
const SAMPLES = 40;

/**
 * Shared targeting arcs: each source to its target, above the pieces. Each action supplies
 * its tone; spells use the same palette as their effects.
 */
export class ShotLayer {
  private readonly container: PIXI.Container;
  private grid: Grid | null = null;
  private size = 0;
  private theme: BoardTheme;
  private arrows: readonly TargetArrow[] = [];

  constructor(container: PIXI.Container, theme: BoardTheme) {
    this.container = container;
    this.theme = theme;
  }

  setGeometry(grid: Grid | null, size: number, theme: BoardTheme): void {
    this.grid = grid;
    this.size = size;
    this.theme = theme;
    this.redraw();
  }

  /** Shared aiming arcs; a single shot remains valid for existing board callers. */
  setShot(shot: TargetArrow | readonly TargetArrow[] | null): void {
    const arrows = shot === null ? [] : Array.isArray(shot) ? shot : [shot as TargetArrow];
    if (JSON.stringify(arrows) === JSON.stringify(this.arrows)) return;
    this.arrows = arrows;
    this.redraw();
  }

  private redraw(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.grid || !this.size) return;
    for (const arrow of this.arrows) {
      const from = this.grid.parse(arrow.from);
      if (!this.grid.inBounds(from)) continue;
      const a = this.grid.center(from, this.size);
      const b = targetAnchor(arrow.toCells ?? [arrow.to], (cell) => {
        const target = this.grid!.parse(cell);
        return this.grid!.inBounds(target) ? this.grid!.center(target, this.size) : null;
      });
      if (!b) continue;
      const tone = arrow.tone ?? 'shoot';
      const colour = tone === 'shoot' || tone === 'fight' ? this.theme.overlay.shot
        : tone === 'rally' ? this.theme.token.ringFlash
          : tone === 'guard' ? this.theme.overlay.cast.defense
            : tone === 'cast' ? this.theme.overlay.cast.controlling : this.theme.overlay.cast[tone];
      const g = new PIXI.Graphics();
      g.name = 'TargetArrow';
      // Draw the placement circle first, beneath the arrowhead, in the action's own colour.
      g.lineStyle(Math.max(1, this.size * 0.018), colour, 0.5)
        .beginFill(colour, 0.22)
        .drawCircle(b.x, b.y, this.size * TARGET_RADIUS)
        .endFill()
        .lineStyle(0);
      if (a.x !== b.x || a.y !== b.y) this.drawArc(g, a, b, colour);
      this.container.addChild(g);
    }
  }

  private drawArc(g: PIXI.Graphics, a: Point, b: Point, colour: number): void {
    const size = this.size;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const lift = Math.min(size * LIFT_MAX, Math.max(size * LIFT_MIN, span * LIFT_SPAN));
    // A quadratic curve sits half way to its control point at the apex, so the control lifts
    // twice as far as the arc should rise.
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - lift * 2 };
    const at = (t: number): Point => ({
      x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    });

    const points: Point[] = [];
    const lengths: number[] = [0];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = at(i / SAMPLES);
      points.push(p);
      if (i) lengths.push(lengths[i - 1] + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y));
    }
    const total = lengths[SAMPLES];
    const flight = total;
    const shaft = flight - size * HEAD_LENGTH;
    if (shaft <= 0) return;

    const along = (length: number): Point => {
      const clamped = Math.max(0, Math.min(total, length));
      let i = 1;
      while (i < SAMPLES && lengths[i] < clamped) i++;
      const run = lengths[i] - lengths[i - 1] || 1;
      const f = (clamped - lengths[i - 1]) / run;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
      };
    };

    // The shaft as one closed ribbon: down the left side of the flight path, back up the
    // right, widening from a hairline at the shooter to the head's nock.
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const s = i / SAMPLES;
      const p = along(shaft * s);
      const q = along(shaft * s + Math.max(shaft / SAMPLES, 0.5));
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const nx = -(q.y - p.y) / d;
      const ny = (q.x - p.x) / d;
      const half = size * (TAIL_HALF + (NOCK_HALF - TAIL_HALF) * s * s);
      left.push({ x: p.x + nx * half, y: p.y + ny * half });
      right.push({ x: p.x - nx * half, y: p.y - ny * half });
    }
    g.beginFill(colour, 0.95)
      .drawPolygon([...left, ...right.reverse()].flatMap((p) => [p.x, p.y]))
      .endFill();

    const tip = along(flight);
    const base = along(shaft);
    const d = Math.hypot(tip.x - base.x, tip.y - base.y) || 1;
    const ux = (tip.x - base.x) / d;
    const uy = (tip.y - base.y) / d;
    const half = size * HEAD_HALF;
    g.beginFill(colour, 0.95)
      .moveTo(tip.x, tip.y)
      .lineTo(base.x - uy * half, base.y + ux * half)
      .lineTo(base.x + uy * half, base.y - ux * half)
      .closePath()
      .endFill();
  }

  destroy(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
