<script lang="ts">
  import type { Board } from '../engine/index.js';
  import { groundRouteWarning } from './connection-warning.js';
  let { board, edit }: { board: Board | null; edit?: () => void } = $props();
  const warning = $derived(groundRouteWarning(board));
</script>

{#if warning}
  <div class="connection-warning" role="status">
    <strong>{warning.title}</strong>
    <p>{warning.message}</p>
    {#if edit}<button onclick={edit}>Paint a crossing</button>{/if}
  </div>
{/if}

<style>
  .connection-warning { margin: .8rem 0; padding: .65rem; border: 1px solid var(--caution); border-left-width: 3px; border-radius: 4px; background: color-mix(in srgb, var(--caution) 12%, var(--paper)); }
  p { margin: .35rem 0; font-size: var(--type-body); }
</style>
