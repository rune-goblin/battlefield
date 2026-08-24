import * as PIXI from 'pixi.js';
import { currentTheme, type BoardTheme } from './theme.js';

export interface BoardAppOptions {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  theme?: BoardTheme;
}

// Owns the PIXI.Application lifecycle so BoardContainer and the layers can stay plain
// containers with no knowledge of the renderer, canvas element or resize wiring.
export class BoardApp {
  readonly app: PIXI.Application;
  private themeValue: BoardTheme;

  constructor({ canvas, container, theme }: BoardAppOptions) {
    this.themeValue = theme ?? currentTheme();
    this.app = new PIXI.Application({
      view: canvas,
      resizeTo: container,
      backgroundColor: this.themeValue.background,
      antialias: true,
      // proto: cap at 2x so a 5K display doesn't blow the canvas budget; autoDensity keeps
      // the CSS size independent of the backing (device-pixel) resolution.
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.sortableChildren = true;
  }

  get stage(): PIXI.Container {
    return this.app.stage;
  }

  get theme(): BoardTheme {
    return this.themeValue;
  }

  // proto: stand-in for Wave 3's real pan/zoom viewport container. Today it's just the stage
  // (scale always 1), but pointing zoom-invariant text (LabelLayer) at `viewport.scale` now
  // means Wave 3 only has to swap this getter, not every caller.
  get viewport(): PIXI.Container {
    return this.app.stage;
  }

  setTheme(theme: BoardTheme): void {
    this.themeValue = theme;
    this.app.renderer.background.color = theme.background;
  }

  resize(): void {
    this.app.resize();
  }

  destroy(): void {
    this.app.destroy(false, { children: true, texture: true, baseTexture: true });
  }
}
