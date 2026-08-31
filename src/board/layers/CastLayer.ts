import * as PIXI from 'pixi.js';
import type { Grid, Point, Tree } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';

// proto: colour + circles stand in for the eventual per-tree sprite systems (see the cast
// effect note in docs/plans) — swirl geometry below is written so swapping a particle's
// Graphics circle for a sprite is the only thing that will need to change.
const PARTICLE_COUNT = 16;
const SWIRL_RADIUS_MIN = 0.05;
const SWIRL_RADIUS_MAX = 0.16;
const TRAVEL_SPAN = 0.7;
const SWIRL_SPAN = 2.4;
const PARTICLE_MIN_RADIUS = 0.018;
const PARTICLE_MAX_RADIUS = 0.05;
const LINE_WIDTH = 0.045;

interface Particle {
  g: PIXI.Graphics;
  along: number;
  phase: number;
  travelSpeed: number;
  swirlSpeed: number;
  radius: number;
  baseSize: number;
}

/**
 * A cast's link from caster to target: a glowing line with particles that spiral along it,
 * one hue per tree (`theme.overlay.cast`). Live the whole time a spell is armed — it tracks
 * the pointer's own cell until a target is picked, then holds there, the way `ShotLayer`
 * holds a shot's arc once aimed.
 */
export class CastLayer {
  private readonly container: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private theme: BoardTheme;
  private grid: Grid | null = null;
  private size = 0;
  private cast: { from: string; to: string; tree: Tree } | null = null;
  private particles: Particle[] = [];
  private a: Point | null = null;
  private b: Point | null = null;

  private readonly tick = (): void => {
    if (!this.particles.length || !this.a || !this.b) return;
    const dt = this.ticker.deltaMS / 1000;
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const dirX = dx / len;
    const dirY = dy / len;
    const perpX = -dirY;
    const perpY = dirX;
    for (const p of this.particles) {
      p.along = (p.along + dt * p.travelSpeed) % 1;
      p.phase += dt * p.swirlSpeed;
      // A sine offset perpendicular to the line, scaled by its own cosine, reads as a
      // corkscrew: particles widen and narrow as they'd bank toward and away from a viewer
      // riding along the line, rather than sitting in one flat plane.
      const depth = Math.cos(p.phase);
      const offset = p.radius * Math.sin(p.phase);
      const cx = this.a.x + dx * p.along;
      const cy = this.a.y + dy * p.along;
      p.g.position.set(cx + perpX * offset, cy + perpY * offset);
      p.g.scale.set(0.55 + 0.45 * (depth * 0.5 + 0.5));
      p.g.alpha = 0.35 + 0.65 * (depth * 0.5 + 0.5);
    }
  };

  constructor(container: PIXI.Container, ticker: PIXI.Ticker, theme: BoardTheme) {
    this.container = container;
    this.ticker = ticker;
    this.theme = theme;
    this.ticker.add(this.tick);
  }

  setGeometry(grid: Grid | null, size: number, theme: BoardTheme): void {
    this.grid = grid;
    this.size = size;
    this.theme = theme;
    this.redraw();
  }

  /** The cast being aimed right now, or null to clear it. */
  setCast(cast: { from: string; to: string; tree: Tree } | null): void {
    if (cast?.from === this.cast?.from && cast?.to === this.cast?.to && cast?.tree === this.cast?.tree) return;
    this.cast = cast;
    this.redraw();
  }

  private redraw(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.particles = [];
    this.a = null;
    this.b = null;
    if (!this.grid || !this.size || !this.cast) return;
    const from = this.grid.parse(this.cast.from);
    const to = this.grid.parse(this.cast.to);
    if (!this.grid.inBounds(from) || !this.grid.inBounds(to)) return;
    const a = this.grid.center(from, this.size);
    const b = this.grid.center(to, this.size);
    if (a.x === b.x && a.y === b.y) return;

    const colour = this.theme.overlay.cast[this.cast.tree];
    const line = new PIXI.Graphics();
    line.name = 'CastLine';
    line.lineStyle(this.size * LINE_WIDTH, colour, 0.5);
    line.moveTo(a.x, a.y).lineTo(b.x, b.y);
    this.container.addChild(line);

    this.a = a;
    this.b = b;
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const baseSize = this.size * (PARTICLE_MIN_RADIUS + Math.random() * (PARTICLE_MAX_RADIUS - PARTICLE_MIN_RADIUS));
      const g = new PIXI.Graphics().beginFill(colour, 1).drawCircle(0, 0, baseSize).endFill();
      this.container.addChild(g);
      return {
        g,
        along: i / PARTICLE_COUNT,
        phase: Math.random() * Math.PI * 2,
        travelSpeed: TRAVEL_SPAN * (0.8 + Math.random() * 0.4),
        swirlSpeed: SWIRL_SPAN * (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1),
        radius: this.size * (SWIRL_RADIUS_MIN + Math.random() * (SWIRL_RADIUS_MAX - SWIRL_RADIUS_MIN)),
        baseSize,
      };
    });
  }

  /** Unhooks the ticker before the generic `LayerManager` teardown runs. */
  destroy(): void {
    this.ticker.remove(this.tick);
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
