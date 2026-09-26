<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onEscape } from './keys.js';

  interface Props {
    label: string;
    open?: boolean;
    onopen?: () => void;
    children: Snippet;
  }
  let { label, open = $bindable(false), onopen, children }: Props = $props();

  function toggle() {
    open = !open;
    if (open) onopen?.();
  }
</script>

<svelte:window onkeydown={onEscape(() => (open = false))} />

<div class="popover">
  <button onclick={toggle} aria-expanded={open}>{label}</button>
  {#if open}
    <div class="panel">{@render children()}</div>
  {/if}
</div>

<style>
  .popover { position: relative; }
  .panel {
    position: absolute; right: 0; top: calc(100% + .3rem); z-index: 10; width: 20rem;
    display: flex; flex-direction: column; gap: .5rem; padding: .6rem;
    background: var(--card); border: 1px solid var(--rule); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .25); font-size: var(--type-body);
  }
</style>
