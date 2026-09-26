import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import { assetUrl } from '../asset-base.js';
import { STATUS_INTRO } from '../Token.js';

export interface FallenModel { id: string; name: string; cell: string }

export interface FallenLayerOptions {
  /** The piece stands under its own death until the mark starts down to the ground. */
  hold(id: string): void;
  release(id: string): void;
}

const SEATED = { ratio: 0.5, alpha: 0.55 };
// A death the popup queue never came for marks itself after this long.
const WAIT_MS = 20000;

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

interface Mark {
  model: FallenModel;
  sprite: PIXI.Sprite;
  colour: PIXI.ColorMatrixFilter;
  /** When the mark starts to show: null once seated, Infinity while it waits for the popup queue. */
  intro: number | null;
  joined: number;
}

/** Where a unit died: the dead icon, large over the piece as the blow's last word, then down
 * onto the ground at half a hex, grey and faint. It takes no pointer and stays for the battle. */
export class FallenLayer {
  private readonly ground: PIXI.Container;
  private readonly over: PIXI.Container;
  private readonly ticker: PIXI.Ticker;
  private readonly opts: FallenLayerOptions;
  private grid: Grid | null = null;
  private size = 0;
  private texture: PIXI.Texture | null = null;
  private models: readonly FallenModel[] = [];
  private readonly marks = new Map<string, Mark>();
  private readonly awaited = new Set<string>();
  private listed = false;
  // The first list drawn is the record as joined, and those marks seat at once.
  private settled = false;

  private readonly tick = (): void => {
    for (const mark of this.marks.values()) if (mark.intro !== null) this.layout(mark);
  };

  constructor(ground: PIXI.Container, over: PIXI.Container, ticker: PIXI.Ticker, opts: FallenLayerOptions) {
    this.ground = ground;
    this.over = over;
    this.ticker = ticker;
    this.opts = opts;
    this.ticker.add(this.tick);
    PIXI.Assets.load<PIXI.Texture>(assetUrl('art/condition-icons/dead.webp'))
      .then((texture) => { this.texture = texture; this.render(); })
      // proto: a missing dead icon leaves a fallen mark with no texture; no error UI.
      .catch(() => {});
  }

  setGeometry(grid: Grid | null, size: number): void {
    this.grid = grid;
    this.size = size;
    if (!grid || !size) this.settled = false;
    this.render();
  }

  setFallen(models: readonly FallenModel[]): void {
    this.models = models;
    this.listed = true;
    this.render();
  }

  /** The popup queue will announce this death, so the piece stays up until it does. */
  expect(id: string): void {
    this.awaited.add(id);
    this.opts.hold(id);
    const mark = this.marks.get(id);
    if (mark && mark.intro !== null) mark.intro = Infinity;
  }

  /** Plays the death now. False when the board holds no such mark. */
  announce(id: string): boolean {
    this.awaited.delete(id);
    const mark = this.marks.get(id);
    if (!mark) { this.opts.release(id); return false; }
    mark.intro = performance.now();
    return true;
  }

  private render(): void {
    const placeable = this.grid && this.size && this.texture;
    const wanted = new Map(placeable ? this.models.map((m) => [m.id, m]) : []);
    for (const [id, mark] of this.marks) {
      if (wanted.has(id)) continue;
      mark.sprite.destroy();
      this.marks.delete(id);
      this.opts.release(id);
    }
    if (!placeable) return;
    const now = performance.now();
    for (const model of this.models) {
      let mark = this.marks.get(model.id);
      if (!mark) {
        const sprite = new PIXI.Sprite(this.texture!);
        sprite.anchor.set(0.5);
        sprite.eventMode = 'none';
        const colour = new PIXI.ColorMatrixFilter();
        sprite.filters = [colour];
        const waits = this.settled && this.awaited.has(model.id);
        mark = { model, sprite, colour, intro: waits ? Infinity : this.settled ? now : null, joined: now };
        this.marks.set(model.id, mark);
      }
      mark.model = model;
      this.layout(mark);
    }
    if (this.listed) this.settled = true;
  }

  private layout(mark: Mark): void {
    const { ratio: large, from, fadeMs, holdMs, settleMs } = STATUS_INTRO;
    const now = performance.now();
    if (mark.intro === Infinity && now - mark.joined > WAIT_MS) { this.awaited.delete(mark.model.id); mark.intro = now; }
    const t = mark.intro === null ? Infinity : now - mark.intro;
    if (t >= fadeMs + holdMs + settleMs) mark.intro = null;
    const fade = Math.max(0, Math.min(1, t / fadeMs));
    const settle = mark.intro === null ? 1 : easeInOut(Math.max(0, t - fadeMs - holdMs) / settleMs);
    const home = settle > 0 ? this.ground : this.over;
    if (mark.sprite.parent !== home) {
      home.addChild(mark.sprite);
      if (home === this.ground) this.opts.release(mark.model.id);
    }
    const at = this.grid!.center(this.grid!.parse(mark.model.cell), this.size);
    const unit = this.size / Math.max(mark.sprite.texture.width, mark.sprite.texture.height, 1);
    mark.sprite.position.set(at.x, at.y);
    mark.sprite.scale.set(unit * (large * (from + (1 - from) * (1 - (1 - fade) ** 3)) * (1 - settle) + SEATED.ratio * settle));
    mark.sprite.alpha = fade * (1 - (1 - SEATED.alpha) * settle);
    mark.colour.saturate(-settle, false);
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.setGeometry(null, 0);
  }
}
