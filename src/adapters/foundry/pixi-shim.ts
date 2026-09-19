import type * as PixiNamespace from 'pixi.js';

// Foundry 14 bundles pixi.js 7.4.3 — the version `package.json` pins — and publishes it as
// `globalThis.PIXI`. The module build aliases `pixi.js` and `@pixi/core` here so one renderer
// serves the board and Foundry's canvas, and the module ships no copy of PIXI.
const pixi = (globalThis as { PIXI?: typeof PixiNamespace }).PIXI;
if (!pixi) throw new Error('Battlefield needs Foundry\'s PIXI global, which is missing.');

export const {
  ALPHA_MODES, AlphaFilter, Application, Assets, BLEND_MODES, BaseTexture, BlurFilter,
  ColorMatrixFilter, Container, DEG_TO_RAD, DisplayObject, Filter, Graphics, LINE_JOIN,
  MIPMAP_MODES, Matrix, ObservablePoint, ParticleContainer, Point, Rectangle, RenderTexture,
  SCALE_MODES, Sprite, SpriteMaskFilter, Spritesheet, TEXT_GRADIENT, Text, TextMetrics,
  TextStyle, Texture, Ticker, TilingSprite, WRAP_MODES, settings, utils,
} = pixi;
