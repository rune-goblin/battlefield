<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onEscape } from './keys.js';

  interface Props {
    title: string;
    alert?: boolean;
    /** Enables Escape and a click on the scrim. Without it the dialog holds a forced choice. */
    close?: () => void;
    tone?: string;
    width?: string;
    /** `window` covers the whole page; `stage` fills the stage's modal layer. */
    layer?: 'window' | 'stage';
    /** The caller draws its own heading and spacing; the title becomes the dialog's label. */
    bare?: boolean;
    actions?: Snippet;
    children: Snippet;
  }
  let {
    title, alert = false, close, tone = 'var(--accent)', width = '28rem', layer = 'window', bare = false, actions, children,
  }: Props = $props();

  const id = $props.id();
</script>

<svelte:window onkeydown={onEscape(() => close?.())} />

<div class="scrim" class:window={layer === 'window'} class:stage={layer === 'stage'} role="presentation" onclick={(e) => { if (close && e.target === e.currentTarget) close(); }}>
  <div
    class="frame" class:bare role={alert ? 'alertdialog' : 'dialog'} aria-modal="true"
    aria-labelledby={bare ? undefined : id} aria-label={bare ? title : undefined}
    style:--tone={tone} style:width="min({width}, 100%)"
  >
    {#if !bare}<h2 {id}>{title}</h2>{/if}
    {@render children()}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</div>

<style>
  .scrim { inset: 0; display: grid; place-items: center; }
  .window { position: fixed; z-index: 60; padding: 1rem; background: var(--scrim); pointer-events: auto; }
  .stage { position: absolute; padding: 2rem; background: var(--scrim); }
  .frame {
    max-height: 100%; min-height: 0; display: flex; flex-direction: column;
    background: var(--card); border: 1px solid var(--rule); border-top: 3px solid var(--tone);
    border-radius: 10px; box-shadow: var(--shadow-3);
  }
  .frame:not(.bare) { gap: .8rem; padding: 1.1rem 1.2rem; }
  h2 { margin: 0; padding: 0; border: 0; font-size: var(--type-2); line-height: var(--leading-compact); }
  .frame:not(.bare) > :global(p) { margin: 0; line-height: var(--leading-compact); }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
</style>
