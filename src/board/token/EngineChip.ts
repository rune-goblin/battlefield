import * as PIXI from 'pixi.js';
import { engineArtUrl } from '../art.js';
import type { BoardTheme } from '../theme.js';
import { CHIP_FRAME, CHIP_ICON, CHIP_OFFSET, TOKEN_FOOTPRINT_RATIO } from './geometry.js';

/** The crewed engine riding with a unit: a framed square at the piece's upper left with the
 * engine's icon in it. */
export class EngineChip {
  readonly container = new PIXI.Container();
  private readonly frame = new PIXI.Graphics();
  private icon: PIXI.Sprite | null = null;
  private path: string | null = null;
  private generation = 0;

  constructor() {
    this.container.addChild(this.frame);
  }

  /** The frame's centre in the piece's own coordinates, and the side of its square. */
  bounds(size: number): { x: number; y: number; side: number } {
    const r = (size * TOKEN_FOOTPRINT_RATIO) / 2;
    return { x: -r * CHIP_OFFSET, y: -r * CHIP_OFFSET, side: size * CHIP_FRAME };
  }

  update(engineName: string | null, size: number, theme: BoardTheme): void {
    this.frame.clear();
    if (engineName) {
      const { x, y, side } = this.bounds(size);
      this.frame
        .lineStyle(1, theme.rule, 1)
        .beginFill(theme.token.badgeFill, 1)
        .drawRoundedRect(x - side / 2, y - side / 2, side, side, size * 0.04)
        .endFill();
    }
    const path = engineName ? engineArtUrl(engineName) : null;
    if (!path) {
      if (this.icon) this.icon.visible = false;
      this.path = null;
      return;
    }
    if (path !== this.path) {
      this.path = path;
      const generation = ++this.generation;
      PIXI.Assets.load<PIXI.Texture>(path)
        .then((texture) => {
          if (this.container.destroyed || generation !== this.generation) return;
          if (!this.icon) {
            this.icon = new PIXI.Sprite(texture);
            this.icon.anchor.set(0.5);
            this.container.addChild(this.icon);
          } else {
            this.icon.texture = texture;
          }
          this.layout(size);
        })
        // proto: a missing chip icon leaves the piece without one; no error UI.
        .catch(() => {});
    }
    if (this.icon) {
      this.icon.visible = true;
      this.layout(size);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private layout(size: number): void {
    if (!this.icon) return;
    const { x, y } = this.bounds(size);
    this.icon.scale.set((size * CHIP_ICON) / Math.max(this.icon.texture.width, 1));
    this.icon.position.set(x, y);
  }
}
