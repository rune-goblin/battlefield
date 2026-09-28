<script lang="ts">
  import type { Snippet } from 'svelte';
  import Modal from './Modal.svelte';

  interface Props {
    label: string;
    title?: string;
    width?: string;
    onopen?: () => void;
    children: Snippet;
  }
  let { label, title = label, width, onopen, children }: Props = $props();

  let open = $state(false);
  const close = () => { open = false; };
</script>

<button aria-haspopup="dialog" aria-expanded={open} onclick={() => { open = true; onopen?.(); }}>{label}</button>
{#if open}
  <Modal {title} {width} {close}>
    {@render children()}
    {#snippet actions()}<button onclick={close}>Done</button>{/snippet}
  </Modal>
{/if}
