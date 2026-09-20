<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The cell the offer is about. It only resets the drag: the popup sits in the corner. */
    cell: string;
    close: () => void;
    children: Snippet;
    appearance?: 'default' | 'cast' | 'rally' | 'shoot';
  }
  let { cell, close, children, appearance = 'default' }: Props = $props();

  let dx = $state(0);
  let dy = $state(0);
  let dragging = $state(false);
  // A fresh cell is a fresh popup, so it comes back to the corner.
  $effect(() => { void cell; dx = 0; dy = 0; });

  let from: { x: number; y: number; dx: number; dy: number } | null = null;

  function grab(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button, input, select, textarea, a')) return;
    from = { x: e.clientX, y: e.clientY, dx, dy };
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!from) return;
    dx = from.dx + e.clientX - from.x;
    dy = from.dy + e.clientY - from.y;
  }

  function drop() {
    from = null;
    dragging = false;
  }
</script>

<div
  role="dialog"
  aria-label="Action"
  tabindex="-1"
  class="board-popup"
  data-appearance={appearance}
  class:dragging
  style="transform: translate({dx}px, {dy}px)"
  onpointerdown={grab}
  onpointermove={move}
  onpointerup={drop}
  onpointercancel={drop}
>
  <button class="popup-close" aria-label="Close" title="Close" onclick={close}>×</button>
  {@render children()}
</div>

<style>
  .board-popup {
    position: absolute; z-index: 6; pointer-events: auto;
    top: calc(var(--inset-top, 0px) + .6rem);
    right: calc(var(--inset-right, 0px) + .6rem);
    min-width: 14rem; max-width: 22rem;
    max-height: calc(100% - var(--inset-top, 0px) - 1.2rem); overflow-y: auto;
    padding: .4rem; border-radius: 10px;
    background: var(--card); border: 1px solid var(--accent);
    box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
    font-size: .85rem;
    cursor: grab;
    touch-action: none;
  }
  .board-popup.dragging { cursor: grabbing; box-shadow: 0 10px 26px rgba(0, 0, 0, .45); }

  .board-popup[data-appearance='cast'] {
    --accent: #66539b;
    border: 3px double color-mix(in srgb, var(--accent) 65%, var(--rule));
    border-radius: 16px;
    background:
      radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 65%),
      var(--card);
  }
  .board-popup[data-appearance='rally'] {
    --accent: #87611d;
    border-radius: 3px 3px 10px 10px;
    border-top: 4px solid var(--accent);
    background: linear-gradient(110deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent), var(--card);
  }
  .board-popup[data-appearance='shoot'] {
    --accent: #66714b;
    border-radius: 4px;
    border-top: 2px solid var(--accent);
  }
  @media (prefers-color-scheme: dark) {
    .board-popup[data-appearance='cast'] { --accent: #b5a3e2; }
    .board-popup[data-appearance='rally'] { --accent: #d5b36e; }
    .board-popup[data-appearance='shoot'] { --accent: #b4bd93; }
  }

  .popup-close {
    position: absolute; top: .15rem; right: .2rem;
    width: 1.15rem; height: 1.15rem; padding: 0;
    display: flex; align-items: center; justify-content: center;
    border: 0; border-radius: 5px;
    background: transparent; color: var(--muted);
    font: inherit; font-size: 1rem; line-height: 1; cursor: pointer;
  }
  .popup-close:hover { background: var(--band); color: var(--ink); }
</style>
