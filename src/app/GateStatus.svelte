<script lang="ts">
  let { open }: { open: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" role="img" aria-label={open ? 'Gate open' : 'Gate closed'}>
  <path class="frame" d="M4 28V13a12 12 0 0 1 24 0v15M2 28h6m16 0h6" />
  {#if open}
    <path class="door" d="M7 13 11 16v12l-4-3Zm18 0-4 3v12l4-3Z" />
  {:else}
    <path class="door" d="M8 27V13a8 8 0 0 1 16 0v14Z" />
    <path class="frame" d="M12 9v18m4-20v20m4-18v18M8 16h16M8 22h16" />
  {/if}
</svg>

<style>
  svg { width: 1.8rem; height: 1.8rem; flex: none; color: var(--ink); }
  .frame { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .door { fill: currentColor; fill-opacity: .2; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
</style>
