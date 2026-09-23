<script lang="ts">
  import type { Snippet } from 'svelte';
  import { outcomeArt } from './battle/battle-ending.js';
  import { outcomeScene } from './scene-art.js';

  let { outcome, phase, onfinish, children }: {
    outcome: string;
    phase: 'announcement' | 'report';
    onfinish: () => void;
    children: Snippet;
  } = $props();
  const kind = $derived(outcomeArt(outcome));
  const art = $derived(kind && outcomeScene(kind));
  let loaded = $state(false);
  let failed = $state(false);
  const ready = $derived(!art || loaded || failed);
</script>

<div class="outcome-scrim" class:reporting={phase === 'report'}>
  <div class="outcome-scene" class:ready class:intro={phase === 'announcement'}
    onanimationend={(event) => { if (event.target === event.currentTarget && phase === 'announcement') onfinish(); }}>
    {#if art && !failed}
      <img class="outcome-art" src={art} alt=""
        onload={() => { loaded = true; }} onerror={() => { failed = true; }} />
    {/if}
    <div class="outcome-title" role="status" aria-live="polite" aria-atomic="true">{outcome}</div>
  </div>
  {#if phase === 'report'}
    <div class="outcome-report">{@render children()}</div>
  {/if}
</div>

<style>
  .outcome-scrim { position: absolute; inset: 0; background: rgb(0 0 0 / .88); animation: scrim-in .6s ease both; }
  .outcome-scene { position: absolute; inset: 0; display: grid; place-items: center; opacity: 0; }
  .outcome-scene.ready { opacity: 1; }
  .outcome-scene.ready.intro { animation: outcome-reveal 4.2s ease both; }
  .outcome-art { width: min(100%, 100rem); height: 100%; object-fit: contain; }
  .outcome-title {
    position: absolute; inset: auto 1rem 12%; text-align: center; color: #fff1dc;
    font-size: clamp(2.4rem, 6vw, 5.5rem); font-weight: 650;
    text-shadow: 0 2px 5px #000, 0 5px 30px #000; line-height: 1.1;
    transition: opacity .6s ease;
  }
  .reporting .outcome-title { opacity: 0; }
  .outcome-report { position: absolute; inset: 0; animation: report-in .8s ease both; }
  @keyframes scrim-in { from { background: transparent; } to { background: rgb(0 0 0 / .88); } }
  @keyframes outcome-reveal { 0% { opacity: 0; } 20%, 100% { opacity: 1; } }
  @keyframes report-in { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .outcome-scrim, .outcome-report { animation-duration: .01ms; }
    .outcome-scene.ready.intro { animation-name: outcome-still; }
    .outcome-title { transition: none; }
  }
  @keyframes outcome-still { from, to { opacity: 1; } }
</style>
