import * as PIXI from 'pixi.js';
import type { Board } from '../engine/index.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { currentTheme, type BoardTheme } from './theme.js';

const GRID_SIZE = 8;

// proto: the full BoardView contract (setHighlight, setSelected, setMode, setBrush, on(),
// TokenModel-typed setTokens) lands with TerrainLayer/TokenLayer/Interaction in Waves 2–4.
// Wave 0 only proves the mount/resize/destroy lifecycle and draws the empty grid.
export interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: unknown[]): void;
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

  const gridLayer = boardContainer.layers.createLayer('grid');
  const grid = new PIXI.Graphics();
  gridLayer.addChild(grid);

  function drawGrid(): void {
    const { width, height } = boardApp.app.screen;
    const size = Math.max(1, Math.floor((Math.min(width, height) * 0.9) / GRID_SIZE));
    const boardSize = size * GRID_SIZE;
    const originX = (width - boardSize) / 2;
    const originY = (height - boardSize) / 2;

    grid.clear();
    grid.lineStyle(1, boardApp.theme.rule, 1);
    for (let i = 0; i <= GRID_SIZE; i++) {
      grid.moveTo(originX, originY + i * size);
      grid.lineTo(originX + boardSize, originY + i * size);
      grid.moveTo(originX + i * size, originY);
      grid.lineTo(originX + i * size, originY + boardSize);
    }
  }

  drawGrid();

  // Pixi's own resizeTo only reacts to window resize (see ResizePlugin); a container that
  // resizes for other reasons (flex layout, a sidebar toggling) needs its own observer.
  const resizeObserver = new ResizeObserver(() => {
    boardApp.resize();
    drawGrid();
  });
  resizeObserver.observe(container);

  return {
    setBoard(_board) {},
    setTokens(_tokens) {},
    resize() {
      boardApp.resize();
      drawGrid();
    },
    destroy() {
      resizeObserver.disconnect();
      boardContainer.destroy({ children: true });
      boardApp.destroy();
    },
  };
}

export { BoardApp } from './BoardApp.js';
export { BoardContainer } from './BoardContainer.js';
export { currentTheme, darkTheme, lightTheme, prefersDark, type BoardTheme } from './theme.js';
