import * as PIXI from 'pixi.js';
import { at, gridOf, type Board, type Grid, type Point, type Side, type Tree } from '../engine/index.js';
import { connectedCells } from './terrain-regions.js';
import { BoardApp } from './BoardApp.js';
import { BoardContainer } from './BoardContainer.js';
import { brushColour, type Brush } from './brush.js';
import { Interaction, type BoardEvent, type BoardEventOf, type BoardEventType, type BoardMode, type Rect } from './Interaction.js';
import type { BoardLayer, LayerContext } from './layers/BoardLayer.js';
import { CastLayer } from './layers/CastLayer.js';
import { EdgeLayer } from './layers/EdgeLayer.js';
import { EffectLayer } from './layers/EffectLayer.js';
import { DEFAULT_GRID_SETTINGS, GridLayer, type GridUpdate } from './layers/GridLayer.js';
import { DEFAULT_MAP_LINES, MapLineLayer } from './layers/MapLineLayer.js';
import { InkLayer, type InkMapAppearance } from './layers/InkLayer.js';
import { OverlayLayer } from './layers/OverlayLayer.js';
import { FallenLayer, type FallenModel } from './layers/FallenLayer.js';
import { CombatTextLayer, type BoardCombatText } from './layers/CombatTextLayer.js';
import type { TargetArrow } from './target-point.js';
import { ShotLayer } from './layers/ShotLayer.js';
import { TerrainLayer } from './layers/TerrainLayer.js';
import { inkAtlas } from './ink-sheet.js';
import { paperTexture, type PaperTexture } from './paper.js';
import type { TerrainAppearance } from './terrain-textures.js';
import { terrainAtlas } from './terrain-sheet.js';
import { TokenLayer } from './layers/TokenLayer.js';
import type { TokenModel } from './Token.js';
import { currentTheme, type BoardTheme, type HighlightStyle } from './theme.js';

export type { HighlightStyle } from './theme.js';
export type { GridUpdate } from './layers/GridLayer.js';
export type { ElevationLines, MapLine } from './map-lines.js';
export type { InkMapAppearance } from './layers/InkLayer.js';
export type { Brush } from './brush.js';
export type { BoardEventOf, BoardEventType, BoardMode } from './Interaction.js';
export type { EngineTokenModel, TokenModel, TokenPick, UnitTokenModel } from './Token.js';

// Empty board left around the grid on every side, in cell pitches. It is what a pan grabs:
// without it the outermost cells sit against the viewport edge with nothing beside them to
// drag from.
const PAD_CELLS = 2;
// Extra empty canvas below the grid, pan-clamp only (it does not shrink the fitted zoom the
// way PAD_CELLS would). The board is full-bleed behind the army bar at the bottom of the
// screen, so a cell near the board's south edge can otherwise only ever sit under it — this
// gives a pan room to carry that cell above the bar instead.
const BOTTOM_PAD_CELLS = 6;

export type { Rect } from './Interaction.js';

export interface BoardView {
  setBoard(board: Board | null): void;
  setTerrainAppearance(appearance: TerrainAppearance | null): void;
  /** The illustrated map — a faint wash per hex under one pencil drawing — in place of the
   * textured surfaces. Set, it is what the board draws; null returns it to the textures. */
  setInkMap(appearance: InkMapAppearance | null): void;
  setTokens(tokens: TokenModel[]): void;
  /** The units that died here, each marked on the ground of its cell. A death that combat text
   * names with the `dead` icon plays in over the piece, which stands until then. */
  setFallen(fallen: FallenModel[]): void;
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
  /** Aiming arrows above the pieces, colored by action or spell. Accepts one target or a
   * group; null clears them. An omitted tone retains the red shot arc; a muted arrow is gray. */
  setShot(shot: TargetArrow | readonly TargetArrow[] | null): void;
  /** The cast being aimed: a swirling particle line from the caster's cell out to the
   * target's, coloured by tree. Null clears it. */
  setCast(cast: { from: string; to: string; tree: Tree; toCells?: string[] } | null): void;
  /** A one-shot resolution animation on `cell`, selected by `tree` — fired once a cast
   * actually lands, unlike `setCast`'s held aim line. `from` is the caster's cell for a
   * spell that flies in; it defaults to the cast being aimed, if there is one. */
  burst(cell: string, tree: Tree, from?: string | null): void;
  /** Floats a word over a piece: the result of a roll, or a condition it just took. Words take
   * turns in the order given, and all of them wait for the pieces to stop moving. */
  combatText(line: BoardCombatText): void;
  /** How long the board still needs to show what the last commit did: a cast playing, words
   * waiting or showing, a status settling into its slot. Infinity while pieces walk, since the
   * words wait for them. Whatever announces the next turn times itself against this, and may
   * come in over the tail. */
  remainingMs(): number;
  /** Drops every burst and combat text line in flight. A stage switch calls it: the next stage's board
   * is the same view, and an effect from the last one would play on over it. */
  clearEffects(): void;
  /** The route the token's next move walks, its own cell first — the same cells the drag
   * traced. Without one a move cuts straight across the board to its destination. Spent by
   * that move, so it is set once per committed move, just before the new position arrives. */
  setRoute(id: string, cells: readonly string[]): void;
  /** The hex under the acting piece, outlined in its side's colour. */
  setSelected(selection: { cell: string; side: Side } | null): void;
  /** The one token a press may escalate into a drag in battle mode; place mode ignores this
   * and always allows any token to drag. */
  setDraggable(id: string | null): void;
  /** The edges a press may take — in battle, the walls the armed action can actually hit.
   * Empty leaves every wall as scenery, which is what a stage with no wall verb wants. */
  setPickableEdges(keys: readonly string[]): void;
  setMode(mode: BoardMode): void;
  /** Ignore every pointer, key, hover and zoom until unfrozen — for a DOM menu that owns the
   * board while it is open. */
  setFrozen(frozen: boolean): void;
  setBrush(brush: Brush | null): void;
  /** The reference hex outline, off by default, one line style per height — the map controls'
   * settings dialog and the texture lab own its state, not any of the game/battle stages. */
  setGrid(settings: GridUpdate): void;
  /** Walls, breached walls and cliffs — every impassable border, shown unless hidden. The
   * texture lab drops them to judge a surface with nothing drawn over it. */
  setBorders(visible: boolean): void;
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
   * passes its own pan/zoom container here; `dev/foundry-mount` passes a container it owns
   * inside a stand-in "primary" container it does not. */
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
 * its own. This is the seam `createBoardView` builds on below, and the one `dev/foundry-mount`
 * calls directly to prove the board can be driven without also constructing a second
 * `PIXI.Application`. See `docs/pixi-board.md`.
 */
export function mountBoardView(opts: MountBoardOptions): BoardView {
  const boardContainer = new BoardContainer();
  opts.parent.addChild(boardContainer);

  const layers = boardContainer.layers;
  const terrainLayer = new TerrainLayer(layers.createLayer('terrain'), opts.renderer, opts.theme);
  // The scatter sheet decodes and chroma-keys off the main thread's first idle moment; the
  // board draws its procedural patterns until then and repaints once the scenery is ready.
  let alive = true;
  terrainAtlas().then((atlas) => {
    if (!alive) return;
    terrainLayer.setAtlas(atlas);
    redraw();
  });
  // Above the terrain fill and below the walls: the illustrated map replaces the surfaces
  // rather than sitting over them, so only one of the two ever has anything in it.
  const inkLayer = new InkLayer(layers.createLayer('ink'));
  let paperName: PaperTexture | 'none' = 'none';
  // The grid rules the ground a piece stands on, so it crosses terrain and washes but never a
  // piece — nor a wall, which is built on the ground rather than drawn on it.
  const gridLayer = new GridLayer(layers.createLayer('grid'));
  // The map lines top the stack: they say where an area ends and where the ground steps, and a
  // piece standing on the step must not hide the step. Their opacity keeps them out of the way.
  const mapLineLayer = new MapLineLayer(layers.createLayer('mapLines'));
  const edgeLayer = new EdgeLayer(layers.createLayer('edges'), opts.theme);
  const overlayLayer = new OverlayLayer(layers.createLayer('overlay'), opts.theme);
  const tokenLayer = new TokenLayer(layers.createLayer('tokens'), opts.ticker, opts.theme, opts.renderer.screen);
  const shotLayer = new ShotLayer(layers.createLayer('shot'), opts.theme);
  const castLayer = new CastLayer(layers.createLayer('cast'), opts.ticker, opts.theme);
  // Two effect containers: light on the cell, pools and scorch marks sit under the pieces;
  // flames, frames and sparks over them.
  const effectLayer = new EffectLayer(
    layers.createLayer('effectsGround'),
    layers.createLayer('effects'),
    opts.ticker,
    {
      onToken: (cell, reaction) => tokenLayer.reactAt(cell, reaction),
      onShake: (offset) => boardContainer.position.set(boardOrigin.x + offset.x, boardOrigin.y + offset.y),
    },
  );
  const fallenLayer = new FallenLayer(layers.createLayer('fallen'), layers.createLayer('fallenIntro'), opts.ticker, {
    hold: (id) => tokenLayer.hold(id),
    release: (id) => tokenLayer.release(id),
  });
  const combatTextLayer = new CombatTextLayer(layers.createLayer('combatText'), opts.parent, opts.ticker, {
    positionOf: (id) => tokenLayer.positionOf(id),
    moving: () => tokenLayer.moving(),
    expect: (id, icons) => tokenLayer.expectStatuses(id, icons),
    announce: (id, icons) => tokenLayer.announceStatuses(id, icons),
    expectFallen: (id) => fallenLayer.expect(id),
    announceFallen: (id) => fallenLayer.announce(id),
  });
  // The fallen marks come before the token layer they release held pieces into.
  const boardLayers: BoardLayer[] = [
    terrainLayer, inkLayer, gridLayer, mapLineLayer, edgeLayer, overlayLayer,
    shotLayer, castLayer, effectLayer, combatTextLayer, fallenLayer, tokenLayer,
  ];

  let currentBoard: Board | null = null;
  let inkMap: InkMapAppearance | null = null;
  let terrain: TerrainAppearance | null = null;
  let context: LayerContext | null = null;
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

  /** The outlines belong to the style that is on: each keeps its own weights, and a board with
   * no appearance at all takes the defaults. */
  function applyLines(): void {
    const settings = inkMap?.settings ?? terrain?.settings;
    gridLayer.setSettings(settings?.grid ?? DEFAULT_GRID_SETTINGS);
    mapLineLayer.setSettings(settings
      ? { area: settings.area, elevation: settings.elevation, groups: (inkMap ?? terrain)?.groups }
      : DEFAULT_MAP_LINES);
  }

  function redraw(): void {
    const fitted = fit();
    context = currentBoard && fitted ? { board: currentBoard, ...fitted, ink: inkMap } : null;
    if (context) {
      const bounds = context.grid.bounds(context.size);
      const { width, height } = opts.size();
      boardOrigin = { x: (width - bounds.width) / 2, y: (height - bounds.height) / 2 };
      boardContainer.position.set(boardOrigin.x, boardOrigin.y);
    }
    for (const layer of boardLayers) layer.setGeometry(context);
    if (context) interaction.clamp();
  }

  /** The padded board rectangle. Extra room below belongs to panning, not framing. */
  function contentRect(forPanning = true): Rect | null {
    if (!context) return null;
    const bounds = context.grid.bounds(context.size);
    const pad = PAD_CELLS * context.size;
    const bottomPad = (forPanning ? BOTTOM_PAD_CELLS : PAD_CELLS) * context.size;
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
    if (!context) return null;
    const { grid, size } = context;
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
    if (!currentBoard || !context) return [key];
    const board = currentBoard;
    const { grid } = context;
    const start = grid.parse(key);
    if (!grid.inBounds(start)) return [];
    const terrain = at(board, start).terrain;
    const same = grid.cells().filter((c) => at(board, c).terrain === terrain);
    const patch = connectedCells(grid, same).find((p) => p.some((c) => grid.key(c) === key));
    return (patch ?? [start]).map((c) => grid.key(c));
  }

  let anchoredId: string | null = null;

  function emit(event: BoardEvent): void {
    for (const handler of handlers.get(event.type) ?? []) (handler as (e: BoardEvent) => void)(event);
  }

  const interaction = new Interaction({
    canvas: opts.canvas,
    viewport: opts.parent,
    toLocal: (screen: Point) => boardContainer.toLocal(screen),
    geometry: () => context,
    content: contentRect,
    tokens: () => tokenLayer.placements(),
    region,
    emit,
    onHover: (cell, edge) => overlayLayer.setHover(cell, edge),
    onPreview: (cells, edges, brush) => overlayLayer.setPaintPreview(cells, edges, brush ? brushColour(brush, opts.theme) : 0),
    onBrush: (brush) => opts.onBrush?.(brush),
    onClear: () => overlayLayer.setSelected(null),
    onDrag: (id, point) => tokenLayer.setDrag(id, id === anchoredId ? null : point),
  });

  return {
    setBoard(board) {
      currentBoard = board;
      redraw();
    },
    setTerrainAppearance(appearance) {
      const loading = terrainLayer.setAppearance(appearance);
      terrain = appearance;
      applyLines();
      if (!inkMap && context) terrainLayer.setGeometry(context);
      void loading.then((loaded) => {
        if (loaded && alive && !inkMap && terrain === appearance && context) {
          terrainLayer.setGeometry(context);
        }
      });
    },
    setInkMap(appearance) {
      const first = !inkMap && !!appearance;
      inkMap = appearance;
      applyLines();
      redraw();
      // The grain tile likewise: fetched on the first ask for it, and the repaint lays it down.
      const grain = appearance?.settings.grain.texture ?? 'none';
      if (grain !== paperName) {
        paperName = grain;
        if (grain === 'none') inkLayer.setPaper(null);
        else void paperTexture(grain).then((texture) => {
          if (!alive || paperName !== grain) return;
          inkLayer.setPaper(texture);
          if (inkMap) redraw();
        });
      }
      // The atlas decodes on the first switch to the illustrated map and never again; the wash
      // is drawn meanwhile and the sprites arrive on the repaint.
      if (first) void inkAtlas().then((atlas) => {
        if (!alive) return;
        inkLayer.setAtlas(atlas);
        if (inkMap) redraw();
      });
    },
    setTokens(tokens) {
      tokenLayer.setTokens(tokens);
    },
    setFallen(fallen) {
      fallenLayer.setFallen(fallen);
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
    combatText(line) {
      combatTextLayer.show(line);
    },
    clearEffects() {
      effectLayer.clear();
      combatTextLayer.clear();
    },
    remainingMs() {
      if (tokenLayer.moving()) return Infinity;
      return Math.max(tokenLayer.settlingMs(), effectLayer.remainingMs(), combatTextLayer.remainingMs());
    },
    setRoute(id, cells) {
      tokenLayer.setRoute(id, cells);
    },
    setSelected(selection) {
      overlayLayer.setSelected(selection);
    },
    setDraggable(id) {
      interaction.setDraggable(id);
    },
    setPickableEdges(keys) {
      interaction.setPickableEdges(keys);
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
    setBorders(visible) {
      if (visible) layers.showLayer('edges'); else layers.hideLayer('edges');
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();
      handlers.set(event, set);
      set.add(handler as (event: never) => void);
      return () => set.delete(handler as (event: never) => void);
    },
    cellAt(clientX, clientY) {
      if (!context) return null;
      const rect = opts.canvas.getBoundingClientRect();
      const local = boardContainer.toLocal({ x: clientX - rect.left, y: clientY - rect.top });
      const cell = context.grid.fromPoint(local, context.size);
      return cell ? context.grid.key(cell) : null;
    },
    screenOf(cell) {
      if (!context) return null;
      const c = context.grid.parse(cell);
      if (!context.grid.inBounds(c)) return null;
      return boardContainer.toGlobal(context.grid.center(c, context.size));
    },
    cellRadius(cell) {
      if (!context) return null;
      const c = context.grid.parse(cell);
      if (!context.grid.inBounds(c)) return null;
      const centre = boardContainer.toGlobal(context.grid.center(c, context.size));
      const vertex = boardContainer.toGlobal(context.grid.vertices(c, context.size)[0]);
      return Math.hypot(vertex.x - centre.x, vertex.y - centre.y);
    },
    // Pans `opts.parent` (the pan/zoom container `boardContainer` sits in) so the cell's
    // centre lands under the viewport's screen centre, at whatever zoom is already set.
    centerOn(cell) {
      if (!currentBoard || !context) return;
      const c = context.grid.parse(cell);
      if (!context.grid.inBounds(c)) return;
      const local = context.grid.center(c, context.size);
      const { width, height } = opts.size();
      const scale = opts.parent.scale.x;
      opts.parent.position.set(
        width / 2 - scale * (boardContainer.position.x + local.x),
        height / 2 - scale * (boardContainer.position.y + local.y),
      );
      interaction.clamp();
    },
    zoomBy(factor, into) {
      const box = into ?? { x: 0, y: 0, ...opts.size() };
      interaction.zoomBy(factor, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    },
    // The cells' own bounding box, grown by a cell all round so pieces on the edge of the
    // frame are not cropped by their own art, then handed to `Interaction` to centre.
    frame(cells, into) {
      if (!context) return;
      const box = cells?.length ? cellsBox(cells) : contentRect(false);
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
      alive = false;
      interaction.destroy();
      for (const layer of boardLayers) layer.destroy();
      boardContainer.destroy({ children: true });
    },
  };
}

export interface CreateBoardViewOptions {
  theme?: BoardTheme;
  /** Keyboard brush changes, so a palette can follow the canvas. Escape sends null. */
  onBrush?: (brush: Brush | null) => void;
}

/** A board view that owns its canvas and renderer, and can move between host elements. */
export interface HostedBoardView extends BoardView {
  /** Size to `container` from now on, send brush changes to `onBrush`, and start rendering. */
  attach(container: HTMLElement, onBrush?: (brush: Brush | null) => void): void;
  /** Stop rendering and stop following the container. The GL context and every uploaded
   * texture stay, which is what a later `attach` saves. */
  detach(): void;
}

export function createBoardView(canvas: HTMLCanvasElement, container: HTMLElement, opts: CreateBoardViewOptions = {}): HostedBoardView {
  const boardApp = new BoardApp({ canvas, container, theme: opts.theme });
  let onBrush = opts.onBrush;
  const view = mountBoardView({
    parent: boardApp.viewport,
    canvas,
    ticker: boardApp.app.ticker,
    renderer: boardApp.app.renderer,
    size: () => boardApp.app.screen,
    theme: boardApp.theme,
    onBrush: (brush) => onBrush?.(brush),
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
    attach(next, brushListener) {
      onBrush = brushListener;
      resizeObserver.disconnect();
      boardApp.app.resizeTo = next;
      resizeObserver.observe(next);
      boardApp.app.start();
      boardApp.resize();
      view.resize();
    },
    detach() {
      onBrush = undefined;
      resizeObserver.disconnect();
      boardApp.app.stop();
    },
    destroy() {
      resizeObserver.disconnect();
      view.destroy();
      boardApp.destroy();
    },
  };
}

export { setVfxTimeScale } from './layers/EffectLayer.js';
export type { FallenModel } from './layers/FallenLayer.js';
export type { BoardCombatText, CombatTextIcon, CombatTextPart, CombatTextTone } from './layers/CombatTextLayer.js';
export { targetIconUrl, type TargetIcon, actionIconUrl, bannerSvg, castIconUrl, engineArtUrl, statusIconUrl, troopArtUrl, type ActionIcon } from './art.js';
export { BRUSH_TERRAINS, sameBrush } from './brush.js';
export { currentTheme, HIGHLIGHT_STYLES, type BoardTheme } from './theme.js';

export { targetAnchor, type TargetArrow } from './target-point.js';
export { assetUrl } from './asset-base.js';
export {
  brokenCells, createTextureSample, DEFAULT_TREES, defaultTextureSettings, normalizeTextureSettings, surfaceGroup,
  TERRAIN_GROUPS, TERRAIN_LABELS, TEXTURE_CHOICES, wallStates, type TerrainAppearance, type TerrainGroup,
} from './terrain-textures.js';
export { statusBars, STATUS_OUTLINE, STATUS_TRACK } from './status-bars.js';
export { isPage, PAPER_GRAINS, PAPER_LABELS, PAPER_PAGES } from './paper.js';
export { cssHex, IDENTITY_HSB, lchToRgb, rgbToLch, type Lch } from './layers/color.js';
export { defaultInkSettings, normalizeInkSettings, type InkMapSettings } from './ink-map.js';
export { selectionCss } from './selection.js';
export { preloadBoardArt, preloadPieceArt } from './preload.js';
