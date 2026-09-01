import * as PIXI from 'pixi.js';
import type { Grid, Tree } from '../../engine/index.js';
import type { BoardTheme } from '../theme.js';

const FADE_IN_MS = 100;
const FADE_OUT_MS = 300;
const START_SCALE = 0.9;
const END_SCALE = 1.05;
const BLAST_DURATION = 1400;
const HEAL_DURATION = 1800;
const CONTROL_DURATION = 1700;
const OFFENSE_DURATION = 1300;
const DEFENSE_DURATION = 1700;
const MOVEMENT_DURATION = 1400;

const BASE = import.meta.env.BASE_URL;
const VFX_FRAME = 128;

// movement's sheet is misregistered and nearly invisible (see pixi-board.todos.md), so that
// tree stays fully procedural and its sheet is not fetched.
const VFX_SHEET = {
  blast: 'blast',
  healing: 'heal',
  controlling: 'control',
  offense: 'buff-attacks',
  defense: 'buff-defenses',
} as const;

const vfxFrames = new Map<Tree, PIXI.Texture[]>();
let vfxLoad: Promise<void> | null = null;

// One fetch for the lifetime of the page, shared by every board mount; kicked off at layer
// construction so the sheets are ready long before the first cast resolves. A cast that lands
// mid-load just plays its procedural accents without the sprite body.
function loadVfx(): void {
  vfxLoad ??= Promise.all(
    (Object.entries(VFX_SHEET) as [Tree, string][]).map(async ([tree, name]) => {
      const sheet = await PIXI.Assets.load<PIXI.Spritesheet>(`${BASE}art/spell-vfx-spritesheets-64f/${name}.json`);
      vfxFrames.set(tree, sheet.animations[name]);
    }),
  ).then(() => undefined, () => { vfxLoad = null; });
}

// [time 0..1, frame] control points, interpolated linearly. The sheets bake a slow linear
// bloom that peaks ~60% in; rushing the growth frames and dwelling on the peak band is what
// turns that bloom into snap-and-linger at board tempo.
type FrameCurve = readonly (readonly [number, number])[];

function frameAt(curve: FrameCurve, t: number): number {
  for (let i = 1; i < curve.length; i++) {
    const [t0, f0] = curve[i - 1];
    const [t1, f1] = curve[i];
    if (t <= t1) return Math.round(f0 + ((t - t0) / (t1 - t0)) * (f1 - f0));
  }
  return Math.round(curve[curve.length - 1][1]);
}

interface SpriteBody {
  curve: FrameCurve;
  scale: number;
  anchorY?: number;
  // 'add' renders the sheet additively — buff-attacks and control carry a pale matte halo
  // that normal blending shows as a mushy fringe but additive turns into glow. 'boost'
  // keeps a normal base (blast's smoke, heal's pool and defense's shield need dark/opaque
  // tones) and layers an additive copy whose alpha follows a bell through the energy phase.
  mode: 'add' | 'boost';
  boost?: number;
}

interface Burst {
  container: PIXI.Container;
  elapsed: number;
  duration: number;
  update(elapsed: number): void;
}

interface Spark {
  g: PIXI.Graphics;
  angle: number;
  arc: number;
  distance: number;
  delay: number;
  life: number;
  spin: number;
}

interface Bubble {
  g: PIXI.Graphics;
  x: number;
  drift: number;
  rise: number;
  delay: number;
  life: number;
  phase: number;
}

/**
 * One-shot spell compositions — fire-and-forget, unlike `CastLayer`'s held aim line. Each
 * tree pairs its 64-frame sprite body (frame index driven through `FrameCurve`, never linear
 * playback) with the procedural accents that sprites can't provide: crisp rings, sparks and
 * fragments. Movement is the exception and stays fully procedural.
 */
export class EffectLayer {
  private readonly container: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private grid: Grid | null = null;
  private size = 0;
  private bursts: Burst[] = [];

  private readonly tick = (): void => {
    if (!this.bursts.length) return;
    const dt = this.ticker.deltaMS;
    for (const burst of [...this.bursts]) {
      burst.elapsed += dt;
      if (burst.elapsed >= burst.duration) {
        this.remove(burst);
        continue;
      }
      burst.update(burst.elapsed);
      this.envelope(burst);
    }
  };

  constructor(container: PIXI.Container, ticker: PIXI.Ticker, _theme: BoardTheme) {
    this.container = container;
    this.ticker = ticker;
    this.ticker.add(this.tick);
    loadVfx();
  }

  setGeometry(grid: Grid | null, size: number, _theme: BoardTheme): void {
    this.grid = grid;
    this.size = size;
    if (!grid || !size) this.clear();
  }

  /** Plays the matching spell composition once on `cell`. */
  burst(cell: string, tree: Tree): void {
    if (!this.grid || !this.size) return;
    const point = this.grid.parse(cell);
    if (!this.grid.inBounds(point)) return;
    this.play(cell, tree);
  }

  private play(cell: string, tree: Tree): void {
    if (!this.grid || !this.size) return;
    const point = this.grid.parse(cell);
    if (!this.grid.inBounds(point)) return;
    const centre = this.grid.center(point, this.size);
    const seed = hash(`${tree}:${cell}`);

    switch (tree) {
      case 'blast': this.add(this.createBlast(centre, seed)); break;
      case 'healing': this.add(this.createHeal(centre, seed)); break;
      case 'controlling': this.add(this.createControl(centre)); break;
      case 'offense': this.add(this.createOffense(centre, seed)); break;
      case 'defense': this.add(this.createDefense(centre, seed)); break;
      case 'movement': this.add(this.createMovement(centre, seed)); break;
    }
  }

  /** The sheet-driven body of an effect, or null while the atlas is still loading. */
  private spriteBody(container: PIXI.Container, tree: Tree, body: SpriteBody): ((t: number) => void) | null {
    const frames = vfxFrames.get(tree);
    if (!frames) return null;
    const scale = (this.size * body.scale) / VFX_FRAME;
    const make = (blend: PIXI.BLEND_MODES): PIXI.Sprite => {
      const sprite = new PIXI.Sprite(frames[0]);
      sprite.anchor.set(0.5, body.anchorY ?? 0.5);
      sprite.scale.set(scale);
      sprite.blendMode = blend;
      container.addChild(sprite);
      return sprite;
    };
    const base = make(body.mode === 'add' ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL);
    const glow = body.mode === 'boost' ? make(PIXI.BLEND_MODES.ADD) : null;
    return (t) => {
      const texture = frames[Math.min(frames.length - 1, Math.max(0, frameAt(body.curve, t)))];
      base.texture = texture;
      if (glow) {
        glow.texture = texture;
        // Bell over the first three quarters: the boost carries the energy phase and is gone
        // before the sheet's decay/smoke frames, which additive blending would wash out.
        glow.alpha = (body.boost ?? 0.6) * Math.sin(Math.PI * Math.min(1, t / 0.75));
      }
    };
  }

  private createBlast(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('blast', centre);
    const sprite = this.spriteBody(container, 'blast', {
      curve: [[0, 4], [0.25, 34], [0.6, 45], [1, 63]],
      scale: 1.7,
      mode: 'boost',
      boost: 0.7,
    });

    const shockwave = new PIXI.Graphics()
      .lineStyle(this.size * 0.055, 0xffc34d, 1)
      .drawCircle(0, 0, this.size * 0.32);
    shockwave.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChildAt(shockwave, 0);

    const random = mulberry32(seed);
    const sparks: Spark[] = Array.from({ length: 28 }, (_, i) => {
      const length = this.size * (0.08 + random() * 0.12);
      const width = this.size * (0.012 + random() * 0.018);
      const g = new PIXI.Graphics()
        .beginFill(i % 4 === 0 ? 0xfff1a6 : 0xff7a18, 1)
        .drawRoundedRect(-length / 2, -width / 2, length, width, width / 2)
        .endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return {
        g,
        angle: random() * Math.PI * 2,
        arc: (random() - 0.5) * this.size * 0.45,
        distance: this.size * (0.65 + random() * 0.85),
        delay: 0.18 + random() * 0.2,
        life: 0.32 + random() * 0.25,
        spin: (random() - 0.5) * 8,
      };
    });

    return {
      container,
      elapsed: 0,
      duration: BLAST_DURATION,
      update: (elapsed) => {
        const t = elapsed / BLAST_DURATION;
        sprite?.(t);
        const waveT = clamp01((t - 0.2) / 0.35);
        shockwave.scale.set(0.25 + easeOut(waveT) * 2.8);
        shockwave.alpha = Math.sin(waveT * Math.PI) * 0.75;
        for (const spark of sparks) {
          const p = clamp01((t - spark.delay) / spark.life);
          const travel = easeOut(p);
          const side = Math.sin(p * Math.PI) * spark.arc;
          const cos = Math.cos(spark.angle);
          const sin = Math.sin(spark.angle);
          spark.g.position.set(
            cos * spark.distance * travel - sin * side,
            sin * spark.distance * travel + cos * side,
          );
          spark.g.rotation = spark.angle + p * spark.spin;
          spark.g.alpha = p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
          spark.g.scale.set(0.65 + 0.6 * (1 - p));
        }
      },
    };
  }

  private createControl(centre: { x: number; y: number }): Burst {
    const container = this.effectContainer('controlling', centre);
    // Ends at frame 54: the sheet's last ten frames decay into grey matte blobs.
    const sprite = this.spriteBody(container, 'controlling', {
      curve: [[0, 2], [0.35, 30], [0.7, 44], [1, 54]],
      scale: 1.6,
      mode: 'add',
    });

    const pulse = new PIXI.Graphics()
      .lineStyle(this.size * 0.045, 0xbfe7ff, 0.9)
      .drawCircle(0, 0, this.size * 0.25);
    pulse.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChildAt(pulse, 0);

    return {
      container,
      elapsed: 0,
      duration: CONTROL_DURATION,
      update: (elapsed) => {
        const t = elapsed / CONTROL_DURATION;
        sprite?.(t);
        const pulseT = clamp01((t - 0.5) / 0.28);
        pulse.scale.set(0.35 + easeOut(pulseT) * 3.2);
        pulse.alpha = Math.sin(pulseT * Math.PI) * 0.75;
      },
    };
  }

  private createOffense(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('offense', centre);
    // Ends at frame 58: the cleanup pass leaves almost nothing in the final splatter frames.
    const sprite = this.spriteBody(container, 'offense', {
      curve: [[0, 4], [0.3, 36], [0.65, 44], [1, 58]],
      scale: 1.6,
      mode: 'add',
    });

    const flash = new PIXI.Graphics()
      .beginFill(0xfff1bd, 1)
      .drawPolygon([0, -this.size * 0.32, this.size * 0.07, -this.size * 0.07, this.size * 0.32, 0, this.size * 0.07, this.size * 0.07, 0, this.size * 0.32, -this.size * 0.07, this.size * 0.07, -this.size * 0.32, 0, -this.size * 0.07, -this.size * 0.07])
      .endFill();
    flash.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(flash);

    const random = mulberry32(seed);
    const sparks: Spark[] = Array.from({ length: 20 }, () => {
      const length = this.size * (0.06 + random() * 0.12);
      const g = new PIXI.Graphics()
        .beginFill(random() > 0.25 ? 0xff7d20 : 0xfff1a6, 0.95)
        .drawRoundedRect(-length / 2, -this.size * 0.01, length, this.size * 0.02, this.size * 0.01)
        .endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return { g, angle: random() * Math.PI * 2, arc: 0, distance: this.size * (0.55 + random() * 0.65), delay: 0.28 + random() * 0.18, life: 0.28 + random() * 0.22, spin: (random() - 0.5) * 6 };
    });

    return {
      container,
      elapsed: 0,
      duration: OFFENSE_DURATION,
      update: (elapsed) => {
        const t = elapsed / OFFENSE_DURATION;
        sprite?.(t);
        const flashT = clamp01(1 - Math.abs(t - 0.34) / 0.11);
        flash.scale.set(0.25 + easeOut(flashT));
        flash.alpha = smoothstep(flashT) * 0.95;
        for (const spark of sparks) {
          const p = clamp01((t - spark.delay) / spark.life);
          const distance = easeOut(p) * spark.distance;
          spark.g.position.set(Math.cos(spark.angle) * distance, Math.sin(spark.angle) * distance);
          spark.g.rotation = spark.angle + p * spark.spin;
          spark.g.alpha = p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
        }
      },
    };
  }

  private createDefense(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('defense', centre);
    const sprite = this.spriteBody(container, 'defense', {
      curve: [[0, 2], [0.4, 32], [0.75, 46], [1, 63]],
      scale: 1.6,
      mode: 'boost',
      boost: 0.45,
    });

    const impact = new PIXI.Graphics()
      .lineStyle(this.size * 0.045, 0xe0f6ff, 1)
      .drawCircle(0, 0, this.size * 0.18);
    impact.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(impact);

    const random = mulberry32(seed);
    const fragments = Array.from({ length: 12 }, () => {
      const r = this.size * (0.025 + random() * 0.025);
      const g = new PIXI.Graphics().beginFill(0x70baff, 0.9).drawPolygon([0, -r, r, r, -r, r]).endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return { g, angle: random() * Math.PI * 2, distance: this.size * (0.45 + random() * 0.5), spin: (random() - 0.5) * 8 };
    });

    return {
      container,
      elapsed: 0,
      duration: DEFENSE_DURATION,
      update: (elapsed) => {
        const t = elapsed / DEFENSE_DURATION;
        sprite?.(t);
        const hitT = clamp01((t - 0.5) / 0.22);
        impact.scale.set(0.25 + easeOut(hitT) * 3.3);
        impact.alpha = Math.sin(hitT * Math.PI) * 0.9;
        const breakT = clamp01((t - 0.72) / 0.28);
        for (const fragment of fragments) {
          const travel = easeOut(breakT) * fragment.distance;
          fragment.g.position.set(Math.cos(fragment.angle) * travel, Math.sin(fragment.angle) * travel);
          fragment.g.rotation = breakT * fragment.spin;
          fragment.g.alpha = breakT > 0 ? 1 - smoothstep(breakT) : 0;
        }
      },
    };
  }

  private createMovement(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('movement', centre);
    const ribbons = Array.from({ length: 5 }, () => {
      const g = new PIXI.Graphics();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return g;
    });
    const wings = [-1, 1].map((side) => {
      const g = new PIXI.Graphics()
        .lineStyle(this.size * 0.045, 0xb8f5ff, 0.8)
        .moveTo(0, 0)
        .bezierCurveTo(side * this.size * 0.18, -this.size * 0.3, side * this.size * 0.42, -this.size * 0.32, side * this.size * 0.55, -this.size * 0.08)
        .bezierCurveTo(side * this.size * 0.32, -this.size * 0.16, side * this.size * 0.18, this.size * 0.02, 0, 0);
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return g;
    });
    const random = mulberry32(seed);
    const streaks = Array.from({ length: 22 }, (_, i) => {
      const length = this.size * (0.08 + random() * 0.18);
      const g = new PIXI.Graphics()
        .lineStyle(this.size * (0.012 + random() * 0.018), i % 5 === 0 ? 0xffffff : 0x67dcff, 0.85)
        .moveTo(-length / 2, 0).lineTo(length / 2, 0);
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return { g, y: (random() - 0.5) * this.size * 0.95, delay: random() * 0.55, life: 0.28 + random() * 0.28, curve: (random() - 0.5) * this.size * 0.24 };
    });

    return {
      container,
      elapsed: 0,
      duration: MOVEMENT_DURATION,
      update: (elapsed) => {
        const t = elapsed / MOVEMENT_DURATION;
        const visibility = Math.sin(t * Math.PI);
        ribbons.forEach((ribbon, i) => {
          ribbon.clear().lineStyle(this.size * (0.025 + i * 0.004), i % 2 ? 0xb8f5ff : 0x54cfff, visibility * (0.65 - i * 0.07));
          const offset = (i - 2) * this.size * 0.13;
          const wave = Math.sin(t * Math.PI * 4 + i) * this.size * 0.12;
          ribbon.moveTo(-this.size * 0.72, offset)
            .bezierCurveTo(-this.size * 0.25, offset + wave, this.size * 0.2, offset - wave, this.size * 0.72, offset);
        });
        const wingT = clamp01(1 - Math.abs(t - 0.5) / 0.3);
        wings.forEach((wing) => {
          wing.scale.set(0.45 + easeOut(wingT) * 0.8);
          wing.alpha = smoothstep(wingT) * 0.75;
        });
        for (const streak of streaks) {
          const p = clamp01((t - streak.delay) / streak.life);
          streak.g.position.set(-this.size * 0.85 + easeOut(p) * this.size * 1.7, streak.y + Math.sin(p * Math.PI) * streak.curve);
          streak.g.alpha = p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
          streak.g.scale.x = 0.65 + p * 1.1;
        }
      },
    };
  }

  private createHeal(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('healing', centre);
    // The pool in the sheet sits below frame centre; the lowered anchor grounds it on the cell.
    const sprite = this.spriteBody(container, 'healing', {
      curve: [[0, 0], [0.45, 32], [0.75, 46], [1, 63]],
      scale: 1.8,
      anchorY: 0.62,
      mode: 'boost',
      boost: 0.5,
    });

    const random = mulberry32(seed);
    const bubbles: Bubble[] = Array.from({ length: 18 }, (_, i) => {
      const radius = this.size * (0.018 + random() * 0.035);
      const g = new PIXI.Graphics()
        .lineStyle(Math.max(1, this.size * 0.012), i % 3 === 0 ? 0xffe58a : 0x9fffb8, 0.9)
        .drawCircle(0, 0, radius)
        .beginFill(0xd8ffe1, 0.18)
        .drawCircle(0, 0, radius * 0.72)
        .endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return {
        g,
        x: (random() - 0.5) * this.size * 0.62,
        drift: this.size * (0.04 + random() * 0.08),
        rise: this.size * (0.55 + random() * 0.55),
        delay: 0.08 + random() * 0.5,
        life: 0.32 + random() * 0.38,
        phase: random() * Math.PI * 2,
      };
    });

    return {
      container,
      elapsed: 0,
      duration: HEAL_DURATION,
      update: (elapsed) => {
        const t = elapsed / HEAL_DURATION;
        sprite?.(t);
        const dissolve = 1 - smoothstep(clamp01((t - 0.72) / 0.28));
        for (const bubble of bubbles) {
          const p = clamp01((t - bubble.delay) / bubble.life);
          bubble.g.position.set(
            bubble.x + Math.sin(p * Math.PI * 2 + bubble.phase) * bubble.drift,
            this.size * 0.25 - easeOut(p) * bubble.rise,
          );
          bubble.g.alpha = p > 0 && p < 1 ? Math.sin(p * Math.PI) * dissolve : 0;
          bubble.g.scale.set(0.65 + p * 0.55);
        }
      },
    };
  }

  private effectContainer(tree: Tree, centre: { x: number; y: number }): PIXI.Container {
    const container = new PIXI.Container();
    container.name = `SpellEffect_${tree}`;
    container.position.set(centre.x, centre.y);
    return container;
  }

  private add(burst: Burst): void {
    burst.update(0);
    this.envelope(burst);
    this.container.addChild(burst.container);
    this.bursts.push(burst);
  }

  private envelope(burst: Burst): void {
    const fadeIn = smoothstep(Math.min(1, burst.elapsed / FADE_IN_MS));
    const fadeOut = smoothstep(Math.min(1, (burst.duration - burst.elapsed) / FADE_OUT_MS));
    burst.container.alpha = Math.min(fadeIn, fadeOut);
    const progress = burst.elapsed / burst.duration;
    burst.container.scale.set(START_SCALE + (END_SCALE - START_SCALE) * easeOut(progress));
  }

  private remove(burst: Burst): void {
    this.container.removeChild(burst.container);
    burst.container.destroy({ children: true });
    this.bursts.splice(this.bursts.indexOf(burst), 1);
  }

  private clear(): void {
    for (const burst of [...this.bursts]) this.remove(burst);
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.clear();
  }
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
