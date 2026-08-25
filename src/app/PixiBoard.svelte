<script lang="ts">
  import { onMount } from 'svelte';
  import { createBoardView, type BoardEventOf, type BoardMode, type BoardView, type Brush, type HighlightStyle, type TokenModel } from '../board/index.js';
  import type { Board } from '../engine/index.js';

  interface Props {
    board: Board | null;
    tokens?: TokenModel[];
    mode?: BoardMode;
    brush?: Brush | null;
    highlight?: string[];
    highlightStyle?: HighlightStyle;
    selected?: string | null;
    /** Full-bleed: fills its container instead of sitting in a capped, square-ish column. */
    fill?: boolean;
    onhover?: (event: BoardEventOf<'hover'>) => void;
    oncell?: (event: BoardEventOf<'cell'>) => void;
    onedge?: (event: BoardEventOf<'edge'>) => void;
    ontoken?: (event: BoardEventOf<'token'>) => void;
    onpaint?: (event: BoardEventOf<'paint'>) => void;
    ondrop?: (event: BoardEventOf<'drop'>) => void;
    onbrush?: (brush: Brush | null) => void;
    /** A native drag (e.g. a tray item) released over the canvas; `cell` is null outside the grid. */
    ontraydrop?: (cell: string | null, data: DataTransfer | null) => void;
  }
  let {
    board, tokens = [], mode = 'view', brush = null, highlight = [], highlightStyle = 'deploy', selected = null, fill = false,
    onhover, oncell, onedge, ontoken, onpaint, ondrop, onbrush, ontraydrop,
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
  $effect(() => { view?.setHighlight(highlight, highlightStyle); });
  $effect(() => { view?.setSelected(selected); });
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
