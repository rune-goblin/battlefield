import { targetAnchor } from '../target-point.js';
import * as PIXI from 'pixi.js';
import type { Grid, Point, Tree } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';
import { primTexture } from '../vfx/textures.js';

const PARTICLE_COUNT = 16;
/** Where the glow primitive's falloff reads as its edge, in texture pixels. */
const GLOW_RADIUS_PX = 30;
const SWIRL_RADIUS_MIN = 0.05;
const SWIRL_RADIUS_MAX = 0.16;
const TRAVEL_SPAN = 0.7;
const SWIRL_SPAN = 2.4;
const PARTICLE_MIN_RADIUS = 0.018;
const PARTICLE_MAX_RADIUS = 0.05;
const LINE_WIDTH = 0.045;
const RESOLVE_DURATION = 0.35;

interface Particle {
  g: PIXI.Sprite;
  along: number;
  phase: number;
  travelSpeed: number;
  swirlSpeed: number;
  radius: number;
  baseSize: number;
  resolveAlong: number;
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
  private cast: { from: string; to: string; tree: Tree; toCells?: string[] } | null = null;
  private particles: Particle[] = [];
  private a: Point | null = null;
  private b: Point | null = null;
  private line: PIXI.Graphics | null = null;
  private resolving: number | null = null;

  private readonly tick = (): void => {
    if (!this.particles.length || !this.a || !this.b) return;
    const dt = this.ticker.deltaMS / 1000;
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const resolveT = this.resolving === null
      ? null
      : Math.min(1, (this.resolving += dt) / RESOLVE_DURATION);
    const converge = resolveT === null ? 0 : smoothstep(resolveT);
    for (const p of this.particles) {
      p.along = resolveT === null
        ? (p.along + dt * p.travelSpeed) % 1
        : p.resolveAlong + (1 - p.resolveAlong) * converge;
      p.phase += dt * p.swirlSpeed * (resolveT === null ? 1 : 1.8);
      // A sine offset perpendicular to the line, scaled by its own cosine, reads as a
      // corkscrew: particles widen and narrow as they'd bank toward and away from a viewer
      // riding along the line, rather than sitting in one flat plane.
      const depth = Math.cos(p.phase);
      const radius = p.radius * (resolveT === null ? 1 : 1 - converge);
      const offset = radius * Math.sin(p.phase);
      const cx = this.a.x + dx * p.along;
      const cy = this.a.y + dy * p.along;
      p.g.position.set(cx + perpX * offset, cy + perpY * offset);
      const visibility = resolveT === null ? 1 : 1 - smoothstep(resolveT);
      p.g.scale.set((0.55 + 0.45 * (depth * 0.5 + 0.5)) * (1 + converge * 0.8) * (p.baseSize / GLOW_RADIUS_PX));
      p.g.alpha = (0.35 + 0.65 * (depth * 0.5 + 0.5)) * visibility;
    }
    if (this.line && resolveT !== null) this.line.alpha = 1 - smoothstep(resolveT);
    if (resolveT === 1) this.clearVisual();
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
  setCast(cast: { from: string; to: string; tree: Tree; toCells?: string[] } | null): void {
    if (cast?.from === this.cast?.from && cast?.to === this.cast?.to && cast?.toCells?.join('+') === this.cast?.toCells?.join('+') && cast?.tree === this.cast?.tree) return;
    this.cast = cast;
    this.redraw();
  }

  /** Pulls the live particles into their target and fades the aim line after confirmation.
   * Returns the caster's cell, so the resolution effect can fly in from it. */
  resolve(): string | null {
    const from = this.cast?.from ?? null;
    if (!this.particles.length || this.resolving !== null) return from;
    this.cast = null;
    this.resolving = 0;
    for (const p of this.particles) p.resolveAlong = p.along;
    return from;
  }

  private redraw(): void {
    this.clearVisual();
    if (!this.grid || !this.size || !this.cast) return;
    const from = this.grid.parse(this.cast.from);
    if (!this.grid.inBounds(from)) return;
    const a = this.grid.center(from, this.size);
    const b = targetAnchor(this.cast.toCells ?? [this.cast.to], (cell) => {
      const target = this.grid!.parse(cell);
      return this.grid!.inBounds(target) ? this.grid!.center(target, this.size) : null;
    });
    if (!b) return;
    if (a.x === b.x && a.y === b.y) return;

    const colour = this.theme.overlay.cast[this.cast.tree];
    const line = new PIXI.Graphics();
    line.name = 'CastLine';
    line.lineStyle(this.size * LINE_WIDTH, colour, 0.5);
    line.moveTo(a.x, a.y).lineTo(b.x, b.y);
    this.container.addChild(line);
    this.line = line;

    this.a = a;
    this.b = b;
    this.particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const baseSize = this.size * (PARTICLE_MIN_RADIUS + Math.random() * (PARTICLE_MAX_RADIUS - PARTICLE_MIN_RADIUS));
      const g = new PIXI.Sprite(primTexture('glow'));
      g.anchor.set(0.5);
      g.tint = colour;
      g.blendMode = PIXI.BLEND_MODES.ADD;
      g.scale.set(baseSize / GLOW_RADIUS_PX);
      this.container.addChild(g);
      return {
        g,
        along: i / PARTICLE_COUNT,
        phase: Math.random() * Math.PI * 2,
        travelSpeed: TRAVEL_SPAN * (0.8 + Math.random() * 0.4),
        swirlSpeed: SWIRL_SPAN * (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1),
        radius: this.size * (SWIRL_RADIUS_MIN + Math.random() * (SWIRL_RADIUS_MAX - SWIRL_RADIUS_MIN)),
        baseSize,
        resolveAlong: 0,
      };
    });
  }

  private clearVisual(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.particles = [];
    this.a = null;
    this.b = null;
    this.line = null;
    this.resolving = null;
  }

  /** Unhooks the ticker before the generic `LayerManager` teardown runs. */
  destroy(): void {
    this.ticker.remove(this.tick);
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
