import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import type { BoardTheme, HighlightStyle } from '../theme.js';

export type { HighlightStyle } from '../theme.js';

const HIGHLIGHT_ORDER: HighlightStyle[] = ['deploy', 'move', 'attack'];

/**
 * Hover cell, selection ring, the three highlight-style washes, and a paint preview — all
 * cell-shaped, so they share one draw pass keyed off the current `Grid`/cell size.
 */
export class OverlayLayer {
  private readonly container: PIXI.Container;
  private grid: Grid | null = null;
  private size = 0;
  private theme: BoardTheme;

  private readonly highlights = new Map<HighlightStyle, Set<string>>();
  private hoverCell: string | null = null;
  private selectedCell: string | null = null;
  private paintPreview: { cells: string[]; colour: number } | null = null;

  constructor(container: PIXI.Container, theme: BoardTheme) {
    this.container = container;
    this.theme = theme;
  }

  /** Called by `setBoard`'s redraw with the board's current grid and cell size. */
  setGeometry(grid: Grid | null, size: number, theme: BoardTheme): void {
    this.grid = grid;
    this.size = size;
    this.theme = theme;
    this.redraw();
  }

  setHighlight(cells: string[], style: HighlightStyle): void {
    this.highlights.set(style, new Set(cells));
    this.redraw();
  }

  // proto: Wave 2 has no tokens yet, so `id` is read as a cell key. A key that doesn't parse
  // to an in-bounds cell (a future token id, say) just draws nothing here — once TokenLayer
  // (Wave 4) exists the token itself carries the selection ring instead.
  setSelected(id: string | null): void {
    this.selectedCell = id;
    this.redraw();
  }

  /** For Wave 3's Interaction: the hovered cell, redrawn at pointer-move rate. */
  setHover(cell: string | null): void {
    this.hoverCell = cell;
    this.redraw();
  }

  /** For Wave 3's drag-paint: the pending stroke, before it commits on pointerup. */
  setPaintPreview(cells: string[], colour: number): void {
    this.paintPreview = cells.length ? { cells, colour } : null;
    this.redraw();
  }

  private redraw(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.grid || !this.size) return;
    const g = new PIXI.Graphics();
    g.name = 'Overlay';

    for (const style of HIGHLIGHT_ORDER) {
      const cells = this.highlights.get(style);
      if (!cells?.size) continue;
      for (const key of cells) this.fillCell(g, key, this.theme.overlay.highlight[style], 0.35);
    }

    if (this.paintPreview) {
      for (const key of this.paintPreview.cells) this.fillCell(g, key, this.paintPreview.colour, 0.5);
    }

    if (this.hoverCell) this.strokeCell(g, this.hoverCell, this.theme.overlay.hover, 0.6, 2);
    if (this.selectedCell) this.strokeCell(g, this.selectedCell, this.theme.overlay.selected, 1, 3);

    this.container.addChild(g);
  }

  private fillCell(g: PIXI.Graphics, key: string, colour: number, alpha: number): void {
    const cell = this.grid!.parse(key);
    if (!this.grid!.inBounds(cell)) return;
    g.beginFill(colour, alpha).drawPolygon(this.grid!.vertices(cell, this.size)).endFill();
  }

  private strokeCell(g: PIXI.Graphics, key: string, colour: number, alpha: number, width: number): void {
    const cell = this.grid!.parse(key);
    if (!this.grid!.inBounds(cell)) return;
    g.lineStyle(width, colour, alpha).drawPolygon(this.grid!.vertices(cell, this.size));
  }

  destroy(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
