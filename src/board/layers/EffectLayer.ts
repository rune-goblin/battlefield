import * as PIXI from 'pixi.js';
import { hashSeed, type Grid, type Point, type Tree } from '../../engine/index.js';
import { assetUrl } from '../asset-base.js';
import { Effect, type TokenReaction } from '../vfx/Effect.js';
import { recipe, SHEET } from '../vfx/recipes.js';
import { primBase } from '../vfx/textures.js';
import type { BoardLayer, LayerContext } from './BoardLayer.js';

const sheets = new Map<string, PIXI.Texture[]>();
let sheetLoad: Promise<void> | null = null;

// One fetch for the lifetime of the page, shared by every board mount, kicked off at layer
// construction so the frames are in before the first cast lands. A cast that arrives mid-load
// plays its particles without the painted body.
export function loadSheets(): void {
  sheetLoad ??= Promise.all(
    Object.values(SHEET).map(async (name) => {
      const sheet = await PIXI.Assets.load<PIXI.Spritesheet>(assetUrl(`art/spell-vfx-spritesheets/${name}.json`));
      sheets.set(name, sheet.animations[name]);
    }),
  ).then(() => undefined, () => { sheetLoad = null; });
}

let timeScale = 1;

// proto: the VFX lab's slow-motion control. Module-wide because every board on the page
// should slow together; nothing outside the lab calls it.
export function setVfxTimeScale(factor: number): void {
  timeScale = Math.max(0, factor);
}

export interface EffectLayerOptions {
  /** A spell's touch on the piece standing on `cell`: flash, squash, hop. */
  onToken(cell: string, reaction: TokenReaction): void;
  /** The offset the board should sit at this frame; zero once every shake has settled. */
  onShake(offset: Point): void;
}

interface Active {
  effect: Effect;
  elapsed: number;
}

/**
 * One-shot spell compositions: `recipe` describes each tree as tracks of particles, painted
 * frames, token reactions and board shake, and `Effect` plays them as a pure function of time.
 * Ground tracks (light on the cell, scorch, pools) draw under the pieces; air tracks over.
 */
export class EffectLayer implements BoardLayer {
  private readonly ground: PIXI.Container;
  private readonly air: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private readonly opts: EffectLayerOptions;
  private grid: Grid | null = null;
  private size = 0;
  private active: Active[] = [];
  private shaking = false;

  private readonly tick = (): void => {
    if (!this.active.length) return;
    const dt = this.ticker.deltaMS * timeScale;
    let x = 0;
    let y = 0;
    for (const a of [...this.active]) {
      a.elapsed += dt;
      if (a.elapsed >= a.effect.duration) {
        this.remove(a);
        continue;
      }
      a.effect.update(a.elapsed);
      const s = a.effect.shake(a.elapsed);
      x += s.x;
      y += s.y;
    }
    const moving = x !== 0 || y !== 0;
    if (moving || this.shaking) this.opts.onShake({ x, y });
    this.shaking = moving;
  };

  constructor(ground: PIXI.Container, air: PIXI.Container, ticker: PIXI.Ticker, opts: EffectLayerOptions) {
    this.ground = ground;
    this.air = air;
    this.ticker = ticker;
    this.opts = opts;
    this.ticker.add(this.tick);
    primBase();
    loadSheets();
  }

  setGeometry(context: LayerContext | null): void {
    this.grid = context?.grid ?? null;
    this.size = context?.size ?? 0;
    if (!context) this.clear();
  }

  remainingMs(): number {
    return Math.max(0, ...this.active.map((a) => a.effect.duration - a.elapsed));
  }

  /** Plays `tree`'s composition on `cell`; a blast with a `from` cell flies in from it. */
  burst(cell: string, tree: Tree, from: string | null = null): void {
    if (!this.grid || !this.size) return;
    const point = this.grid.parse(cell);
    if (!this.grid.inBounds(point)) return;
    const centre = this.grid.center(point, this.size);
    let origin: Point | null = null;
    if (from && from !== cell) {
      const fromPoint = this.grid.parse(from);
      if (this.grid.inBounds(fromPoint)) origin = this.grid.center(fromPoint, this.size);
    }
    const effect = new Effect(recipe(tree, origin !== null), {
      ground: this.ground,
      air: this.air,
      size: this.size,
      centre,
      from: origin,
      sheet: (name) => sheets.get(name) ?? null,
      onToken: (reaction) => this.opts.onToken(cell, reaction),
    }, hashSeed(`${tree}:${cell}`));
    effect.update(0);
    this.active.push({ effect, elapsed: 0 });
  }

  private remove(a: Active): void {
    a.effect.destroy();
    this.active.splice(this.active.indexOf(a), 1);
  }

  clear(): void {
    for (const a of [...this.active]) this.remove(a);
    if (this.shaking) this.opts.onShake({ x: 0, y: 0 });
    this.shaking = false;
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.clear();
  }
}
