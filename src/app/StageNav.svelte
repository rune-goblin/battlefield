<script lang="ts">
  import { back, forward, game, goToStage, type Stage } from './game.svelte.js';

  const STAGES: { id: Stage; label: string }[] = [
    { id: 'board', label: '1 · Battlefield' }, { id: 'paint', label: '2 · Paint' },
    { id: 'attackers', label: '3 · Attackers' }, { id: 'defenders', label: '4 · Defenders' }, { id: 'battle', label: '5 · Battle' },
  ];

  const step = $derived(forward());
  // Every setup stage can be jumped to once the board exists; `battle` never can — it's
  // reached only through the primary button below, once both sides are ready.
  const reachable = (id: Stage) => id !== 'battle' && (id === 'board' || !!game.setup.board);
</script>

<div class="stagenav">
  <div class="steps">
    {#each STAGES as s (s.id)}
      <button
        class="step" class:on={game.stage === s.id}
        disabled={!reachable(s.id)} onclick={() => goToStage(s.id)}
      >{s.label}</button>
    {/each}
  </div>
  <button onclick={back} disabled={game.stage === 'board'}>Back</button>
  <button class="primary" disabled={!step.enabled} onclick={step.go}>{step.label}</button>
</div>

<style>
  .stagenav { display: flex; align-items: center; gap: .4rem; font-size: .85rem; }
  .steps { display: flex; gap: .3rem; }
  .step {
    padding: .1rem .6rem; border-radius: 999px; border: 1px solid var(--rule); color: var(--muted);
    white-space: nowrap; background: none; font: inherit; font-size: .85rem; cursor: pointer;
  }
  .step:disabled { cursor: default; opacity: .5; }
  .step:not(:disabled):not(.on):hover { border-color: var(--accent); color: var(--ink); }
  .step.on { background: var(--accent); color: var(--paper); border-color: var(--accent); }
  button { padding: .2rem .6rem; font-size: .85rem; }
  @media (max-width: 80rem) { .steps { display: none; } }
</style>
