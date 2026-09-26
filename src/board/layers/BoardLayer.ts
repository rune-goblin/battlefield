import type * as PIXI from 'pixi.js';
import type { Board, Grid } from '../../engine/index.js';
import type { InkMapAppearance } from './InkLayer.js';

/** `ink` is set while the illustrated map is on. */
export interface LayerContext { board: Board; grid: Grid; size: number; ink: InkMapAppearance | null }

/** A null context means no board: the layer drops whatever it drew. */
export interface BoardLayer {
  setGeometry(context: LayerContext | null): void;
  destroy(): void;
}

export function clearChildren(container: PIXI.Container): void {
  for (const child of container.removeChildren()) child.destroy({ children: true });
}
