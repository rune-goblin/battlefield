<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    createBoardView, HIGHLIGHT_STYLES, type BoardCombatText, type BoardEventOf, type BoardMode, type BoardView, type Brush, type FallenModel,
    statusBars, type TargetArrow, type GridUpdate, type HighlightStyle, type InkMapAppearance, type Rect, type TerrainAppearance, type TokenModel,
  } from '../board/index.js';
  import type { Board, Side, Tree } from '../engine/index.js';
  import HexInfo from './HexInfo.svelte';

  interface HighlightGroup { style: HighlightStyle; cells: string[] }

  interface Props {
    board: Board | null;
    terrainAppearance?: TerrainAppearance | null;
    /** The illustrated map, in place of the textured surfaces — see `BoardView.setInkMap`. */
    inkMap?: InkMapAppearance | null;
    tokens?: TokenModel[];
    /** The units that died on this board — see `BoardView.setFallen`. */
    fallen?: FallenModel[];
    mode?: BoardMode;
    brush?: Brush | null;
    /** One cell set per style; a style missing from the list is cleared. */
    highlights?: HighlightGroup[];
    /** The token-drag path trace, unit's own cell first — see `BoardView.setDragPath`. */
    dragPath?: string[];
    /** The cell a drag has reached that it may not take — see `BoardView.setBarred`. */
    barred?: string | null;
    /** A token that traces a drag without leaving its square — see `BoardView.setAnchored`. */
    anchored?: string | null;
    /** Action-colored aiming arrows — see `BoardView.setShot`. */
    shot?: TargetArrow | readonly TargetArrow[] | null;
    /** The cast being aimed, caster's cell to target's — see `BoardView.setCast`. */
    cast?: { from: string; to: string; tree: Tree; toCells?: string[] } | null;
    /** The acting piece's hex, washed and outlined in its side's colour. */
    selected?: { cell: string; side: Side } | null;
    /** In battle mode, the only token a press may pick up. Place mode ignores this. */
    draggable?: string | null;
    /** The walls a press may take — see `BoardView.setPickableEdges`. */
    pickableEdges?: string[];
    /** Full-bleed: fills its container instead of sitting in a capped, square-ish column. */
    fill?: boolean;
    /** Reframe when this area changes. Null centers on the canvas; omitted preserves the view. */
    frameWithin?: Rect | null;
    /** The board answers nothing while something else is the menu — see `BoardView.setFrozen`. */
    frozen?: boolean;
    onhover?: (event: BoardEventOf<'hover'>) => void;
    oncell?: (event: BoardEventOf<'cell'>) => void;
    onedge?: (event: BoardEventOf<'edge'>) => void;
    ontoken?: (event: BoardEventOf<'token'>) => void;
    onpaint?: (event: BoardEventOf<'paint'>) => void;
    ondrop?: (event: BoardEventOf<'drop'>) => void;
    ondrag?: (event: BoardEventOf<'drag'>) => void;
    onwaypoint?: (event: BoardEventOf<'waypoint'>) => void;
    onbrush?: (brush: Brush | null) => void;
    /** A native drag (e.g. a tray item) released over the canvas; `cell` is null outside the grid. */
    ontraydrop?: (cell: string | null, data: DataTransfer | null) => void;
    /** Native tray drags use HTML drag events rather than the board's pointer hover. */
    ontrayhover?: (cell: string | null) => void;
  }
  let {
    board, terrainAppearance = null, inkMap = null, tokens = [], fallen = [], mode = 'view', brush = null, highlights = [], dragPath = [], barred = null, anchored = null, shot = null, cast = null, selected = null, draggable = null, pickableEdges = [], fill = false, frozen = false,
    onhover, oncell, onedge, ontoken, onpaint, ondrop, ondrag, onwaypoint, onbrush, ontraydrop, ontrayhover, frameWithin,
  }: Props = $props();

  let container: HTMLDivElement;
  let view: BoardView | undefined = $state();
  let hoveredCell = $state<string | null>(null);
  const hoverTitle = $derived.by(() => {
    const unit = tokens.find((token) => token.cell === hoveredCell);
    if (!unit) return undefined;
    if (unit.kind === 'engine') return `${unit.name}${unit.loading ? `\n${unit.loading.label}` : ''}`;
    const bars = statusBars(unit.wounds, unit.disorder, unit.routed);
    return `${unit.name}\n${bars.health.label}\n${bars.morale.label}${unit.loading ? `\n${unit.engine}: ${unit.loading.label}` : ''}`;
  });

  export function centerOn(cell: string) { view?.centerOn(cell); }
  export function screenOf(cell: string) { return view?.screenOf(cell) ?? null; }
  export function cellRadius(cell: string) { return view?.cellRadius(cell) ?? null; }
  export function setRoute(id: string, cells: readonly string[]) { view?.setRoute(id, cells); }
  /** Plays a one-shot spell animation on `cell` — see `BoardView.burst`. */
  export function burst(cell: string, tree: Tree, from?: string | null) { view?.burst(cell, tree, from); }
  export function combatText(line: BoardCombatText) { view?.combatText(line); }
  export function remainingMs() { return view?.remainingMs() ?? 0; }
  export function clearEffects() { view?.clearEffects(); }
  export function zoomBy(factor: number, into?: Rect) { view?.zoomBy(factor, into); }
  export function frame(cells: readonly string[] | null, into?: Rect) { view?.frame(cells, into); }
  export function setGrid(settings: GridUpdate) { view?.setGrid(settings); }
  export function setBorders(visible: boolean) { view?.setBorders(visible); }

  function ownBoard() {
    const canvas = document.createElement('canvas');
    container.prepend(canvas);
    return { canvas, view: createBoardView(canvas, container, { onBrush: (b) => onbrush?.(b) }) };
  }

  let canvas: HTMLCanvasElement | undefined = $state();

  onMount(() => {
    const held = ownBoard();
    const target = held.view;
    canvas = held.canvas;
    view = target;
    // Interaction listens on the canvas, so it has to take focus for the brush keys; the same
    // element is the tray's drop target, since it already has an interactive role.
    held.canvas.tabIndex = 0;
    held.canvas.setAttribute('aria-label', 'Battle board');
    const cellUnder = (e: DragEvent) => target.cellAt(e.clientX, e.clientY) ?? null;
    const over = (e: DragEvent) => { if (!ontraydrop) return; e.preventDefault(); ontrayhover?.(cellUnder(e)); };
    const leave = () => ontrayhover?.(null);
    const drop = (e: DragEvent) => { if (!ontraydrop) return; e.preventDefault(); ontraydrop(cellUnder(e), e.dataTransfer); };
    held.canvas.addEventListener('dragover', over);
    held.canvas.addEventListener('dragleave', leave);
    held.canvas.addEventListener('drop', drop);
    const off = [
      target.on('hover', (e) => { hoveredCell = e.cell; onhover?.(e); }),
      target.on('cell', (e) => oncell?.(e)),
      target.on('edge', (e) => onedge?.(e)),
      target.on('token', (e) => ontoken?.(e)),
      target.on('paint', (e) => onpaint?.(e)),
      target.on('drop', (e) => ondrop?.(e)),
      target.on('drag', (e) => ondrag?.(e)),
      target.on('waypoint', (e) => onwaypoint?.(e)),
    ];
    return () => {
      for (const unsubscribe of off) unsubscribe();
      held.canvas.removeEventListener('dragover', over);
      held.canvas.removeEventListener('dragleave', leave);
      held.canvas.removeEventListener('drop', drop);
      target.destroy();
    };
  });

  $effect(() => { if (canvas) canvas.title = hoverTitle ?? ''; });

  // Stages hand these in through `{...view.board}`, and reading any spread prop reruns the whole
  // getter, so each one changes whenever anything on the board does — a card hover included.
  // A derived only passes on a real change: the board by identity (a paint stroke clones it),
  // the two appearances by content. Without this, every hover rebuilt the terrain textures.
  const shownBoard = $derived(board);
  const terrainKey = $derived(terrainAppearance ? JSON.stringify($state.snapshot(terrainAppearance)) : null);
  const inkKey = $derived(inkMap ? JSON.stringify($state.snapshot(inkMap)) : null);
  $effect(() => { view?.setBoard(shownBoard); });
  // Geometry changes need a fresh fit; painting and troop placement keep the player's zoom.
  const geometryKey = $derived(board ? `${board.grid}:${board.squares.length}` : null);
  $effect(() => {
    const target = view;
    const area = frameWithin;
    if (!target || !geometryKey || area === undefined) return;
    // Wait for the shell's measurements and the renderer's size to settle.
    const frame = requestAnimationFrame(() => {
      target.resize();
      target.frame(null, area ?? undefined);
    });
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    // Read every setting here: Pixi retains plain state and cannot subscribe to nested
    // Svelte mutations. Give it a fresh snapshot for each texture, scale, or tree edit.
    const appearance = terrainKey === null ? null : JSON.parse(terrainKey);
    const target = view;
    untrack(() => target?.setTerrainAppearance(appearance));
  });
  $effect(() => {
    const appearance = inkKey === null ? null : JSON.parse(inkKey);
    const target = view;
    untrack(() => target?.setInkMap(appearance));
  });
  $effect(() => { view?.setTokens(tokens); });
  $effect(() => { view?.setFallen(fallen); });
  $effect(() => { view?.setMode(mode); });
  $effect(() => { view?.setBrush(brush); });
  // One `setHighlight` call per known style, in a single effect: two independent effects
  // each clearing-then-setting the same style can race and clobber each other's wash.
  $effect(() => {
    if (!view) return;
    const byStyle = new Map(HIGHLIGHT_STYLES.map((s) => [s, [] as string[]]));
    // Groups union rather than replace: two callers may light the same style at once — an
    // armed action prop and an open popup both wash in `attack` — and the later group used to
    // wipe the earlier one's cells.
    for (const g of highlights) byStyle.get(g.style)!.push(...g.cells);
    for (const [style, cells] of byStyle) view.setHighlight(cells, style);
  });
  $effect(() => { view?.setDragPath(dragPath); });
  $effect(() => { view?.setBarred(barred); });
  $effect(() => { view?.setAnchored(anchored); });
  $effect(() => { view?.setShot(shot); });
  $effect(() => { view?.setCast(cast); });
  $effect(() => { view?.setSelected(selected); });
  $effect(() => { view?.setDraggable(draggable); });
  $effect(() => { view?.setPickableEdges(pickableEdges); });
  $effect(() => { view?.setFrozen(frozen); });
</script>

<div class="pixiboard" class:fill bind:this={container}>
  <HexInfo {board} cell={hoveredCell} {tokens} {fallen} />
</div>

<style>
  .pixiboard { width: 100%; max-width: 40rem; aspect-ratio: 1; margin: 0.75rem 0; }
  .pixiboard.fill { width: 100%; height: 100%; max-width: none; aspect-ratio: auto; margin: 0; }
  /* The canvas is made in script, so the scoped selector cannot reach it. */
  .pixiboard :global(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
  .pixiboard :global(canvas:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
