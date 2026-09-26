import * as PIXI from 'pixi.js';
import { statusIconUrl, type StatusIcon } from '../art.js';
import { easeInOut } from '../easing.js';
import { FLAG_OFFSET, FLAG_RATIO, STATUS_COLUMN, STATUS_INTRO, STATUS_RATIO, TOKEN_FOOTPRINT_RATIO } from './geometry.js';

// A status the combat text queue never came for shows itself after this long.
const STATUS_WAIT_MS = 20000;

/** The statuses a piece is under, stacked under its flag. A status that joins announces itself
 * large over the piece before it takes its slot, or waits for the combat text queue to call it. */
export class StatusColumn {
  readonly container = Object.assign(new PIXI.Container(), { sortableChildren: true });
  /** `intro` is when the status starts to show: null once seated, Infinity while it waits for
   * its announcement. */
  private statuses: { icon: StatusIcon; sprite: PIXI.Sprite | null; intro: number | null; joined: number }[] = [];
  private readonly awaited = new Set<StatusIcon>();
  /** False until the first update: a piece that mounts already guarding has nothing to announce. */
  private settled = false;
  private size = 0;

  /** How long until every status has settled into its slot. One still waiting for the combat text
   * queue does not count: the queue answers for it. */
  get settlingMs(): number {
    const { fadeMs, holdMs, settleMs } = STATUS_INTRO;
    const now = performance.now();
    return Math.max(0, ...this.statuses
      .filter((held) => held.intro !== null && held.intro !== Infinity)
      .map((held) => held.intro! + fadeMs + holdMs + settleMs - now));
  }

  /** Once per token draw: the first call seats what the piece mounts with, and every later one
   * announces what joins. */
  update(wanted: readonly StatusIcon[], size: number): void {
    this.size = size;
    for (const gone of this.statuses.filter((held) => !wanted.includes(held.icon))) gone.sprite?.destroy();
    const kept = this.statuses.filter((held) => wanted.includes(held.icon));
    const { fadeMs, holdMs } = STATUS_INTRO;
    const now = performance.now();
    let turn = Math.max(now, ...kept.map((held) => (held.intro === Infinity ? -Infinity : held.intro ?? -Infinity) + fadeMs + holdMs));
    this.statuses = wanted.map((icon) => {
      const held = kept.find((k) => k.icon === icon);
      if (held) return held;
      const waits = this.settled && this.awaited.has(icon);
      const entry = { icon, sprite: null as PIXI.Sprite | null, intro: waits ? Infinity : this.settled ? turn : null, joined: now };
      if (this.settled && !waits) turn += fadeMs + holdMs;
      PIXI.Assets.load<PIXI.Texture>(statusIconUrl(icon))
        .then((texture) => {
          if (this.container.destroyed || !this.statuses.includes(entry)) return;
          entry.sprite = new PIXI.Sprite(texture);
          entry.sprite.anchor.set(0.5);
          this.container.addChild(entry.sprite);
          this.layout(this.size);
        })
        // proto: a missing icon leaves the piece without it; no error UI.
        .catch(() => {});
      return entry;
    });
    this.layout(size);
    this.settled = true;
  }

  /** The combat text queue will announce these, so they stay hidden until it does. */
  expect(icons: readonly StatusIcon[]): void {
    for (const icon of icons) {
      this.awaited.add(icon);
      const held = this.statuses.find((h) => h.icon === icon);
      if (held && held.intro !== null) held.intro = Infinity;
    }
  }

  /** Plays each status's arrival now, one after another. False when the piece holds none of them. */
  announce(icons: readonly StatusIcon[]): boolean {
    const { fadeMs, holdMs } = STATUS_INTRO;
    let turn = performance.now();
    let any = false;
    for (const icon of icons) {
      this.awaited.delete(icon);
      const held = this.statuses.find((h) => h.icon === icon);
      if (!held) continue;
      held.intro = turn;
      turn += fadeMs + holdMs;
      any = true;
    }
    return any;
  }

  tick(): void {
    if (this.statuses.some((held) => held.intro !== null)) this.layout(this.size);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private layout(size: number): void {
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    const { rows, pitch, gap } = STATUS_COLUMN;
    const ratio = STATUS_RATIO;
    const step = size * ratio * pitch;
    const flagX = r * FLAG_OFFSET;
    const top = -r * FLAG_OFFSET + size * (FLAG_RATIO / 2 + gap + ratio / 2);
    const now = performance.now();
    const { ratio: large, from, fadeMs, holdMs, settleMs } = STATUS_INTRO;
    this.statuses.forEach((held, slot) => {
      if (!held.sprite) return;
      if (held.intro === Infinity && now - held.joined > STATUS_WAIT_MS) held.intro = now;
      const unit = size / Math.max(held.sprite.texture.width, held.sprite.texture.height, 1);
      const t = held.intro === null ? Infinity : now - held.intro;
      if (t >= fadeMs + holdMs + settleMs) held.intro = null;
      const fade = Math.max(0, Math.min(1, t / fadeMs));
      const settle = held.intro === null ? 1 : easeInOut(Math.max(0, t - fadeMs - holdMs) / settleMs);
      held.sprite.alpha = fade;
      held.sprite.scale.set(unit * (large * (from + (1 - from) * (1 - (1 - fade) ** 3)) * (1 - settle) + ratio * settle));
      held.sprite.position.set((flagX + Math.floor(slot / rows) * step) * settle, (top + (slot % rows) * step) * settle);
      // The one arriving rides over the ones already seated.
      held.sprite.zIndex = held.intro === null ? slot : 100 + slot;
    });
  }
}
