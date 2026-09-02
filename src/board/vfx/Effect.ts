import * as PIXI from 'pixi.js';
import type { Point } from '../../engine/index.js';
import { mulberry32, PRIM_PX, primTexture, type Prim } from './textures.js';

/** Uniformly spaced keyframes over a 0..1 span, interpolated linearly. */
export type Curve = readonly number[];
/** One hex, or hex stops spread uniformly over a particle's life. */
export type Colour = number | readonly number[];
export type Layer = 'ground' | 'air';
export type Blend = 'add' | 'normal';

/** Lengths are in cells, times in milliseconds, speeds in cells per second, angles in radians
 * with 0 pointing right and positive turning clockwise (screen space). */
export interface ParticlesSpec {
  kind: 'particles';
  texture: Prim;
  blend?: Blend;
  layer?: Layer;
  at?: number;
  /** Emission window; 0 (the default) births every particle at once. */
  over?: number;
  count: number;
  life: [number, number];
  spawn?: { x?: number; y?: number; radius?: number; ring?: boolean; w?: number; h?: number };
  /** Launch direction and half-spread; a spread of π with no direction is a full circle. */
  direction?: number;
  spread?: number;
  /** Negative speeds launch inward — toward the spawn centre rather than away from it. */
  speed?: [number, number];
  gravity?: number;
  drag?: number;
  /** Diameter, in cells. */
  size: [number, number];
  scale?: Curve;
  alpha?: Curve;
  colour?: Colour;
  spin?: [number, number];
  wobble?: { amp: number; freq: number };
  /** Extra length along the velocity per cell/s, with `align` implied. */
  stretch?: number;
  align?: boolean;
  /** Circle the centre instead of flying: radius shrinks along `shrink` over the life. */
  orbit?: { radius: [number, number]; speed: [number, number]; shrink?: Curve };
  /** Births walk from `from` to the centre across the emission window — a projectile's trail. */
  trail?: boolean;
}

export interface SpriteSpec {
  kind: 'sprite';
  texture: Prim | { sheet: string; frames: readonly number[] };
  blend?: Blend;
  layer?: Layer;
  at?: number;
  duration: number;
  /** Width, in cells, at scale 1. */
  size: number;
  scale?: Curve;
  alpha?: Curve;
  colour?: Colour;
  rotation?: [number, number];
  x?: Curve;
  y?: Curve;
  anchor?: [number, number];
  /** An additive copy at this alpha over a normal-blended base: painted frames keep their
   * darks and still bloom. */
  glow?: number;
  /** Flies from `from` to the centre over the duration, pointed along the way; `heading` is
   * the direction the art itself faces. */
  travel?: boolean;
  heading?: number;
}

export interface TokenReaction {
  duration: number;
  /** Widen x and shrink y, then spring back. */
  squash?: number;
  /** Uniform scale bump. */
  pop?: number;
  /** Rise, in cells. */
  hop?: number;
  /** Sideways jitter, in cells. */
  shake?: number;
  flash?: number;
}

export interface TokenSpec {
  kind: 'token';
  at?: number;
  reaction: TokenReaction;
}

export interface ShakeSpec {
  kind: 'shake';
  at?: number;
  duration: number;
  /** In cells. */
  amp: number;
}

export type Track = ParticlesSpec | SpriteSpec | TokenSpec | ShakeSpec;

export interface EffectHost {
  ground: PIXI.Container;
  air: PIXI.Container;
  size: number;
  centre: Point;
  from: Point | null;
  sheet(name: string): PIXI.Texture[] | null;
  onToken(reaction: TokenReaction): void;
}

interface Runner {
  end: number;
  update(t: number): void;
  destroy(): void;
}

export class Effect {
  readonly duration: number;
  private readonly runners: Runner[];
  private readonly shakes: ShakeSpec[];
  private readonly size: number;

  constructor(tracks: readonly Track[], host: EffectHost, seed: number) {
    const random = mulberry32(seed);
    this.size = host.size;
    this.runners = [];
    this.shakes = [];
    for (const track of tracks) {
      switch (track.kind) {
        case 'particles': this.runners.push(new Particles(track, host, random)); break;
        case 'sprite': {
          const runner = Decal.create(track, host);
          if (runner) this.runners.push(runner);
          break;
        }
        case 'token': this.runners.push(new Reaction(track, host)); break;
        case 'shake': this.shakes.push(track); break;
      }
    }
    this.duration = Math.max(
      ...this.runners.map((r) => r.end),
      ...this.shakes.map((s) => (s.at ?? 0) + s.duration),
      0,
    );
  }

  update(t: number): void {
    for (const runner of this.runners) runner.update(t);
  }

  /** The board offset this effect asks for at `t`, in pixels. */
  shake(t: number): Point {
    let x = 0;
    let y = 0;
    for (const s of this.shakes) {
      const u = (t - (s.at ?? 0)) / s.duration;
      if (u < 0 || u >= 1) continue;
      const amp = s.amp * this.size * (1 - u) ** 2;
      x += Math.sin(t * 0.09) * amp;
      y += Math.cos(t * 0.13) * amp * 0.6;
    }
    return { x, y };
  }

  destroy(): void {
    for (const runner of this.runners) runner.destroy();
  }
}

// ---------------------------------------------------------------------------------------

interface Particle {
  sprite: PIXI.Sprite;
  birth: number;
  life: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  rot0: number;
  phase: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
}

class Particles implements Runner {
  readonly end: number;
  private readonly spec: ParticlesSpec;
  private readonly container: PIXI.ParticleContainer;
  private readonly particles: Particle[];
  private readonly size: number;

  constructor(spec: ParticlesSpec, host: EffectHost, random: () => number) {
    this.spec = spec;
    this.size = host.size;
    const at = spec.at ?? 0;
    const over = spec.over ?? 0;
    this.end = at + over + spec.life[1];
    this.container = new PIXI.ParticleContainer(spec.count, { position: true, scale: true, rotation: true, uvs: true, tint: true }, undefined, true);
    // Normal unless asked: the light theme's cream board turns anything additive white.
    this.container.blendMode = spec.blend === 'add' ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
    this.container.position.set(host.centre.x, host.centre.y);
    (spec.layer === 'ground' ? host.ground : host.air).addChild(this.container);

    const texture = primTexture(spec.texture);
    const pick = (range: [number, number]): number => range[0] + random() * (range[1] - range[0]);
    const spawn = spec.spawn ?? {};
    const fromDx = host.from ? host.from.x - host.centre.x : 0;
    const fromDy = host.from ? host.from.y - host.centre.y : 0;

    this.particles = Array.from({ length: spec.count }, () => {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.alpha = 0;
      sprite.scale.set(0);
      this.container.addChild(sprite);

      const birthFraction = random();
      const birth = at + birthFraction * over;
      let x0 = (spawn.x ?? 0) * this.size;
      let y0 = (spawn.y ?? 0) * this.size;
      if (spec.trail && host.from) {
        const u = 1 - birthFraction;
        x0 += fromDx * u;
        y0 += fromDy * u;
      }
      if (spawn.radius) {
        const r = spawn.ring ? spawn.radius : spawn.radius * Math.sqrt(random());
        const a = random() * Math.PI * 2;
        x0 += Math.cos(a) * r * this.size;
        y0 += Math.sin(a) * r * this.size;
      }
      if (spawn.w) x0 += (random() - 0.5) * spawn.w * this.size;
      if (spawn.h) y0 += (random() - 0.5) * spawn.h * this.size;

      const spread = spec.spread ?? Math.PI;
      const heading = spec.direction === undefined && spec.spread === undefined
        ? random() * Math.PI * 2
        : (spec.direction ?? Math.atan2(y0, x0)) + (random() * 2 - 1) * spread;
      const speed = spec.speed ? pick(spec.speed) : 0;
      return {
        sprite,
        birth,
        life: pick(spec.life),
        x0,
        y0,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        size: pick(spec.size),
        spin: spec.spin ? pick(spec.spin) : 0,
        rot0: spec.align || spec.stretch ? 0 : random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
        orbitAngle: random() * Math.PI * 2,
        orbitRadius: spec.orbit ? pick(spec.orbit.radius) : 0,
        orbitSpeed: spec.orbit ? pick(spec.orbit.speed) * (random() < 0.5 ? -1 : 1) : 0,
      };
    });
  }

  update(t: number): void {
    const { spec, size } = this;
    const drag = spec.drag ?? 0;
    const gravity = spec.gravity ?? 0;
    for (const p of this.particles) {
      const age = t - p.birth;
      if (age < 0 || age >= p.life) {
        p.sprite.alpha = 0;
        p.sprite.scale.set(0);
        continue;
      }
      const u = age / p.life;
      const s = age / 1000;
      let x: number;
      let y: number;
      let vx: number;
      let vy: number;
      if (spec.orbit) {
        const angle = p.orbitAngle + p.orbitSpeed * s;
        const radius = p.orbitRadius * (spec.orbit.shrink ? curve(spec.orbit.shrink, u) : 1);
        x = p.x0 + Math.cos(angle) * radius * size;
        y = p.y0 + Math.sin(angle) * radius * size;
        vx = -Math.sin(angle) * p.orbitSpeed * radius;
        vy = Math.cos(angle) * p.orbitSpeed * radius;
      } else {
        const travel = drag > 0 ? (1 - Math.exp(-drag * s)) / drag : s;
        const damp = drag > 0 ? Math.exp(-drag * s) : 1;
        x = p.x0 + p.vx * travel * size;
        y = p.y0 + (p.vy * travel + 0.5 * gravity * s * s) * size;
        vx = p.vx * damp;
        vy = p.vy * damp + gravity * s;
      }
      if (spec.wobble) {
        const len = Math.hypot(vx, vy) || 1;
        const w = Math.sin(s * spec.wobble.freq * Math.PI * 2 + p.phase) * spec.wobble.amp * size * Math.min(1, u * 3);
        x += (-vy / len) * w;
        y += (vx / len) * w;
      }
      p.sprite.position.set(x, y);

      const base = (p.size * size) / PRIM_PX * (spec.scale ? curve(spec.scale, u) : 1);
      const speedNow = Math.hypot(vx, vy);
      if (spec.stretch) p.sprite.scale.set(base * (1 + spec.stretch * speedNow), base);
      else p.sprite.scale.set(base);
      p.sprite.rotation = spec.align || spec.stretch ? Math.atan2(vy, vx) : p.rot0 + p.spin * s;
      p.sprite.alpha = spec.alpha ? curve(spec.alpha, u) : 1 - u;
      p.sprite.tint = colourAt(spec.colour, u);
    }
  }

  destroy(): void {
    this.container.parent?.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------------------

class Decal implements Runner {
  readonly end: number;
  private readonly spec: SpriteSpec;
  private readonly at: number;
  private readonly frames: PIXI.Texture[];
  private readonly base: PIXI.Sprite;
  private readonly glow: PIXI.Sprite | null;
  private readonly container: PIXI.Container;
  private readonly size: number;
  private readonly from: Point | null;

  static create(spec: SpriteSpec, host: EffectHost): Decal | null {
    let frames: PIXI.Texture[];
    if (typeof spec.texture === 'string') frames = [primTexture(spec.texture)];
    else {
      const sheet = host.sheet(spec.texture.sheet);
      if (!sheet) return null;
      frames = spec.texture.frames.map((i) => sheet[Math.min(sheet.length - 1, i)]);
    }
    return new Decal(spec, host, frames);
  }

  private constructor(spec: SpriteSpec, host: EffectHost, frames: PIXI.Texture[]) {
    this.spec = spec;
    this.at = spec.at ?? 0;
    this.end = this.at + spec.duration;
    this.frames = frames;
    this.size = host.size;
    this.from = spec.travel ? host.from : null;
    this.container = new PIXI.Container();
    this.container.position.set(host.centre.x, host.centre.y);
    (spec.layer === 'ground' ? host.ground : host.air).addChild(this.container);
    const make = (blend: PIXI.BLEND_MODES): PIXI.Sprite => {
      const sprite = new PIXI.Sprite(frames[0]);
      sprite.anchor.set(spec.anchor?.[0] ?? 0.5, spec.anchor?.[1] ?? 0.5);
      sprite.blendMode = blend;
      sprite.alpha = 0;
      this.container.addChild(sprite);
      return sprite;
    };
    this.base = make(spec.blend === 'add' ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL);
    this.glow = spec.glow ? make(PIXI.BLEND_MODES.ADD) : null;
  }

  update(t: number): void {
    const { spec, size } = this;
    const u = (t - this.at) / spec.duration;
    if (u < 0 || u >= 1) {
      this.base.alpha = 0;
      if (this.glow) this.glow.alpha = 0;
      return;
    }
    const texture = this.frames[Math.min(this.frames.length - 1, Math.floor(u * this.frames.length))];
    const scale = (spec.size * size) / texture.width * (spec.scale ? curve(spec.scale, u) : 1);
    const alpha = spec.alpha ? curve(spec.alpha, u) : 1;
    let rotation = spec.rotation ? spec.rotation[0] + (spec.rotation[1] - spec.rotation[0]) * u : 0;
    let x = (spec.x ? curve(spec.x, u) : 0) * size;
    let y = (spec.y ? curve(spec.y, u) : 0) * size;
    if (this.from) {
      const dx = this.from.x - this.container.x;
      const dy = this.from.y - this.container.y;
      const v = 1 - easeIn(u);
      x += dx * v;
      y += dy * v;
      rotation += Math.atan2(-dy, -dx) - (spec.heading ?? 0);
    }
    for (const sprite of this.glow ? [this.base, this.glow] : [this.base]) {
      sprite.texture = texture;
      sprite.scale.set(scale);
      sprite.rotation = rotation;
      sprite.position.set(x, y);
      sprite.tint = colourAt(spec.colour, u);
    }
    this.base.alpha = alpha;
    if (this.glow) this.glow.alpha = alpha * (spec.glow ?? 0);
  }

  destroy(): void {
    this.container.parent?.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------------------

class Reaction implements Runner {
  readonly end: number;
  private readonly host: EffectHost;
  private readonly spec: TokenSpec;
  private fired = false;

  constructor(spec: TokenSpec, host: EffectHost) {
    this.spec = spec;
    this.host = host;
    this.end = (spec.at ?? 0) + spec.reaction.duration;
  }

  update(t: number): void {
    if (this.fired || t < (this.spec.at ?? 0)) return;
    this.fired = true;
    this.host.onToken(this.spec.reaction);
  }

  destroy(): void {}
}

// ---------------------------------------------------------------------------------------

export function curve(c: Curve, u: number): number {
  if (c.length === 1) return c[0];
  const pos = Math.max(0, Math.min(1, u)) * (c.length - 1);
  const i = Math.min(c.length - 2, Math.floor(pos));
  const f = pos - i;
  return c[i] + (c[i + 1] - c[i]) * f;
}

export function colourAt(colour: Colour | undefined, u: number): number {
  if (colour === undefined) return 0xffffff;
  if (typeof colour === 'number') return colour;
  if (colour.length === 1) return colour[0];
  const pos = Math.max(0, Math.min(1, u)) * (colour.length - 1);
  const i = Math.min(colour.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = colour[i];
  const b = colour[i + 1];
  const mix = (shift: number): number => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * f);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

const easeIn = (t: number): number => t * t;
