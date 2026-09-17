<script lang="ts">
  import { setTextureLab } from '../texture-lab.svelte.js';
  import { mapSettings, persistMapSettings } from '../map-style.svelte.js';
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

  // Each style keeps its grid settings alongside its terrain and outlines.
  const grid = $derived(mapSettings.style === 'ink' ? mapSettings.ink.grid : mapSettings.textures.grid);
  const toggleGrid = () => { grid.visible = !grid.visible; persistMapSettings(); };

  let settings: HTMLDialogElement | undefined = $state();
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
  <button class="rule" title={grid.visible ? 'Hide hex grid' : 'Show hex grid'} aria-label={grid.visible ? 'Hide hex grid' : 'Show hex grid'} aria-pressed={grid.visible} onclick={toggleGrid}>
    {#if grid.visible}
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4z" />
        <circle cx="8" cy="8" r="1.6" />
      </svg>
    {:else}
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.5 8.5s2.3-3 6.5-3 6.5 3 6.5 3M5 11.2l-.8 1.4M8 11.7V13M11 11.2l.8 1.4" />
      </svg>
    {/if}
  </button>
  <button title="Grid settings" aria-label="Grid settings" onclick={() => settings?.showModal()}>
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7L3.5 3.5" />
    </svg>
  </button>
  {#if import.meta.env.DEV}
    <button class="rule" title="Terrain texture lab" aria-label="Terrain texture lab" onclick={() => setTextureLab(true)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l5.6 3.2v6.6L8 14.5l-5.6-3.2V4.7zM2.4 4.7L8 8l5.6-3.3M8 8v6.5" /></svg>
    </button>
  {/if}
</div>

<dialog bind:this={settings} class="grid-settings">
  <h2>Hex grid</h2>
  <label>
    <input type="checkbox" bind:checked={grid.visible} onchange={persistMapSettings} />
    Show the reference grid
  </label>
  <label>
    Line weight
    <input type="range" min="0.5" max="2" step="0.5" bind:value={grid.width} oninput={persistMapSettings} />
    <span>{grid.width}px</span>
  </label>
  <button onclick={() => settings?.close()}>Done</button>
</dialog>

<style>
  /* Parked in the map's bottom-right corner, which moves when a dock or the strip does. */
  .mapcontrols {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: absolute;
    right: calc(var(--inset-right, 0px) + .85rem);
    bottom: calc(var(--inset-bottom, 0px) + .85rem);
    pointer-events: auto;
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

  .grid-settings {
    min-width: 15rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--rule);
    border-radius: 9px;
    background: var(--card);
    color: var(--ink);
    box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
  }
  .grid-settings::backdrop { background: rgba(0, 0, 0, .35); }
  .grid-settings h2 { margin: 0 0 .7rem; font-size: 1rem; }
  .grid-settings label {
    display: flex; align-items: center; gap: .5rem;
    font-size: .9rem; color: var(--muted);
    margin-bottom: .6rem;
  }
  .grid-settings label span { color: var(--ink); min-width: 2.4em; }
  .grid-settings > button { margin-top: .3rem; width: 100%; }
</style>
