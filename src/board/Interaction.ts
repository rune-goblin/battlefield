import type * as PIXI from 'pixi.js';
import type { Grid, Point } from '../engine/index.js';
import { BRUSH_TERRAINS, eraseForm, isEdgeBrush, type Brush } from './brush.js';
import { edgeCandidates, hitTest, nearestEdge, type Hit, type TokenBoundsProvider } from './hit.js';

export type BoardMode = 'view' | 'paint' | 'place' | 'battle';

export type BoardEvent =
  | { type: 'hover'; cell: string | null }
  | { type: 'cell'; cell: string; button: 0 | 2 }
  | { type: 'edge'; edge: string }
  | { type: 'token'; id: string }
  | { type: 'paint'; cells: string[]; edges: string[]; brush: Brush }
  | { type: 'drop'; id: string; cell: string }
  /** Fires on every pointer move while a token drag is live; `cell` is null off-grid or on
   * release/cancel, which the drag-preview consumer reads as "clear". */
  | { type: 'drag'; id: string; cell: string | null };

export type BoardEventType = BoardEvent['type'];
export type BoardEventOf<T extends BoardEventType> = Extract<BoardEvent, { type: T }>;

const CLICK_SLOP = 4;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.0015;
const WALL_TIERS = 4;
// A wall stroke prefers edges it is travelling along: |cos| ≥ this against the drag vector.
// 0.45 admits a hex's 60° edges, which a zigzag row boundary needs, and rejects the square
// grid's perpendicular edge at a cell corner.
const PARALLEL = 0.45;

interface Stroke { brush: Brush; cells: Set<string>; edges: Set<string> }

type Gesture =
  | { kind: 'none' }
  | { kind: 'press'; token: string | null }
  | { kind: 'paint'; stroke: Stroke }
  | { kind: 'drag'; token: string }
  | { kind: 'pan' };

export interface InteractionOptions {
  canvas: HTMLCanvasElement;
  /** The pan/zoom container; Interaction is the only thing that moves it. */
  viewport: PIXI.Container;
  /** Screen point (CSS pixels inside the canvas) to board-local coordinates. */
  toLocal(screen: Point): Point;
  geometry(): { grid: Grid; size: number } | null;
  tokens: TokenBoundsProvider;
  /** Connected cells of the same terrain as `cell`, for shift-click fill. */
  region(cell: string): string[];
  emit(event: BoardEvent): void;
  onHover(cell: string | null, edge: string | null): void;
  onPreview(cells: string[], edges: string[], brush: Brush | null): void;
  /** Keyboard brush changes, so the stage's palette can follow the canvas. */
  onBrush(brush: Brush | null): void;
  /** Escape: the stage drops its selection. */
  onClear(): void;
  /** Pan or zoom happened; zoom-invariant text needs rescaling. */
  onViewport(): void;
  /** A board-internal token drag: `point` (board-local) while live, `null` on drop/cancel. */
  onDrag(id: string, point: Point | null): void;
}

/**
 * The pointer state machine. DOM `pointer*` listeners on the canvas element, never
 * `PIXI.InteractionManager` on the stage — Foundry owns the stage, so a board that listens
 * to its own element ports across unchanged.
 */
export class Interaction {
  private readonly o: InteractionOptions;
  private mode: BoardMode = 'view';
  private brush: Brush | null = null;
  /** In battle mode, the only token a press may escalate into a drag; unset in every other
   * mode, where any token already presses into a drag (place mode's reposition). */
  private draggableId: string | null = null;
  private gesture: Gesture = { kind: 'none' };
  private origin: Point = { x: 0, y: 0 };
  private lastScreen: Point = { x: 0, y: 0 };
  private spaceDown = false;
  private pointerInside = false;
  private hoverCell: string | null = null;
  private hoverEdge: string | null = null;
  private wallTier = 0;
  private lastPainted: Point | null = null;

  constructor(options: InteractionOptions) {
    this.o = options;
    const c = options.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerCancel);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDoubleClick);
    c.addEventListener('contextmenu', this.onContextMenu);
    c.addEventListener('keydown', this.onKeyDown);
    c.addEventListener('keyup', this.onKeyUp);
    this.applyCursor();
  }

  setMode(mode: BoardMode): void {
    this.mode = mode;
    this.cancel();
    this.applyCursor();
  }

  setDraggable(id: string | null): void {
    this.draggableId = id;
  }

  setBrush(brush: Brush | null): void {
    this.brush = brush;
    if (brush?.kind === 'wall') this.wallTier = brush.tier;
    this.cancel();
    this.applyCursor();
  }

  /** Fit: undo every pan and zoom. The board is centred by its own redraw. */
  resetView(): void {
    this.o.viewport.scale.set(1);
    this.o.viewport.position.set(0, 0);
    this.viewportChanged();
  }

  destroy(): void {
    const c = this.o.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerCancel);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('dblclick', this.onDoubleClick);
    c.removeEventListener('contextmenu', this.onContextMenu);
    c.removeEventListener('keydown', this.onKeyDown);
    c.removeEventListener('keyup', this.onKeyUp);
  }

  private screenOf(e: PointerEvent | WheelEvent | MouseEvent): Point {
    const rect = this.o.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Edges compete for hits in view mode (wall inspection) and battle mode (wall-target
  // actions like a ram/bombard); paint mode only cares about edges under an edge brush, since
  // otherwise every cell near a boundary would fight the terrain brush for the click.
  private edgesLive(): boolean {
    return isEdgeBrush(this.brush) || this.mode === 'view' || this.mode === 'battle';
  }

  private hitAt(screen: Point): Hit | null {
    const geometry = this.o.geometry();
    if (!geometry) return null;
    return hitTest(this.o.toLocal(screen), { ...geometry, edges: this.edgesLive(), tokens: this.o.tokens });
  }

  private applyCursor(): void {
    const style = this.o.canvas.style;
    if (this.gesture.kind === 'pan') style.cursor = 'grabbing';
    else if (this.spaceDown) style.cursor = 'grab';
    else if (this.mode === 'paint' && this.brush) style.cursor = 'crosshair';
    else style.cursor = 'default';
  }

  private onContextMenu = (e: Event): void => { e.preventDefault(); };

  private onPointerDown = (e: PointerEvent): void => {
    this.o.canvas.focus({ preventScroll: true });
    const screen = this.screenOf(e);
    this.pointerInside = true;
    this.origin = screen;
    this.lastScreen = screen;
    this.o.canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || this.spaceDown) {
      e.preventDefault();
      this.gesture = { kind: 'pan' };
      this.applyCursor();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;

    const hit = this.hitAt(screen);
    if (hit?.kind === 'token' && (this.mode === 'place' || this.mode === 'battle')) {
      // Battle mode drags only the active unit's own token; every other token still presses
      // (so a plain click still resolves as a target on release) but never escalates to drag.
      const draggable = this.mode === 'place' || hit.id === this.draggableId;
      this.gesture = { kind: 'press', token: draggable ? hit.id : null };
      return;
    }
    if (this.mode === 'paint' && this.brush) {
      const brush = e.button === 2 ? eraseForm(this.brush) : this.brush;
      const stroke: Stroke = { brush, cells: new Set(), edges: new Set() };
      this.gesture = { kind: 'paint', stroke };
      this.lastPainted = null;
      this.extend(stroke, screen, e.shiftKey);
      return;
    }
    this.gesture = { kind: 'press', token: null };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const screen = this.screenOf(e);
    this.pointerInside = true;
    const moved = Math.hypot(screen.x - this.origin.x, screen.y - this.origin.y);

    if (this.gesture.kind === 'pan') {
      this.o.viewport.x += screen.x - this.lastScreen.x;
      this.o.viewport.y += screen.y - this.lastScreen.y;
      this.lastScreen = screen;
      this.viewportChanged();
      return;
    }
    this.lastScreen = screen;

    if (this.gesture.kind === 'paint') {
      this.extend(this.gesture.stroke, screen, false);
    } else if (this.gesture.kind === 'press' && this.gesture.token && moved > CLICK_SLOP) {
      this.gesture = { kind: 'drag', token: this.gesture.token };
    }
    if (this.gesture.kind === 'drag') {
      const local = this.o.toLocal(screen);
      this.o.onDrag(this.gesture.token, local);
      const geometry = this.o.geometry();
      const cell = geometry ? geometry.grid.fromPoint(local, geometry.size) : null;
      this.o.emit({ type: 'drag', id: this.gesture.token, cell: cell ? geometry!.grid.key(cell) : null });
    }
    this.updateHover(screen);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const screen = this.screenOf(e);
    const gesture = this.gesture;
    this.gesture = { kind: 'none' };
    if (this.o.canvas.hasPointerCapture(e.pointerId)) this.o.canvas.releasePointerCapture(e.pointerId);
    this.applyCursor();

    if (gesture.kind === 'pan') return;

    if (gesture.kind === 'paint') {
      const { stroke } = gesture;
      this.o.onPreview([], [], null);
      if (stroke.cells.size || stroke.edges.size) {
        this.o.emit({ type: 'paint', cells: [...stroke.cells], edges: [...stroke.edges], brush: stroke.brush });
      }
      return;
    }

    if (gesture.kind === 'drag') {
      const geometry = this.o.geometry();
      const cell = geometry?.grid.fromPoint(this.o.toLocal(screen), geometry.size);
      if (geometry && cell) this.o.emit({ type: 'drop', id: gesture.token, cell: geometry.grid.key(cell) });
      this.o.onDrag(gesture.token, null);
      this.o.emit({ type: 'drag', id: gesture.token, cell: null });
      return;
    }

    if (gesture.kind !== 'press') return;
    if (Math.hypot(screen.x - this.origin.x, screen.y - this.origin.y) > CLICK_SLOP) return;
    const hit = this.hitAt(screen);
    if (!hit) return;
    if (hit.kind === 'token') this.o.emit({ type: 'token', id: hit.id });
    else if (hit.kind === 'edge') this.o.emit({ type: 'edge', edge: hit.id });
    else this.o.emit({ type: 'cell', cell: hit.id, button: e.button === 2 ? 2 : 0 });
  };

  private onPointerCancel = (): void => { this.cancel(); };

  private onPointerLeave = (): void => {
    if (this.gesture.kind !== 'none') return;
    this.pointerInside = false;
    this.setHover(null, null);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const viewport = this.o.viewport;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.scale.x * Math.exp(-e.deltaY * ZOOM_STEP)));
    if (next === viewport.scale.x) return;
    const screen = this.screenOf(e);
    const before = viewport.toLocal(screen);
    viewport.scale.set(next);
    const after = viewport.toLocal(screen);
    viewport.x += (after.x - before.x) * next;
    viewport.y += (after.y - before.y) * next;
    this.lastScreen = screen;
    this.pointerInside = true;
    this.viewportChanged();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    // "Empty space" means nothing claims the click: no token, and no brush either, since a
    // paint brush makes every cell a target and a refit mid-stroke would fight the painter.
    if (this.brush || this.hitAt(this.screenOf(e))?.kind === 'token') return;
    this.resetView();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      e.preventDefault();
      this.spaceDown = true;
      this.applyCursor();
      return;
    }
    if (e.key === 'Escape') {
      this.setBrush(null);
      this.o.onBrush(null);
      this.o.onClear();
      return;
    }
    const brush = this.brushForKey(e.key);
    if (!brush) return;
    e.preventDefault();
    this.setBrush(brush);
    this.o.onBrush(brush);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key !== ' ') return;
    this.spaceDown = false;
    this.applyCursor();
  };

  private brushForKey(key: string): Brush | null {
    const terrain = BRUSH_TERRAINS[Number(key) - 1];
    if (terrain) return { kind: 'terrain', terrain };
    switch (key.toLowerCase()) {
      case 'q': return { kind: 'elevation', level: 0 };
      case 'w': return { kind: 'elevation', level: 1 };
      case 'e': return { kind: 'elevation', level: 2 };
      // Repeated R cycles the tier, so one key reaches all four walls.
      case 'r': return { kind: 'wall', tier: this.brush?.kind === 'wall' ? (this.wallTier + 1) % WALL_TIERS : this.wallTier };
      case 'x': return { kind: 'erase' };
      default: return null;
    }
  }

  private extend(stroke: Stroke, screen: Point, fillRegion: boolean): void {
    const geometry = this.o.geometry();
    if (!geometry) return;
    const point = this.o.toLocal(screen);
    const cell = geometry.grid.fromPoint(point, geometry.size);
    if (!cell) return;

    if (isEdgeBrush(stroke.brush)) {
      // A wall stroke always takes the nearest edge, band or not: the band decides hit
      // priority against the cell, and with a wall brush the cell is never the target. The
      // travel filter is what stops a drag along one boundary from also catching the
      // perpendicular edge it passes through at every cell corner.
      const candidates = edgeCandidates(point, cell, geometry.grid, geometry.size);
      const along = this.travel(point);
      const edge = (along && candidates.find((c) => Math.abs(c.direction.x * along.x + c.direction.y * along.y) >= PARALLEL)) ?? candidates[0];
      if (edge) stroke.edges.add(edge.key);
    } else if (fillRegion) {
      for (const key of this.o.region(geometry.grid.key(cell))) stroke.cells.add(key);
    } else {
      stroke.cells.add(geometry.grid.key(cell));
    }
    this.lastPainted = point;
    this.o.onPreview([...stroke.cells], [...stroke.edges], stroke.brush);
  }

  private travel(point: Point): Point | null {
    if (!this.lastPainted) return null;
    const dx = point.x - this.lastPainted.x;
    const dy = point.y - this.lastPainted.y;
    const length = Math.hypot(dx, dy);
    return length < 1 ? null : { x: dx / length, y: dy / length };
  }

  private updateHover(screen: Point): void {
    const geometry = this.o.geometry();
    if (!geometry) return this.setHover(null, null);
    const point = this.o.toLocal(screen);
    const cell = geometry.grid.fromPoint(point, geometry.size);
    if (!cell) return this.setHover(null, null);

    let edge: string | null = null;
    if (isEdgeBrush(this.brush) || this.mode === 'view' || this.mode === 'battle') {
      const candidate = nearestEdge(point, cell, geometry.grid, geometry.size);
      // With a wall brush the nearest edge is always what a click paints, so always show it.
      if (candidate && (isEdgeBrush(this.brush) || candidate.inBand)) edge = candidate.key;
    }
    this.setHover(geometry.grid.key(cell), edge);
  }

  // Pan and zoom move the board under a stationary pointer, so the hover is stale until it
  // is recomputed; the labels need their inverse scale refreshed for the same reason.
  private viewportChanged(): void {
    this.o.onViewport();
    if (this.pointerInside) this.updateHover(this.lastScreen);
  }

  private setHover(cell: string | null, edge: string | null): void {
    if (cell === this.hoverCell && edge === this.hoverEdge) return;
    const cellChanged = cell !== this.hoverCell;
    this.hoverCell = cell;
    this.hoverEdge = edge;
    this.o.onHover(cell, edge);
    if (cellChanged) this.o.emit({ type: 'hover', cell });
  }

  private cancel(): void {
    const gesture = this.gesture;
    this.gesture = { kind: 'none' };
    this.o.onPreview([], [], null);
    if (gesture.kind === 'drag') {
      this.o.onDrag(gesture.token, null);
      this.o.emit({ type: 'drag', id: gesture.token, cell: null });
    }
    this.applyCursor();
  }
}
