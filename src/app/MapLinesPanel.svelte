<script lang="ts">
  import LchColour from './LchColour.svelte';
  import type { ElevationLines, MapLine } from '../board/index.js';

  interface Props {
    /** The outline around each terrain area. */
    area: MapLine;
    /** The ring around ground standing at each height. */
    elevation: ElevationLines;
    /** One weight for every hex, whatever its height. */
    grid: MapLine;
    /** Prefix for control ids, so both styles' panels can be on the page at once. */
    id: string;
  }
  let { area = $bindable(), elevation = $bindable(), grid = $bindable(), id }: Props = $props();

  const LEVELS = [
    { key: 'level1', label: 'Level ±1', note: 'One step up, or one down' },
    { key: 'level2', label: 'Level ±2', note: 'Two steps or more' },
  ] as const;
</script>

{#snippet dials(line: MapLine, key: string)}
  <label class="slider" for="{key}-width"><span>Thickness</span><output>{line.width.toFixed(2)} px</output></label>
  <input id="{key}-width" type="range" min="0" max="8" step="0.25" bind:value={line.width} disabled={!line.visible} />
  <label class="slider" for="{key}-opacity"><span>Opacity</span><output>{Math.round(line.opacity * 100)}%</output></label>
  <input id="{key}-opacity" type="range" min="0" max="1" step="0.01" bind:value={line.opacity} disabled={!line.visible} />
  <LchColour label="Colour" id="{key}-colour" bind:value={line.colour} />
{/snippet}

<p class="eyebrow">Every line over the map</p>
<p class="description">All three are drawn above the board — terrain, walls and pieces included — so a line never disappears under whatever is standing on it.</p>

<section aria-label="Terrain area outlines">
  <div class="section-title"><h2>Terrain areas</h2><span>Around the whole patch</span></div>
  <label class="check"><input type="checkbox" bind:checked={area.visible} /> Outline terrain areas</label>
  <p class="description">One line around a wood, not around each of its hexes. Two areas share their border, so it is drawn once and comes out the same weight as an area's edge against open board.</p>
  {@render dials(area, `${id}-area`)}
</section>

<section aria-label="Elevation outlines">
  <div class="section-title"><h2>Elevation</h2><span>Around ground at a height</span></div>
  <p class="description">The same ring as a terrain area, drawn around every hex standing at one height — the whole shelf, not the stretches where it happens to meet lower ground. A mesa inside a shelf leaves a hole in the shelf's ring, so the two steps read as two.</p>
  {#each LEVELS as level (level.key)}
    <div class="level">
      <div class="section-title"><h3>{level.label}</h3><span>{level.note}</span></div>
      <label class="check"><input type="checkbox" bind:checked={elevation[level.key].visible} /> Ring this height</label>
      {@render dials(elevation[level.key], `${id}-${level.key}`)}
    </div>
  {/each}
</section>

<section aria-label="Hex grid">
  <div class="section-title"><h2>Hex grid</h2><span>Reference outline</span></div>
  <label class="check"><input type="checkbox" bind:checked={grid.visible} /> Show the hex grid</label>
  <p class="description">One weight for every hex on the board. Height has its own rings above, so the grid has nothing to say about it.</p>
  {@render dials(grid, `${id}-grid`)}
</section>

<style>
  .eyebrow { font: 600 var(--type-small)/var(--leading-compact) var(--sans); color: var(--muted); margin: 0 0 .6rem; }
  section { border-top: 1px solid var(--rule); margin-top: 1.2rem; padding-top: 1rem; }
  .section-title { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  h2 { border: 0; margin: 0; padding: 0; }
  h3 { font-size: var(--type-body); margin: 0; }
  .section-title span { font-size: var(--type-small); color: var(--muted); }
  .level { border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); margin-top: 1rem; padding-top: .8rem; }
  .description { margin: .4rem 0 .9rem; color: var(--muted); font-size: var(--type-small); }
  .slider { display: flex; justify-content: space-between; width: 100%; font-size: var(--type-body); }
  output { font-variant-numeric: tabular-nums; color: var(--accent); }
  input[type=range] { display: block; width: 100%; padding: 0; margin: .5rem 0 .65rem; accent-color: var(--accent); }
  .check { display: flex; align-items: center; gap: .4rem; margin: .7rem 0 .2rem; font-size: var(--type-body); }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
