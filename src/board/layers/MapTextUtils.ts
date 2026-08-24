// proto: lifted from pf2e-reignmaker src/services/map/utils/MapTextUtils.ts (2026-08-24).
// Changes: the zoom-invariant scale reads a PIXI.Container's `.scale.x` (repointed at
// `BoardApp.viewport`, Wave 3's pan/zoom seam) instead of Foundry's `canvas.stage.scale.x`;
// dropped `getHexCenter` (Foundry's `canvas.grid` API — this board resolves centres through
// `Grid.center` instead) and the unused `updateTextScale` (dead in Reignmaker too — never
// called outside this file); dropped the `logger` import, `createMapText` just returns null
// on error. Added `coordinateLabel`, a preset Reignmaker has no equivalent for (chessboard-
// style file/rank labels), alongside the three lifted presets.
import * as PIXI from 'pixi.js';

export const MAP_TEXT_STYLES = {
  settlementLabel: {
    fontFamily: 'Faculty Glyphic, Domine, serif',
    fontSize: 21,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 0,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 6,
    dropShadowAngle: Math.PI / 4,
    dropShadowDistance: 3,
    align: 'center' as const,
  },
  terrainLabel: {
    fontFamily: 'Signika, sans-serif',
    fontSize: 18,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 6,
    dropShadowAngle: Math.PI / 4,
    dropShadowDistance: 3,
    align: 'center' as const,
  },
  infoLabel: {
    fontFamily: 'Signika, sans-serif',
    fontSize: 16,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 3,
    dropShadow: true,
    dropShadowColor: 0x000000,
    dropShadowBlur: 3,
    dropShadowDistance: 1,
    align: 'center' as const,
  },
  coordinateLabel: {
    fontFamily: 'Signika, sans-serif',
    fontSize: 13,
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 3,
    dropShadow: false,
    align: 'center' as const,
  },
} as const;

export type MapTextStyleName = keyof typeof MAP_TEXT_STYLES;

export interface MapTextOptions {
  text: string;
  x: number;
  y: number;
  style?: MapTextStyleName | Partial<PIXI.ITextStyle>;
  anchorX?: number;
  anchorY?: number;
  name?: string;
  minScaleClamp?: number;
}

function getZoomInvariantScale(viewport: PIXI.Container, minClamp: number = 0.3): number {
  const rawScale = viewport?.scale?.x || 1.0;
  const clampedScale = Math.max(minClamp, rawScale);
  return 1.0 / clampedScale;
}

/** A PIXI.Text that keeps a constant on-screen size as `viewport.scale` changes. */
export function createMapText(options: MapTextOptions, viewport: PIXI.Container): PIXI.Text | null {
  try {
    const { text, x, y, style = 'terrainLabel', anchorX = 0.5, anchorY = 0.5, name, minScaleClamp = 0.3 } = options;

    const textStyleOptions: Partial<PIXI.ITextStyle> =
      typeof style === 'string' ? MAP_TEXT_STYLES[style] || MAP_TEXT_STYLES.terrainLabel : style;

    const pixiText = new PIXI.Text(text, new PIXI.TextStyle(textStyleOptions));
    pixiText.anchor.set(anchorX, anchorY);
    pixiText.position.set(x, y);

    const inverseScale = getZoomInvariantScale(viewport, minScaleClamp);
    pixiText.scale.set(inverseScale, inverseScale);

    if (name) pixiText.name = name;
    return pixiText;
  } catch {
    return null;
  }
}
