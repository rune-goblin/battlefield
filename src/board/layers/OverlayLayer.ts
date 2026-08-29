import * as PIXI from 'pixi.js';
import type { Grid } from '../../engine/index.js';
import { actionIconUrl } from '../art.js';
import type { BoardTheme, HighlightStyle } from '../theme.js';

export type { HighlightStyle } from '../theme.js';

const HIGHLIGHT_ORDER: HighlightStyle[] = ['deploy', 'moveFar3', 'moveFar', 'move', 'push', 'attack'];

/** Reach reads as ink, never colour: the terrain keeps the board's only palette, so a band is
 * a wash the map shows straight through. Three levels, and the cheaper the ground the more
 * solid it sits — a free step is plain, a three-action haul is barely there. */
const FAINT = 0.08;
const MID = 0.16;
const STRONG = 0.24;

/** `push` and `attack` also take a thin outline: both mean something the wash alone cannot
 * say — ground past every action you have, and ground under threat. */
const SHADE: Record<HighlightStyle, { wash: number; outline: boolean }> = {
  deploy: { wash: MID, outline: false },
  move: { wash: STRONG, outline: false },
  moveFar: { wash: MID, outline: false },
  moveFar3: { wash: FAINT, outline: false },
  push: { wash: FAINT, outline: true },
  attack: { wash: STRONG, outline: true },
};

// The drag arrow's head, as fractions of cell size: how far its tip stops short of the
// destination's centre, how long it is, and how wide at the base.
const HEAD_INSET = 0.2;
const HEAD_LENGTH = 0.22;
const HEAD_HALF_WIDTH = 0.13;

/** The barred X's box, as a fraction of cell size. It marks the whole cell, so it sits nearer
 * the shot's bullseye than the badge-sized props hung off a piece. */
const BAR_RATIO = 0.52;

/**
 * Hover cell, selection ring, the highlight washes, and a paint preview — all cell-shaped, so
 * they share one draw pass keyed off the current `Grid`/cell size.
 */
export class OverlayLayer {
  private readonly container: PIXI.Container;
  private grid: Grid | null = null;
  private size = 0;
  private theme: BoardTheme;
  private destroyed = false;

  private readonly highlights = new Map<HighlightStyle, Set<string>>();
  private hoverCell: string | null = null;
  private hoverEdge: string | null = null;
  private selectedCell: string | null = null;
  private paintPreview: { cells: string[]; edges: string[]; colour: number } | null = null;
  /** The drag-to-move trace, unit's own cell first — a thin trail on top of the highlight
   * wash so a fanned-out hex reach still reads as one path rather than a region. */
  private dragPath: string[] = [];
  /** The cell a drag has reached that it may not take, marked where the arrowhead would have
   * gone: the refusal belongs where the player is pulling, not on the piece they grabbed. */
  private barredCell: string | null = null;
  /** Every other mark this layer makes is Graphics, thrown away and redrawn. The X is a
   * sprite, so it is held across redraws rather than reloaded on every pointer move. */
  private barredSprite: PIXI.Sprite | null = null;
  private barredLoading = false;

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

  setBarred(cell: string | null): void {
    if (cell === this.barredCell) return;
    this.barredCell = cell;
    this.redraw();
  }

  private redraw(): void {
    for (const child of this.container.removeChildren()) {
      if (child !== this.barredSprite) child.destroy({ children: true });
    }
    if (!this.grid || !this.size) return;
    const g = new PIXI.Graphics();
    g.name = 'Overlay';

    for (const style of HIGHLIGHT_ORDER) {
      const cells = this.highlights.get(style);
      if (!cells?.size) continue;
      const shade = SHADE[style];
      for (const key of cells) this.fillCell(g, key, this.theme.ink, shade.wash);
      if (shade.outline) for (const key of cells) this.strokeCell(g, key, this.theme.ink, 0.3, 1.5);
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
    this.drawBarred();
  }

  private drawBarred(): void {
    const cell = this.barredCell ? this.grid!.parse(this.barredCell) : null;
    if (!cell || !this.grid!.inBounds(cell)) {
      if (this.barredSprite) this.barredSprite.visible = false;
      return;
    }
    if (!this.barredSprite) {
      this.loadBarred();
      return;
    }
    const { x, y } = this.grid!.center(cell, this.size);
    const { width, height } = this.barredSprite.texture;
    this.barredSprite.scale.set((this.size * BAR_RATIO) / Math.max(width, height, 1));
    this.barredSprite.position.set(x, y);
    this.barredSprite.visible = true;
    this.container.addChild(this.barredSprite);
  }

  private loadBarred(): void {
    if (this.barredLoading) return;
    this.barredLoading = true;
    PIXI.Assets.load<PIXI.Texture>(actionIconUrl('no'))
      .then((texture) => {
        // The layer may have been destroyed, or the drag released, while the texture loaded.
        if (this.destroyed) return;
        this.barredSprite = new PIXI.Sprite(texture);
        this.barredSprite.anchor.set(0.5);
        this.redraw();
      })
      .catch(() => { this.barredLoading = false; });
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
    this.destroyed = true;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.barredSprite = null;
  }
}
