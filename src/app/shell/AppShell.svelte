<script lang="ts">
  import type { Snippet } from 'svelte';
  import Dock from './Dock.svelte';
  import { withinApp } from '../app-root.js';
  import { setDock, ui } from './layout.svelte.js';

  interface Props {
    /** The map. One full-bleed canvas under everything else; nothing here resizes it. */
    map: Snippet;
    /** Anchored to board coordinates — action popups, drag readouts, other players' pings.
     * The layer ignores the pointer; a child that wants it says so. */
    pin?: Snippet;
    top?: Snippet;
    bottom?: Snippet;
    left?: Snippet;
    right?: Snippet;
    leftTitle?: string;
    rightTitle?: string;
    leftWidth?: number;
    rightWidth?: number;
    /** Free-floating windows above the docks. */
    float?: Snippet;
    /** Blocking dialogs. Takes the whole screen and the pointer with it. */
    modal?: Snippet;
  }
  let {
    map, pin, top, bottom, left, right,
    leftTitle = 'Panel', rightTitle = 'Panel', leftWidth = 25, rightWidth = 24,
    float, modal,
  }: Props = $props();

  let leftW = $state(0);
  let rightW = $state(0);
  let topH = $state(0);
  let bottomH = $state(0);

  // [ and ] walk one dock through open → rail → hidden → open. The board's own keys are
  // letters and digits, and a field with focus keeps everything it is given.
  const CYCLE = { open: 'rail', rail: 'hidden', hidden: 'open' } as const;
  function onKey(e: KeyboardEvent) {
    if (!withinApp(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
    const side = e.key === '[' ? 'left' : e.key === ']' ? 'right' : null;
    if (!side || !ui.has[side]) return;
    e.preventDefault();
    setDock(side, CYCLE[ui.dock[side]]);
  }

  $effect(() => { ui.chrome = { left: leftW, right: rightW, top: topH, bottom: bottomH }; });

  // Which docks this stage offers at all, so the top bar's toggles can grey out the ones
  // with nothing behind them. Not persisted: it is a fact about the stage, not a preference.
  $effect(() => { ui.has = { left: !!left, right: !!right }; });
</script>

<svelte:window onkeydown={onKey} />

<!-- The chrome measures itself and publishes what it covers as CSS variables. The board is
     never told: it fills the canvas and stays where it is. This is only so that a corner-parked
     overlay picks the map's free corner instead of opening behind a dock. -->
<div
  class="shell"
  style="--inset-top:{topH}px; --inset-bottom:{bottomH}px; --inset-left:{leftW}px; --inset-right:{rightW}px"
>
  <div class="layer map">{@render map()}</div>

  <div class="layer pin">{#if pin}{@render pin()}{/if}</div>

  <div class="layer chrome">
    {#if top}<header class="bar top" bind:clientHeight={topH}>{@render top()}</header>{:else}<div></div>{/if}
    <div class="mid">
      <div class="slot" bind:clientWidth={leftW}>
        {#if left}<Dock side="left" title={leftTitle} width={leftWidth}>{@render left()}</Dock>{/if}
      </div>
      <!-- The docks run floor to ceiling; a bottom bar belongs to the map between them, not
           under them, so it lives in this column rather than in the shell's own last row. -->
      <div class="centre">
        <div class="gap"></div>
        {#if bottom}<footer class="bar bottom" bind:clientHeight={bottomH}>{@render bottom()}</footer>{/if}
      </div>
      <div class="slot" bind:clientWidth={rightW}>
        {#if right}<Dock side="right" title={rightTitle} width={rightWidth}>{@render right()}</Dock>{/if}
      </div>
    </div>
  </div>

  {#if float}<div class="layer float">{@render float()}</div>{/if}
  {#if modal}<div class="layer modal">{@render modal()}</div>{/if}
</div>

<style>
  .shell { position: fixed; inset: 0; overflow: hidden; background: var(--paper); color: var(--ink); }
  .layer { position: absolute; inset: 0; }
  .map { z-index: 0; }
  .pin { z-index: 1; pointer-events: none; }
  .chrome { z-index: 2; display: grid; grid-template-rows: auto minmax(0, 1fr); pointer-events: none; }
  .float { z-index: 3; pointer-events: none; }
  .modal { z-index: 4; }

  .bar { pointer-events: auto; background: color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter: blur(6px); }
  .bar.top { border-bottom: 1px solid var(--rule); }
  .bar.bottom { border-top: 1px solid var(--rule); }

  .mid { display: flex; min-height: 0; }
  .slot { display: flex; min-height: 0; }
  .centre { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .gap { flex: 1; min-height: 0; }
</style>
