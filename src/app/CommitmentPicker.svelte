<script lang="ts">
  import ActionCost from './ActionCost.svelte';
  let { base, available, value = $bindable(0), effect = 'on the roll' }: {
    base: number; available: number; value?: number; effect?: string;
  } = $props();
</script>

<fieldset class="commitment">
  <legend>Boost</legend>
  <div class="choices">
    {#each [0, 1, 2] as extra}
      <button type="button" class:chosen={value === extra} aria-pressed={value === extra}
        disabled={base + extra > available} onclick={() => { value = extra; }}
        title={base + extra > available ? `Needs ${base + extra} actions; ${available} available` : `${base + extra} ${base + extra === 1 ? 'action' : 'actions'} total${extra ? ` · +${extra * 2} ${effect}` : ''}`}>
        <ActionCost n={base + extra} /><strong>{extra ? `+${extra * 2}` : 'Normal'}</strong>
      </button>
    {/each}
  </div>
  <p aria-live="polite">{available - base - value} {available - base - value === 1 ? 'action' : 'actions'} left</p>
</fieldset>

<style>
  .commitment { margin: .35rem .3rem; padding: .35rem; border: 1px solid var(--rule); border-radius: 8px; min-width: 0; }
  legend { padding: 0 .3rem; font-weight: 600; font-size: .85rem; }
  .choices { display: flex; gap: .35rem; }
  button { flex: 1; display: flex; flex-direction: row; justify-content: center; gap: .3rem; align-items: center; padding: .45rem .2rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--card); color: var(--ink); cursor: pointer; font: inherit; font-size: .8rem; }
  button.chosen { border-color: var(--accent); background: var(--band); }
  button:disabled { opacity: .4; cursor: default; }
  p { margin: .45rem 0 0; color: var(--muted); font-size: .8rem; }
</style>
