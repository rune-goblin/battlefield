import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import type { BoardTheme, HighlightStyle } from '../theme.js';

export type { HighlightStyle } from '../theme.js';

const HIGHLIGHT_ORDER: HighlightStyle[] = ['deploy', 'moveFar3', 'moveFar', 'move', 'push', 'attack'];

// The drag arrow's head, as fractions of cell size: how far its tip stops short of the
// destination's centre, how long it is, and how wide at the base.
const HEAD_INSET = 0.2;
const HEAD_LENGTH = 0.22;
const HEAD_HALF_WIDTH = 0.13;

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
  private hoverEdge: string | null = null;
  private selectedCell: string | null = null;
  private paintPreview: { cells: string[]; edges: string[]; colour: number } | null = null;
  /** The drag-to-move trace, unit's own cell first — a thin trail on top of the highlight
   * wash so a fanned-out hex reach still reads as one path rather than a region. */
  private dragPath: string[] = [];

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

  /** The hovered cell and, under an edge brush, the edge a click would take. */
  setHover(cell: string | null, edge: string | null = null): void {
    if (cell === this.hoverCell && edge === this.hoverEdge) return;
    this.hoverCell = cell;
    this.hoverEdge = edge;
    this.redraw();
  }

  /** The pending drag-paint stroke, before it commits on pointerup. */
  setPaintPreview(cells: string[], edges: string[], colour: number): void {
    this.paintPreview = cells.length || edges.length ? { cells, edges, colour } : null;
    this.redraw();
  }

  /** The token-drag path trace, unit's own cell first, destination last. Empty clears it. */
  setDragPath(cells: string[]): void {
    this.dragPath = cells;
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
      for (const key of this.paintPreview.edges) this.strokeEdge(g, key, this.paintPreview.colour, 0.85, 6);
    }

    if (this.dragPath.length > 1) this.strokePath(g, this.dragPath, this.theme.overlay.selected, 0.9, 3);

    if (this.hoverCell) this.strokeCell(g, this.hoverCell, this.theme.overlay.hover, 0.6, 2);
    if (this.hoverEdge) this.strokeEdge(g, this.hoverEdge, this.theme.overlay.selected, 0.9, 5);
    if (this.selectedCell) this.strokeCell(g, this.selectedCell, this.theme.overlay.selected, 1, 3);

    this.container.addChild(g);
  }

  private fillCell(g: PIXI.Graphics, key: string, colour: number, alpha: number): void {
    const cell = this.grid!.parse(key);
    if (!this.grid!.inBounds(cell)) return;
    g.beginFill(colour, alpha).drawPolygon(this.grid!.vertices(cell, this.size)).endFill();
  }

  private strokeEdge(g: PIXI.Graphics, key: string, colour: number, alpha: number, width: number): void {
    const [aKey, bKey] = key.split('|');
    const a = this.grid!.parse(aKey);
    const b = this.grid!.parse(bKey);
    if (!this.grid!.inBounds(a) || !this.grid!.inBounds(b)) return;
    const [p, q] = this.grid!.edgeSegment(a, b, this.size);
    g.lineStyle(width, colour, alpha).moveTo(p.x, p.y).lineTo(q.x, q.y);
  }

  // The route the unit will actually walk, with an arrowhead on the end — a straight
  // origin-to-destination arrow would lie about a path that bends around terrain. The head
  // stops short of the destination's centre so it points at the cell rather than covering
  // whatever stands there.
  private strokePath(g: PIXI.Graphics, cells: string[], colour: number, alpha: number, width: number): void {
    const points = cells.map((key) => this.grid!.parse(key)).filter((c) => this.grid!.inBounds(c)).map((c) => this.grid!.center(c, this.size));
    if (points.length < 2) return;
    const end = points[points.length - 1];
    const previous = points[points.length - 2];
    const span = Math.hypot(end.x - previous.x, end.y - previous.y) || 1;
    const ux = (end.x - previous.x) / span;
    const uy = (end.y - previous.y) / span;
    const head = this.size * HEAD_LENGTH;
    const tip = { x: end.x - ux * this.size * HEAD_INSET, y: end.y - uy * this.size * HEAD_INSET };
    const base = { x: tip.x - ux * head, y: tip.y - uy * head };

    g.lineStyle(width, colour, alpha).moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1, -1)) g.lineTo(p.x, p.y);
    g.lineTo(base.x, base.y);

    const half = this.size * HEAD_HALF_WIDTH;
    g.lineStyle(0)
      .beginFill(colour, alpha)
      .moveTo(tip.x, tip.y)
      .lineTo(base.x - uy * half, base.y + ux * half)
      .lineTo(base.x + uy * half, base.y - ux * half)
      .closePath()
      .endFill();
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
