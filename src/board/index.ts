import { gridOf, type Board, type Grid } from '../engine/index.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { EdgeLayer } from './layers/EdgeLayer.js';
import { LabelLayer } from './layers/LabelLayer.js';
import { OverlayLayer } from './layers/OverlayLayer.js';
import { TerrainLayer } from './layers/TerrainLayer.js';
import type { BoardTheme, HighlightStyle } from './theme.js';

export type { HighlightStyle } from './theme.js';

// The grid fills this fraction of the container; the rest is margin for LabelLayer's
// coordinate text, which sits just outside the grid bounds.
const FIT_MARGIN = 0.86;

// proto: the token/mode/brush/event surface (setTokens, setMode, setBrush, on()) is stubbed
// here and lands with TokenLayer and Interaction in Waves 3–4. Wave 2 wires setBoard through
// TerrainLayer/EdgeLayer/LabelLayer, and setHighlight/setSelected through OverlayLayer.
export interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: unknown[]): void;
  setHighlight(cells: string[], style: HighlightStyle): void;
  setSelected(id: string | null): void;
  setMode(mode: 'view' | 'paint' | 'place' | 'battle'): void;
  setBrush(brush: unknown | null): void;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
  resize(): void;
  destroy(): void;
}

export interface CreateBoardViewOptions {
  theme?: BoardTheme;
}

export function createBoardView(canvas: HTMLCanvasElement, container: HTMLElement, opts: CreateBoardViewOptions = {}): BoardView {
  const boardApp = new BoardApp({ canvas, container, theme: opts.theme });
  const boardContainer = new BoardContainer();
  boardApp.stage.addChild(boardContainer);

  const layers = boardContainer.layers;
  const terrainLayer = new TerrainLayer(layers.createLayer('terrain', layers.getDefaultZIndex('terrain')));
  const edgeLayer = new EdgeLayer(layers.createLayer('edges', layers.getDefaultZIndex('edges')));
  const overlayLayer = new OverlayLayer(layers.createLayer('overlay', layers.getDefaultZIndex('overlay')), boardApp.theme);
  const labelLayer = new LabelLayer(layers.createLayer('labels', layers.getDefaultZIndex('labels')), boardApp.viewport);

  let currentBoard: Board | null = null;

  function fit(): { grid: Grid; size: number } | null {
    if (!currentBoard) return null;
    const grid = gridOf(currentBoard);
    const unit = grid.bounds(1);
    const { width, height } = boardApp.app.screen;
    const size = Math.max(1, Math.min((width * FIT_MARGIN) / unit.width, (height * FIT_MARGIN) / unit.height));
    return { grid, size };
  }

  function redraw(): void {
    const layout = fit();
    if (!currentBoard || !layout) {
      terrainLayer.clear();
      edgeLayer.clear();
      labelLayer.clear();
      overlayLayer.setGeometry(null, 0, boardApp.theme);
      return;
    }
    const { grid, size } = layout;
    const bounds = grid.bounds(size);
    const { width, height } = boardApp.app.screen;
    boardContainer.position.set((width - bounds.width) / 2, (height - bounds.height) / 2);

    terrainLayer.draw(boardApp.app, currentBoard, size, boardApp.theme);
    edgeLayer.draw(currentBoard, size, boardApp.theme);
    labelLayer.draw(grid, size, boardApp.theme);
    overlayLayer.setGeometry(grid, size, boardApp.theme);
  }

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
    setMode(_mode) {},
    setBrush(_brush) {},
    on(_event, _handler) {
      return () => {};
    },
    resize() {
      boardApp.resize();
      redraw();
    },
    destroy() {
      resizeObserver.disconnect();
      terrainLayer.destroy();
      boardContainer.destroy({ children: true });
      boardApp.destroy();
    },
  };
}

export { BoardApp } from './BoardApp.js';
export { BoardContainer } from './BoardContainer.js';
export { currentTheme, darkTheme, lightTheme, prefersDark, type BoardTheme } from './theme.js';
