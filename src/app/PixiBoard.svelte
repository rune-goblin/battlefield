<script lang="ts">
  import { onMount } from 'svelte';
  import { createBoardView, type BoardView } from '../board/index.js';
  import type { Board } from '../engine/index.js';

  interface Props {
    board: Board | null;
    // proto: TokenModel lands with TokenLayer in Wave 4; forwarded untyped until then.
    tokens?: unknown[];
  }
  let { board, tokens = [] }: Props = $props();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view: BoardView | undefined;

  onMount(() => {
    view = createBoardView(canvas, container);
    return () => view?.destroy();
  });

  $effect(() => { view?.setBoard(board); });
  $effect(() => { view?.setTokens(tokens); });
</script>

<div class="pixiboard" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .pixiboard { width: 100%; max-width: 40rem; aspect-ratio: 1; margin: 0.75rem 0; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
