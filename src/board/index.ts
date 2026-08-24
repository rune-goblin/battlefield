import { at, gridOf, type Board, type Grid, type Point } from '../engine/index.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { brushColour, type Brush } from './brush.js';
import { Interaction, type BoardEvent, type BoardEventOf, type BoardEventType, type BoardMode } from './Interaction.js';
import { EdgeLayer } from './layers/EdgeLayer.js';
import { LabelLayer } from './layers/LabelLayer.js';
import { OverlayLayer } from './layers/OverlayLayer.js';
import { TerrainLayer } from './layers/TerrainLayer.js';
import type { TokenBounds, TokenBoundsProvider } from './hit.js';
import type { BoardTheme, HighlightStyle } from './theme.js';

export type { HighlightStyle } from './theme.js';
export type { Brush } from './brush.js';
export type { BoardEvent, BoardEventOf, BoardEventType, BoardMode } from './Interaction.js';
export type { TokenBounds } from './hit.js';

// The grid fills this fraction of the container; the rest is margin for LabelLayer's
// coordinate text, which sits just outside the grid bounds.
const FIT_MARGIN = 0.86;

// proto: setTokens stays a stub until TokenLayer lands in Wave 4. Token hit-testing already
// works — Interaction reads a token-bounds provider, which Wave 4 points at the sprite cache.
export interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: unknown[]): void;
  setHighlight(cells: string[], style: HighlightStyle): void;
  setSelected(id: string | null): void;
  setMode(mode: BoardMode): void;
  setBrush(brush: Brush | null): void;
  on<T extends BoardEventType>(event: T, handler: (event: BoardEventOf<T>) => void): () => void;
  resetView(): void;
  resize(): void;
  destroy(): void;
}

export interface CreateBoardViewOptions {
  theme?: BoardTheme;
  /** Keyboard brush changes, so a palette can follow the canvas. Escape sends null. */
  onBrush?: (brush: Brush | null) => void;
  /** Wave 4's TokenLayer supplies token discs in board-local coordinates. */
  tokenBounds?: TokenBoundsProvider;
}

export function createBoardView(canvas: HTMLCanvasElement, container: HTMLElement, opts: CreateBoardViewOptions = {}): BoardView {
  const boardApp = new BoardApp({ canvas, container, theme: opts.theme });
  const boardContainer = new BoardContainer();
  boardApp.viewport.addChild(boardContainer);

  const layers = boardContainer.layers;
  const terrainLayer = new TerrainLayer(layers.createLayer('terrain', layers.getDefaultZIndex('terrain')));
  const edgeLayer = new EdgeLayer(layers.createLayer('edges', layers.getDefaultZIndex('edges')));
  const overlayLayer = new OverlayLayer(layers.createLayer('overlay', layers.getDefaultZIndex('overlay')), boardApp.theme);
  const labelLayer = new LabelLayer(layers.createLayer('labels', layers.getDefaultZIndex('labels')), boardApp.viewport);

  let currentBoard: Board | null = null;
  let geometry: { grid: Grid; size: number } | null = null;
  const handlers = new Map<BoardEventType, Set<(event: never) => void>>();

  function fit(): { grid: Grid; size: number } | null {
    if (!currentBoard) return null;
    const grid = gridOf(currentBoard);
    const unit = grid.bounds(1);
    const { width, height } = boardApp.app.screen;
    const size = Math.max(1, Math.min((width * FIT_MARGIN) / unit.width, (height * FIT_MARGIN) / unit.height));
    return { grid, size };
  }

  function redraw(): void {
    geometry = fit();
    if (!currentBoard || !geometry) {
      terrainLayer.clear();
      edgeLayer.clear();
      labelLayer.clear();
      overlayLayer.setGeometry(null, 0, boardApp.theme);
      return;
    }
    const { grid, size } = geometry;
    const bounds = grid.bounds(size);
    const { width, height } = boardApp.app.screen;
    boardContainer.position.set((width - bounds.width) / 2, (height - bounds.height) / 2);

    terrainLayer.draw(boardApp.app, currentBoard, size, boardApp.theme);
    edgeLayer.draw(currentBoard, size, boardApp.theme);
    labelLayer.draw(grid, size, boardApp.theme);
    labelLayer.rescale();
    overlayLayer.setGeometry(grid, size, boardApp.theme);
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
    canvas,
    viewport: boardApp.viewport,
    toLocal: (screen: Point) => boardContainer.toLocal(screen),
    geometry: () => geometry,
    tokens: opts.tokenBounds ?? ((): TokenBounds[] => []),
    region,
    emit,
    onHover: (cell, edge) => overlayLayer.setHover(cell, edge),
    onPreview: (cells, edges, brush) => overlayLayer.setPaintPreview(cells, edges, brush ? brushColour(brush, boardApp.theme) : 0),
    onBrush: (brush) => opts.onBrush?.(brush),
    onClear: () => overlayLayer.setSelected(null),
    onViewport: () => labelLayer.rescale(),
  });

  // Pixi's own resizeTo only reacts to window resize (see ResizePlugin); a container that
  // resizes for other reasons (flex layout, a sidebar toggling) needs its own observer.
  const resizeObserver = new ResizeObserver(() => {
    boardApp.resize();
    redraw();
  });
  resizeObserver.observe(container);

  return {
    setBoard(board) {
      currentBoard = board;
      redraw();
    },
    setTokens(_tokens) {},
    setHighlight(cells, style) {
      overlayLayer.setHighlight(cells, style);
    },
    setSelected(id) {
      overlayLayer.setSelected(id);
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
    resetView() {
      interaction.resetView();
    },
    resize() {
      boardApp.resize();
      redraw();
    },
    destroy() {
      resizeObserver.disconnect();
      interaction.destroy();
      terrainLayer.destroy();
      boardContainer.destroy({ children: true });
      boardApp.destroy();
    },
  };
}

export { BoardApp } from './BoardApp.js';
export { BoardContainer } from './BoardContainer.js';
export { BRUSH_TERRAINS, brushColour, eraseForm, isEdgeBrush, sameBrush } from './brush.js';
export { EDGE_BAND, edgeCandidates, hitTest, nearestEdge } from './hit.js';
export { currentTheme, darkTheme, lightTheme, prefersDark, type BoardTheme } from './theme.js';
