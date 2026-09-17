<script lang="ts">
  import { hasGroundConnection, type Board } from '../engine/index.js';
  let { board, edit }: { board: Board | null; edit?: () => void } = $props();
  const blocked = $derived(board?.spec.feature === 'river' && !hasGroundConnection(board));
</script>

{#if blocked}
  <div class="connection-warning" role="status">
    <strong>River blocks the ground crossing</strong>
    <p>Ground units have no route between the deployment zones. The GM can keep this battlefield, or paint bridges or shallows to connect the banks.</p>
    {#if edit}<button onclick={edit}>Edit crossings</button>{/if}
  </div>
{/if}

<style>
  .connection-warning { margin: .8rem 0; padding: .65rem; border: 1px solid #b78939; border-left-width: 3px; border-radius: 4px; background: color-mix(in srgb, #b78939 12%, var(--paper)); }
  p { margin: .35rem 0; font-size: .9rem; }
</style>
