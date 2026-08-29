import * as PIXI from 'pixi.js';
import { currentTheme, mountBoardView, type BoardView } from '../../src/board/index.js';
import type { TokenModel } from '../../src/board/Token.js';
import type { Board } from '../../src/engine/index.js';

// proto: this page's own PIXI.Application stands in for Foundry's ambient one. Foundry owns
// exactly one Application/canvas for the whole page; a real port passes `canvas.app.view` and
// `canvas.app.renderer` below instead of constructing a second Application here.
const app = new PIXI.Application({
  width: 900,
  height: 700,
  backgroundColor: 0x11151c,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById('stage')!.appendChild(app.view as HTMLCanvasElement);

// The full canvas, drawn at stage scale — the board must not fill this.
const canvasBounds = new PIXI.Graphics().lineStyle(2, 0x445066, 1).drawRect(1, 1, app.screen.width - 2, app.screen.height - 2);
app.stage.addChild(canvasBounds);

// Stand-in for whatever container Foundry nests its own scene content under. BoardContainer
// must make no assumption that this is the stage — it takes whatever container it's handed.
const primary = new PIXI.Container();
primary.scale.set(0.5);
primary.position.set(180, 110);
app.stage.addChild(primary);

const primaryBounds = new PIXI.Graphics().lineStyle(2, 0xd98b6e, 1).drawRect(0, 0, 800, 800);
primary.addChild(primaryBounds);

// The board's own pan/zoom container, nested one level inside `primary` — `Interaction` is
// its only writer, so a wheel-zoom or drag-pan in this demo moves the board, not Foundry's
// own primary container. `mountBoardView` doesn't create this itself: `BoardApp` owns an
// equivalent container for the in-app board (see `docs/pixi-board.md`), and a host is free to
// reuse whatever pan/zoom container it already has instead of this one.
const boardViewport = new PIXI.Container();
primary.addChild(boardViewport);

const view: BoardView = mountBoardView({
  parent: boardViewport,
  canvas: app.view as HTMLCanvasElement,
  ticker: app.ticker,
  renderer: app.renderer,
  // The board's own logical footprint, in `primary`-local units — independent of the real
  // canvas size, since `primary`'s 0.5 scale (Foundry's own zoom, in a real mount) already
  // decides how big that footprint reads on screen.
  size: () => ({ width: 800, height: 800 }),
  theme: currentTheme(),
});
view.setMode('battle');

interface BattleState { board: Board; tokens: TokenModel[] }

fetch('./battle-state.json')
  .then((r) => r.json() as Promise<BattleState>)
  .then(({ board, tokens }) => {
    view.setBoard(board);
    view.setTokens(tokens);
    view.setHighlight(['d5', 'e5', 'd6', 'e6'], 'move');
  });
