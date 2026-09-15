<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { BattleState, LogEntry } from '../engine/index.js';
  import { battleLogBlocks } from './battle-log.js';

  let { battle }: { battle: BattleState } = $props();
  const blocks = $derived(battleLogBlocks(battle));
  let scroller = $state<HTMLDivElement>();
  let following = $state(true);
  const outcome = (entry: LogEntry) => entry.check?.degree ?? '';

  function latest() {
    following = true;
    scroller?.scrollTo({ top: scroller.scrollHeight });
  }
  $effect(() => {
    void battle.log.length;
    void battle.active;
    const follow = untrack(() => following);
    void tick().then(() => { if (follow) latest(); });
  });
</script>

<div class="battle-log" bind:this={scroller} role="log" aria-label="Turn history" aria-live="polite" aria-relevant="additions"
  onscroll={() => { if (scroller) following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40; }}>
  {#each blocks as block (block.id)}
    {#if block.kind === 'turn'}
      <section class="turn" data-side={block.side} aria-label="{block.name} turn">
        <header class="turn-head">
          <h3>{block.name}</h3>
        </header>
        <div class="turn-events">
          {#each block.entries as entry, i (i)}
            <p class="event" data-outcome={outcome(entry)}>{entry.text}</p>
          {:else}
            <p class="waiting">{block.ended ? 'No actions taken.' : 'Choose an action.'}</p>
          {/each}
        </div>
        {#if block.ended}<footer class="turn-end"><span>End turn</span></footer>{/if}
      </section>
    {:else}
      <div class="events">
        {#each block.entries as entry, i (i)}
          <p class="event" class:round={!entry.unit} data-outcome={outcome(entry)}>{entry.text}</p>
        {/each}
      </div>
    {/if}
  {/each}
</div>
{#if !following}<button class="latest" onclick={latest}>Latest entries ↓</button>{/if}

<style>
  .battle-log {
    flex: 1; min-height: 8rem; overflow-y: auto; overflow-x: hidden;
    /* Overlay scrollbars ignore scrollbar-gutter, so keep a separate clear lane too. */
    padding-inline-end: 1rem; scrollbar-gutter: stable; scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--muted) 65%, var(--paper)) transparent;
    font: .875rem/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .turn { --side: var(--muted); margin: .7rem 0; border: 1px solid color-mix(in srgb, var(--side) 45%, transparent); border-top: 2px solid var(--side); background: color-mix(in srgb, var(--side) 7%, transparent); }
  .turn[data-side='attacker'] { --side: var(--att); }
  .turn[data-side='defender'] { --side: var(--def); }
  .turn-head { padding: .65rem .7rem .55rem; background: color-mix(in srgb, var(--side) 10%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--side) 23%, transparent); }
  h3 { color: var(--ink); font-size: 1rem; line-height: 1.35; margin: 0; font-weight: 650; }
  .turn-events { padding: .1rem .7rem; }
  .event { margin: 0; padding: .5rem 0; overflow-wrap: anywhere; }
  .event + .event { border-top: 1px solid color-mix(in srgb, var(--rule) 25%, transparent); }
  .event[data-outcome='critical-success'] { color: var(--good); font-weight: 600; }
  .event[data-outcome='critical-failure'] { color: var(--bad); }
  .turn-end { display: flex; align-items: center; gap: .5rem; padding: .35rem .7rem .55rem; color: var(--muted); font-size: .625rem; letter-spacing: .08em; text-transform: uppercase; }
  .turn-end::after { content: ''; height: 1px; flex: 1; background: color-mix(in srgb, var(--side) 35%, transparent); }
  .waiting { color: var(--muted); margin: .6rem 0; font-size: .8rem; }
  .events { padding: 0 .2rem; }
  .event.round { padding: .6rem 0 .4rem; margin-top: .5rem; color: var(--muted); font-size: .7rem; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; border-top: 1px solid var(--rule); }
  .latest { flex-shrink: 0; font: 600 .75rem/1.5 system-ui, sans-serif; padding: .4rem .6rem; }
</style>
