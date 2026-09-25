<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setDock, ui, type DockSide } from './layout.svelte.js';

  interface Props {
    side: DockSide;
    title: string;
    /** Panel width in rem when open. */
    width?: number;
    head?: Snippet;
    /** Always open, with no collapse or hide: the setup wizard's entry panel. */
    fixed?: boolean;
    children: Snippet;
  }
  let { side, title, width = 25, head, fixed = false, children }: Props = $props();

  const state = $derived(fixed ? 'open' : ui.dock[side]);
  const away = $derived(side === 'left' ? '‹' : '›');
  const back = $derived(side === 'left' ? '›' : '‹');
</script>

{#if state !== 'hidden'}
  <aside class="dock {side}" class:rail={state === 'rail'} style="--w:{width}rem" aria-label={title}>
    {#if state === 'rail'}
      <button class="railbtn" title="Open {title}" onclick={() => setDock(side, 'open')}>
        <span class="railtitle">{title}</span>
        <span class="chev">{back}</span>
      </button>
    {:else}
      <header class="dock-head">
        <h2>{title}</h2>
        {#if !fixed}
          <button class="ghost" title="Collapse to a strip" aria-label="Collapse {title}" onclick={() => setDock(side, 'rail')}>{away}</button>
          <button class="ghost" title="Hide — the top bar brings it back" aria-label="Hide {title}" onclick={() => setDock(side, 'hidden')}>×</button>
        {/if}
      </header>
      {#if head}<div class="dock-sub">{@render head()}</div>{/if}
      <div class="dock-body">{@render children()}</div>
    {/if}
  </aside>
{/if}

<style>
  .dock {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: var(--w);
    background: color-mix(in srgb, var(--paper) 88%, transparent);
    box-shadow: 0 0 18px rgba(0, 0, 0, .28);
  }
  .dock.left { border-right: 1px solid var(--rule); }
  .dock.right { border-left: 1px solid var(--rule); }
  .dock.rail { width: 1.9rem; }

  .dock-head { display: flex; align-items: center; gap: .2rem; padding: .3rem .3rem .3rem .7rem; border-bottom: 1px solid var(--rule); }
  .dock-head h2 { flex: 1; margin: 0; border: 0; padding: 0; font-size: var(--type-body); font-weight: 700; color: var(--ink); }
  .dock-sub { padding: .45rem .7rem; border-bottom: 1px solid var(--rule); }
  .dock-body { flex: 1; min-height: 0; overflow: auto; padding: .6rem .7rem .8rem; display: flex; flex-direction: column; gap: .6rem; }

  .railbtn {
    flex: 1; width: 100%; padding: .5rem .1rem; border: 0; border-radius: 0;
    background: none; color: var(--muted); cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: .6rem;
  }
  .railbtn:hover { color: var(--ink); background: var(--band); }
  .railtitle { writing-mode: vertical-rl; font-size: var(--type-small); font-weight: 600; }
  .dock.left .railtitle { rotate: 180deg; }
  .chev { font-size: var(--type-small); }

  .ghost { border: 0; background: none; color: var(--muted); padding: .1rem .3rem; line-height: 1; }
  .ghost:hover { color: var(--ink); background: var(--band); }
</style>
