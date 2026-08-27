<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The anchor, in CSS pixels inside the board container. */
    x: number;
    y: number;
    children: Snippet;
  }
  let { x, y, children }: Props = $props();

  // The gap the tail spans, matching the transform below.
  const TAIL_ROOM = 44;

  // Above the cell, unless it would overflow the top of the board. Measured rather than
  // guessed: the popup's height depends on how many rows and dials the offer has.
  let height = $state(0);
  const below = $derived(y - height < TAIL_ROOM);
</script>

<div class="board-popup" class:below style="left: {x}px; top: {y}px" bind:clientHeight={height}>
  {@render children()}
</div>

<style>
  .board-popup {
    position: absolute; z-index: 6;
    transform: translate(-50%, calc(-100% - 2.2rem));
    min-width: 14rem; max-width: 22rem;
    padding: .4rem; border-radius: 10px;
    background: var(--card); border: 1px solid var(--accent);
    box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
    font-size: .85rem;
  }
  .board-popup.below { transform: translate(-50%, 2.2rem); }

  /* The tail points back at the cell the popup is talking about. */
  .board-popup::after {
    content: ''; position: absolute; left: 50%; margin-left: -6px;
    border: 6px solid transparent;
  }
  .board-popup:not(.below)::after { top: 100%; border-top-color: var(--accent); }
  .board-popup.below::after { bottom: 100%; border-bottom-color: var(--accent); }
</style>
