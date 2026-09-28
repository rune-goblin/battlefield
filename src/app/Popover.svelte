<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onEscape } from './keys.js';
  import { hostOf } from './shell/overlay.js';

  interface Props {
    label: string;
    open?: boolean;
    onopen?: () => void;
    children: Snippet;
  }
  let { label, open = $bindable(false), onopen, children }: Props = $props();

  let button: HTMLButtonElement;

  function toggle() {
    open = !open;
    if (open) onopen?.();
  }

  // The panel moves to the shell's overlay layer and hangs under its button there.
  const underButton = (panel: HTMLElement) => {
    const host = hostOf(panel);
    if (!host) return;
    const at = button.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    panel.style.top = `${at.bottom - frame.top + 5}px`;
    panel.style.right = `${Math.max(8, frame.right - at.right)}px`;
    panel.style.maxHeight = `${frame.bottom - at.bottom - 16}px`;
    host.append(panel);
  };
</script>

<svelte:document onkeydown={onEscape(() => (open = false))} />

<div class="popover">
  <button bind:this={button} onclick={toggle} aria-expanded={open}>{label}</button>
  {#if open}
    <div class="panel" {@attach underButton}>{@render children()}</div>
  {/if}
</div>

<style>
  .popover { position: relative; }
  .panel {
    position: absolute; width: 20rem; max-width: calc(100% - 1rem);
    overflow: auto; overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: .5rem; padding: .6rem;
    background: var(--card); border: 1px solid var(--rule); border-radius: 8px;
    box-shadow: var(--shadow-2); font-size: var(--type-body);
  }
</style>
