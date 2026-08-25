<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createBoardView, HIGHLIGHT_STYLES, type BoardEventOf, type BoardMode, type BoardView, type Brush,
    type HighlightStyle, type TokenModel,
  } from '../board/index.js';
  import type { Board } from '../engine/index.js';

  interface HighlightGroup { style: HighlightStyle; cells: string[] }

  interface Props {
    board: Board | null;
    tokens?: TokenModel[];
    mode?: BoardMode;
    brush?: Brush | null;
    /** One cell set per style; a style missing from the list is cleared. */
    highlights?: HighlightGroup[];
    /** The token-drag path trace, unit's own cell first — see `BoardView.setDragPath`. */
    dragPath?: string[];
    selected?: string | null;
    /** In battle mode, the only token a press may pick up. Place mode ignores this. */
    draggable?: string | null;
    /** Full-bleed: fills its container instead of sitting in a capped, square-ish column. */
    fill?: boolean;
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
    board, tokens = [], mode = 'view', brush = null, highlights = [], dragPath = [], selected = null, draggable = null, fill = false,
    onhover, oncell, onedge, ontoken, onpaint, ondrop, ondrag, onbrush, ontraydrop,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view: BoardView | undefined;

  export function centerOn(cell: string) { view?.centerOn(cell); }

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
  $effect(() => { view?.setTokens(tokens); });
  $effect(() => { view?.setMode(mode); });
  $effect(() => { view?.setBrush(brush); });
  // One `setHighlight` call per known style, in a single effect: two independent effects
  // each clearing-then-setting the same style can race and clobber each other's wash.
  $effect(() => {
    if (!view) return;
    const byStyle = new Map(HIGHLIGHT_STYLES.map((s) => [s, [] as string[]]));
    for (const g of highlights) byStyle.set(g.style, g.cells);
    for (const [style, cells] of byStyle) view.setHighlight(cells, style);
  });
  $effect(() => { view?.setDragPath(dragPath); });
  $effect(() => { view?.setSelected(selected); });
  $effect(() => { view?.setDraggable(draggable); });
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
