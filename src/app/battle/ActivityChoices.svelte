<script lang="ts">
  import type { ActivityIndex, ActivityOption } from '../../engine/index.js';
  import { reachableActivities, actionReason } from './action-menu.js';
  import ActionCost from '../ActionCost.svelte';
  let { options, selected, choose }: {
    options: ActivityOption[]; selected: ActivityIndex | null; choose: (index: ActivityIndex) => void;
  } = $props();
  const id = $props.id();
  const selection = $derived(options.find(option => option.index === selected));
</script>

  <div class="activity-options">
    {#each reachableActivities(options) as opt (opt.activity)}
      <button class="popup-row activity-row" class:on={opt.index === selected} class:dim={!opt.legal}
        aria-label={`${opt.label} · ${opt.cost} ${opt.cost === 1 ? 'action' : 'actions'}`}
        aria-disabled={!opt.legal} aria-pressed={opt.index === selected}
        aria-describedby={`${id}-${opt.activity}`}
        onclick={() => opt.legal && choose(opt.index)}>
        <span class="popup-verb"><ActionCost n={opt.cost!} size="1.1em" />{opt.label}</span>
        <span id={`${id}-${opt.activity}`} class="activity-tooltip" role="tooltip">{opt.legal ? opt.detail : actionReason(opt.reason)}</span>
      </button>
    {/each}
  </div>
  {#if selection}
    <p class="selected-effect">{selection.detail}</p>
  {/if}

<style>
  .activity-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem; padding: .2rem .3rem; }
  .activity-row:only-child { grid-column: 1 / -1; }
  .activity-row { position: relative; justify-content: center; min-height: 2.6rem; border-color: var(--rule); }
  .activity-row .popup-verb { gap: .4rem; font-size: var(--type-small); }
  .activity-row.dim { opacity: 1; color: var(--muted); background: var(--band); }
  .activity-row.dim .popup-verb { opacity: .55; filter: grayscale(1); }
  .activity-tooltip { display: none; position: absolute; top: 100%; left: 0; z-index: 10; width: max-content; max-width: 16rem; padding: .4rem .55rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--card); color: var(--ink); box-shadow: var(--shadow-1); font-size: var(--type-small); font-weight: 400; pointer-events: none; }
  .activity-row:nth-child(even) .activity-tooltip { left: auto; right: 0; }
  .activity-row:not(.on):hover .activity-tooltip, .activity-row:not(.on):focus-visible .activity-tooltip { display: block; }
  .selected-effect { margin: .4rem .5rem; color: var(--muted); line-height: var(--leading-compact); }
  .popup-row { width: 100%; padding: .35rem .5rem; border: 1px solid var(--rule); border-radius: 7px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .popup-row:hover:not(.dim), .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-row.dim { cursor: default; }
  .popup-verb { display: flex; align-items: center; font-weight: 600; }
  .activity-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
