import * as PIXI from 'pixi.js';
import { seededRandom } from '../../engine/index.js';

/** The soft white primitives every particle and flash is built from. All of them live on one
 * canvas so a `ParticleContainer` can mix them, and all are white so tint sets the colour. */
export type Prim = 'glow' | 'spot' | 'smoke' | 'ring' | 'streak' | 'shard' | 'flare' | 'wisp';

export const PRIM_PX = 128;
const ORDER: Prim[] = ['glow', 'spot', 'smoke', 'ring', 'streak', 'shard', 'flare', 'wisp'];
const COLS = 4;
const R = 60;

let atlas: { base: PIXI.BaseTexture; textures: Record<Prim, PIXI.Texture> } | null = null;

export function primTexture(prim: Prim): PIXI.Texture {
  return primitives().textures[prim];
}

export function primBase(): PIXI.BaseTexture {
  return primitives().base;
}

function primitives(): NonNullable<typeof atlas> {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = PRIM_PX * COLS;
  canvas.height = PRIM_PX * Math.ceil(ORDER.length / COLS);
  const ctx = canvas.getContext('2d')!;
  ORDER.forEach((prim, i) => {
    ctx.save();
    ctx.translate((i % COLS) * PRIM_PX + PRIM_PX / 2, Math.floor(i / COLS) * PRIM_PX + PRIM_PX / 2);
    PAINT[prim](ctx);
    ctx.restore();
  });
  const base = new PIXI.BaseTexture(canvas, { mipmap: PIXI.MIPMAP_MODES.ON, scaleMode: PIXI.SCALE_MODES.LINEAR });
  const textures = Object.fromEntries(ORDER.map((prim, i) => [
    prim,
    new PIXI.Texture(base, new PIXI.Rectangle((i % COLS) * PRIM_PX, Math.floor(i / COLS) * PRIM_PX, PRIM_PX, PRIM_PX)),
  ])) as Record<Prim, PIXI.Texture>;
  atlas = { base, textures };
  return atlas;
}

type Stop = [number, number];

function radial(ctx: CanvasRenderingContext2D, stops: Stop[], radius = R): void {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(-PRIM_PX / 2, -PRIM_PX / 2, PRIM_PX, PRIM_PX);
}

const PAINT: Record<Prim, (ctx: CanvasRenderingContext2D) => void> = {
  glow: (ctx) => radial(ctx, [[0, 1], [0.2, 0.8], [0.45, 0.35], [0.75, 0.08], [1, 0]]),
  spot: (ctx) => radial(ctx, [[0, 1], [0.4, 1], [0.6, 0.5], [0.8, 0.1], [1, 0]], 40),
  smoke: (ctx) => {
    const random = seededRandom(7);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const angle = random() * Math.PI * 2;
      const dist = random() * 24;
      ctx.save();
      ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
      radial(ctx, [[0, 0.32], [0.5, 0.16], [1, 0]], 26 + random() * 16);
      ctx.restore();
    }
    // A radial mask keeps the puff round enough to tile against its neighbours.
    ctx.globalCompositeOperation = 'destination-in';
    radial(ctx, [[0, 1], [0.55, 1], [1, 0]]);
  },
  ring: (ctx) => radial(ctx, [[0, 0], [0.58, 0], [0.7, 1], [0.78, 1], [0.92, 0], [1, 0]]),
  streak: (ctx) => {
    ctx.scale(1, 0.16);
    radial(ctx, [[0, 1], [0.35, 0.85], [0.7, 0.3], [1, 0]]);
  },
  shard: (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 40);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
  },
  flare: (ctx) => {
    ctx.globalCompositeOperation = 'lighter';
    for (const angle of [0, Math.PI / 2]) {
      ctx.save();
      ctx.rotate(angle);
      ctx.scale(1, 0.09);
      radial(ctx, [[0, 1], [0.25, 0.7], [0.6, 0.2], [1, 0]]);
      ctx.restore();
    }
    radial(ctx, [[0, 1], [0.3, 0.6], [1, 0]], 22);
  },
  wisp: (ctx) => {
    ctx.scale(0.55, 1);
    radial(ctx, [[0, 1], [0.3, 0.7], [0.65, 0.2], [1, 0]]);
  },
};
