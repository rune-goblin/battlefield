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
 * One-shot spell compositions — fire-and-forget, unlike `CastLayer`'s held aim line. Blast
 * and each tree owns a distinct deterministic `Graphics` composition. Sprite-sheet assets
 * stay outside this layer.
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
      case 'controlling': this.add(this.createControl(centre, seed)); break;
      case 'offense': this.add(this.createOffense(centre, seed)); break;
      case 'defense': this.add(this.createDefense(centre, seed)); break;
      case 'movement': this.add(this.createMovement(centre, seed)); break;
    }
  }

  private createBlast(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('blast', centre);
    const core = new PIXI.Graphics()
      .beginFill(0xfff2ad, 1).drawCircle(0, 0, this.size * 0.1).endFill()
      .beginFill(0xffa21f, 0.72).drawCircle(0, 0, this.size * 0.22).endFill()
      .beginFill(0xff5a12, 0.32).drawCircle(0, 0, this.size * 0.34).endFill();
    core.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(core);

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
        delay: 0.3 + random() * 0.24,
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
        const coreForm = easeOut(clamp01(t / 0.48));
        const coreFade = 1 - smoothstep(clamp01((t - 0.68) / 0.25));
        core.scale.set(0.18 + coreForm * 1.25);
        core.alpha = coreFade;
        core.rotation = t * 1.8;
        const waveT = clamp01((t - 0.42) / 0.42);
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

  private createControl(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('controlling', centre);
    const orb = new PIXI.Graphics()
      .beginFill(0xd5efff, 1).drawCircle(0, 0, this.size * 0.08).endFill()
      .beginFill(0x3987ff, 0.46).drawCircle(0, 0, this.size * 0.2).endFill();
    orb.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(orb);

    const rings = [0, 1, 2].map((i) => {
      const g = new PIXI.Graphics()
        .lineStyle(this.size * (0.028 - i * 0.004), i === 1 ? 0xffd46b : 0x65b7ff, 0.9)
        .drawEllipse(0, 0, this.size * (0.3 + i * 0.1), this.size * (0.12 + i * 0.035));
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return g;
    });
    const pulse = new PIXI.Graphics()
      .lineStyle(this.size * 0.045, 0xbfe7ff, 0.9)
      .drawCircle(0, 0, this.size * 0.25);
    pulse.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChildAt(pulse, 0);

    const random = mulberry32(seed);
    const shards = Array.from({ length: 10 }, (_, i) => {
      const r = this.size * (0.025 + random() * 0.025);
      const g = new PIXI.Graphics()
        .beginFill(i % 3 === 0 ? 0xffd46b : 0x80c8ff, 0.92)
        .drawPolygon([0, -r * 1.8, r, 0, 0, r * 1.8, -r, 0])
        .endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return { g, angle: random() * Math.PI * 2, radius: this.size * (0.36 + random() * 0.2), speed: 0.65 + random() * 0.55 };
    });

    return {
      container,
      elapsed: 0,
      duration: CONTROL_DURATION,
      update: (elapsed) => {
        const t = elapsed / CONTROL_DURATION;
        const form = smoothstep(clamp01(t / 0.3));
        const release = 1 - smoothstep(clamp01((t - 0.76) / 0.24));
        orb.scale.set(0.3 + form * (0.82 + Math.sin(t * Math.PI * 8) * 0.08));
        orb.alpha = release;
        rings.forEach((ring, i) => {
          ring.scale.set(0.25 + form * (0.9 + i * 0.08));
          ring.rotation = (i % 2 ? -1 : 1) * t * Math.PI * (1.2 + i * 0.45) + i * Math.PI / 3;
          ring.alpha = release * (0.55 + 0.3 * Math.sin(t * Math.PI * 4 + i));
        });
        const pulseT = clamp01((t - 0.5) / 0.28);
        pulse.scale.set(0.35 + easeOut(pulseT) * 3.2);
        pulse.alpha = Math.sin(pulseT * Math.PI) * 0.75;
        for (const shard of shards) {
          const angle = shard.angle + t * Math.PI * 2 * shard.speed;
          const radius = shard.radius * (0.4 + form * 0.6);
          shard.g.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62);
          shard.g.rotation = angle + t * Math.PI * 2;
          shard.g.alpha = form * release;
        }
      },
    };
  }

  private createOffense(centre: { x: number; y: number }, seed: number): Burst {
    const container = this.effectContainer('offense', centre);
    const arcs = [0, 1].map((i) => {
      const g = new PIXI.Graphics()
        .lineStyle(this.size * 0.12, i ? 0xff6a17 : 0xffd36b, 0.9)
        .arc(0, 0, this.size * (0.38 + i * 0.06), -1.22, 1.22);
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return g;
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
      return { g, angle: random() * Math.PI * 2, arc: 0, distance: this.size * (0.55 + random() * 0.65), delay: 0.42 + random() * 0.18, life: 0.28 + random() * 0.22, spin: (random() - 0.5) * 6 };
    });

    return {
      container,
      elapsed: 0,
      duration: OFFENSE_DURATION,
      update: (elapsed) => {
        const t = elapsed / OFFENSE_DURATION;
        const sweep = easeOut(clamp01(t / 0.58));
        const fade = 1 - smoothstep(clamp01((t - 0.68) / 0.3));
        arcs[0].rotation = -1.15 + sweep * 1.95;
        arcs[1].rotation = Math.PI + 1.15 - sweep * 1.95;
        arcs.forEach((arc, i) => {
          arc.scale.set(0.35 + sweep * (0.9 + i * 0.1));
          arc.alpha = fade;
        });
        const flashT = clamp01(1 - Math.abs(t - 0.53) / 0.11);
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
    const w = this.size * 0.48;
    const h = this.size * 0.58;
    const shieldPoints = [0, -h, w, -h * 0.55, w * 0.82, h * 0.36, 0, h, -w * 0.82, h * 0.36, -w, -h * 0.55];
    const shield = new PIXI.Graphics()
      .beginFill(0x397dff, 0.22).drawPolygon(shieldPoints).endFill()
      .lineStyle(this.size * 0.045, 0x8cd2ff, 0.95).drawPolygon(shieldPoints);
    shield.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(shield);

    const cells: PIXI.Graphics[] = [];
    for (const [x, y] of [[-0.2, -0.25], [0.2, -0.25], [0, 0], [-0.2, 0.25], [0.2, 0.25]] as const) {
      const g = new PIXI.Graphics().lineStyle(this.size * 0.018, 0x9edcff, 0.65);
      drawHex(g, x * this.size, y * this.size, this.size * 0.14);
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      cells.push(g);
    }
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
        const assemble = smoothstep(clamp01(t / 0.38));
        const breakT = clamp01((t - 0.72) / 0.28);
        shield.scale.set(0.3 + assemble * 0.75);
        shield.alpha = (1 - smoothstep(breakT)) * (0.72 + Math.sin(t * Math.PI * 7) * 0.1);
        cells.forEach((cell, i) => {
          const cellT = smoothstep(clamp01((t - i * 0.035) / 0.35));
          cell.alpha = cellT * (1 - breakT) * 0.75;
          cell.scale.set(0.5 + cellT * 0.5);
        });
        const hitT = clamp01((t - 0.5) / 0.22);
        impact.scale.set(0.25 + easeOut(hitT) * 3.3);
        impact.alpha = Math.sin(hitT * Math.PI) * 0.9;
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
    const pool = new PIXI.Container();
    container.addChild(pool);
    const rings = [0, 1, 2].map((i) => {
      const g = new PIXI.Graphics()
        .lineStyle(this.size * (0.025 - i * 0.004), i === 1 ? 0x9fffb8 : 0xffd45c, 1)
        .drawEllipse(0, 0, this.size * (0.28 + i * 0.08), this.size * (0.1 + i * 0.025));
      g.blendMode = PIXI.BLEND_MODES.ADD;
      pool.addChild(g);
      return g;
    });

    const ribbons = [0, Math.PI].map(() => {
      const g = new PIXI.Graphics();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      container.addChild(g);
      return g;
    });

    const cross = new PIXI.Graphics()
      .beginFill(0xd8ffe1, 1)
      .drawRoundedRect(-this.size * 0.055, -this.size * 0.2, this.size * 0.11, this.size * 0.4, this.size * 0.025)
      .drawRoundedRect(-this.size * 0.2, -this.size * 0.055, this.size * 0.4, this.size * 0.11, this.size * 0.025)
      .endFill();
    cross.blendMode = PIXI.BLEND_MODES.ADD;
    container.addChild(cross);

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
        const form = smoothstep(clamp01(t / 0.28));
        const dissolve = 1 - smoothstep(clamp01((t - 0.72) / 0.28));
        rings.forEach((ring, i) => {
          ring.scale.set(0.55 + form * (0.7 + i * 0.18) + Math.sin(t * Math.PI * 4 + i) * 0.035);
          ring.alpha = dissolve * (0.45 + 0.3 * Math.sin(t * Math.PI * 3 + i));
          ring.rotation = (i % 2 ? -1 : 1) * t * (0.35 + i * 0.12);
        });

        const growth = smoothstep(clamp01((t - 0.08) / 0.5));
        ribbons.forEach((ribbon, i) => {
          ribbon.clear().lineStyle(this.size * 0.035, i ? 0xffd45c : 0x86ffad, 0.72 * dissolve);
          const phase = i * Math.PI + t * Math.PI * 2;
          for (let step = 0; step <= 24; step++) {
            const s = (step / 24) * growth;
            const taper = 0.35 + 0.65 * Math.sin(s * Math.PI);
            const x = Math.sin(s * Math.PI * 3 + phase) * this.size * 0.2 * taper;
            const y = this.size * 0.28 - s * this.size * 0.95;
            if (step === 0) ribbon.moveTo(x, y); else ribbon.lineTo(x, y);
          }
        });

        const crossT = clamp01(1 - Math.abs(t - 0.58) / 0.14);
        cross.position.set(0, -this.size * 0.22);
        cross.alpha = smoothstep(crossT) * 0.9;
        cross.scale.set(0.5 + easeOut(crossT) * 0.65);

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

function drawHex(g: PIXI.Graphics, x: number, y: number, radius: number): void {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    points.push(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  g.drawPolygon(points);
}
