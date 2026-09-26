<script lang="ts">
  import { ACTIONS_PER_ACTIVATION } from '../engine/index.js';
  import ActionCost from './ActionCost.svelte';

  let { remaining, bonus = 0, size = '2.2rem' }: { remaining: number; bonus?: number; size?: string } = $props();
  const total = $derived(Math.max(ACTIONS_PER_ACTIVATION + bonus, remaining));
</script>

<span class="action-budget" role="img" aria-label={`${remaining} of ${total} actions available`} title={`${remaining} of ${total} actions available`}>
  {#each Array(total) as _, i}
    <span class="action-slot" class:available={i < remaining} aria-hidden="true"><ActionCost n={1} {size} /></span>
  {/each}
</span>

<style>
  .action-budget { display: inline-flex; align-items: center; gap: .3rem; flex: none; }
  .action-slot { display: inline-flex; color: var(--muted); opacity: .35; transition: color .18s ease, opacity .18s ease; }
  .action-slot.available { color: var(--good); opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .action-slot { transition: none; } }
</style>
