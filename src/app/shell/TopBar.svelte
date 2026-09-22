<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MAP_STYLES, MAP_STYLE_LABELS, mapSettings, setMapStyle } from '../map-style.svelte.js';
  import SaveLoadPanel from '../SaveLoadPanel.svelte';
  import SeatingPanel from '../SeatingPanel.svelte';
  import { setDock, toggleDock, ui } from './layout.svelte.js';
  import { tableCalled, tableSummons } from '../game.svelte.js';
  import { viewer } from '../viewer.svelte.js';
  import { assetUrl } from '../../board/asset-base.js';

  interface Props {
    /** Stage-specific readout, left of centre: round and turn in battle, the deploy note in
     * a placement stage. */
    status?: Snippet;
    /** Stage-specific controls, right of centre, before the dock toggles. */
    tools?: Snippet;
  }
  let { status, tools }: Props = $props();

  const table = $derived(viewer.isGm ? tableSummons() : null);
  const called = $derived(tableCalled());
</script>

<div class="topbar">
  <h1>Battlefield</h1>
  {#if status}<div class="status">{@render status()}</div>{/if}
  <div class="tools">
    {#if tools}{@render tools()}{/if}
    <div class="styles" role="group" aria-label="Map style">
      <span class="style-label">Map</span>
      {#each MAP_STYLES as style (style)}
        <button
          class:on={mapSettings.style === style}
          aria-pressed={mapSettings.style === style}
          title="Draw the map in the {MAP_STYLE_LABELS[style].toLowerCase()} style"
          onclick={() => setMapStyle(style)}
        >{MAP_STYLE_LABELS[style]}</button>
      {/each}
    </div>
    <div class="docks">
      {#each ['left', 'right'] as const as side (side)}
        <button
          class="dockbtn {side}"
          class:on={ui.has[side] && ui.dock[side] !== 'hidden'}
          disabled={!ui.has[side]}
          title={ui.has[side] ? `${ui.dock[side] === 'hidden' ? 'Show' : 'Hide'} the ${side} panel (${side === 'left' ? '[' : ']'}) · double-click to collapse it to a strip` : `No ${side} panel here`}
          aria-label="Toggle the {side} panel"
          onclick={() => toggleDock(side)}
          ondblclick={() => setDock(side, 'rail')}
        ></button>
      {/each}
    </div>
    {#if table}
      <button
        title={called ? 'Shut the battle window on every player\'s client' : 'Open the battle window on every player\'s client'}
        onclick={() => void (called ? table.dismiss() : table.call())}
      >{called ? 'Dismiss players' : 'Call players'}</button>
    {/if}
    <SeatingPanel />
    <SaveLoadPanel />
    <nav>
      <!-- The labs are otherwise reachable only by typing the query param. Both read it once
           on load, so these are real navigations; the game survives one through localStorage. -->
      {#if import.meta.env.DEV}
        <a href="?textures" title="Terrain texture lab">Textures</a>
        <a href="?vfx" title="Spell effect gallery">Effects</a>
      {/if}
      <a href={assetUrl('rules.html')} target="_blank" rel="noopener">Rules</a>
      <a href="https://github.com/rune-goblin/battlefield" target="_blank" rel="noopener">Source</a>
    </nav>
  </div>
</div>

<style>
  .topbar { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem .9rem; padding: .3rem .8rem; }
  h1 { flex: none; font-size: 1.05rem; }
  /* One line, and the first thing to give when the bar runs out of room — the panels and the
     board say the same things at more length. */
  .status { min-width: 0; font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { flex: 0 1 auto; max-width: 100%; margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .6rem; }
  .tools :global(button) { white-space: nowrap; }
  nav { display: flex; }
  nav a { color: var(--muted); font-size: .82rem; margin-left: .7rem; }
  nav a:hover { color: var(--ink); }

  /* The two styles share a border; the active style fills its segment. */
  .styles { display: flex; align-items: center; }
  .style-label { margin-right: .4rem; font-size: .78rem; color: var(--muted); }
  .styles button {
    padding: .15rem .5rem; font-size: .78rem; border-radius: 0;
    color: var(--muted); background: none;
  }
  .styles button:first-of-type { border-radius: 4px 0 0 4px; }
  .styles button:last-child { border-radius: 0 4px 4px 0; }
  .styles button + button { border-left-width: 0; }
  .styles button:hover { color: var(--ink); }
  .styles button.on { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  /* The filled segment owns the border it shares with the segment after it. */
  .styles button.on + button { border-left: 1px solid var(--accent); }

  /* Two little page glyphs: a filled edge is a panel that is showing. */
  .docks { display: flex; gap: .25rem; }
  .dockbtn {
    width: 1.5rem; height: 1.15rem; padding: 0; border-radius: 3px;
    background: linear-gradient(to var(--to), var(--rule) 0 34%, transparent 34%);
  }
  .dockbtn.left { --to: right; }
  .dockbtn.right { --to: left; }
  .dockbtn.on { border-color: var(--accent); background: linear-gradient(to var(--to), var(--accent) 0 34%, transparent 34%); }
  .dockbtn:disabled { opacity: .3; }
</style>
