import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Grid, type Point } from '../engine/index.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { brushColour, type Brush } from './brush.js';
import { Interaction, type BoardEvent, type BoardEventOf, type BoardEventType, type BoardMode } from './Interaction.js';
import { EdgeLayer } from './layers/EdgeLayer.js';
import { LabelLayer } from './layers/LabelLayer.js';
import { OverlayLayer } from './layers/OverlayLayer.js';
import { TerrainLayer } from './layers/TerrainLayer.js';
import { TokenLayer } from './layers/TokenLayer.js';
import type { TokenModel } from './Token.js';
import { currentTheme, type BoardTheme, type HighlightStyle } from './theme.js';

export type { HighlightStyle } from './theme.js';
export type { Brush } from './brush.js';
export type { BoardEvent, BoardEventOf, BoardEventType, BoardMode } from './Interaction.js';
export type { TokenBounds } from './hit.js';
export type { EngineTokenModel, TokenModel, TokenRing, UnitTokenModel } from './Token.js';

// The grid fills this fraction of the container; the rest is margin for LabelLayer's
// coordinate text, which sits just outside the grid bounds.
const FIT_MARGIN = 0.86;

export interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: TokenModel[]): void;
  setHighlight(cells: string[], style: HighlightStyle): void;
  /** The token-drag path trace (unit's own cell first), drawn as a trail over the highlight
   * wash. Empty clears it. */
  setDragPath(cells: string[]): void;
  setSelected(id: string | null): void;
  /** The one token a press may escalate into a drag in battle mode; place mode ignores this
   * and always allows any token to drag. */
  setDraggable(id: string | null): void;
  setMode(mode: BoardMode): void;
  setBrush(brush: Brush | null): void;
  on<T extends BoardEventType>(event: T, handler: (event: BoardEventOf<T>) => void): () => void;
  /** Screen point (e.g. from a native `DragEvent`) to a cell key, for drag-drop from outside
   * the canvas — a DOM tray item dropped onto the board. */
  cellAt(clientX: number, clientY: number): string | null;
  /** Pans (without rezooming) so `cell` sits in the middle of the viewport. A no-op if the
   * cell is off-board or there is no board yet. */
  centerOn(cell: string): void;
  resetView(): void;
  resize(): void;
  destroy(): void;
}

export interface MountBoardOptions {
  /** Where `BoardContainer` attaches, and the container `Interaction` pans/zooms. `BoardApp`
   * passes its own pan/zoom container here; the Wave 6 Foundry-mount prototype passes a
   * container it owns inside a stand-in "primary" container it does not. */
  parent: PIXI.Container;
  /** Receives the pointer/keyboard listeners `Interaction` adds and removes. This code never
   * creates it — `BoardApp` passes the canvas it made, a host passes its own. */
  canvas: HTMLCanvasElement;
  /** Drives token move tweens and ring pulses off the host's own render loop. */
  ticker: PIXI.Ticker;
  /** Generates `TerrainLayer`'s procedural textures. `TerrainLayer` only ever calls
   * `generateTexture`, so this takes the renderer directly rather than a whole
   * `PIXI.Application` — a host supplies its own renderer, not a second one. */
  renderer: PIXI.IRenderer;
  /** The area `BoardContainer` fits itself into. `BoardApp` reads its own `app.screen`; a
   * host reads whatever it considers the board's on-screen footprint. */
  size(): { width: number; height: number };
  theme: BoardTheme;
  /** Keyboard brush changes, so a palette can follow the canvas. Escape sends null. */
  onBrush?: (brush: Brush | null) => void;
}

/**
 * Wires a `BoardContainer` and its layer stack into a `PIXI.Container` someone else owns, and
 * drives it with `Interaction` — no `PIXI.Application`, canvas creation, or resize handling of
 * its own. This is the seam `createBoardView` builds on below, and the one the Wave 6
 * Foundry-mount prototype (`dev/foundry-mount/`) calls directly to prove the board can be
 * driven without also constructing a second `PIXI.Application`. See `docs/board.md`.
 */
export function mountBoardView(opts: MountBoardOptions): BoardView {
  const boardContainer = new BoardContainer();
  opts.parent.addChild(boardContainer);

  const layers = boardContainer.layers;
  const terrainLayer = new TerrainLayer(layers.createLayer('terrain', layers.getDefaultZIndex('terrain')));
  const edgeLayer = new EdgeLayer(layers.createLayer('edges', layers.getDefaultZIndex('edges')));
  const overlayLayer = new OverlayLayer(layers.createLayer('overlay', layers.getDefaultZIndex('overlay')), opts.theme);
  const tokenLayer = new TokenLayer(layers.createLayer('tokens', layers.getDefaultZIndex('tokens')), opts.ticker, opts.theme);
  const labelLayer = new LabelLayer(layers.createLayer('labels', layers.getDefaultZIndex('labels')), opts.parent);

  let currentBoard: Board | null = null;
  let geometry: { grid: Grid; size: number } | null = null;
  const handlers = new Map<BoardEventType, Set<(event: never) => void>>();

  function fit(): { grid: Grid; size: number } | null {
    if (!currentBoard) return null;
    const grid = gridOf(currentBoard);
    const unit = grid.bounds(1);
    const { width, height } = opts.size();
    const size = Math.max(1, Math.min((width * FIT_MARGIN) / unit.width, (height * FIT_MARGIN) / unit.height));
    return { grid, size };
  }

  function redraw(): void {
    geometry = fit();
    if (!currentBoard || !geometry) {
      terrainLayer.clear();
      edgeLayer.clear();
      labelLayer.clear();
      overlayLayer.setGeometry(null, 0, opts.theme);
      tokenLayer.setGeometry(null, 0, opts.theme);
      return;
    }
    const { grid, size } = geometry;
    const bounds = grid.bounds(size);
    const { width, height } = opts.size();
    boardContainer.position.set((width - bounds.width) / 2, (height - bounds.height) / 2);

    terrainLayer.draw(opts.renderer, currentBoard, size, opts.theme);
    edgeLayer.draw(currentBoard, size, opts.theme);
    labelLayer.draw(grid, size, opts.theme);
    labelLayer.rescale();
    overlayLayer.setGeometry(grid, size, opts.theme);
    tokenLayer.setGeometry(grid, size, opts.theme);
  }

  /** Shift-click fill: the connected run of cells sharing the clicked cell's terrain. */
  function region(key: string): string[] {
    if (!currentBoard || !geometry) return [key];
    const { grid } = geometry;
    const start = grid.parse(key);
    if (!grid.inBounds(start)) return [];
    const terrain = at(currentBoard, start).terrain;
    const seen = new Set([key]);
    const queue = [start];
    while (queue.length) {
      for (const n of grid.neighbours(queue.pop()!)) {
        const nKey = grid.key(n);
        if (seen.has(nKey) || at(currentBoard, n).terrain !== terrain) continue;
        seen.add(nKey);
        queue.push(n);
      }
    }
    return [...seen];
  }

  function emit(event: BoardEvent): void {
    for (const handler of handlers.get(event.type) ?? []) (handler as (e: BoardEvent) => void)(event);
  }

  const interaction = new Interaction({
    canvas: opts.canvas,
    viewport: opts.parent,
    toLocal: (screen: Point) => boardContainer.toLocal(screen),
    geometry: () => geometry,
    tokens: () => tokenLayer.bounds(),
    region,
    emit,
    onHover: (cell, edge) => overlayLayer.setHover(cell, edge),
    onPreview: (cells, edges, brush) => overlayLayer.setPaintPreview(cells, edges, brush ? brushColour(brush, opts.theme) : 0),
    onBrush: (brush) => opts.onBrush?.(brush),
    onClear: () => overlayLayer.setSelected(null),
    onViewport: () => labelLayer.rescale(),
    onDrag: (id, point) => tokenLayer.setDrag(id, point),
  });

  return {
    setBoard(board) {
      currentBoard = board;
      redraw();
    },
    setTokens(tokens) {
      tokenLayer.setTokens(tokens);
    },
    setHighlight(cells, style) {
      overlayLayer.setHighlight(cells, style);
    },
    setDragPath(cells) {
      overlayLayer.setDragPath(cells);
    },
    setSelected(id) {
      overlayLayer.setSelected(id);
    },
    setDraggable(id) {
      interaction.setDraggable(id);
    },
    setMode(mode) {
      interaction.setMode(mode);
    },
    setBrush(brush) {
      interaction.setBrush(brush);
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      handlers.set(event, set);
      set.add(handler as (event: never) => void);
      return () => set.delete(handler as (event: never) => void);
    },
    cellAt(clientX, clientY) {
      if (!geometry) return null;
      const rect = opts.canvas.getBoundingClientRect();
      const local = boardContainer.toLocal({ x: clientX - rect.left, y: clientY - rect.top });
      const cell = geometry.grid.fromPoint(local, geometry.size);
      return cell ? geometry.grid.key(cell) : null;
    },
    // Pans `opts.parent` (the pan/zoom container `boardContainer` sits in) so the cell's
    // centre lands under the viewport's screen centre, at whatever zoom is already set.
    centerOn(cell) {
      if (!currentBoard || !geometry) return;
      const c = geometry.grid.parse(cell);
      if (!geometry.grid.inBounds(c)) return;
      const local = geometry.grid.center(c, geometry.size);
      const { width, height } = opts.size();
      const scale = opts.parent.scale.x;
      opts.parent.position.set(
        width / 2 - scale * (boardContainer.position.x + local.x),
        height / 2 - scale * (boardContainer.position.y + local.y),
      );
      labelLayer.rescale();
    },
    resetView() {
      interaction.resetView();
    },
    // The host decides when the board's on-screen footprint changed and calls this; unlike
    // `createBoardView`'s wrapper, there is no `PIXI.Application` here to resize first.
    resize() {
      redraw();
    },
    // Tears down only what this call created — `boardContainer`, its layers, and
    // `Interaction`'s listeners on `opts.canvas`. `opts.parent`, `opts.canvas` and
    // `opts.ticker` are the host's; it destroys them itself.
    destroy() {
      interaction.destroy();
      terrainLayer.destroy();
      tokenLayer.destroy();
      boardContainer.destroy({ children: true });
    },
  };
}

export interface CreateBoardViewOptions {
  theme?: BoardTheme;
  /** Keyboard brush changes, so a palette can follow the canvas. Escape sends null. */
  onBrush?: (brush: Brush | null) => void;
}

export function createBoardView(canvas: HTMLCanvasElement, container: HTMLElement, opts: CreateBoardViewOptions = {}): BoardView {
  const boardApp = new BoardApp({ canvas, container, theme: opts.theme });
  const view = mountBoardView({
    parent: boardApp.viewport,
    canvas,
    ticker: boardApp.app.ticker,
    renderer: boardApp.app.renderer,
    size: () => boardApp.app.screen,
    theme: boardApp.theme,
    onBrush: opts.onBrush,
  });

  // Pixi's own resizeTo only reacts to window resize (see ResizePlugin); a container that
  // resizes for other reasons (flex layout, a sidebar toggling) needs its own observer.
  const resizeObserver = new ResizeObserver(() => {
    boardApp.resize();
    view.resize();
  });
  resizeObserver.observe(container);

  return {
    ...view,
    resize() {
      boardApp.resize();
      view.resize();
    },
    destroy() {
      resizeObserver.disconnect();
      view.destroy();
      boardApp.destroy();
    },
  };
}

export { BoardApp } from './BoardApp.js';
export { BoardContainer } from './BoardContainer.js';
// proto: the only non-BoardView surface Svelte touches — a pure path-builder (no PIXI, no
// DOM) that Token.ts also calls for the same art. Re-deriving the BASE_URL-prefixing here
// would just duplicate it; see "Wave 2 notes" in the todos.
export { engineArtUrl, troopArtUrl } from './art.js';
export { BRUSH_TERRAINS, brushColour, eraseForm, isEdgeBrush, sameBrush } from './brush.js';
export { EDGE_BAND, edgeCandidates, hitTest, nearestEdge } from './hit.js';
export { currentTheme, darkTheme, HIGHLIGHT_STYLES, lightTheme, prefersDark, type BoardTheme } from './theme.js';
