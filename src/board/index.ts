import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Grid, type Point, type Tree } from '../engine/index.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { brushColour, type Brush } from './brush.js';
import { Interaction, type BoardEvent, type BoardEventOf, type BoardEventType, type BoardMode, type Rect } from './Interaction.js';
import { CastLayer } from './layers/CastLayer.js';
import { EdgeLayer } from './layers/EdgeLayer.js';
import { EffectLayer } from './layers/EffectLayer.js';
import { GridLayer, type GridSettings } from './layers/GridLayer.js';
import { LabelLayer } from './layers/LabelLayer.js';
import { OverlayLayer } from './layers/OverlayLayer.js';
import { ShotLayer } from './layers/ShotLayer.js';
import { TerrainLayer } from './layers/TerrainLayer.js';
import { TokenLayer } from './layers/TokenLayer.js';
import type { TokenModel } from './Token.js';
import { currentTheme, type BoardTheme, type HighlightStyle } from './theme.js';

export type { HighlightStyle } from './theme.js';
export type { GridSettings } from './layers/GridLayer.js';
export type { Brush } from './brush.js';
export type { BoardEvent, BoardEventOf, BoardEventType, BoardMode } from './Interaction.js';
export type { TokenBounds } from './hit.js';
export type { EngineTokenModel, TokenModel, TokenRing, UnitTokenModel } from './Token.js';

// Empty board left around the grid on every side, in cell pitches. It holds LabelLayer's
// coordinate text, and it is what a pan grabs: without it the outermost cells sit against the
// viewport edge with nothing beside them to drag from.
const PAD_CELLS = 2;
// Extra empty canvas below the grid, pan-clamp only (it does not shrink the fitted zoom the
// way PAD_CELLS would). The board is full-bleed behind the army bar at the bottom of the
// screen, so a cell near the board's south edge can otherwise only ever sit under it — this
// gives a pan room to carry that cell above the bar instead.
const BOTTOM_PAD_CELLS = 6;

export type { Rect } from './Interaction.js';

export interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: TokenModel[]): void;
  setHighlight(cells: string[], style: HighlightStyle): void;
  /** The token-drag path trace (unit's own cell first), drawn as a trail over the highlight
   * wash. Empty clears it. */
  setDragPath(cells: string[]): void;
  /** The cell a drag has reached that it cannot take, marked with an X. Null clears it. */
  setBarred(cell: string | null): void;
  /** A token whose drag traces without the piece leaving its square: the pointer and every
   * `drag`/`drop` event still run, so the caller can answer the gesture, but a piece that has
   * nowhere to go never lifts. Null lets every drag lift again. */
  setAnchored(id: string | null): void;
  /** The shot being aimed: an arc from the shooter's cell over to the target's, drawn above
   * the pieces. Null clears it. */
  setShot(shot: { from: string; to: string } | null): void;
  /** The cast being aimed: a swirling particle line from the caster's cell out to the
   * target's, coloured by tree. Null clears it. */
  setCast(cast: { from: string; to: string; tree: Tree } | null): void;
  /** A one-shot resolution animation on `cell`, selected by `tree` — fired once a cast
   * actually lands, unlike `setCast`'s held aim line. `from` is the caster's cell for a
   * spell that flies in; it defaults to the cast being aimed, if there is one. */
  burst(cell: string, tree: Tree, from?: string | null): void;
  /** The route the token's next move walks, its own cell first — the same cells the drag
   * traced. Without one a move cuts straight across the board to its destination. Spent by
   * that move, so it is set once per committed move, just before the new position arrives. */
  setRoute(id: string, cells: readonly string[]): void;
  setSelected(id: string | null): void;
  /** The one token a press may escalate into a drag in battle mode; place mode ignores this
   * and always allows any token to drag. */
  setDraggable(id: string | null): void;
  setMode(mode: BoardMode): void;
  /** Ignore every pointer, key, hover and zoom until unfrozen — for a DOM menu that owns the
   * board while it is open. */
  setFrozen(frozen: boolean): void;
  setBrush(brush: Brush | null): void;
  /** The faint reference hex outline, off by default — the map controls' settings dialog owns
   * its state, not any of the game/battle stages. */
  setGrid(settings: Partial<GridSettings>): void;
  on<T extends BoardEventType>(event: T, handler: (event: BoardEventOf<T>) => void): () => void;
  /** Screen point (e.g. from a native `DragEvent`) to a cell key, for drag-drop from outside
   * the canvas — a DOM tray item dropped onto the board. */
  cellAt(clientX: number, clientY: number): string | null;
  /** A cell's centre in CSS pixels inside the canvas — `cellAt` the other way round, so a DOM
   * overlay can anchor itself to a cell. Null when the cell is off-board or there is no board
   * yet. Pan, zoom and resize all move it, and none of them is announced here. */
  screenOf(cell: string): Point | null;
  /** A cell's circumradius in CSS pixels — what `screenOf` gives for position, this gives for
   * size, so a DOM overlay can ring the cell at whatever zoom is set. */
  cellRadius(cell: string): number | null;
  /** Pans (without rezooming) so `cell` sits in the middle of the viewport. A no-op if the
   * cell is off-board or there is no board yet. */
  centerOn(cell: string): void;
  /** One step of zoom, about `at` (a canvas point) or the middle of `into` if given. */
  zoomBy(factor: number, into?: Rect): void;
  /** Fits `cells` — or the whole board, given none — inside `into`, defaulting to the whole
   * canvas. The board never frames itself: something asked, and said where. */
  frame(cells: readonly string[] | null, into?: Rect): void;
  zoom(): number;
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
 * driven without also constructing a second `PIXI.Application`. See `docs/pixi-board.md`.
 */
export function mountBoardView(opts: MountBoardOptions): BoardView {
  const boardContainer = new BoardContainer();
  opts.parent.addChild(boardContainer);

  const layers = boardContainer.layers;
  const terrainLayer = new TerrainLayer(layers.createLayer('terrain', layers.getDefaultZIndex('terrain')));
  // Above terrain (0) but below edges (10) — the hairline should sit over the elevation wash,
  // not get swallowed by it, but a wall or cliff still draws over the hairline it crosses.
  const gridLayer = new GridLayer(layers.createLayer('grid', 4));
  const edgeLayer = new EdgeLayer(layers.createLayer('edges', layers.getDefaultZIndex('edges')));
  const overlayLayer = new OverlayLayer(layers.createLayer('overlay', layers.getDefaultZIndex('overlay')), opts.theme);
  const tokenLayer = new TokenLayer(layers.createLayer('tokens', layers.getDefaultZIndex('tokens')), opts.ticker, opts.theme);
  const shotLayer = new ShotLayer(layers.createLayer('shot', 35), opts.theme);
  const castLayer = new CastLayer(layers.createLayer('cast', 36), opts.ticker, opts.theme);
  // Two effect containers: light on the cell, pools and scorch marks sit under the pieces;
  // flames, frames and sparks over them.
  const effectLayer = new EffectLayer(
    layers.createLayer('effectsGround', layers.getDefaultZIndex('tokens') - 1),
    layers.createLayer('effects', 37),
    opts.ticker,
    opts.theme,
    {
      onToken: (cell, reaction) => tokenLayer.reactAt(cell, reaction),
      onShake: (offset) => boardContainer.position.set(boardOrigin.x + offset.x, boardOrigin.y + offset.y),
    },
  );
  const labelLayer = new LabelLayer(layers.createLayer('labels', layers.getDefaultZIndex('labels')), opts.parent);

  let currentBoard: Board | null = null;
  let geometry: { grid: Grid; size: number } | null = null;
  let boardOrigin: Point = { x: 0, y: 0 };
  const handlers = new Map<BoardEventType, Set<(event: never) => void>>();

  function fit(): { grid: Grid; size: number } | null {
    if (!currentBoard) return null;
    const grid = gridOf(currentBoard);
    const unit = grid.bounds(1);
    const { width, height } = opts.size();
    const size = Math.max(1, Math.min(width / (unit.width + 2 * PAD_CELLS), height / (unit.height + 2 * PAD_CELLS)));
    return { grid, size };
  }

  function redraw(): void {
    geometry = fit();
    if (!currentBoard || !geometry) {
      terrainLayer.clear();
      gridLayer.setGeometry(null, 0, opts.theme);
      edgeLayer.clear();
      labelLayer.clear();
      overlayLayer.setGeometry(null, 0, opts.theme);
      shotLayer.setGeometry(null, 0, opts.theme);
      castLayer.setGeometry(null, 0, opts.theme);
      effectLayer.setGeometry(null, 0, opts.theme);
      tokenLayer.setGeometry(null, 0, opts.theme);
      return;
    }
    const { grid, size } = geometry;
    const bounds = grid.bounds(size);
    const { width, height } = opts.size();
    boardOrigin = { x: (width - bounds.width) / 2, y: (height - bounds.height) / 2 };
    boardContainer.position.set(boardOrigin.x, boardOrigin.y);

    terrainLayer.draw(opts.renderer, currentBoard, size, opts.theme);
    gridLayer.setGeometry(grid, size, opts.theme);
    edgeLayer.draw(currentBoard, size, opts.theme);
    labelLayer.draw(grid, size, opts.theme);
    labelLayer.rescale();
    overlayLayer.setGeometry(grid, size, opts.theme);
    shotLayer.setGeometry(grid, size, opts.theme);
    castLayer.setGeometry(grid, size, opts.theme);
    effectLayer.setGeometry(grid, size, opts.theme);
    tokenLayer.setGeometry(grid, size, opts.theme);
    interaction.clamp();
  }

  /** The padded board rectangle, in the viewport's coordinates — the pan clamp's bounds, and
   * what "frame everything" frames. */
  function contentRect(): Rect | null {
    if (!geometry) return null;
    const bounds = geometry.grid.bounds(geometry.size);
    const pad = PAD_CELLS * geometry.size;
    const bottomPad = BOTTOM_PAD_CELLS * geometry.size;
    return {
      x: boardContainer.position.x - pad,
      y: boardContainer.position.y - pad,
      width: bounds.width + 2 * pad,
      height: bounds.height + pad + bottomPad,
    };
  }

  /** The rectangle a set of cells covers, in the viewport's coordinates, with a cell of margin
   * so a piece at the edge keeps its art and its flag. */
  function cellsBox(cells: readonly string[]): Rect | null {
    if (!geometry) return null;
    const { grid, size } = geometry;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of cells) {
      const cell = grid.parse(key);
      if (!grid.inBounds(cell)) continue;
      for (const v of grid.vertices(cell, size)) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
    }
    if (minX > maxX) return null;
    const pad = size;
    return {
      x: boardContainer.position.x + minX - pad,
      y: boardContainer.position.y + minY - pad,
      width: maxX - minX + 2 * pad,
      height: maxY - minY + 2 * pad,
    };
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

  let anchoredId: string | null = null;

  function emit(event: BoardEvent): void {
    for (const handler of handlers.get(event.type) ?? []) (handler as (e: BoardEvent) => void)(event);
  }

  const interaction = new Interaction({
    canvas: opts.canvas,
    viewport: opts.parent,
    toLocal: (screen: Point) => boardContainer.toLocal(screen),
    geometry: () => geometry,
    content: contentRect,
    tokens: () => tokenLayer.bounds(),
    region,
    emit,
    onHover: (cell, edge) => overlayLayer.setHover(cell, edge),
    onPreview: (cells, edges, brush) => overlayLayer.setPaintPreview(cells, edges, brush ? brushColour(brush, opts.theme) : 0),
    onBrush: (brush) => opts.onBrush?.(brush),
    onClear: () => overlayLayer.setSelected(null),
    onViewport: () => labelLayer.rescale(),
    onDrag: (id, point) => tokenLayer.setDrag(id, id === anchoredId ? null : point),
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
    setBarred(cell) {
      overlayLayer.setBarred(cell);
    },
    setAnchored(id) {
      anchoredId = id;
      if (id) tokenLayer.setDrag(null, null);
    },
    setShot(shot) {
      shotLayer.setShot(shot);
    },
    setCast(cast) {
      castLayer.setCast(cast);
    },
    burst(cell, tree, from) {
      const origin = castLayer.resolve();
      effectLayer.burst(cell, tree, from ?? origin);
    },
    setRoute(id, cells) {
      tokenLayer.setRoute(id, cells);
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
    setFrozen(frozen) {
      interaction.setFrozen(frozen);
    },
    setBrush(brush) {
      interaction.setBrush(brush);
    },
    setGrid(settings) {
      gridLayer.setSettings(settings);
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
    screenOf(cell) {
      if (!geometry) return null;
      const c = geometry.grid.parse(cell);
      if (!geometry.grid.inBounds(c)) return null;
      return boardContainer.toGlobal(geometry.grid.center(c, geometry.size));
    },
    cellRadius(cell) {
      if (!geometry) return null;
      const c = geometry.grid.parse(cell);
      if (!geometry.grid.inBounds(c)) return null;
      const centre = boardContainer.toGlobal(geometry.grid.center(c, geometry.size));
      const vertex = boardContainer.toGlobal(geometry.grid.vertices(c, geometry.size)[0]);
      return Math.hypot(vertex.x - centre.x, vertex.y - centre.y);
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
      interaction.clamp();
      labelLayer.rescale();
    },
    zoomBy(factor, into) {
      const box = into ?? { x: 0, y: 0, ...opts.size() };
      interaction.zoomBy(factor, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    },
    // The cells' own bounding box, grown by a cell all round so pieces on the edge of the
    // frame are not cropped by their own art, then handed to `Interaction` to centre.
    frame(cells, into) {
      if (!geometry) return;
      const box = cells?.length ? cellsBox(cells) : contentRect();
      if (!box) return;
      interaction.frame(box, into ?? { x: 0, y: 0, ...opts.size() });
    },
    zoom() {
      return interaction.zoom;
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
      castLayer.destroy();
      effectLayer.destroy();
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
export { setVfxTimeScale } from './layers/EffectLayer.js';
// proto: the only non-BoardView surface Svelte touches — a pure path-builder (no PIXI, no
// DOM) that Token.ts also calls for the same art. Re-deriving the BASE_URL-prefixing here
// would just duplicate it; see "Wave 2 notes" in the todos.
export { actionIconUrl, castIconUrl, engineArtUrl, troopArtUrl, type ActionIcon } from './art.js';
export { BRUSH_TERRAINS, brushColour, eraseForm, isEdgeBrush, sameBrush } from './brush.js';
export { EDGE_BAND, edgeCandidates, hitTest, nearestEdge } from './hit.js';
export { currentTheme, darkTheme, HIGHLIGHT_STYLES, lightTheme, prefersDark, type BoardTheme } from './theme.js';
