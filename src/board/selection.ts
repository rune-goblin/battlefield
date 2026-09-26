import type { Graphics } from 'pixi.js';
import { cssHex } from './layers/color.js';

/** A steady ivory outline with a dark edge stays legible over either army and any terrain. */
export const SELECTION = { colour: 0xf4efe6, edge: 0x292621, width: 2, edgeWidth: 4 } as const;

export const selectionCss = `--selection-colour:${cssHex(SELECTION.colour)};--selection-edge:${cssHex(SELECTION.edge)};--selection-width:${SELECTION.width}px`;

/** Any board object supplies its outline; this renderer owns the shared selection treatment. */
export function drawSelection(graphics: Graphics, outline: (graphics: Graphics) => void): void {
  graphics.lineStyle(SELECTION.edgeWidth, SELECTION.edge, 1);
  outline(graphics);
  graphics.lineStyle(SELECTION.width, SELECTION.colour, 1);
  outline(graphics);
}
