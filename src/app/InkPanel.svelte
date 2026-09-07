<script lang="ts">
  import LchColour from './LchColour.svelte';
  import MapLinesPanel from './MapLinesPanel.svelte';
  import { defaultInkSettings, type InkMapSettings } from '../board/ink-map.js';
  import { TERRAIN_GROUPS, TERRAIN_LABELS, type TerrainGroup } from '../board/terrain-textures.js';

  interface Props {
    settings: InkMapSettings;
    selected: TerrainGroup;
    elevationLevel: number | null;
    count: number;
  }
  let { settings = $bindable(), selected = $bindable(), elevationLevel = $bindable(), count }: Props = $props();

  // Which terrain the pencil library actually draws. Water, shallows and settlement have no
  // art in it, and are carried by their wash alone.
  const DRAWN: TerrainGroup[] = ['plains', 'desert', 'forest', 'swamp', 'hills', 'mountain'];
  const ELEVATION_LEVELS = [2, 1, 0, -1, -2];
  let tab = $state<'terrain' | 'global' | 'lines'>('terrain');
</script>

<div class="tabs" role="tablist" aria-label="Illustrated map settings">
  <button role="tab" id="ink-tab-terrain" aria-controls="ink-panel" aria-selected={tab === 'terrain'} class:active={tab === 'terrain'} onclick={() => tab = 'terrain'}>Terrain</button>
  <button role="tab" id="ink-tab-lines" aria-controls="ink-panel" aria-selected={tab === 'lines'} class:active={tab === 'lines'} onclick={() => tab = 'lines'}>Lines</button>
  <button role="tab" id="ink-tab-global" aria-controls="ink-panel" aria-selected={tab === 'global'} class:active={tab === 'global'} onclick={() => tab = 'global'}>Global</button>
</div>
<div id="ink-panel" role="tabpanel" aria-labelledby="ink-tab-{tab}">
{#if tab === 'terrain'}
  <p class="eyebrow">Colour and drawing per terrain</p>
  <nav aria-label="Terrain types">
    {#each TERRAIN_GROUPS as group}
      <button class:active={selected === group} aria-pressed={selected === group} onclick={() => selected = group}>{TERRAIN_LABELS[group]}</button>
    {/each}
  </nav>
  <div class="section-title"><h2>{TERRAIN_LABELS[selected]}</h2><span>{count} sample hexes</span></div>
  <LchColour label="Wash colour" id="ink-colour-{selected}" bind:value={settings.terrains[selected].colour} />
  <p class="description">The hex's own hue, printed onto the paper at the wash strength every terrain shares. Lightness and chroma are the two that matter here: the wash has to sit under a pencil drawing without competing with it.</p>
  {#if DRAWN.includes(selected)}
    <label class="slider" for="ink-scale-{selected}"><span>Drawing size</span><output>{settings.terrains[selected].scale.toFixed(2)}×</output></label>
    <input id="ink-scale-{selected}" type="range" min="0.2" max="2.5" step="0.05" bind:value={settings.terrains[selected].scale} />
    <p class="description">Sixteen pencil variants; each hex keeps the one its own coordinate draws. This size multiplies the pencil's own, so one terrain can stand taller than the rest without moving the whole board.</p>
  {:else}
    <div class="no-art">No pencil art — this terrain reads by its colour alone.</div>
  {/if}
{:else if tab === 'lines'}
  <MapLinesPanel id="ink" bind:area={settings.area} bind:elevation={settings.elevation} bind:grid={settings.grid} />
{:else}
  <p class="eyebrow">Shared by the whole map</p>
  <section aria-label="Paper and wash">
    <div class="section-title"><h2>Paper &amp; wash</h2><span>The ground under the ink</span></div>
    <LchColour label="Paper" id="ink-paper" bind:value={settings.paper} />
    <label class="slider" for="ink-wash"><span>Wash strength</span><output>{Math.round(settings.wash * 100)}%</output></label>
    <input id="ink-wash" type="range" min="0" max="1" step="0.01" bind:value={settings.wash} />
    <label class="slider" for="ink-variation"><span>Hex-to-hex variation</span><output>±{Math.round(settings.variation * 100)}%</output></label>
    <input id="ink-variation" type="range" min="0" max="0.4" step="0.01" bind:value={settings.variation} />
    <p class="description">Each hex draws its own shade once, so a run of one terrain is not a flat plate.</p>
  </section>
  <section aria-label="Pencil settings">
    <div class="section-title"><h2>Pencil</h2><span>Every drawing on the board</span></div>
    <LchColour label="Ink colour" id="ink-colour" bind:value={settings.ink.colour} />
    <label class="slider" for="ink-opacity"><span>Weight</span><output>{Math.round(settings.ink.opacity * 100)}%</output></label>
    <input id="ink-opacity" type="range" min="0" max="1" step="0.01" bind:value={settings.ink.opacity} />
    <label class="slider" for="ink-size"><span>Size</span><output>{settings.ink.scale.toFixed(2)} hex</output></label>
    <input id="ink-size" type="range" min="0.2" max="2" step="0.05" bind:value={settings.ink.scale} />
    <label class="slider" for="ink-size-variation"><span>Size variation</span><output>±{Math.round(settings.ink.variation * 100)}%</output></label>
    <input id="ink-size-variation" type="range" min="0" max="1" step="0.01" bind:value={settings.ink.variation} />
    <label class="slider" for="ink-jitter"><span>Wander</span><output>{settings.ink.jitter.toFixed(2)} hex</output></label>
    <input id="ink-jitter" type="range" min="0" max="0.5" step="0.01" bind:value={settings.ink.jitter} />
    <label class="slider" for="ink-lift"><span>Lift</span><output>{settings.ink.lift.toFixed(2)} hex</output></label>
    <input id="ink-lift" type="range" min="-0.4" max="0.4" step="0.01" bind:value={settings.ink.lift} />
    <p class="description">The ink is a tint over an alpha stencil, so the whole map is one pass whatever colour it is set to. Lift raises a drawing off its hex, which puts a peak in front of the ground behind it.</p>
  </section>
  <section aria-label="Elevation brush">
    <div class="section-title"><h2>Elevation</h2><span>What makes hills and mountains</span></div>
    <div class="levels" role="group" aria-label="Elevation brush">
      {#each ELEVATION_LEVELS as level}
        <button class:active={elevationLevel === level} aria-pressed={elevationLevel === level}
          onclick={() => elevationLevel = elevationLevel === level ? null : level}>{level > 0 ? `+${level}` : level < 0 ? `−${-level}` : '0'}</button>
      {/each}
    </div>
    <p class="description">Height is the terrain here: a hex at +1 draws hills, at +2 mountains. The illustrated map leaves the wash off and lets the drawing say how high the ground is; the Lines tab can ring a height if the drawing is not enough.</p>
  </section>
{/if}
</div>
<footer><button onclick={() => settings = defaultInkSettings()}>Reset illustrated map</button></footer>

<style>
  .tabs { display: flex; gap: .35rem; margin-bottom: 1rem; }
  .tabs button { flex: 1; padding: .35rem .5rem; font-size: .85rem; }
  .tabs button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  .eyebrow { font: 600 .65rem/1.4 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin: 0 0 .6rem; }
  nav { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: 1.4rem; }
  nav button { padding: .25rem .5rem; font-size: .8rem; }
  nav button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  section { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  .section-title { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  h2 { border: 0; margin: 0; padding: 0; }
  .section-title span { font-size: .75rem; color: var(--muted); }
  .description { margin: .4rem 0 .9rem; color: var(--muted); font-size: .8rem; }
  .slider { display: flex; justify-content: space-between; width: 100%; font-size: .85rem; }
  output { font-variant-numeric: tabular-nums; color: var(--accent); }
  input[type=range] { display: block; width: 100%; padding: 0; margin: .5rem 0 .65rem; accent-color: var(--accent); }
  .no-art { background: var(--band); color: var(--muted); font-size: .8rem; border-radius: 7px; padding: .8rem; }
  .levels { display: flex; gap: .35rem; margin: .7rem 0 0; }
  .levels button { flex: 1; padding: .25rem .4rem; font-size: .8rem; font-variant-numeric: tabular-nums; }
  .levels button.active { color: var(--paper); background: var(--accent); border-color: var(--accent); }
  footer { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  footer button { font-size: .8rem; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
