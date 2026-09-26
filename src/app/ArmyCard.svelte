<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Side } from '../engine/index.js';
  import { ARMY_TITLE, sideColour } from './presentation.js';

  interface Props {
    side: Side;
    edit?: Snippet;
    children: Snippet;
  }
  let { side, edit, children }: Props = $props();
</script>

<section class="card army-card" style:--side={sideColour(side)}>
  <header>
    <h3>{ARMY_TITLE[side]}</h3>
    {@render edit?.()}
  </header>
  {@render children()}
</section>

<style>
  .army-card { border-left: 4px solid var(--side); }
  header { display: flex; align-items: baseline; gap: .5rem; }
  h3 { flex: 1; margin: 0; color: var(--side); }

  .army-card :global(.line) { margin: .3rem 0 0; font-size: var(--type-body); color: var(--muted); }
  .army-card :global(.problem) { margin: .4rem 0 0; font-size: var(--type-body); color: var(--bad); font-weight: 600; }

  .army-card :global(ul) { list-style: none; margin: .4rem 0 0; padding: 0; }
  .army-card :global(li) {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .6rem; align-items: center;
    padding: .22rem 0; border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent); font-size: var(--type-body);
  }
  .army-card :global(.name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .army-card :global(.meta) { font-size: var(--type-small); color: var(--muted); white-space: nowrap; }
</style>
