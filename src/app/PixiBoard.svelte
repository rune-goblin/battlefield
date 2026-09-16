<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { TerrainAppearance } from '../board/terrain-textures.js';
  import {
    createBoardView, HIGHLIGHT_STYLES, type BoardEventOf, type BoardMode, type BoardView, type Brush,
    type TargetArrow, type GridUpdate, type HighlightStyle, type InkMapAppearance, type Rect, type TokenModel,
  } from '../board/index.js';
  import type { Board, Side, Tree } from '../engine/index.js';

  interface HighlightGroup { style: HighlightStyle; cells: string[] }

  interface Props {
    board: Board | null;
    terrainAppearance?: TerrainAppearance | null;
    /** The illustrated map, in place of the textured surfaces — see `BoardView.setInkMap`. */
    inkMap?: InkMapAppearance | null;
    tokens?: TokenModel[];
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
    /** The board answers nothing while something else is the menu — see `BoardView.setFrozen`. */
    frozen?: boolean;
    onhover?: (event: BoardEventOf<'hover'>) => void;
    oncell?: (event: BoardEventOf<'cell'>) => void;
    onedge?: (event: BoardEventOf<'edge'>) => void;
    ontoken?: (event: BoardEventOf<'token'>) => void;
    onpaint?: (event: BoardEventOf<'paint'>) => void;
    ondrop?: (event: BoardEventOf<'drop'>) => void;
    ondrag?: (event: BoardEventOf<'drag'>) => void;
    onbrush?: (brush: Brush | null) => void;
    /** A native drag (e.g. a tray item) released over the canvas; `cell` is null outside the grid. */
    ontraydrop?: (cell: string | null, data: DataTransfer | null) => void;
  }
  let {
    board, terrainAppearance = null, inkMap = null, tokens = [], mode = 'view', brush = null, highlights = [], dragPath = [], barred = null, anchored = null, shot = null, cast = null, selected = null, draggable = null, pickableEdges = [], fill = false, frozen = false,
    onhover, oncell, onedge, ontoken, onpaint, ondrop, ondrag, onbrush, ontraydrop,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view: BoardView | undefined = $state();

  export function centerOn(cell: string) { view?.centerOn(cell); }
  export function screenOf(cell: string) { return view?.screenOf(cell) ?? null; }
  export function cellRadius(cell: string) { return view?.cellRadius(cell) ?? null; }
  export function setRoute(id: string, cells: readonly string[]) { view?.setRoute(id, cells); }
  /** Plays a one-shot spell animation on `cell` — see `BoardView.burst`. */
  export function burst(cell: string, tree: Tree, from?: string | null) { view?.burst(cell, tree, from); }
  export function zoomBy(factor: number, into?: Rect) { view?.zoomBy(factor, into); }
  export function frame(cells: readonly string[] | null, into?: Rect) { view?.frame(cells, into); }
  export function setGrid(settings: GridUpdate) { view?.setGrid(settings); }
  export function setBorders(visible: boolean) { view?.setBorders(visible); }

  onMount(() => {
    view = createBoardView(canvas, container, { onBrush: (b) => onbrush?.(b) });
    const off = [
      view.on('hover', (e) => onhover?.(e)),
      view.on('cell', (e) => oncell?.(e)),
      view.on('edge', (e) => onedge?.(e)),
      view.on('token', (e) => ontoken?.(e)),
      view.on('paint', (e) => onpaint?.(e)),
      view.on('drop', (e) => ondrop?.(e)),
      view.on('drag', (e) => ondrag?.(e)),
    ];
    return () => {
      for (const unsubscribe of off) unsubscribe();
      view?.destroy();
    };
  });

  $effect(() => { view?.setBoard(board); });
  $effect(() => {
    // Read every setting here: Pixi retains plain state and cannot subscribe to nested
    // Svelte mutations. Give it a fresh snapshot for each texture, scale, or tree edit.
    const appearance = terrainAppearance ? $state.snapshot(terrainAppearance) : null;
    const target = view;
    untrack(() => target?.setTerrainAppearance(appearance));
  });
  $effect(() => {
    const appearance = inkMap ? $state.snapshot(inkMap) : null;
    const target = view;
    untrack(() => target?.setInkMap(appearance));
  });
  $effect(() => { view?.setTokens(tokens); });
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
  <!-- Interaction listens on this element, so it has to take focus for the brush keys; the
       same element is the tray's drop target, since it already has an interactive role. -->
  <canvas
    bind:this={canvas}
    tabindex="0"
    aria-label="Battle board"
    ondragover={ontraydrop && ((e) => e.preventDefault())}
    ondrop={ontraydrop && ((e) => { e.preventDefault(); ontraydrop(view?.cellAt(e.clientX, e.clientY) ?? null, e.dataTransfer); })}
  ></canvas>
</div>

<style>
  .pixiboard { width: 100%; max-width: 40rem; aspect-ratio: 1; margin: 0.75rem 0; }
  .pixiboard.fill { width: 100%; height: 100%; max-width: none; aspect-ratio: auto; margin: 0; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  canvas:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
