<script lang="ts">
  import type PixiBoard from '../PixiBoard.svelte';
  import { visibleRect } from './layout.svelte.js';

  interface Props {
    board: PixiBoard | undefined;
    /** The cells "my army" covers, for the last button. Given none, the button is not there —
     * the board stages have no army to frame. */
    army?: () => string[];
    armyLabel?: string;
  }
  let { board, army, armyLabel = 'Frame my army' }: Props = $props();

  // One notch of the wheel, near enough: the button and the wheel should not feel like two
  // different zooms.
  const STEP = 1.3;

  const cells = $derived(army?.() ?? []);

  // Every command aims at the visible map, not the canvas: press "frame everything" with the
  // orders panel open and the board lands beside it, not under it. Nothing is re-framed when
  // a panel opens — only when the player asks.
  const zoom = (factor: number) => board?.zoomBy(factor, visibleRect());
  const frame = (of: string[] | null) => board?.frame(of, visibleRect());
</script>

<div class="mapcontrols">
  <button title="Zoom in" aria-label="Zoom in" onclick={() => zoom(STEP)}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
  </button>
  <button title="Zoom out" aria-label="Zoom out" onclick={() => zoom(1 / STEP)}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
  </button>
  <button class="rule" title="Frame the whole board" aria-label="Frame the whole board" onclick={() => frame(null)}>
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    </svg>
  </button>
  {#if army}
    <button title={armyLabel} aria-label={armyLabel} disabled={!cells.length} onclick={() => frame(cells)}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4.5 13.5v-11l7 1.6v4.4l-7-1.6" />
      </svg>
    </button>
  {/if}
</div>

<style>
  /* Parked in the map's bottom-right corner, which moves when a dock or the strip does. */
  .mapcontrols {
    position: absolute;
    right: calc(var(--inset-right, 0px) + .85rem);
    bottom: calc(var(--inset-bottom, 0px) + .85rem);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--rule);
    border-radius: 9px;
    background: color-mix(in srgb, var(--card) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 3px 12px rgba(0, 0, 0, .3);
    transition: right .18s ease, bottom .18s ease;
  }

  button {
    width: 2.1rem; height: 2.1rem; padding: 0;
    display: grid; place-items: center;
    border: 0; border-radius: 0; background: none; color: var(--muted);
  }
  button:hover:not(:disabled) { background: var(--band); color: var(--ink); }
  button + button { border-top: 1px solid color-mix(in srgb, var(--rule) 60%, transparent); }
  /* The two zooms are one control; framing is another. */
  button.rule { border-top-width: 3px; border-top-style: double; }

  svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
</style>
