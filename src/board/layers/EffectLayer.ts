import * as PIXI from 'pixi.js';
import type { Grid, Tree } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';

// proto: one basic-poly motif per tree, tinted off the same `theme.overlay.cast` palette
// CastLayer already swirls with — a placeholder for the eventual per-spell sprite animation
// (explosion, orb, hearts, ...) this note also flags in CastLayer.

type BurstShape = 'shard' | 'heart' | 'orb' | 'chevron' | 'vortex';

const SHAPE_FOR: Record<Tree, BurstShape> = {
  blast: 'shard',
  offense: 'shard',
  healing: 'heart',
  defense: 'orb',
  movement: 'chevron',
  controlling: 'vortex',
};

// Fewer, slower pieces read as a buff settling in; more, faster ones read as a blast going
// off — same shard poly, told apart by how many fly and how far.
const COUNT_FOR: Record<Tree, number> = {
  blast: 16, offense: 8, healing: 8, defense: 1, movement: 10, controlling: 10,
};

const DURATION_MS = 650;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

function drawShape(shape: BurstShape, colour: number, size: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  switch (shape) {
    case 'shard': {
      const len = size * 0.24;
      const half = size * 0.05;
      g.beginFill(colour, 0.95)
        .moveTo(0, -half).lineTo(len, 0).lineTo(0, half).lineTo(len * 0.3, 0)
        .closePath().endFill();
      break;
    }
    case 'heart': {
      // A parametric heart curve, sampled to a polygon — simplest "basic poly" that still
      // reads as a heart rather than a blob.
      const s = size * 0.028;
      const pts: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push(x * s, y * s);
      }
      g.beginFill(colour, 0.95).drawPolygon(pts).endFill();
      break;
    }
    case 'orb': {
      const r = size * 0.26;
      g.beginFill(colour, 0.22).drawCircle(0, 0, r).endFill();
      g.lineStyle(size * 0.03, colour, 0.9).drawCircle(0, 0, r * 0.58);
      g.beginFill(colour, 0.95).drawCircle(0, 0, r * 0.2).endFill();
      break;
    }
    case 'chevron': {
      const w = size * 0.16;
      const h = size * 0.09;
      g.beginFill(colour, 0.95)
        .moveTo(-w / 2, -h).lineTo(w / 2, 0).lineTo(-w / 2, h)
        .lineTo(-w / 2 + h * 0.7, 0).closePath().endFill();
      break;
    }
    case 'vortex': {
      const r = size * 0.06;
      g.beginFill(colour, 0.95).drawPolygon([0, -r, r, 0, 0, r, -r, 0]).endFill();
      break;
    }
  }
  return g;
}

interface BurstPart { g: PIXI.Graphics; angle: number; spin: number; delay: number }
interface Burst { container: PIXI.Container; shape: BurstShape; parts: BurstPart[]; elapsed: number }

/**
 * One-shot resolution bursts — fire-and-forget, unlike `CastLayer`'s held aim line. Several
 * can run at once (e.g. an AoE landing on more than one square), each ticking its own
 * lifetime and self-destroying rather than waiting on a `set`/`clear` pair.
 */
export class EffectLayer {
  private readonly container: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private theme: BoardTheme;
  private grid: Grid | null = null;
  private size = 0;
  private bursts: Burst[] = [];

  private readonly tick = (): void => {
    if (!this.bursts.length) return;
    const dt = this.ticker.deltaMS;
    for (const b of [...this.bursts]) {
      b.elapsed += dt;
      this.step(b, Math.min(1, b.elapsed / DURATION_MS));
      if (b.elapsed >= DURATION_MS) {
        this.container.removeChild(b.container);
        b.container.destroy({ children: true });
        this.bursts.splice(this.bursts.indexOf(b), 1);
      }
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
    // The board underneath just changed shape (or vanished) — nothing left for a burst
    // mid-flight to land on, so it's cut short rather than finishing at a stale position.
    if (!grid || !size) {
      for (const b of this.bursts) b.container.destroy({ children: true });
      this.bursts = [];
      this.container.removeChildren();
    }
  }

  /** Fires a resolution burst on `cell`, tinted and shaped for `tree`. No-op off-board or
   * before the board has geometry. */
  burst(cell: string, tree: Tree): void {
    if (!this.grid || !this.size) return;
    const point = this.grid.parse(cell);
    if (!this.grid.inBounds(point)) return;
    const centre = this.grid.center(point, this.size);
    const shape = SHAPE_FOR[tree];
    const colour = this.theme.overlay.cast[tree];
    const count = COUNT_FOR[tree];

    const container = new PIXI.Container();
    container.position.set(centre.x, centre.y);
    this.container.addChild(container);

    const parts: BurstPart[] = Array.from({ length: count }, (_, i) => {
      const g = drawShape(shape, colour, this.size);
      container.addChild(g);
      return {
        g,
        angle: (i / count) * Math.PI * 2 + Math.random() * 0.3,
        spin: (Math.random() - 0.5) * 6,
        delay: shape === 'vortex' ? Math.random() * 0.2 : 0,
      };
    });

    this.bursts.push({ container, shape, parts, elapsed: 0 });
  }

  private step(b: Burst, t: number): void {
    const size = this.size;
    for (const p of b.parts) {
      switch (b.shape) {
        case 'shard': {
          const dist = size * 0.55 * easeOut(t);
          p.g.position.set(Math.cos(p.angle) * dist, Math.sin(p.angle) * dist);
          p.g.rotation = p.angle + t * p.spin;
          p.g.alpha = 1 - t;
          p.g.scale.set(1 - 0.3 * t);
          break;
        }
        case 'heart': {
          const orbit = size * 0.32;
          const rise = -size * 0.55 * t;
          const ang = p.angle + t * Math.PI * 1.4;
          p.g.position.set(Math.cos(ang) * orbit * (1 - t * 0.3), rise + Math.sin(ang) * orbit * 0.4);
          p.g.alpha = 1 - t;
          p.g.scale.set(0.6 + 0.4 * Math.sin(t * Math.PI));
          break;
        }
        case 'orb': {
          p.g.scale.set(0.4 + 0.9 * easeOut(Math.min(1, t * 1.6)));
          p.g.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
          break;
        }
        case 'chevron': {
          const dist = size * 0.5 * t;
          p.g.position.set(Math.cos(p.angle) * dist, Math.sin(p.angle) * dist);
          p.g.rotation = p.angle;
          p.g.alpha = 1 - t;
          break;
        }
        case 'vortex': {
          const tt = Math.max(0, (t - p.delay) / (1 - p.delay || 1));
          const radius = size * 0.5 * (1 - tt);
          const ang = p.angle + tt * Math.PI * 3;
          p.g.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius);
          p.g.alpha = 1 - tt;
          p.g.scale.set(1 - 0.5 * tt);
          break;
        }
      }
    }
  }

  /** Unhooks the ticker before the generic `LayerManager` teardown runs. */
  destroy(): void {
    this.ticker.remove(this.tick);
    for (const b of this.bursts) b.container.destroy({ children: true });
    this.bursts = [];
    this.container.removeChildren();
  }
}
