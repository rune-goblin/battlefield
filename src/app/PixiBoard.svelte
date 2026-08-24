<script lang="ts">
  import { onMount } from 'svelte';
  import { createBoardView, type BoardEventOf, type BoardMode, type BoardView, type Brush } from '../board/index.js';
  import type { Board } from '../engine/index.js';

  interface Props {
    board: Board | null;
    // proto: TokenModel lands with TokenLayer in Wave 4; forwarded untyped until then.
    tokens?: unknown[];
    mode?: BoardMode;
    brush?: Brush | null;
    onhover?: (event: BoardEventOf<'hover'>) => void;
    oncell?: (event: BoardEventOf<'cell'>) => void;
    onedge?: (event: BoardEventOf<'edge'>) => void;
    ontoken?: (event: BoardEventOf<'token'>) => void;
    onpaint?: (event: BoardEventOf<'paint'>) => void;
    ondrop?: (event: BoardEventOf<'drop'>) => void;
    onbrush?: (brush: Brush | null) => void;
  }
  let {
    board, tokens = [], mode = 'view', brush = null,
    onhover, oncell, onedge, ontoken, onpaint, ondrop, onbrush,
  }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view: BoardView | undefined;

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
</script>

<div class="pixiboard" bind:this={container}>
  <!-- Interaction listens on this element, so it has to take focus for the brush keys. -->
  <canvas bind:this={canvas} tabindex="0" aria-label="Battle board"></canvas>
</div>

<style>
  .pixiboard { width: 100%; max-width: 40rem; aspect-ratio: 1; margin: 0.75rem 0; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  canvas:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
