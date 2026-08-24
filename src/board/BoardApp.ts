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
  private readonly viewportContainer = new PIXI.Container();
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
    this.viewportContainer.name = 'Viewport';
    this.viewportContainer.sortableChildren = true;
    this.app.stage.addChild(this.viewportContainer);
  }

  get stage(): PIXI.Container {
    return this.app.stage;
  }

  get theme(): BoardTheme {
    return this.themeValue;
  }

  // Pan and zoom live here, between the stage and the board, so Interaction moves one
  // container and every layer inherits the transform. `Interaction` is its only writer.
  get viewport(): PIXI.Container {
    return this.viewportContainer;
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
